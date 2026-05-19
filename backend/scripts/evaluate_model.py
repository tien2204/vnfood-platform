"""Evaluate VNFood hierarchical model on test set, output per-class P/R/F1.

Walks `test/<slug>/*.{jpg,jpeg,png,webp}` (path relative to repo root),
runs the full inference pipeline (group classifier → sub-class classifier),
and computes precision / recall / F1 per slug + macro / weighted aggregates.

When `predictor.predict()` reports `needs_fallback=True` (low group confidence
or no sub-model), the sample is counted as predicted='__unknown__' — a wrong
prediction against any real class. This penalises the model honestly rather
than skipping uncertain samples.

Output: backend/app/ai/model_metrics.json

Usage (from repo root):
    cd backend
    python -m scripts.evaluate_model [--limit-per-class N] [--test-dir PATH]
"""
import argparse
import json
import logging
import time
from collections import defaultdict
from pathlib import Path

from PIL import Image
from sklearn.metrics import precision_recall_fscore_support, accuracy_score

from app.ai.inference import VNFoodPredictor
from app.core.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp"}

# Repo-root-relative default — script runs from backend/ but test set lives at ../test
DEFAULT_TEST_DIR = Path(__file__).parent.parent.parent / "test"
OUTPUT_PATH = Path(__file__).parent.parent / "app" / "ai" / "model_metrics.json"
UNKNOWN_LABEL = "__unknown__"


def collect_test_samples(test_dir: Path, limit_per_class: int | None) -> list[tuple[Path, str]]:
    """Return [(image_path, true_slug), ...] from ImageFolder layout."""
    samples = []
    for slug_dir in sorted(test_dir.iterdir()):
        if not slug_dir.is_dir():
            continue
        slug = slug_dir.name
        imgs = [p for p in slug_dir.iterdir() if p.suffix.lower() in IMG_EXTS]
        imgs.sort()
        if limit_per_class:
            imgs = imgs[:limit_per_class]
        for img_path in imgs:
            samples.append((img_path, slug))
    return samples


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit-per-class", type=int, default=None,
                        help="Cap images per class (testing). Default: all.")
    parser.add_argument("--test-dir", type=str, default=str(DEFAULT_TEST_DIR),
                        help=f"Test set root (default: {DEFAULT_TEST_DIR})")
    args = parser.parse_args()

    test_dir = Path(args.test_dir).resolve()
    if not test_dir.exists():
        raise SystemExit(f"Test dir not found: {test_dir}")

    import os
    weights_dir = os.path.abspath(settings.MODEL_WEIGHTS_DIR)
    logger.info(f"Loading model weights from {weights_dir}...")
    predictor = VNFoodPredictor(weights_dir)
    logger.info("Model loaded.")

    samples = collect_test_samples(test_dir, args.limit_per_class)
    logger.info(f"Found {len(samples)} test samples across {len(set(s for _, s in samples))} classes.")

    y_true: list[str] = []
    y_pred: list[str] = []
    per_class_counts: dict[str, dict[str, int]] = defaultdict(lambda: {"total": 0, "correct": 0})
    fallback_count = 0

    start = time.monotonic()
    for idx, (img_path, true_slug) in enumerate(samples, start=1):
        try:
            pil = Image.open(img_path)
        except Exception as e:
            logger.warning(f"[{idx}] skip unreadable: {img_path} ({e})")
            continue

        result = predictor.predict(pil)
        if result["needs_fallback"] or not result["predicted_class"]:
            pred_slug = UNKNOWN_LABEL
            fallback_count += 1
        else:
            pred_slug = result["predicted_class"]

        y_true.append(true_slug)
        y_pred.append(pred_slug)
        per_class_counts[true_slug]["total"] += 1
        if pred_slug == true_slug:
            per_class_counts[true_slug]["correct"] += 1

        if idx % 200 == 0 or idx == len(samples):
            elapsed = time.monotonic() - start
            rate = idx / elapsed
            eta = (len(samples) - idx) / rate if rate else 0
            logger.info(
                f"[{idx}/{len(samples)}] elapsed={elapsed:.1f}s rate={rate:.1f}/s "
                f"eta={eta:.0f}s | fallback={fallback_count}"
            )

    # Per-class P/R/F1 (sklearn handles label set automatically)
    all_classes = sorted(set(y_true))  # exclude UNKNOWN_LABEL from "real" classes
    precision, recall, f1, support = precision_recall_fscore_support(
        y_true, y_pred, labels=all_classes, zero_division=0
    )

    per_class = {
        slug: {
            "precision": float(precision[i]),
            "recall": float(recall[i]),
            "f1": float(f1[i]),
            "support": int(support[i]),
        }
        for i, slug in enumerate(all_classes)
    }

    # Aggregates
    macro_p, macro_r, macro_f1, _ = precision_recall_fscore_support(
        y_true, y_pred, labels=all_classes, average="macro", zero_division=0
    )
    weighted_p, weighted_r, weighted_f1, _ = precision_recall_fscore_support(
        y_true, y_pred, labels=all_classes, average="weighted", zero_division=0
    )
    accuracy = accuracy_score(y_true, y_pred)

    output = {
        "per_class": per_class,
        "macro": {
            "precision": float(macro_p),
            "recall": float(macro_r),
            "f1": float(macro_f1),
        },
        "weighted": {
            "precision": float(weighted_p),
            "recall": float(weighted_r),
            "f1": float(weighted_f1),
        },
        "accuracy": float(accuracy),
        "total_samples": len(y_true),
        "fallback_count": fallback_count,
        "test_dir": str(test_dir),
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.info(
        f"[DONE] Wrote {OUTPUT_PATH}. "
        f"Accuracy={accuracy:.3f} | Macro F1={macro_f1:.3f} | Weighted F1={weighted_f1:.3f} | "
        f"fallback={fallback_count}/{len(y_true)}"
    )


if __name__ == "__main__":
    main()
