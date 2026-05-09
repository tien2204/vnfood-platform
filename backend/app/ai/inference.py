import os
import logging

import torch
import torch.nn as nn
import torch.nn.functional as F
import torchvision.transforms as T
from PIL import Image
from torchvision.models import (
    efficientnet_b0, EfficientNet_B0_Weights,
    efficientnet_b2, EfficientNet_B2_Weights,
)

from app.ai.class_names import (
    CLASS_DISPLAY_NAMES,
    GROUP_CLASSES,
    GROUP_MODEL_FILE,
    GROUP_TO_WEIGHT,
)

logger = logging.getLogger(__name__)

# ImageNet stats used during training
_MEAN = [0.485, 0.456, 0.406]
_STD  = [0.229, 0.224, 0.225]

# Val transforms match training exactly (Resize to target, no CenterCrop)
_GROUP_TRANSFORM = T.Compose([
    T.Resize((224, 224)),
    T.ToTensor(),
    T.Normalize(mean=_MEAN, std=_STD),
])

_SUB_TRANSFORM = T.Compose([
    T.Resize((260, 260)),
    T.ToTensor(),
    T.Normalize(mean=_MEAN, std=_STD),
])


def _build_group_model(num_classes: int) -> nn.Module:
    """EfficientNet-B0 with same classifier structure as training."""
    model = efficientnet_b0(weights=None)
    in_features = model.classifier[1].in_features
    model.classifier = nn.Sequential(
        nn.Dropout(p=0.3, inplace=True),
        nn.Linear(in_features, num_classes),
    )
    return model


def _build_sub_model(num_classes: int) -> nn.Module:
    """EfficientNet-B2 with same classifier structure as training."""
    model = efficientnet_b2(weights=None)
    in_features = model.classifier[1].in_features
    model.classifier = nn.Sequential(
        nn.Dropout(p=0.3, inplace=True),
        nn.Linear(in_features, num_classes),
    )
    return model


def _load_model_state(path: str, device) -> dict:
    """
    Load checkpoint regardless of format:
      - {'model_state': ..., 'val_acc': ...}   ← best_* files (minimal)
      - {'model_state': ..., 'group_names': ..., ...}  ← final files (with metadata)
    """
    ckpt = torch.load(path, map_location=device, weights_only=False)
    if not isinstance(ckpt, dict):
        # raw state_dict tensor
        return {'model_state': ckpt}
    return ckpt


class VNFoodPredictor:
    """
    Hierarchical predictor matching vnfood_hierarchical_training.py exactly.

    Checkpoint format (best_* files — no metadata):
        {'model_state': OrderedDict(...), 'val_acc': float}

    Sub-class ordering: sorted(GROUP_CLASSES[group]) — matches training line 531.
    """

    GROUP_CONFIDENCE_THRESHOLD = 0.5
    CLASS_CONFIDENCE_THRESHOLD = 0.6

    def __init__(self, weights_dir: str):
        self.weights_dir = weights_dir
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        logger.info("VNFoodPredictor initializing on %s", self.device)

        # ── Group model ──────────────────────────────────────────────────────
        group_path = os.path.join(weights_dir, GROUP_MODEL_FILE)
        group_ckpt = _load_model_state(group_path, self.device)

        # Metadata may or may not exist in checkpoint
        self.group_names: list = group_ckpt.get(
            'group_names', list(GROUP_CLASSES.keys())
        )
        num_groups = group_ckpt.get('num_groups', len(self.group_names))

        self.group_model = _build_group_model(num_groups)
        self.group_model.load_state_dict(group_ckpt['model_state'])
        self.group_model.eval().to(self.device)
        logger.info(
            "Loaded group model: %d groups — val_acc=%.2f%%",
            num_groups,
            group_ckpt.get('val_acc', group_ckpt.get('best_val_acc', 0)) * 100,
        )

        # ── Sub-class models ─────────────────────────────────────────────────
        self.sub_models: dict = {}
        self.sub_class_names: dict = {}  # group → [class_slug, ...] in sorted order

        for gname in self.group_names:
            weight_file = GROUP_TO_WEIGHT.get(gname, f'best_sub_{gname}_effb2.pth')
            path = os.path.join(weights_dir, weight_file)
            if not os.path.isfile(path):
                logger.warning("Missing sub-model: %s — skipping %s", path, gname)
                continue

            sub_ckpt = _load_model_state(path, self.device)

            # class_names in checkpoint are sorted (training line 531)
            # fallback: sort GROUP_CLASSES[gname] to match training behaviour
            class_names: list = sub_ckpt.get(
                'class_names', sorted(GROUP_CLASSES.get(gname, []))
            )
            num_classes = sub_ckpt.get('num_classes', len(class_names))

            self.sub_class_names[gname] = class_names
            model = _build_sub_model(num_classes)
            model.load_state_dict(sub_ckpt['model_state'])
            model.eval().to(self.device)
            self.sub_models[gname] = model
            logger.info(
                "Loaded %s: %d classes — val_acc=%.2f%%",
                gname, num_classes,
                sub_ckpt.get('val_acc', sub_ckpt.get('best_val_acc', 0)) * 100,
            )

        logger.info("VNFoodPredictor ready")

    # ── inference ────────────────────────────────────────────────────────────

    @torch.no_grad()
    def predict(self, pil_image: Image.Image) -> dict:
        """
        Returns:
        {
            "needs_fallback": bool,
            "group": str | None,
            "group_confidence": float,
            "predicted_class": str | None,
            "display_name": str | None,
            "class_confidence": float,
            "top5": [{"class": str, "display_name": str, "confidence": float}, ...]
        }
        """
        if pil_image.mode != 'RGB':
            pil_image = pil_image.convert('RGB')

        # Stage 1: group
        img_t = _GROUP_TRANSFORM(pil_image).unsqueeze(0).to(self.device)
        group_probs = F.softmax(self.group_model(img_t), dim=1)[0]
        group_conf, group_idx = group_probs.max(0)
        group_name = self.group_names[group_idx.item()]
        group_conf = float(group_conf.item())

        result = {
            "needs_fallback": False,
            "group": group_name,
            "group_confidence": group_conf,
            "predicted_class": None,
            "display_name": None,
            "class_confidence": 0.0,
            "top5": [],
        }

        if group_conf < self.GROUP_CONFIDENCE_THRESHOLD:
            result["needs_fallback"] = True
            return result

        if group_name not in self.sub_models:
            logger.warning("No sub-model for group %s", group_name)
            result["needs_fallback"] = True
            return result

        # Stage 2: sub-class
        class_names = self.sub_class_names[group_name]
        img_t2 = _SUB_TRANSFORM(pil_image).unsqueeze(0).to(self.device)
        sub_probs = F.softmax(self.sub_models[group_name](img_t2), dim=1)[0]

        k = min(5, len(class_names))
        top_vals, top_idxs = sub_probs.topk(k)
        top5 = [
            {
                "class": class_names[i.item()],
                "display_name": CLASS_DISPLAY_NAMES.get(
                    class_names[i.item()], class_names[i.item()]
                ),
                "confidence": float(v.item()),
            }
            for v, i in zip(top_vals, top_idxs)
        ]
        result["top5"] = top5

        best = top5[0]
        result["predicted_class"] = best["class"]
        result["display_name"] = best["display_name"]
        result["class_confidence"] = best["confidence"]

        if best["confidence"] < self.CLASS_CONFIDENCE_THRESHOLD:
            result["needs_fallback"] = True

        return result
