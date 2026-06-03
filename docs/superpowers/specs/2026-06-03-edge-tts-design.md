# Thiết kế — Đổi TTS engine sang edge-tts (giọng Việt native)

**Ngày:** 2026-06-03
**Branch:** `feat/canonical-recipes`
**Bối cảnh:** TTS cooking mode đang dùng OpenAI (`gpt-4o-mini-tts`, voice `alloy`) — giọng OpenAI thiết kế cho tiếng Anh nên đọc tiếng Việt kém tự nhiên. Đổi engine synth sang **edge-tts** (Microsoft Edge neural, giọng vi-VN native, miễn phí). Chỉ thay phần synth ở backend; endpoint + frontend giữ nguyên.

---

## 1. Mục tiêu
Giọng đọc bước nấu **tự nhiên như người Việt** bằng giọng neural `vi-VN-HoaiMyNeural` (nữ). Không cần API key.

## 2. Quyết định đã chốt (với user)
- Engine: **edge-tts** (đổi từ OpenAI). Lý do: giọng vi-VN bản địa, miễn phí, tự nhiên hơn.
- Voice mặc định: **`vi-VN-HoaiMyNeural`** (nữ). Đổi `vi-VN-NamMinhNeural` (nam) qua config nếu muốn.
- Giữ `OPENAI_API_KEY` (vẫn dùng cho vision fallback + dish recipes) — chỉ bỏ phần OpenAI TTS.
- Endpoint `GET /api/v1/tts`, frontend `useSpeech`, prefetch, dedupe "Bước N" — **không đổi**.

### Non-goals
- Không Azure (cần key/SDK). Không hybrid. Không đổi STT. Không đổi frontend/endpoint.

### Ràng buộc đã biết
- edge-tts gọi endpoint Microsoft **không chính thức** → cần internet, có thể đổi/gián đoạn. Chấp nhận cho demo; đổi engine dễ vì đã cô lập trong `tts_service`.

## 3. Thay đổi chi tiết (chỉ backend)

### 3.1 `backend/requirements.txt`
Thêm dòng `edge-tts>=6.1.9`. Cài: `pip install "edge-tts>=6.1.9"` trong `.venv`.

### 3.2 `backend/app/core/config.py`
- **Bỏ** `OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE` (không còn dùng).
- **Thêm** `EDGE_TTS_VOICE: str = "vi-VN-HoaiMyNeural"`.
- Giữ `OPENAI_API_KEY`.

### 3.3 `backend/app/services/tts_service.py`
- Bỏ `from openai import AsyncOpenAI`; thêm `import edge_tts`.
- Cache key đổi sang `f"edge|{settings.EDGE_TTS_VOICE}|{text}"` (file OpenAI cũ trong `uploads/tts/` thành rác vô hại, gitignored).
- `synthesize_vi(text)`:
  - `text = text.strip()[:MAX_TTS_CHARS]`; rỗng → `ValueError`.
  - cache hit → đọc trả.
  - else: `os.makedirs(TTS_DIR, exist_ok=True)`; `tmp = path + ".tmp"`;
    ```python
    communicate = edge_tts.Communicate(text, settings.EDGE_TTS_VOICE)
    await communicate.save(tmp)   # xuất mp3 vi-VN native
    os.replace(tmp, path)
    ```
    return file bytes.
  - **Bỏ** nhánh `RuntimeError("OPENAI_API_KEY not configured")` (edge-tts không cần key).

### 3.4 `backend/app/api/v1/tts.py`
- **Bỏ** nhánh `except RuntimeError → 503` (không còn no-key case). Giữ `ValueError → 400` và `except Exception → 502` (edge-tts lỗi mạng/no-audio rơi vào đây, có `logger.exception`).

## 4. Files
- **Modify:** `backend/requirements.txt`, `backend/app/core/config.py`, `backend/app/services/tts_service.py`, `backend/app/api/v1/tts.py`
- Không đổi frontend, không migration, không DB.

## 5. Error handling
- edge-tts raise (mạng/NoAudioReceived) → endpoint `except Exception → 502` + log.
- text rỗng → 400. text dài → cắt `MAX_TTS_CHARS=1000`.

## 6. Verification
- **Backend smoke** (từ `backend/`, `.venv`, `$env:PYTHONUTF8=1`): `synthesize_vi("Xin chào, đây là bước một.")` → bytes mp3 (`\xff\xfb`/`ID3`) + file `uploads/tts/<hash>.mp3`; gọi lần 2 → cache hit.
- Route vẫn `/api/v1/tts` (không đổi).
- `pip install edge-tts` thành công, `python -c "import edge_tts"` OK.
- Restart uvicorn → browser nghe giọng HoaiMy (nữ, native).

## 7. Vị trí
Tiếp nối TTS cooking mode. Sau cái này còn 3 sub-project: personalization engine (embedding), substitution (curated+LLM), video.
