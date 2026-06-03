import asyncio
import hashlib
import logging
import os

import edge_tts

from app.core.config import settings

logger = logging.getLogger(__name__)

TTS_DIR = os.path.join(settings.UPLOAD_DIR, "tts")
MAX_TTS_CHARS = 1000
MAX_RETRIES = 3
RETRY_BACKOFF = [0.5, 1.5]  # seconds before attempt 2, 3


def _cache_path(text: str) -> str:
    """Stable cache filename for a given voice+text combination."""
    key = hashlib.sha1(
        f"edge|{settings.EDGE_TTS_VOICE}|{text}".encode("utf-8")
    ).hexdigest()
    return os.path.join(TTS_DIR, f"{key}.mp3")


async def synthesize_vi(text: str) -> bytes:
    """Return MP3 bytes of `text` spoken in Vietnamese (edge-tts), cached on disk.

    Retries on edge-tts's transient NoAudioReceived flake; other errors
    propagate. Raises ValueError if `text` is empty.
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

    last_exc: Exception | None = None
    for attempt in range(MAX_RETRIES):
        if attempt > 0:
            await asyncio.sleep(RETRY_BACKOFF[attempt - 1])
        try:
            communicate = edge_tts.Communicate(text, settings.EDGE_TTS_VOICE)
            await communicate.save(tmp)  # native vi-VN neural MP3
            os.replace(tmp, path)  # atomic publish so a partial file is never cached
            with open(path, "rb") as f:
                return f.read()
        except edge_tts.exceptions.NoAudioReceived as exc:
            # Transient Edge-TTS websocket flake — clean partial tmp and retry.
            last_exc = exc
            if os.path.exists(tmp):
                os.remove(tmp)
            logger.warning(
                "edge-tts NoAudioReceived (attempt %d/%d)", attempt + 1, MAX_RETRIES
            )

    raise last_exc  # exhausted retries → caller maps to 502
