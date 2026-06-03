import hashlib
import os

import edge_tts

from app.core.config import settings

TTS_DIR = os.path.join(settings.UPLOAD_DIR, "tts")
MAX_TTS_CHARS = 1000


def _cache_path(text: str) -> str:
    """Stable cache filename for a given voice+text combination."""
    key = hashlib.sha1(
        f"edge|{settings.EDGE_TTS_VOICE}|{text}".encode("utf-8")
    ).hexdigest()
    return os.path.join(TTS_DIR, f"{key}.mp3")


async def synthesize_vi(text: str) -> bytes:
    """Return MP3 bytes of `text` spoken in Vietnamese (edge-tts), cached on disk.

    Raises ValueError if `text` is empty.
    """
    text = text.strip()[:MAX_TTS_CHARS]
    if not text:
        raise ValueError("text rỗng")

    path = _cache_path(text)
    if os.path.exists(path):
        with open(path, "rb") as f:
            return f.read()

    os.makedirs(TTS_DIR, exist_ok=True)
    tmp = path + ".tmp"
    communicate = edge_tts.Communicate(text, settings.EDGE_TTS_VOICE)
    await communicate.save(tmp)  # writes an MP3 using a native vi-VN neural voice
    os.replace(tmp, path)  # atomic publish so a partial file is never cached

    with open(path, "rb") as f:
        return f.read()
