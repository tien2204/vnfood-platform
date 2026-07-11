"""
Global predictor state — kept separate from main.py to avoid circular imports
when AI router modules need to import get_predictor.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import HTTPException

if TYPE_CHECKING:
    from app.ai.inference import TastyVietnamPredictor

_predictor: "TastyVietnamPredictor | None" = None


def set_predictor(p: "TastyVietnamPredictor | None") -> None:
    global _predictor
    _predictor = p


def get_predictor() -> "TastyVietnamPredictor":
    if _predictor is None:
        raise HTTPException(status_code=503, detail="AI models chưa sẵn sàng")
    return _predictor


def get_predictor_optional() -> "TastyVietnamPredictor | None":
    return _predictor
