import logging
import os

from app.core.config import settings

logger = logging.getLogger(__name__)


def build_predictor():
    """Dựng predictor theo cấu hình: HttpPredictor (http), TastyVietnamPredictor
    (local + có weights), hoặc None (local + thiếu weights → AI tắt)."""
    if settings.AI_BACKEND == "http":
        from app.ai.http_predictor import HttpPredictor
        logger.info("AI backend = http (%s)", settings.AI_SERVICE_URL)
        return HttpPredictor(
            settings.AI_SERVICE_URL,
            settings.AI_SERVICE_TOKEN,
            settings.AI_SERVICE_TIMEOUT,
        )

    weights_dir = os.path.abspath(settings.MODEL_WEIGHTS_DIR)
    if not os.path.isdir(weights_dir):
        logger.warning("Model weights dir not found: %s — AI features disabled", weights_dir)
        return None
    from app.ai.inference import TastyVietnamPredictor
    logger.info("Loading AI models from %s ...", weights_dir)
    return TastyVietnamPredictor(weights_dir)
