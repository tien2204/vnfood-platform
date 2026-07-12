import asyncio
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from app.core.config import settings

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
CATEGORY_DIRS = {"recipe": "recipes", "step": "steps", "avatar": "avatars"}

_CONTENT_TYPE_BY_EXT = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}


async def save_uploaded_file(file: UploadFile, category: str = "recipe") -> dict:
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chỉ chấp nhận jpg, png, webp",
        )

    original_ext = Path(file.filename or "").suffix.lower()
    if original_ext not in ALLOWED_EXTENSIONS:
        original_ext = ".jpg"

    content = await file.read()
    if len(content) > settings.max_upload_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Ảnh quá lớn (max {settings.MAX_UPLOAD_SIZE_MB}MB)",
        )

    subdir = CATEGORY_DIRS.get(category, "recipes")
    filename = f"{uuid.uuid4()}{original_ext}"
    content_type = _CONTENT_TYPE_BY_EXT.get(original_ext, "application/octet-stream")

    if settings.STORAGE_BACKEND == "s3":
        url = await _write_s3(subdir, filename, content, content_type)
    else:
        url = _write_local(subdir, filename, content)

    return {"url": url, "filename": filename, "size_bytes": len(content)}


def _write_local(subdir: str, filename: str, content: bytes) -> str:
    upload_root = Path(settings.UPLOAD_DIR) / subdir
    upload_root.mkdir(parents=True, exist_ok=True)
    (upload_root / filename).write_bytes(content)
    return f"/static/uploads/{subdir}/{filename}"


_s3_client = None


def _get_s3_client():
    """Lazily build an S3-compatible client (boto3). Works with Cloudflare R2,
    Supabase Storage, and AWS S3 via a configurable endpoint URL."""
    global _s3_client
    if _s3_client is None:
        import boto3

        _s3_client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL or None,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
            region_name=settings.S3_REGION or "auto",
        )
    return _s3_client


async def _write_s3(subdir: str, filename: str, content: bytes, content_type: str) -> str:
    key = f"{subdir}/{filename}"
    client = _get_s3_client()
    # boto3 is synchronous — run it off the event loop so uploads don't block.
    await asyncio.to_thread(
        client.put_object,
        Bucket=settings.S3_BUCKET,
        Key=key,
        Body=content,
        ContentType=content_type,
    )
    base = settings.S3_PUBLIC_BASE_URL.rstrip("/")
    return f"{base}/{key}"
