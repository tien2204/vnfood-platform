"""Per-class model evaluation metrics (Precision / Recall / F1).

Generated offline by `scripts/evaluate_model.py` from the test set, loaded
once at app startup. Recognition endpoint attaches the metrics for the
predicted class so the UI can report model performance for THIS dish on
TEST SET (different from per-prediction confidence, which is softmax
probability for THIS image).
"""
import json
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

METRICS_PATH = Path(__file__).parent.parent / "ai" / "model_metrics.json"
MODEL_METRICS: dict = {}


def load_model_metrics() -> int:
    """Load metrics into memory at startup. Returns number of per-class entries."""
    global MODEL_METRICS
    if not METRICS_PATH.exists():
        logger.warning(f"model_metrics.json not found at {METRICS_PATH}")
        MODEL_METRICS = {}
        return 0
    MODEL_METRICS = json.loads(METRICS_PATH.read_text(encoding="utf-8"))
    n = len(MODEL_METRICS.get("per_class", {}))
    logger.info(f"Loaded model metrics: {n} classes, accuracy={MODEL_METRICS.get('accuracy', 0):.3f}")
    return n


def get_class_metrics(slug: str) -> Optional[dict]:
    """Return {'precision': ..., 'recall': ..., 'f1': ..., 'support': ...} for slug, or None."""
    return MODEL_METRICS.get("per_class", {}).get(slug)


def get_overall_metrics() -> dict:
    """Return {'accuracy', 'macro', 'weighted', 'total_samples'} or empty dict if unloaded."""
    if not MODEL_METRICS:
        return {}
    return {
        "accuracy": MODEL_METRICS.get("accuracy"),
        "macro": MODEL_METRICS.get("macro"),
        "weighted": MODEL_METRICS.get("weighted"),
        "total_samples": MODEL_METRICS.get("total_samples"),
    }
