import logging

from fastapi import APIRouter, Depends, HTTPException, Response

from app.core.deps import get_current_user
from app.services.tts_service import synthesize_vi

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/tts")
async def tts_endpoint(text: str, current_user=Depends(get_current_user)):
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="text rỗng")
    try:
        audio = await synthesize_vi(text)
    except ValueError:
        raise HTTPException(status_code=400, detail="text rỗng")
    except RuntimeError:
        raise HTTPException(status_code=503, detail="TTS chưa cấu hình")
    except Exception:
        logger.exception("TTS synthesis failed")
        raise HTTPException(status_code=502, detail="TTS lỗi")
    return Response(
        content=audio,
        media_type="audio/mpeg",
        headers={"Cache-Control": "public, max-age=86400"},
    )
