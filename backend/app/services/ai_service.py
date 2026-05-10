import asyncio
import base64
import io
import json
import logging
import uuid
from typing import Optional

import requests as _requests_lib
from openai import AsyncOpenAI
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.class_names import CLASS_DISPLAY_NAMES, get_keyword_from_class
from app.core.config import settings
from app.models.ai_log import AILog
from app.models.recipe import Recipe

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

    return {
        "predicted_class": predicted_class,
        "display_name": display_name,
        "confidence": confidence,
        "model_used": model_used,
        "subgroup": group,
        "top_predictions": top5,
        "suggested_recipes": suggested_recipes,
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


async def _find_suggested_recipes(
    db: AsyncSession,
    predicted_class: Optional[str],
    display_name: Optional[str],
    keyword: Optional[str],
    limit: int = 6,
) -> list[dict]:
    recipes: list[Recipe] = []

    _unknown = {"unknown", "Không xác định", "Không nhận diện được", None}

    if display_name not in _unknown:
        q = (
            select(Recipe)
            .where(Recipe.status == "approved", Recipe.title.ilike(f"%{display_name}%"))
            .order_by(Recipe.avg_rating.desc(), Recipe.view_count.desc())
            .limit(limit)
        )
        result = await db.execute(q)
        recipes = list(result.scalars().all())

    if len(recipes) < 3 and keyword:
        fallback_q = (
            select(Recipe)
            .where(Recipe.status == "approved", Recipe.keyword == keyword)
            .order_by(Recipe.avg_rating.desc(), Recipe.view_count.desc())
            .limit(limit)
        )
        fallback_result = await db.execute(fallback_q)
        recipes = recipes + list(fallback_result.scalars().all())

    seen: set = set()
    output: list[dict] = []
    for r in recipes:
        if r.id in seen:
            continue
        seen.add(r.id)
        output.append({
            "id": str(r.id),
            "title": r.title,
            "image_url": r.image_url,
            "avg_rating": r.avg_rating,
            "rating_count": r.rating_count,
            "cooking_time": r.cooking_time,
            "source": r.source,
        })
        if len(output) >= limit:
            break

    return output
