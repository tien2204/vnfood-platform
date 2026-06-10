import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.state import get_predictor, get_predictor_optional
from app.core.database import get_db
from app.core.deps import get_current_user, get_optional_current_user

router = APIRouter()


@router.get("/health")
async def ai_health():
    from app.services.canonical_coverage import LAST_COVERAGE

    predictor = get_predictor_optional()
    return {
        "success": True,
        "data": {
            "loaded": predictor is not None,
            "device": str(predictor.device) if predictor else None,
            "groups": list(predictor.sub_models.keys()) if predictor else [],
            "canonical_coverage": LAST_COVERAGE,
        },
    }


@router.post("/recognize")
async def recognize_endpoint(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    predictor=Depends(get_predictor),
    current_user=Depends(get_optional_current_user),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File phải là ảnh")

    image_bytes = await file.read()
    if len(image_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Ảnh quá lớn (tối đa 10MB)")

    from app.services.ai_service import recognize_image

    try:
        result = await recognize_image(
            db,
            predictor,
            image_bytes,
            user_id=current_user.id if current_user else None,
        )
        return {"success": True, "data": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class RecognizeUrlRequest(BaseModel):
    image_url: str


@router.post("/recognize-url")
async def recognize_url_endpoint(
    req: RecognizeUrlRequest,
    db: AsyncSession = Depends(get_db),
    predictor=Depends(get_predictor),
    current_user=Depends(get_optional_current_user),
):
    from app.services.ai_service import fetch_image_from_url, recognize_image

    try:
        image_bytes = await fetch_image_from_url(req.image_url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Không tải được ảnh từ URL: {e}")

    if len(image_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Ảnh quá lớn (tối đa 10MB)")

    try:
        result = await recognize_image(
            db,
            predictor,
            image_bytes,
            user_id=current_user.id if current_user else None,
            image_url=req.image_url,
        )
        return {"success": True, "data": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/me/recognition-history")
async def get_my_recognition_history(
    page: int = 1,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from sqlalchemy import func, select

    from app.models.ai_log import AILog

    offset = (page - 1) * limit

    total = (
        await db.execute(select(func.count(AILog.id)).where(AILog.user_id == current_user.id))
    ).scalar()

    logs = (
        await db.execute(
            select(AILog)
            .where(AILog.user_id == current_user.id)
            .order_by(AILog.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
    ).scalars().all()

    return {
        "success": True,
        "data": [
            {
                "id": str(log.id),
                "image_url": log.image_url,
                "predicted_class": log.predicted_class,
                "confidence": log.confidence,
                "model_used": log.model_used,
                "created_at": log.created_at.isoformat(),
            }
            for log in logs
        ],
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "total_pages": (total + limit - 1) // limit,
        },
    }
