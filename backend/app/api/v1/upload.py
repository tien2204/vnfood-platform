from fastapi import APIRouter, Depends, UploadFile, File, Form

from app.core.deps import get_current_active_user
from app.models.user import User
from app.schemas.recipe import UploadResponse
from app.services.upload_service import save_uploaded_file

router = APIRouter()


@router.post("/image", response_model=dict)
async def upload_image(
    file: UploadFile = File(...),
    category: str = Form(default="recipe"),
    current_user: User = Depends(get_current_active_user),
):
    if category not in ("recipe", "step", "avatar"):
        category = "recipe"
    result = await save_uploaded_file(file, category)
    return {"success": True, "data": UploadResponse(**result).model_dump()}
