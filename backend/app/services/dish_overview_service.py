"""Static dish overviews for multi-variant dishes (LLM-seeded, hand-editable)."""
import json
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

DISH_OVERVIEWS_PATH = Path(__file__).parent.parent / "ai" / "dish_overviews.json"
DISH_OVERVIEWS: dict[str, dict] = {}


def load_dish_overviews() -> int:
    """Load overviews into memory. Called once at app startup."""
    global DISH_OVERVIEWS
    if not DISH_OVERVIEWS_PATH.exists():
        logger.warning(f"dish_overviews.json not found at {DISH_OVERVIEWS_PATH}")
        DISH_OVERVIEWS = {}
        return 0
    DISH_OVERVIEWS = json.loads(DISH_OVERVIEWS_PATH.read_text(encoding="utf-8"))
    logger.info(f"Loaded {len(DISH_OVERVIEWS)} dish overviews")
    return len(DISH_OVERVIEWS)


def get_overview(slug: Optional[str]) -> Optional[dict]:
    """Return overview dict for slug, or None."""
    if not slug:
        return None
    return DISH_OVERVIEWS.get(slug)
