import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from app.core.config import settings

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
CATEGORY_DIRS = {"recipe": "recipes", "step": "steps", "avatar": "avatars"}


async def save_uploaded_file(file: UploadFile, category: str = "recipe") -> dict:
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chỉ chấp nhận jpg, png, webp",
        )

    original_ext = Path(file.filename or "").suffix.lower()
    if original_ext not in ALLOWED_EXTENSIONS:
        original_ext = ".jpg"

    subdir = CATEGORY_DIRS.get(category, "recipes")
    upload_root = Path(settings.UPLOAD_DIR) / subdir
    upload_root.mkdir(parents=True, exist_ok=True)

    content = await file.read()
    if len(content) > settings.max_upload_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Ảnh quá lớn (max {settings.MAX_UPLOAD_SIZE_MB}MB)",
        )

    filename = f"{uuid.uuid4()}{original_ext}"
    dest = upload_root / filename
    dest.write_bytes(content)

    url = f"/static/uploads/{subdir}/{filename}"
    return {"url": url, "filename": filename, "size_bytes": len(content)}
