"""Static dish overviews for multi-variant dishes (LLM-seeded, hand-editable)."""
import json
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

DISH_OVERVIEWS_PATH = Path(__file__).parent.parent / "ai" / "dish_overviews.json"
DISH_OVERVIEWS: dict[str, dict] = {}


def load_dish_overviews() -> int:
    """Load overviews into memory. Called once at app startup.

    The JSON is hand-editable, so a missing / malformed / non-dict file degrades
    gracefully to no overviews (logged) rather than crashing app startup.
    """
    global DISH_OVERVIEWS
    try:
        data = json.loads(DISH_OVERVIEWS_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError:
        logger.warning(f"dish_overviews.json not found at {DISH_OVERVIEWS_PATH}")
        DISH_OVERVIEWS = {}
        return 0
    except json.JSONDecodeError as exc:
        logger.error(f"dish_overviews.json is malformed: {exc}")
        DISH_OVERVIEWS = {}
        return 0
    if not isinstance(data, dict):
        logger.error("dish_overviews.json top-level must be an object")
        DISH_OVERVIEWS = {}
        return 0
    DISH_OVERVIEWS = data
    logger.info(f"Loaded {len(DISH_OVERVIEWS)} dish overviews")
    return len(DISH_OVERVIEWS)


def get_overview(slug: Optional[str]) -> Optional[dict]:
    """Return overview dict for slug, or None (also None for an empty entry)."""
    if not slug:
        return None
    return DISH_OVERVIEWS.get(slug) or None
