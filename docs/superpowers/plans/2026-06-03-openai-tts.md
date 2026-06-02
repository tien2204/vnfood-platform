# Server-side Vietnamese TTS (OpenAI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read cooking steps aloud in Vietnamese on any machine by synthesizing speech server-side with OpenAI, instead of the browser's Web Speech API (which needs a locally installed Vietnamese voice the user doesn't have).

**Architecture:** A new FastAPI `GET /api/v1/tts?text=` endpoint (auth-required) calls `tts_service.synthesize_vi()`, which returns cached MP3 bytes (cache key = sha1 of model+voice+text, stored under `uploads/tts/`) or synthesizes via `AsyncOpenAI.audio.speech.with_streaming_response`. The frontend `useSpeech` hook keeps its public interface but rewrites its internals to fetch the MP3 blob and play it with an `Audio` element, so `CookingMode` is unchanged.

**Tech Stack:** FastAPI, `openai>=1.52` (`AsyncOpenAI`), pydantic-settings, Next.js 16 client hook, axios (`@/lib/api`), browser `Audio` + `AbortController`.

**Branch:** `feat/canonical-recipes`. No DB, no migration. **Restart uvicorn after backend changes.**

**Verification note:** No backend pytest harness here; verify with a throwaway smoke script run from `backend/` via the venv, plus an app route-registration check (no running server needed). Frontend has no test runner → `npx tsc --noEmit` + manual. Backend commands run from `backend/` on Windows PowerShell with `$env:PYTHONUTF8=1; .venv\Scripts\python.exe ...`.

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/app/core/config.py` (modify) | Add `OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE` settings. |
| `backend/app/services/tts_service.py` (new) | `synthesize_vi(text) -> bytes`: disk-cached OpenAI MP3 synthesis. |
| `backend/app/api/v1/tts.py` (new) | `GET /tts` auth-required endpoint returning `audio/mpeg`. |
| `backend/app/main.py` (modify) | Import + mount the tts router at `/api/v1`. |
| `frontend/lib/hooks/useSpeech.ts` (rewrite internals) | Same interface; fetch MP3 from `/tts` and play via `Audio`. |

---

### Task 1: TTS settings

**Files:**
- Modify: `backend/app/core/config.py`

- [ ] **Step 1: Add the two settings**

In `backend/app/core/config.py`, change:

```python
    OPENAI_API_KEY: str = ""
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE_MB: int = 10
    MODEL_WEIGHTS_DIR: str = "../model_weights"
```

to:

```python
    OPENAI_API_KEY: str = ""
    OPENAI_TTS_MODEL: str = "gpt-4o-mini-tts"
    OPENAI_TTS_VOICE: str = "alloy"
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE_MB: int = 10
    MODEL_WEIGHTS_DIR: str = "../model_weights"
```

- [ ] **Step 2: Verify settings load**

Run from `backend/`:

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -c "from app.core.config import settings; print(settings.OPENAI_TTS_MODEL, '|', settings.OPENAI_TTS_VOICE)"
```

Expected: `gpt-4o-mini-tts | alloy`

- [ ] **Step 3: Commit**

```bash
git add backend/app/core/config.py
git commit -m "feat(tts): add OPENAI_TTS_MODEL/VOICE settings"
```

---

### Task 2: `tts_service.synthesize_vi`

**Files:**
- Create: `backend/app/services/tts_service.py`

- [ ] **Step 1: Create the service**

Create `backend/app/services/tts_service.py`:

```python
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
```

- [ ] **Step 2: Create a throwaway smoke script**

Create `backend/scripts/_smoke_tts.py` (temporary — deleted in Step 5, never committed):

```python
import asyncio

from app.services.tts_service import _cache_path, synthesize_vi


async def main():
    text = "Xin chào, đây là bước một."
    audio = await synthesize_vi(text)
    print("bytes:", len(audio), "header:", audio[:3])
    print("cache file exists:", __import__("os").path.exists(_cache_path(text)))


asyncio.run(main())
```

- [ ] **Step 3: Run the smoke (real OpenAI call — needs OPENAI_API_KEY + network)**

Run from `backend/`:

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -m scripts._smoke_tts
```

Expected: `bytes:` a number > 1000, and `cache file exists: True`. (If it prints a RuntimeError about `OPENAI_API_KEY`, the key is missing from `backend/.env` — report that as a blocker.)

- [ ] **Step 4: Verify the cache is reused (no second network call)**

Run the same command again:

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -m scripts._smoke_tts
```

Expected: same `bytes:` count, returns near-instantly (served from `uploads/tts/<hash>.mp3`, no OpenAI call).

- [ ] **Step 5: Delete the throwaway smoke script**

```bash
git status --short backend/scripts/_smoke_tts.py   # should be untracked
```
Then delete the file `backend/scripts/_smoke_tts.py` (it must NOT be committed). On Windows: `Remove-Item backend/scripts/_smoke_tts.py`.

- [ ] **Step 6: Commit (service only)**

```bash
git add backend/app/services/tts_service.py
git commit -m "feat(tts): synthesize_vi — OpenAI MP3 synthesis with disk cache"
```

---

### Task 3: `/api/v1/tts` endpoint + mount

**Files:**
- Create: `backend/app/api/v1/tts.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Create the endpoint**

Create `backend/app/api/v1/tts.py`:

```python
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
```

- [ ] **Step 2: Import the router in `main.py`**

In `backend/app/main.py`, after the line:

```python
from app.api.v1.saved import router as saved_router
```

add:

```python
from app.api.v1.tts import router as tts_router
```

- [ ] **Step 3: Mount the router in `main.py`**

In `backend/app/main.py`, after the line:

```python
app.include_router(grocery_router, prefix="/api/v1", tags=["grocery"])
```

add:

```python
app.include_router(tts_router, prefix="/api/v1", tags=["tts"])
```

- [ ] **Step 4: Verify the route is registered (no server needed)**

Run from `backend/`:

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -c "from app.main import app; print([r.path for r in app.routes if getattr(r,'path','').endswith('/tts')])"
```

Expected: `['/api/v1/tts']`

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/tts.py backend/app/main.py
git commit -m "feat(tts): GET /api/v1/tts endpoint (auth) returning audio/mpeg"
```

---

### Task 4: Frontend — rewrite `useSpeech` to fetch + play

**Files:**
- Modify: `frontend/lib/hooks/useSpeech.ts` (full replace)

- [ ] **Step 1: Replace the file**

Replace the entire contents of `frontend/lib/hooks/useSpeech.ts` with:

```ts
"use client";

import { useCallback, useRef, useState } from "react";
import api from "@/lib/api";

export interface UseSpeech {
  supported: boolean;
  enabled: boolean;
  setEnabled: (b: boolean) => void;
  speak: (text: string) => void;
  cancel: () => void;
}

/**
 * Reads cooking steps aloud in Vietnamese via the backend `/tts` endpoint
 * (OpenAI server-side synthesis) — no dependency on a locally installed voice.
 * Fetches MP3 audio for the text and plays it; a new `speak` first cancels the
 * previous audio and aborts any in-flight request so steps never overlap.
 * `supported` is always true: synthesis happens on the server, and cooking mode
 * is only reachable while logged in (so the authed request always has a token).
 */
export function useSpeech(): UseSpeech {
  const [enabled, setEnabled] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!enabled) return;
      cancel();
      const controller = new AbortController();
      abortRef.current = controller;
      api
        .get("/tts", {
          params: { text },
          responseType: "blob",
          signal: controller.signal,
        })
        .then((res) => {
          if (controller.signal.aborted) return;
          const url = URL.createObjectURL(res.data as Blob);
          urlRef.current = url;
          const audio = new Audio(url);
          audioRef.current = audio;
          void audio.play();
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          // eslint-disable-next-line no-console
          console.warn("[useSpeech] TTS fetch failed:", err);
        });
    },
    [enabled, cancel],
  );

  return { supported: true, enabled, setEnabled, speak, cancel };
}
```

- [ ] **Step 2: Typecheck**

Run from `frontend/`: `npx tsc --noEmit`
Expected: no new errors (only the 3 known pre-existing files may appear: `app/admin/page.tsx`, `app/me/profile/page.tsx`, `app/recognize/page.tsx`).

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/hooks/useSpeech.ts
git commit -m "feat(tts): useSpeech fetches+plays server TTS audio (same interface)"
```

- [ ] **Step 4: Manual smoke (after restarting uvicorn)**

Restart uvicorn (to load the new router + settings), `npm run dev` in `frontend/`, log in, open a recipe with steps, click "Bắt đầu nấu":
1. The first step is read aloud in a **Vietnamese** voice (OpenAI). Network tab shows `GET /api/v1/tts?text=...` returning `audio/mpeg`.
2. Navigate steps quickly → previous audio stops, no overlap.
3. Toggle the speaker off → no audio; on → reads current step.
4. Re-visiting the same step/recipe is near-instant (served from `uploads/tts/` cache).

---

## Self-Review

**1. Spec coverage:**
- `OPENAI_TTS_MODEL`/`OPENAI_TTS_VOICE` settings → Task 1. ✓
- `tts_service.synthesize_vi` with sha1 cache in `uploads/tts/`, MAX_TTS_CHARS cap, empty→ValueError, no-key→RuntimeError, `with_streaming_response.stream_to_file` + atomic `os.replace` → Task 2. ✓
- `GET /api/v1/tts` auth-required, 400/503/502 mapping, `audio/mpeg` + Cache-Control → Task 3. ✓
- Router mounted at `/api/v1` → Task 3 Steps 2-3. ✓
- Frontend `useSpeech` rewrite keeping interface `{supported, enabled, setEnabled, speak, cancel}`, fetch blob via `api` + play `Audio`, abort/cancel on new speak → Task 4. ✓
- CookingMode unchanged (interface preserved; `supported` stays truthy so the speaker button still renders; existing `cancelSpeech` cleanup still valid) → no task needed, confirmed. ✓
- STT unchanged → no task touches `useVoiceCommands`. ✓
- No migration/DB → confirmed. ✓

**2. Placeholder scan:** No TBD/vague steps. The OpenAI synthesis call is concrete (`with_streaming_response.create(...).stream_to_file`). Every code step shows full code; verification steps give exact commands + expected output. The smoke makes a real (tiny) OpenAI call — called out explicitly, including the missing-key failure mode.

**3. Type consistency:**
- `synthesize_vi(text: str) -> bytes` defined Task 2, called identically in Task 2 smoke and Task 3 endpoint. ✓
- `_cache_path(text)` used by both `synthesize_vi` and the smoke. ✓
- Settings names `OPENAI_TTS_MODEL`/`OPENAI_TTS_VOICE` identical across Task 1 (definition), Task 2 (`_cache_path`, `create(...)`). ✓
- Endpoint param `text` matches the frontend axios `params: { text }` in Task 4. ✓
- `UseSpeech` interface unchanged from the previous implementation, so `CookingMode`'s `speech.supported/enabled/setEnabled/speak/cancel` usage stays valid. ✓

No gaps found.
