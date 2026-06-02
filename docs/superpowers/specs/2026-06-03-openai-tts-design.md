# Thiết kế — Server-side Vietnamese TTS (OpenAI) cho Cooking Mode

**Ngày:** 2026-06-03
**Branch:** `feat/canonical-recipes`
**Bối cảnh:** Mở rộng sub-project 4 (cooking mode + voice). Bản đầu dùng Web Speech `speechSynthesis` để đọc bước — nhưng máy user (Chrome + Windows 11) **không có giọng tiếng Việt** nên đọc text Việt bằng giọng Anh. Web Speech chỉ dùng được voice đã cài trên máy → ngõ cụt. Chuyển TTS lên server: backend synth qua OpenAI, trả audio, frontend phát.

---

## 1. Mục tiêu
Đọc bước nấu bằng **giọng tiếng Việt nhất quán trên mọi máy**, không phụ thuộc voice cài sẵn. Tận dụng `OPENAI_API_KEY` + `openai>=1.52` đã có trong dự án.

## 2. Ràng buộc / quyết định đã chốt (với user)
- **Chỉ OpenAI** (không hybrid local-first): một đường code, giọng nhất quán mọi máy. Chấp nhận độ trễ mạng ~1s/bước lần đầu (cache lại → lần sau tức thì).
- STT (`useVoiceCommands`) **giữ nguyên** Web Speech — chỉ thay phần TTS.
- Giữ **interface hook `useSpeech`** `{ supported, enabled, setEnabled, speak, cancel }` → `CookingMode` gần như không đổi.
- Endpoint **yêu cầu đăng nhập** (cooking mode đã sau auth; bảo vệ OpenAI key khỏi lạm dụng).
- Model mặc định `gpt-4o-mini-tts`, voice mặc định `alloy` (voice OpenAI đa ngôn ngữ — đọc text Việt ra giọng Việt). Cấu hình được qua settings.

### Non-goals
- Không hybrid Web Speech/OpenAI.
- Không streaming audio từng phần (synth full bước rồi phát — bước ngắn).
- Không TTS cho nội dung khác ngoài bước cooking ở phạm vi này (endpoint generic nhưng chỉ cooking gọi).
- Không lưu DB (chỉ cache file).
- Không đổi STT.

## 3. Kiến trúc
```
useSpeech.speak("Bước N: …")
  → api.get('/api/v1/tts', { params:{text}, responseType:'blob' })   (Bearer tự gắn)
  → backend GET /tts: tts_service.synthesize_vi(text)
       → sha1(model+voice+text); nếu uploads/tts/<hash>.mp3 tồn tại → đọc trả
       → else AsyncOpenAI.audio.speech.create(model, voice, input, response_format="mp3") → lưu file → trả bytes
  → Response(audio/mpeg) + Cache-Control
  → frontend: new Audio(URL.createObjectURL(blob)).play()
```

## 4. Thiết kế chi tiết

### 4.1 Backend

**`app/core/config.py`** — thêm 2 setting (có default, load từ .env nếu có):
- `OPENAI_TTS_MODEL: str = "gpt-4o-mini-tts"`
- `OPENAI_TTS_VOICE: str = "alloy"`

**`app/services/tts_service.py`** (mới):
- Hằng: `TTS_DIR = os.path.join(settings.UPLOAD_DIR, "tts")`, `MAX_TTS_CHARS = 1000`.
- `async def synthesize_vi(text: str) -> bytes`:
  - `text = text.strip()[:MAX_TTS_CHARS]`; nếu rỗng → raise `ValueError`.
  - `key = sha1(f"{model}|{voice}|{text}".encode()).hexdigest()`; `path = TTS_DIR/<key>.mp3`.
  - Nếu file tồn tại → đọc bytes, return (không gọi OpenAI).
  - Else: nếu `settings.OPENAI_API_KEY` rỗng → raise `RuntimeError("OPENAI_API_KEY not configured")`. `client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)`. Synth bằng streaming-response API ổn định của openai>=1.52:
    ```python
    os.makedirs(TTS_DIR, exist_ok=True)
    tmp = path + ".tmp"
    async with client.audio.speech.with_streaming_response.create(
        model=settings.OPENAI_TTS_MODEL,
        voice=settings.OPENAI_TTS_VOICE,
        input=text,
        response_format="mp3",
    ) as response:
        await response.stream_to_file(tmp)
    os.replace(tmp, path)          # atomic publish
    return open(path, "rb").read()
    ```

**`app/api/v1/tts.py`** (mới):
- `router = APIRouter()`.
- `@router.get("/tts")` `async def tts_endpoint(text: str, current_user = Depends(get_current_user))`:
  - validate `text.strip()` rỗng → `HTTPException(400, "text rỗng")`.
  - `try: audio = await synthesize_vi(text)` ; `except ValueError → 400`; `except RuntimeError → 503 "TTS chưa cấu hình"`; `except Exception → 502 "TTS lỗi"` (log).
  - `return Response(content=audio, media_type="audio/mpeg", headers={"Cache-Control": "public, max-age=86400"})`.

**`app/main.py`** — mount: `app.include_router(tts_router, prefix="/api/v1", tags=["tts"])`.

### 4.2 Frontend — `frontend/lib/hooks/useSpeech.ts` (viết lại ruột, giữ interface)

Interface không đổi:
```ts
export interface UseSpeech {
  supported: boolean;
  enabled: boolean;
  setEnabled: (b: boolean) => void;
  speak: (text: string) => void;
  cancel: () => void;
}
```
- `supported = true` (server lo synth; cooking mode luôn ở trạng thái đã đăng nhập).
- `enabled` state default `true`.
- Refs: `audioRef` (`HTMLAudioElement | null`), `urlRef` (object URL hiện tại để revoke), `abortRef` (`AbortController | null`).
- `cancel()`: nếu `audioRef` → `pause()` + bỏ src; abort `abortRef`; revoke `urlRef`; clear refs.
- `speak(text)`: nếu `!enabled` → return. Gọi `cancel()` trước (dừng cái cũ + abort fetch cũ). Tạo `AbortController` mới. `await api.get('/tts', { params:{text}, responseType:'blob', signal })`. Tạo `url = URL.createObjectURL(blob)`, `audio = new Audio(url)`, lưu refs, `audio.play()`. `catch`: nếu không phải abort → `console.warn` (UI không đổi). `speak` là `useCallback([enabled])` (dùng `api` import sẵn).
- Cleanup: hook **không** tự cancel on unmount; consumer `CookingMode` đã có `useEffect(() => () => cancelSpeech(), [cancelSpeech])` (giữ nguyên) → dừng audio khi đóng.

> Loại bỏ toàn bộ logic Web Speech `speechSynthesis`/voice-pick/`onvoiceschanged`/pending-queue hiện tại (kể cả phần user vừa sửa) — không còn cần dò voice máy.

### 4.3 CookingMode
Không đổi logic. `speech.supported` giờ luôn true → nút loa luôn hiện (đúng ý: TTS giờ chạy mọi máy). `speakStep`/auto-read effect/`cancelSpeech` cleanup giữ nguyên.

## 5. Error handling
- Key rỗng → 503 → frontend `console.warn`, không phát, UI ổn.
- OpenAI lỗi/timeout → 502 → tương tự.
- Đổi bước nhanh → abort fetch cũ + dừng audio cũ trước khi phát mới (không chồng tiếng).
- Mất mạng → fetch fail → no audio, nút/phím vẫn điều hướng.
- text quá dài → cắt `MAX_TTS_CHARS` (bước recipe ngắn nên hiếm).

## 6. Files
- **New:** `backend/app/services/tts_service.py`, `backend/app/api/v1/tts.py`
- **Modify:** `backend/app/core/config.py` (+2 setting), `backend/app/main.py` (mount router)
- **Modify (rewrite internals):** `frontend/lib/hooks/useSpeech.ts`
- Không migration, không DB. `uploads/tts/` tự tạo (gitignore uploads đã có).

## 7. Verification
- **Backend smoke** (chạy từ `backend/` với `.venv`, `$env:PYTHONUTF8=1`): gọi `synthesize_vi("Xin chào, đây là bước một")` → kiểm bytes mp3 (header `ID3`/`\xff\xfb`) + file `uploads/tts/<hash>.mp3` được tạo; gọi lần 2 cùng text → trả từ cache (không gọi mạng — kiểm bằng mtime/không tăng thời gian rõ rệt hoặc log).
- **Endpoint:** uvicorn chạy, `curl -H "Authorization: Bearer <token>" "http://localhost:8000/api/v1/tts?text=Xin%20chao" --output test.mp3` → file phát được; không token → 401.
- **Frontend:** `npx tsc --noEmit` 0 lỗi mới (baseline 3 file pre-existing). Manual: cooking mode (đã login) → nghe giọng Việt; đổi bước nhanh không chồng tiếng; tắt loa → im.
- Cần **restart uvicorn** để load router + config mới.

## 8. Vị trí trong decomposition
Mở rộng sub-project 4 (cooking voice). Sau cái này còn 3 sub-project: personalization engine (embedding), substitution (curated+LLM), video.
