import json
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


async def ai_suggest_recipes(ingredient_names: list[str]) -> list[dict]:
    if not settings.OPENAI_API_KEY:
        return []

    try:
        import openai
        client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)

        prompt = (
            f"Tôi có các nguyên liệu sau: {', '.join(ingredient_names)}\n\n"
            "Hãy gợi ý 5 món ăn Việt Nam có thể nấu được từ các nguyên liệu này. "
            "Ưu tiên các món truyền thống, dễ làm.\n\n"
            "Trả về JSON theo format:\n"
            '{"suggestions": [{"name": "tên món", "description": "mô tả ngắn 1-2 câu về món", '
            '"key_ingredients": ["nguyên liệu chính 1", "nguyên liệu chính 2"], '
            '"additional_needed": ["nguyên liệu cần thêm 1", "nguyên liệu cần thêm 2"]}]}'
        )

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.5,
            max_tokens=800,
        )
        result = json.loads(response.choices[0].message.content)
        return result.get("suggestions", [])
    except Exception as exc:
        logger.warning("OpenAI ingredient suggest failed: %s", exc)
        return []
