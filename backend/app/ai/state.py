"""
Global predictor state — kept separate from main.py to avoid circular imports
when AI router modules need to import get_predictor.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import HTTPException

if TYPE_CHECKING:
    from app.ai.inference import VNFoodPredictor

_predictor: "VNFoodPredictor | None" = None


def set_predictor(p: "VNFoodPredictor | None") -> None:
    global _predictor
    _predictor = p


def get_predictor() -> "VNFoodPredictor":
    if _predictor is None:
        raise HTTPException(status_code=503, detail="AI models chưa sẵn sàng")
    return _predictor


def get_predictor_optional() -> "VNFoodPredictor | None":
    return _predictor
