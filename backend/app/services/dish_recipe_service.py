"""Curated dish recipes (103 món) tải sẵn cho chức năng nhận diện."""
import json
import logging
from pathlib import Path
from typing import Optional

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
