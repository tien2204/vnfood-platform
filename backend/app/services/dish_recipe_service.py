"""Curated dish recipes (103 món) + OpenAI fallback cache."""
import json
import logging
import uuid
from pathlib import Path
from typing import Optional

from openai import AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.ai_generated_recipe import AIGeneratedRecipe

logger = logging.getLogger(__name__)

DISH_RECIPES_PATH = Path(__file__).parent.parent / "ai" / "dish_recipes.json"
DISH_RECIPES: dict[str, dict] = {}


def load_dish_recipes() -> int:
    """Load curated recipes into memory. Called once at app startup."""
    global DISH_RECIPES
    if not DISH_RECIPES_PATH.exists():
        logger.warning(f"dish_recipes.json not found at {DISH_RECIPES_PATH}")
        DISH_RECIPES = {}
        return 0
    DISH_RECIPES = json.loads(DISH_RECIPES_PATH.read_text(encoding="utf-8"))
    logger.info(f"Loaded {len(DISH_RECIPES)} curated dish recipes")
    return len(DISH_RECIPES)


def get_curated(slug: str) -> Optional[dict]:
    """Return curated recipe dict for slug, or None."""
    recipe = DISH_RECIPES.get(slug)
    if not recipe:
        return None
    return {"source": "curated", **recipe}


def _normalize_name(name: str) -> str:
    return name.lower().strip()


async def _generate_via_openai(dish_name: str) -> dict:
    """Ask OpenAI to produce a full recipe JSON for an unknown dish."""
    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    prompt = (
        f'Generate a cooking recipe for the dish "{dish_name}" in Vietnamese.\n\n'
        'Reply ONLY with a JSON object, no markdown:\n'
        '{\n'
        f'  "title": "{dish_name}",\n'
        '  "description": "Mô tả ngắn 1-2 câu (Vietnamese)",\n'
        '  "ingredients": ["nguyên liệu 1 có định lượng", ...],\n'
        '  "steps": ["bước 1 chi tiết", ...],\n'
        '  "cooking_time_minutes": <int 15-180>,\n'
        '  "servings": <int 1-10>,\n'
        '  "difficulty": "easy" | "medium" | "hard"\n'
        '}\n\n'
        "ingredients: ít nhất 5 items có định lượng.\n"
        "steps: ít nhất 3 bước chi tiết.\n"
        "Use Vietnamese language for description/ingredients/steps."
    )
    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=1500,
        response_format={"type": "json_object"},
    )
    return json.loads(response.choices[0].message.content.strip())


async def get_or_generate_ai(
    db: AsyncSession,
    dish_name: str,
    user_id: Optional[uuid.UUID] = None,
) -> Optional[dict]:
    """Return cached or newly-generated recipe for AI-fallback dish.

    Returns None if dish_name is empty or generation fails.
    """
    if not dish_name or dish_name.lower() == "unknown":
        return None

    normalized = _normalize_name(dish_name)

    # 1. Cache hit
    row = (await db.execute(
        select(AIGeneratedRecipe).where(AIGeneratedRecipe.dish_name_normalized == normalized)
    )).scalar_one_or_none()
    if row:
        return {"source": "ai-generated", **row.recipe_json}

    # 2. Cache miss → generate + insert
    try:
        recipe_json = await _generate_via_openai(dish_name)
    except Exception:
        logger.exception(f"OpenAI recipe generation failed for: {dish_name}")
        return None

    cache_row = AIGeneratedRecipe(
        id=uuid.uuid4(),
        dish_name_normalized=normalized,
        display_name=dish_name,
        recipe_json=recipe_json,
        created_by_user_id=user_id,
    )
    db.add(cache_row)
    await db.commit()

    return {"source": "ai-generated", **recipe_json}
