# AI over HTTP Service (Task D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép chạy suy luận AI ở một service HTTP riêng (deploy Hugging Face), chọn qua env; mặc định vẫn in-process cho dev.

**Architecture:** Adapter `HttpPredictor` có cùng interface `.predict(pil_image) -> dict` như `TastyVietnamPredictor`. Một factory dựng local hay http tùy `AI_BACKEND`; `ai_service.py` không đổi. Kèm thư mục `ai-service/` (FastAPI + Dockerfile) tự chứa để deploy.

**Tech Stack:** Python 3.11, FastAPI, Pillow, `requests` (đã có trong backend), pytest. Service: FastAPI + torch CPU + uvicorn.

## Global Constraints

- Giữ nguyên hợp đồng dict của `predict()`: keys `needs_fallback, group, group_confidence, predicted_class, display_name, class_confidence, top5`.
- `AI_BACKEND` mặc định `"local"` — không đổi hành vi dev hiện tại.
- Backend KHÔNG thêm dependency mới (dùng `requests` đã có). Message lỗi người dùng: tiếng Việt.
- Python `snake_case` hàm/biến, `PascalCase` class. Test trong `backend/tests/`, chạy `pytest` từ `backend/`.
- Backend khi AI lỗi phải trả 503 (khớp `get_predictor()` cũ); dữ liệu service sai → 502.
- Adapter phải có thuộc tính `device` và `sub_models` để endpoint `/ai/health` (đọc `predictor.device`, `predictor.sub_models`) không vỡ.

---

### Task 1: Config toggle cho AI backend

**Files:**
- Modify: `backend/app/core/config.py`
- Modify: `backend/.env.example`
- Test: `backend/tests/test_ai_backend_config.py`

**Interfaces:**
- Produces: `settings.AI_BACKEND` (str), `settings.AI_SERVICE_URL` (str), `settings.AI_SERVICE_TOKEN` (str), `settings.AI_SERVICE_TIMEOUT` (int).

- [ ] **Step 1: Viết test thất bại**

Tạo `backend/tests/test_ai_backend_config.py`:

```python
from app.core.config import settings


def test_ai_backend_defaults_to_local():
    assert settings.AI_BACKEND == "local"


def test_ai_service_fields_exist_with_defaults():
    assert settings.AI_SERVICE_URL == ""
    assert settings.AI_SERVICE_TOKEN == ""
    assert settings.AI_SERVICE_TIMEOUT == 30
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_ai_backend_config.py -v`
Expected: FAIL — `AttributeError: 'Settings' object has no attribute 'AI_BACKEND'`.

- [ ] **Step 3: Thêm field vào `config.py`**

Trong `backend/app/core/config.py`, ngay sau field `MODEL_WEIGHTS_DIR` (dòng ~22), thêm:

```python
    # AI backend. "local" → nạp model in-process (dev). "http" → gọi service AI
    # riêng (Hugging Face) qua HTTP để tầng AI scale độc lập.
    AI_BACKEND: str = "local"
    AI_SERVICE_URL: str = ""
    AI_SERVICE_TOKEN: str = ""
    AI_SERVICE_TIMEOUT: int = 30
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_ai_backend_config.py -v`
Expected: 2 PASS.

- [ ] **Step 5: Cập nhật `.env.example`**

Thêm vào cuối `backend/.env.example`:

```
# AI backend — "local" (in-process, dev) hoặc "http" (service riêng, HF)
AI_BACKEND=local
# AI_SERVICE_URL=https://<user>-vnfood-ai.hf.space
# AI_SERVICE_TOKEN=
# AI_SERVICE_TIMEOUT=30
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/core/config.py backend/.env.example backend/tests/test_ai_backend_config.py
git commit -m "feat(scale): config toggle for AI backend (local|http)"
```

---

### Task 2: HttpPredictor adapter

**Files:**
- Create: `backend/app/ai/http_predictor.py`
- Test: `backend/tests/test_http_predictor.py`

**Interfaces:**
- Consumes: `settings.*` từ Task 1 (chỉ dùng giá trị, không import trực tiếp — nhận qua tham số).
- Produces: `HttpPredictor(service_url: str, token: str = "", timeout: int = 30)` với `.predict(pil_image: PIL.Image.Image) -> dict`, thuộc tính `.device: str`, `.sub_models: dict`.

- [ ] **Step 1: Viết test thất bại**

Tạo `backend/tests/test_http_predictor.py`:

```python
import io

import pytest
import requests
from fastapi import HTTPException
from PIL import Image

from app.ai import http_predictor as hp
from app.ai.http_predictor import HttpPredictor

_FULL = {
    "needs_fallback": False,
    "group": "BANH",
    "group_confidence": 0.98,
    "predicted_class": "banh-mi",
    "display_name": "Bánh mì",
    "class_confidence": 0.91,
    "top5": [{"class": "banh-mi", "display_name": "Bánh mì", "confidence": 0.91}],
}


class _Resp:
    def __init__(self, status=200, payload=None, raise_json=False):
        self.status_code = status
        self._payload = payload
        self._raise_json = raise_json
        self.text = "err"

    def json(self):
        if self._raise_json:
            raise ValueError("no json")
        return self._payload


def _img():
    return Image.new("RGB", (120, 120))


def test_requires_url():
    with pytest.raises(ValueError):
        HttpPredictor("")


def test_posts_image_and_parses_dict(monkeypatch):
    captured = {}

    def fake_post(url, files=None, headers=None, timeout=None):
        captured["url"] = url
        captured["files"] = files
        captured["headers"] = headers
        return _Resp(200, _FULL)

    monkeypatch.setattr(hp.requests, "post", fake_post)
    out = HttpPredictor("http://svc/", token="secret").predict(_img())
    assert out == _FULL
    assert captured["url"] == "http://svc/predict"
    assert captured["headers"]["Authorization"] == "Bearer secret"
    assert "file" in captured["files"]


def test_no_token_no_auth_header(monkeypatch):
    captured = {}
    monkeypatch.setattr(hp.requests, "post",
                        lambda url, files=None, headers=None, timeout=None:
                        (captured.update(headers=headers) or _Resp(200, _FULL)))
    HttpPredictor("http://svc").predict(_img())
    assert "Authorization" not in captured["headers"]


def test_timeout_retries_then_503(monkeypatch):
    calls = {"n": 0}

    def fake_post(*a, **k):
        calls["n"] += 1
        raise requests.ConnectionError("down")

    monkeypatch.setattr(hp.requests, "post", fake_post)
    with pytest.raises(HTTPException) as exc:
        HttpPredictor("http://svc").predict(_img())
    assert exc.value.status_code == 503
    assert calls["n"] == 2  # 1 lần + 1 retry


def test_server_5xx_maps_503(monkeypatch):
    monkeypatch.setattr(hp.requests, "post",
                        lambda *a, **k: _Resp(500, None))
    with pytest.raises(HTTPException) as exc:
        HttpPredictor("http://svc").predict(_img())
    assert exc.value.status_code == 503


def test_missing_field_maps_502(monkeypatch):
    monkeypatch.setattr(hp.requests, "post",
                        lambda *a, **k: _Resp(200, {"group": "BANH"}))
    with pytest.raises(HTTPException) as exc:
        HttpPredictor("http://svc").predict(_img())
    assert exc.value.status_code == 502


def test_bad_json_maps_502(monkeypatch):
    monkeypatch.setattr(hp.requests, "post",
                        lambda *a, **k: _Resp(200, None, raise_json=True))
    with pytest.raises(HTTPException) as exc:
        HttpPredictor("http://svc").predict(_img())
    assert exc.value.status_code == 502
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_http_predictor.py -v`
Expected: FAIL — `ModuleNotFoundError: app.ai.http_predictor`.

- [ ] **Step 3: Tạo `backend/app/ai/http_predictor.py`**

```python
import io
import logging

import requests
from fastapi import HTTPException
from PIL import Image

logger = logging.getLogger(__name__)

_REQUIRED_FIELDS = (
    "needs_fallback", "group", "group_confidence",
    "predicted_class", "display_name", "class_confidence", "top5",
)


class HttpPredictor:
    """Chạy suy luận trên service AI từ xa qua HTTP, giữ đúng interface
    predict() như TastyVietnamPredictor (local)."""

    def __init__(self, service_url: str, token: str = "", timeout: int = 30):
        if not service_url:
            raise ValueError("AI_SERVICE_URL bắt buộc khi AI_BACKEND='http'")
        self.base_url = service_url.rstrip("/")
        self.token = token
        self.timeout = timeout
        # Cho endpoint /ai/health đọc mà không vỡ:
        self.device = "remote"
        self.sub_models: dict = {}

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.token}"} if self.token else {}

    def _encode(self, pil_image: Image.Image) -> io.BytesIO:
        if pil_image.mode != "RGB":
            pil_image = pil_image.convert("RGB")
        buf = io.BytesIO()
        pil_image.save(buf, format="JPEG")
        buf.seek(0)
        return buf

    def predict(self, pil_image: Image.Image) -> dict:
        url = f"{self.base_url}/predict"
        buf = self._encode(pil_image)
        try:
            resp = requests.post(
                url, files={"file": ("image.jpg", buf, "image/jpeg")},
                headers=self._headers(), timeout=self.timeout,
            )
        except requests.RequestException:
            # Cold start / lỗi tạm thời — thử lại 1 lần với timeout dài hơn.
            buf.seek(0)
            try:
                resp = requests.post(
                    url, files={"file": ("image.jpg", buf, "image/jpeg")},
                    headers=self._headers(), timeout=self.timeout * 2,
                )
            except requests.RequestException:
                logger.exception("AI service không truy cập được: %s", url)
                raise HTTPException(status_code=503, detail="AI service không sẵn sàng")

        if resp.status_code >= 500:
            logger.error("AI service lỗi %s: %s", resp.status_code, resp.text[:200])
            raise HTTPException(status_code=503, detail="AI service không sẵn sàng")

        try:
            data = resp.json()
        except ValueError:
            raise HTTPException(status_code=502, detail="AI service trả dữ liệu không hợp lệ")

        if not all(k in data for k in _REQUIRED_FIELDS):
            raise HTTPException(status_code=502, detail="AI service trả dữ liệu không hợp lệ")
        return data
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_http_predictor.py -v`
Expected: 7 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/ai/http_predictor.py backend/tests/test_http_predictor.py
git commit -m "feat(scale): HttpPredictor adapter (remote AI over HTTP)"
```

---

### Task 3: Predictor factory + wire vào lifespan

**Files:**
- Create: `backend/app/ai/factory.py`
- Modify: `backend/app/main.py:42-57`
- Test: `backend/tests/test_predictor_factory.py`

**Interfaces:**
- Consumes: `HttpPredictor` (Task 2), `settings.AI_BACKEND/AI_SERVICE_URL/AI_SERVICE_TOKEN/AI_SERVICE_TIMEOUT/MODEL_WEIGHTS_DIR`.
- Produces: `build_predictor() -> object | None` — trả `HttpPredictor` (http), `TastyVietnamPredictor` (local + có weights), hoặc `None` (local + thiếu weights).

- [ ] **Step 1: Viết test thất bại**

Tạo `backend/tests/test_predictor_factory.py`:

```python
from app.core.config import settings
from app.ai.http_predictor import HttpPredictor


def test_http_backend_returns_http_predictor(monkeypatch):
    from app.ai import factory
    monkeypatch.setattr(settings, "AI_BACKEND", "http")
    monkeypatch.setattr(settings, "AI_SERVICE_URL", "http://svc")
    p = factory.build_predictor()
    assert isinstance(p, HttpPredictor)
    assert p.base_url == "http://svc"


def test_local_backend_missing_weights_returns_none(monkeypatch):
    from app.ai import factory
    monkeypatch.setattr(settings, "AI_BACKEND", "local")
    monkeypatch.setattr(settings, "MODEL_WEIGHTS_DIR", "/khong-ton-tai-xyz")
    assert factory.build_predictor() is None
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_predictor_factory.py -v`
Expected: FAIL — `ModuleNotFoundError: app.ai.factory`.

- [ ] **Step 3: Tạo `backend/app/ai/factory.py`**

```python
import logging
import os

from app.core.config import settings

logger = logging.getLogger(__name__)


def build_predictor():
    """Dựng predictor theo cấu hình: HttpPredictor (http), TastyVietnamPredictor
    (local + có weights), hoặc None (local + thiếu weights → AI tắt)."""
    if settings.AI_BACKEND == "http":
        from app.ai.http_predictor import HttpPredictor
        logger.info("AI backend = http (%s)", settings.AI_SERVICE_URL)
        return HttpPredictor(
            settings.AI_SERVICE_URL,
            settings.AI_SERVICE_TOKEN,
            settings.AI_SERVICE_TIMEOUT,
        )

    weights_dir = os.path.abspath(settings.MODEL_WEIGHTS_DIR)
    if not os.path.isdir(weights_dir):
        logger.warning("Model weights dir not found: %s — AI features disabled", weights_dir)
        return None
    from app.ai.inference import TastyVietnamPredictor
    logger.info("Loading AI models from %s ...", weights_dir)
    return TastyVietnamPredictor(weights_dir)
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_predictor_factory.py -v`
Expected: 2 PASS.

- [ ] **Step 5: Thay nhánh dựng predictor trong `main.py`**

Trong `backend/app/main.py`, thay khối lifespan hiện tại (dòng 44-57, từ `from app.ai.inference import ...` tới hết khối `else:` load model) bằng:

```python
    from app.ai.factory import build_predictor
    from app.ai.state import set_predictor

    try:
        predictor = build_predictor()
        set_predictor(predictor)
        if predictor is not None:
            logger.info("AI predictor ready (backend=%s)", settings.AI_BACKEND)
    except Exception as exc:
        logger.error("Failed to init AI predictor: %s", exc)
```

- [ ] **Step 6: Chạy full suite (không hồi quy)**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest -q`
Expected: tất cả PASS (số test tăng theo Task 1-3).

- [ ] **Step 7: Xác minh thủ công (local vẫn chạy)**

Restart backend với `.env` mặc định (`AI_BACKEND=local`).
Run: `curl -s http://localhost:8000/api/v1/ai/health`
Expected: `{"success":true,"data":{"loaded":true,...}}` (in-process như cũ).

- [ ] **Step 8: Commit**

```bash
git add backend/app/ai/factory.py backend/app/main.py backend/tests/test_predictor_factory.py
git commit -m "feat(scale): predictor factory selects local or http backend"
```

---

### Task 4: Standalone AI service (deploy HF)

**Files:**
- Create: `ai-service/app.py`
- Create: `ai-service/inference.py` (copy từ `backend/app/ai/inference.py`, đổi import class_names)
- Create: `ai-service/class_names.py` (copy từ `backend/app/ai/class_names.py`)
- Create: `ai-service/requirements.txt`
- Create: `ai-service/Dockerfile`
- Create: `ai-service/README.md`
- Test: `ai-service/test_app.py`

**Interfaces:**
- Produces: HTTP service `POST /predict` (multipart `file` → dict `predict()`), `GET /health`.
- Consumes: `TastyVietnamPredictor` (copy), biến môi trường `MODEL_WEIGHTS_DIR`, `AI_SERVICE_TOKEN`.

- [ ] **Step 1: Copy code suy luận**

Tạo `ai-service/class_names.py` = bản sao **nguyên văn** `backend/app/ai/class_names.py`.
Tạo `ai-service/inference.py` = bản sao `backend/app/ai/inference.py`, **đổi duy nhất** dòng import:
```python
from app.ai.class_names import (
```
thành:
```python
from class_names import (
```
(giữ nguyên phần còn lại của file.)

- [ ] **Step 2: Viết test thất bại**

Tạo `ai-service/test_app.py`:

```python
import io

from fastapi.testclient import TestClient
from PIL import Image

import app as svc

_FULL = {
    "needs_fallback": False, "group": "BANH", "group_confidence": 0.98,
    "predicted_class": "banh-mi", "display_name": "Bánh mì",
    "class_confidence": 0.91,
    "top5": [{"class": "banh-mi", "display_name": "Bánh mì", "confidence": 0.91}],
}


class _StubPredictor:
    device = "cpu"
    sub_models: dict = {}

    def __init__(self, *a, **k):
        pass

    def predict(self, img):
        return _FULL


def _img_bytes():
    buf = io.BytesIO()
    Image.new("RGB", (120, 120)).save(buf, format="JPEG")
    return buf.getvalue()


def test_predict_returns_contract(monkeypatch):
    monkeypatch.setattr(svc, "TastyVietnamPredictor", _StubPredictor)
    with TestClient(svc.app) as client:
        r = client.post("/predict", files={"file": ("x.jpg", _img_bytes(), "image/jpeg")})
    assert r.status_code == 200
    body = r.json()
    assert body["group"] == "BANH"
    assert set(("needs_fallback", "top5", "predicted_class")).issubset(body)


def test_health(monkeypatch):
    monkeypatch.setattr(svc, "TastyVietnamPredictor", _StubPredictor)
    with TestClient(svc.app) as client:
        r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
```

- [ ] **Step 3: Chạy test để xác nhận FAIL**

Run: `cd ai-service && ../backend/.venv/Scripts/python.exe -m pytest test_app.py -v`
Expected: FAIL — `ModuleNotFoundError: app` (chưa có `app.py`).

- [ ] **Step 4: Tạo `ai-service/app.py`**

```python
import io
import logging
import os

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from PIL import Image

from inference import TastyVietnamPredictor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

WEIGHTS_DIR = os.environ.get("MODEL_WEIGHTS_DIR", "model_weights")
API_TOKEN = os.environ.get("AI_SERVICE_TOKEN", "")

app = FastAPI(title="VNFood AI Service")
_predictor = None


@app.on_event("startup")
def _load():
    global _predictor
    try:
        _predictor = TastyVietnamPredictor(WEIGHTS_DIR)
        logger.info("AI model loaded from %s", WEIGHTS_DIR)
    except Exception:
        logger.exception("Failed to load AI model from %s", WEIGHTS_DIR)
        _predictor = None


@app.get("/health")
def health():
    return {"status": "ok" if _predictor is not None else "loading"}


@app.post("/predict")
async def predict(file: UploadFile = File(...), authorization: str = Header(default="")):
    if API_TOKEN and authorization != f"Bearer {API_TOKEN}":
        raise HTTPException(status_code=401, detail="Unauthorized")
    if _predictor is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    content = await file.read()
    try:
        img = Image.open(io.BytesIO(content))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image")
    return _predictor.predict(img)
```

- [ ] **Step 5: Chạy test để xác nhận PASS**

Run: `cd ai-service && ../backend/.venv/Scripts/python.exe -m pytest test_app.py -v`
Expected: 2 PASS.

- [ ] **Step 6: Tạo `ai-service/requirements.txt`**

```
fastapi
uvicorn[standard]
python-multipart
pillow
torch
torchvision
```

- [ ] **Step 7: Tạo `ai-service/Dockerfile`**

```dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY class_names.py inference.py app.py ./
COPY model_weights ./model_weights

ENV MODEL_WEIGHTS_DIR=/app/model_weights
EXPOSE 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
```

- [ ] **Step 8: Tạo `ai-service/README.md`**

```markdown
# VNFood AI Service

Service suy luận EfficientNet 2 tầng, tách khỏi backend để scale độc lập.

## Endpoint
- `POST /predict` (multipart `file` = ảnh) → JSON dict nhận diện.
- `GET /health` → `{"status": "ok"}` khi model đã nạp.

## Chạy local
```
pip install -r requirements.txt
MODEL_WEIGHTS_DIR=./model_weights uvicorn app:app --port 7860
```

## Deploy Hugging Face Spaces (Docker)
1. Tạo Space kiểu **Docker**.
2. Push thư mục này + `model_weights/` (~300MB) hoặc mount qua HF storage.
3. Đặt secret `AI_SERVICE_TOKEN` (tùy chọn) để bảo vệ endpoint.
4. Space chạy port 7860; URL công khai dạng `https://<user>-<space>.hf.space`.

## Kết nối từ backend
Đặt trong `backend/.env`:
```
AI_BACKEND=http
AI_SERVICE_URL=https://<user>-<space>.hf.space
AI_SERVICE_TOKEN=<token nếu có>
```

> Space free tier ngủ sau một lúc → request đầu chậm (cold start). Production nên giữ min-replica.
```

- [ ] **Step 9: Commit**

```bash
git add ai-service/
git commit -m "feat(scale): standalone AI inference service for HF deploy"
```

---

## Self-Review

**Spec coverage:**
- Config toggle (AI_BACKEND + 3 field) → Task 1 ✅
- HttpPredictor adapter (predict, device/sub_models, error 503/502, retry) → Task 2 ✅
- Factory + wire lifespan → Task 3 ✅
- Standalone ai-service (app, Dockerfile, copied inference/class_names, README, test) → Task 4 ✅
- Giữ contract dict + default local + không thêm dep backend → Global Constraints, kiểm ở Task 2/3 ✅

**Placeholder scan:** không có TBD/TODO; mọi step code đầy đủ. ✅

**Type consistency:** `HttpPredictor(service_url, token, timeout)` + `.base_url/.device/.sub_models/.predict` dùng nhất quán giữa Task 2, 3, và test. `build_predictor()` trả 3 nhánh khớp Task 3. `_REQUIRED_FIELDS` khớp keys contract ở Global Constraints. ✅
