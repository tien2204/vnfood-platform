import asyncio
import base64
import io
import json
import logging
import unicodedata
import uuid
from typing import Optional

import requests as _requests_lib
from openai import AsyncOpenAI
from PIL import Image
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.ai.class_names import CLASS_DISPLAY_NAMES, get_keyword_from_class
from app.core.config import settings
from app.models.ai_log import AILog
from app.models.recipe import Recipe
from app.services import dish_recipe_service, metrics_service

logger = logging.getLogger(__name__)


async def recognize_image(
    db: AsyncSession,
    predictor,
    image_bytes: bytes,
    user_id: Optional[uuid.UUID] = None,
    image_url: Optional[str] = None,
) -> dict:
    """
    Pipeline:
      1. Validate image (size, dimensions)
      2. VNFoodPredictor → if needs_fallback → OpenAI Vision
      3. Query suggested recipes from DB
      4. Log to ai_logs
    """
    try:
        pil_image = Image.open(io.BytesIO(image_bytes))
        if pil_image.size[0] < 100 or pil_image.size[1] < 100:
            raise ValueError("Ảnh quá nhỏ (tối thiểu 100×100 px)")
    except ValueError:
        raise
    except Exception as e:
        raise ValueError(f"Ảnh không hợp lệ: {e}")

    vnfood_result = predictor.predict(pil_image)

    predicted_class: Optional[str] = None
    display_name: Optional[str] = None
    confidence: float = 0.0
    model_used: str = "vnfood"
    top5: list = vnfood_result.get("top5", [])
    group: Optional[str] = vnfood_result.get("group")

    if not vnfood_result["needs_fallback"]:
        predicted_class = vnfood_result["predicted_class"]
        display_name = vnfood_result["display_name"]
        confidence = vnfood_result["class_confidence"]
    else:
        # Confidence thấp → phải dùng OpenAI, không trả VNFood result
        openai_ok = False
        if settings.OPENAI_API_KEY:
            try:
                display_name, confidence = await _openai_recognize(image_bytes)
                predicted_class = display_name
                model_used = "openai"
                top5 = [{"class": predicted_class, "display_name": display_name, "confidence": confidence}]
                openai_ok = True
            except Exception:
                logger.exception("OpenAI fallback failed")
        else:
            logger.warning("OPENAI_API_KEY not configured — cannot fallback")

        if not openai_ok:
            # OpenAI không khả dụng hoặc fail → không hiển thị kết quả VNFood confidence thấp
            predicted_class = "unknown"
            display_name = "Không nhận diện được"
            confidence = 0.0
            # top5 giữ nguyên từ VNFood để hiển thị gợi ý tham khảo

    keyword = get_keyword_from_class(predicted_class) if predicted_class and group else None
    suggested_recipes = await _find_suggested_recipes(db, predicted_class, display_name, keyword, limit=6)
    canonical_recipe, variants = await _find_canonical_for_class(db, predicted_class)

    log = AILog(
        id=uuid.uuid4(),
        user_id=user_id,
        image_url=image_url,
        predicted_class=predicted_class,
        confidence=confidence,
        model_used=model_used,
    )
    db.add(log)
    await db.commit()

    # Resolve dish_recipe attachment.
    # VNFood path: canonical_recipe is the single source of truth and links to the
    # lookup detail page. Only fall back to the curated card if no canonical exists
    # (defensive — should not happen after the canonical gap-fill).
    dish_recipe = None
    if predicted_class and predicted_class != "unknown" and model_used == "vnfood":
        if canonical_recipe is not None:
            # Inline the canonical recipe's real ingredients/steps so the card
            # matches the linked detail page (source of truth = canonical row).
            dish_recipe = await _build_dish_recipe_from_canonical(db, canonical_recipe["id"])
        else:
            dish_recipe = dish_recipe_service.get_curated(predicted_class)
    elif model_used == "openai" and display_name and display_name not in ("Không nhận diện được", "unknown"):
        dish_recipe = await dish_recipe_service.get_or_generate_ai(db, display_name, user_id=user_id)

    # Attach per-class evaluation metrics only when prediction comes from VNFood model.
    # OpenAI fallback has no offline-evaluated metrics (it's a different model entirely).
    class_metrics = None
    if model_used == "vnfood" and predicted_class and predicted_class != "unknown":
        class_metrics = metrics_service.get_class_metrics(predicted_class)

    return {
        "predicted_class": predicted_class,
        "display_name": display_name,
        "confidence": confidence,
        "model_used": model_used,
        "subgroup": group,
        "top_predictions": top5,
        "suggested_recipes": suggested_recipes,
        "canonical_recipe": canonical_recipe,
        "variants": variants,
        "dish_recipe": dish_recipe,
        "class_metrics": class_metrics,
    }


async def _openai_recognize(image_bytes: bytes) -> tuple[str, float]:
    # Detect actual MIME type from bytes
    try:
        probe = Image.open(io.BytesIO(image_bytes))
        fmt = (probe.format or "JPEG").upper()
        mime = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp", "GIF": "image/gif"}.get(fmt, "image/jpeg")
    except Exception:
        mime = "image/jpeg"

    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    b64 = base64.b64encode(image_bytes).decode()

    # No response_format — avoid SDK 1.30 + vision incompatibility; parse manually instead
    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": (
                        "Identify the food dish in this image. "
                        "Reply ONLY with a JSON object, no markdown, no explanation: "
                        '{"dish_name": "actual dish name (Vietnamese if VN dish, English if not)", "confidence": 0.0-1.0}. '
                        "Always provide the real dish name — never reply with 'Unknown'. "
                        "Set confidence below 0.3 if it is NOT a Vietnamese dish or if truly unrecognizable."
                    ),
                },
                {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
            ],
        }],
        max_tokens=150,
    )

    content = response.choices[0].message.content.strip()

    # Strip markdown code fences if model wraps response
    import re as _re
    m = _re.search(r"\{.*\}", content, _re.DOTALL)
    if not m:
        raise ValueError(f"OpenAI trả về không phải JSON: {content[:200]}")
    result = json.loads(m.group())
    return result.get("dish_name", "Không xác định"), float(result.get("confidence", 0.5))


async def fetch_image_from_url(url: str) -> bytes:
    def _get() -> bytes:
        resp = _requests_lib.get(url, timeout=10)
        resp.raise_for_status()
        return resp.content

    return await asyncio.to_thread(_get)


def _serialize_recipe_for_ai(r: Recipe) -> dict:
    return {
        "id": str(r.id),
        "title": r.title,
        "image_url": r.image_url,
        "variant_label": r.variant_label,
        "canonical_dish_slug": r.canonical_dish_slug,
        "cooking_time": r.cooking_time,
        "servings": r.servings,
        "difficulty": r.difficulty,
        "avg_rating": r.avg_rating,
        "rating_count": r.rating_count,
        "source": r.source,
        "is_canonical": r.is_canonical,
    }


async def _build_dish_recipe_from_canonical(db: AsyncSession, recipe_id) -> Optional[dict]:
    """Build a dish_recipe payload (DishRecipeOut shape) from a canonical recipe's
    OWN ingredients/steps, so the inline 'Công thức chuẩn' card matches the detail
    page it links to exactly (same rows: display_text + step content)."""
    rid = recipe_id if isinstance(recipe_id, uuid.UUID) else uuid.UUID(str(recipe_id))
    row = (await db.execute(
        select(Recipe)
        .options(selectinload(Recipe.ingredients), selectinload(Recipe.steps))
        .where(Recipe.id == rid)
    )).scalar_one_or_none()
    if row is None:
        return None
    ingredients = [i.display_text for i in sorted(row.ingredients, key=lambda x: x.order_index)]
    steps = [s.content for s in sorted(row.steps, key=lambda x: x.step_number)]
    return {
        "source": "canonical",
        "title": row.title,
        "description": row.description,
        "ingredients": ingredients,
        "steps": steps,
        "cooking_time_minutes": row.cooking_time,
        "servings": row.servings,
        "difficulty": row.difficulty,
    }


async def _find_canonical_for_class(
    db: AsyncSession, predicted_class: Optional[str]
) -> tuple[Optional[dict], list[dict]]:
    """Return (canonical_recipe_dict, variants_list) for predicted class slug.

    Matches predicted_class against canonical_dish_slug. Ranks by llm_judge_score
    desc; top row is the main canonical, remainder are variants.
    """
    if not predicted_class or predicted_class == "unknown":
        return None, []

    result = await db.execute(
        select(Recipe).where(
            Recipe.is_canonical.is_(True),
            Recipe.status == "approved",
            Recipe.canonical_dish_slug == predicted_class,
        ).order_by(Recipe.llm_judge_score.desc().nullslast())
    )
    rows = list(result.scalars().all())
    if not rows:
        return None, []

    main = _serialize_recipe_for_ai(rows[0])
    variants = [_serialize_recipe_for_ai(r) for r in rows[1:]]
    return main, variants


def _norm_title(title: Optional[str]) -> str:
    """Normalized key for collapsing same-title recipes (NFC, casefolded, single-spaced)."""
    return " ".join(unicodedata.normalize("NFC", (title or "").strip().lower()).split())


def _title_unaccent_ilike(display_name: str):
    """Accent-insensitive title match: unaccent(title) ILIKE unaccent(%name%)."""
    pattern = f"%{display_name}%"
    return func.unaccent(Recipe.title).ilike(func.unaccent(pattern))


async def _find_suggested_recipes(
    db: AsyncSession,
    resolved_slug: Optional[str],
    display_name: Optional[str],
    keyword: Optional[str],
    canonical_recipe: Optional[dict] = None,
    variants: Optional[list[dict]] = None,
    limit: int = 6,
) -> list[dict]:
    seen: set = set()
    output: list[dict] = []

    def _add(item: dict) -> None:
        key = _norm_title(item.get("title"))
        if key in seen or not item.get("id"):
            return
        seen.add(key)
        output.append({
            "id": str(item["id"]),
            "title": item["title"],
            "image_url": item.get("image_url"),
            "avg_rating": item.get("avg_rating") or 0,
            "rating_count": item.get("rating_count") or 0,
            "cooking_time": item.get("cooking_time"),
            "source": item.get("source"),
        })

    # 1. Seed from the authoritative slug match (canonical first, then variants).
    if canonical_recipe:
        _add(canonical_recipe)
    for v in (variants or []):
        if len(output) >= limit:
            break
        _add(v)

    # 2. Top up by title match (only when we still need more).
    _unknown = {"unknown", "Không xác định", "Không nhận diện được", None}
    if len(output) < limit and display_name not in _unknown:
        q = (
            select(Recipe)
            .where(Recipe.status == "approved")
            .where(_title_unaccent_ilike(display_name))
            .order_by(Recipe.avg_rating.desc(), Recipe.view_count.desc())
            .limit(limit)
        )
        for r in (await db.execute(q)).scalars().all():
            if len(output) >= limit:
                break
            _add(_serialize_recipe_for_ai(r))

    # 3. Top up by coarse keyword as a last resort.
    if len(output) < limit and keyword:
        fallback_q = (
            select(Recipe)
            .where(Recipe.status == "approved", Recipe.keyword == keyword)
            .order_by(Recipe.avg_rating.desc(), Recipe.view_count.desc())
            .limit(limit)
        )
        for r in (await db.execute(fallback_q)).scalars().all():
            if len(output) >= limit:
                break
            _add(_serialize_recipe_for_ai(r))

    return output[:limit]
