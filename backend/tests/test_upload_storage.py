import asyncio
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.core.config import settings
from app.services import upload_service


class _StubUpload:
    """Minimal stand-in for starlette UploadFile (only what the service uses)."""

    def __init__(self, content=b"imgdata", filename="photo.jpg", content_type="image/jpeg"):
        self._content = content
        self.filename = filename
        self.content_type = content_type

    async def read(self):
        return self._content


def test_local_backend_writes_to_disk(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "STORAGE_BACKEND", "local")
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))

    result = asyncio.run(upload_service.save_uploaded_file(_StubUpload(), "recipe"))

    assert result["url"].startswith("/static/uploads/recipes/")
    written = tmp_path / "recipes" / result["filename"]
    assert written.read_bytes() == b"imgdata"


def test_s3_backend_uploads_and_builds_public_url(monkeypatch):
    monkeypatch.setattr(settings, "STORAGE_BACKEND", "s3")
    monkeypatch.setattr(settings, "S3_BUCKET", "my-bucket")
    monkeypatch.setattr(settings, "S3_PUBLIC_BASE_URL", "https://cdn.example.com")

    client = MagicMock()
    monkeypatch.setattr(upload_service, "_get_s3_client", lambda: client)

    result = asyncio.run(upload_service.save_uploaded_file(_StubUpload(), "recipe"))

    client.put_object.assert_called_once()
    kwargs = client.put_object.call_args.kwargs
    assert kwargs["Bucket"] == "my-bucket"
    assert kwargs["Key"] == f"recipes/{result['filename']}"
    assert kwargs["ContentType"] == "image/jpeg"
    assert result["url"] == f"https://cdn.example.com/recipes/{result['filename']}"


def test_rejects_disallowed_content_type(monkeypatch):
    monkeypatch.setattr(settings, "STORAGE_BACKEND", "local")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            upload_service.save_uploaded_file(
                _StubUpload(content_type="application/pdf"), "recipe"
            )
        )
    assert exc.value.status_code == 400
