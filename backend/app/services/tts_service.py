import asyncio
import hashlib
import io
import logging
import os
import shutil
import wave
from pathlib import Path

from piper import PiperVoice

from app.core.config import settings

logger = logging.getLogger(__name__)

TTS_DIR = os.path.join(settings.UPLOAD_DIR, "tts")
MAX_TTS_CHARS = 1000

# Local Piper voice (offline neural TTS — no network, no Microsoft edge-tts flake).
_MODEL_DIR = Path(__file__).resolve().parent.parent.parent / "tts_models"
_MODEL_PATH = _MODEL_DIR / "vi_VN-vais1000-medium.onnx"
_CONFIG_PATH = _MODEL_DIR / "vi_VN-vais1000-medium.onnx.json"
_VOICE_TAG = "vi_VN-vais1000-medium"

_voice: PiperVoice | None = None  # lazy singleton, loaded on first use


def _ascii_espeak_dir() -> str:
    """Return an ASCII-only path to espeak-ng-data, mirroring the bundled copy on
    first use.

    Piper phonemizes via espeak-ng, a C library whose file I/O fails when the
    data dir contains non-ASCII characters — and this repo lives under
    "…/ĐATN 20252/…". The .onnx model itself is fine (loaded by onnxruntime via
    Python), only espeak-ng-data must sit on an ASCII path.
    """
    import piper

    src = Path(piper.__file__).parent / "espeak-ng-data"
    dst = Path.home() / ".vnfood_tts" / "espeak-ng-data"
    if not (dst / "phontab").exists():
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(src, dst, dirs_exist_ok=True)
    return str(dst)


def _get_voice() -> PiperVoice:
    global _voice
    if _voice is None:
        _voice = PiperVoice.load(
            str(_MODEL_PATH),
            config_path=str(_CONFIG_PATH),
            espeak_data_dir=_ascii_espeak_dir(),
        )
        logger.info("Piper voice loaded: %s", _VOICE_TAG)
    return _voice


def _cache_path(text: str) -> str:
    """Stable cache filename for a given voice+text combination."""
    key = hashlib.sha1(f"piper|{_VOICE_TAG}|{text}".encode("utf-8")).hexdigest()
    return os.path.join(TTS_DIR, f"{key}.wav")


def _render_wav(text: str) -> bytes:
    """Synchronously synthesize `text` to WAV bytes (CPU-bound, ~0.2s)."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        _get_voice().synthesize_wav(text, wf)
    return buf.getvalue()


async def synthesize_vi(text: str) -> bytes:
    """Return WAV bytes of `text` spoken in Vietnamese (Piper, offline), cached on disk.

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
    # Run the blocking Piper inference off the event loop.
    audio = await asyncio.to_thread(_render_wav, text)

    tmp = path + ".tmp"
    with open(tmp, "wb") as f:
        f.write(audio)
    os.replace(tmp, path)  # atomic publish so a partial file is never cached
    return audio
