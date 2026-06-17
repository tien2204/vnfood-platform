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
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.ai.class_names import CLASS_DISPLAY_NAMES, get_keyword_from_class
from app.core.config import settings
from app.models.ai_log import AILog
from app.models.recipe import Recipe
from app.core.variant_config import is_multi_variant
from app.services import (
    dish_overview_service,
    dish_recipe_service,
    dish_resolver,
    metrics_service,
)

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
    top5: list = vnfood_result.get("top5", [])
    group: Optional[str] = vnfood_result.get("group")

    resolved_slug: Optional[str] = None
    match_tier: str = "unknown"
    predicted_class: Optional[str] = None
    display_name: Optional[str] = None
    confidence: float = 0.0
    model_used: str = "vnfood"

    vn_slug, vn_tier = dish_resolver.resolve_vnfood(vnfood_result, dish_resolver.has_canonical)
    if vn_slug is not None:
        # VNFood confident or tentative
        resolved_slug = vn_slug
        match_tier = vn_tier  # "confident" | "tentative"
        predicted_class = vn_slug
        display_name = CLASS_DISPLAY_NAMES.get(vn_slug, vn_slug)
        confidence = top5[0]["confidence"]
        model_used = "vnfood"
    else:
        # Fall back to OpenAI Vision
        model_used = "openai"
        openai_name: Optional[str] = None
        if settings.OPENAI_API_KEY:
            try:
                openai_name, confidence = await _openai_recognize(image_bytes)
            except Exception:
                logger.exception("OpenAI fallback failed")
        else:
            logger.warning("OPENAI_API_KEY not configured — cannot fallback")

        mapped = dish_resolver.resolve_to_slug(openai_name)
        if mapped and dish_resolver.has_canonical(mapped):
            # OpenAI named a dish we already have a canonical recipe for → re-enter lookup.
            resolved_slug = mapped
            match_tier = "openai_known"
            predicted_class = mapped
            display_name = CLASS_DISPLAY_NAMES.get(mapped, openai_name)
            top5 = [{"class": mapped, "display_name": display_name, "confidence": confidence}]
        elif openai_name:
            # Genuinely outside the 103 → AI-generate path.
            match_tier = "unknown"
            predicted_class = openai_name
            display_name = openai_name
            top5 = [{"class": openai_name, "display_name": openai_name, "confidence": confidence}]
        else:
            match_tier = "unknown"
            predicted_class = "unknown"
            display_name = "Không nhận diện được"
            confidence = 0.0

    # ── lookup, all keyed off resolved_slug ──────────────────────────────────
    keyword = get_keyword_from_class(resolved_slug) if resolved_slug else None
    canonical_recipe, variants = await _find_canonical_for_class(db, resolved_slug)
    suggested_recipes = await _find_suggested_recipes(
        db, resolved_slug, display_name, keyword, canonical_recipe, variants, limit=6
    )

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

    # dish_recipe: canonical inline card when we have a slug; else OpenAI-generated.
    dish_recipe = None
    if resolved_slug and canonical_recipe is not None:
        dish_recipe = await _build_dish_recipe_from_canonical(db, canonical_recipe["id"])
    elif resolved_slug:
        dish_recipe = dish_recipe_service.get_curated(resolved_slug)
    elif match_tier == "unknown" and display_name and display_name not in ("Không nhận diện được", "unknown"):
        dish_recipe = await dish_recipe_service.get_or_generate_ai(db, display_name, user_id=user_id)

    class_metrics = None
    if model_used == "vnfood" and resolved_slug:
        class_metrics = metrics_service.get_class_metrics(resolved_slug)

    multi_variant = is_multi_variant(resolved_slug)
    dish_overview = dish_overview_service.get_overview(resolved_slug) if multi_variant else None

    return {
        "predicted_class": predicted_class,
        "display_name": display_name,
        "confidence": confidence,
        "model_used": model_used,
        "match_tier": match_tier,
        "resolved_slug": resolved_slug,
        # Only surface VNFood's group on VNFood-trusted results; on OpenAI paths the
        # group is a discarded low-confidence guess and would contradict resolved_slug.
        "subgroup": group if model_used == "vnfood" else None,
        "top_predictions": top5,
        "suggested_recipes": suggested_recipes,
        "canonical_recipe": canonical_recipe,
        "variants": variants,
        "dish_recipe": dish_recipe,
        "class_metrics": class_metrics,
        "is_multi_variant": multi_variant,
        "dish_overview": dish_overview,
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
                        "If it matches one of these Vietnamese dishes, reply with that exact name: "
                        + ", ".join(sorted(set(CLASS_DISPLAY_NAMES.values())))
                        + ". Otherwise reply with the dish's real name. "
                        "Reply ONLY with a JSON object, no markdown, no explanation: "
                        '{"dish_name": "name (Vietnamese if VN dish, English if not)", "confidence": 0.0-1.0}. '
                        "Never reply 'Unknown'. "
                        "Set confidence below 0.3 if it is NOT a Vietnamese dish or truly unrecognizable."
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
        "description": row.flavor_text or row.description,
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


def _in_recipes_page_pool():
    """Restrict to the same recipe pool the /recipes page shows: canonical recipes
    tagged to one of the 103 AI dishes (ai_class_slug) or user-submitted recipes."""
    return or_(
        and_(Recipe.is_canonical.is_(True), Recipe.ai_class_slug.isnot(None)),
        Recipe.source == "user",
    )


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
            .where(_in_recipes_page_pool())
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
            .where(_in_recipes_page_pool())
            .order_by(Recipe.avg_rating.desc(), Recipe.view_count.desc())
            .limit(limit)
        )
        for r in (await db.execute(fallback_q)).scalars().all():
            if len(output) >= limit:
                break
            _add(_serialize_recipe_for_ai(r))

    return output[:limit]
