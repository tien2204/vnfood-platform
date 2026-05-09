"""
Quick smoke-test for VNFoodPredictor.
Run from backend/ with the venv active:
    python scripts/test_predict.py [path/to/image.jpg]
"""
import sys
import os

# Allow importing app.* without installing the package
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from PIL import Image
from app.ai.inference import VNFoodPredictor
from app.core.config import settings


def main():
    image_path = sys.argv[1] if len(sys.argv) > 1 else None
    weights_dir = os.path.abspath(settings.MODEL_WEIGHTS_DIR)

    print(f"Weights dir : {weights_dir}")
    print(f"Exists      : {os.path.isdir(weights_dir)}")
    if not os.path.isdir(weights_dir):
        print("ERROR: weights dir not found. Set MODEL_WEIGHTS_DIR in backend/.env")
        sys.exit(1)

    print("\nLoading models...")
    predictor = VNFoodPredictor(weights_dir)
    print("Models loaded.\n")

    if image_path is None:
        print("No image path supplied — creating a blank 224×224 test image.")
        img = Image.new("RGB", (224, 224), color=(200, 150, 100))
    else:
        img = Image.open(image_path)
        print(f"Image: {image_path}  size={img.size}  mode={img.mode}")

    result = predictor.predict(img)

    print("\n── Prediction result ──────────────────────────")
    print(f"  needs_fallback   : {result['needs_fallback']}")
    print(f"  group            : {result['group']}  ({result['group_confidence']:.3f})")
    print(f"  predicted_class  : {result['predicted_class']}")
    print(f"  display_name     : {result['display_name']}")
    print(f"  class_confidence : {result['class_confidence']:.3f}")
    print("  top5:")
    for item in result.get("top5", []):
        print(f"    {item['confidence']:.3f}  {item['class']}  ({item['display_name']})")


if __name__ == "__main__":
    main()
