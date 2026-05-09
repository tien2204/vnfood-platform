from fastapi import APIRouter

from app.ai.state import get_predictor_optional

router = APIRouter()


@router.get("/health")
async def ai_health():
    """Check AI models load status."""
    predictor = get_predictor_optional()
    return {
        "success": True,
        "data": {
            "loaded": predictor is not None,
            "device": str(predictor.device) if predictor else None,
            "groups": list(predictor.sub_models.keys()) if predictor else [],
        },
    }
