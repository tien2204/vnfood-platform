import hashlib
import os

from openai import AsyncOpenAI

from app.core.config import settings

TTS_DIR = os.path.join(settings.UPLOAD_DIR, "tts")
MAX_TTS_CHARS = 1000


def _cache_path(text: str) -> str:
    """Stable cache filename for a given model+voice+text combination."""
    key = hashlib.sha1(
        f"{settings.OPENAI_TTS_MODEL}|{settings.OPENAI_TTS_VOICE}|{text}".encode("utf-8")
    ).hexdigest()
    return os.path.join(TTS_DIR, f"{key}.mp3")


async def synthesize_vi(text: str) -> bytes:
    """Return MP3 bytes of `text` spoken in Vietnamese, cached on disk.

    Raises ValueError if `text` is empty, RuntimeError if no API key is set.
    """
    text = text.strip()[:MAX_TTS_CHARS]
    if not text:
        raise ValueError("text rỗng")

    path = _cache_path(text)
    if os.path.exists(path):
        with open(path, "rb") as f:
            return f.read()

    if not settings.OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY not configured")

    os.makedirs(TTS_DIR, exist_ok=True)
    tmp = path + ".tmp"
    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    async with client.audio.speech.with_streaming_response.create(
        model=settings.OPENAI_TTS_MODEL,
        voice=settings.OPENAI_TTS_VOICE,
        input=text,
        response_format="mp3",
    ) as response:
        await response.stream_to_file(tmp)
    os.replace(tmp, path)  # atomic publish so a partial file is never cached

    with open(path, "rb") as f:
        return f.read()
