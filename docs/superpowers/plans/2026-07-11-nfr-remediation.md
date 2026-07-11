# NFR Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vá 6 finding phi chức năng (SECRET_KEY guard, health check DB thật, API error envelope, rate limiting, verify N+1, public-route allowlist) trên VNFood platform.

**Architecture:** Backend FastAPI thêm 2 module core mới (`exceptions.py`, `rate_limit.py`) đăng ký ở `main.py`; sửa `config.py` và endpoint health. Frontend thêm 1 helper trong `api.ts` và mở rộng allowlist trong `proxy.ts`. Test theo phong cách hiện có (pytest + mock, và FastAPI TestClient trên mini-app để tránh lifespan nặng).

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy async, pydantic-settings, slowapi (mới), pytest; Next.js (App Router, middleware = `proxy.ts`), TypeScript, axios.

## Global Constraints

- API response phải theo envelope: thành công `{success:true, data|message}`; lỗi `{success:false, error:{code, message}}` (theo `CLAUDE.md`).
- Python: `snake_case` hàm/biến, `PascalCase` class. TypeScript: `camelCase` hàm/biến.
- Message lỗi cho người dùng: tiếng Việt.
- Test đặt trong `backend/tests/`, chạy `pytest` từ thư mục `backend/`.
- Rate-limit storage: in-memory (single-instance dev). Ghi chú Redis cho production, KHÔNG implement Redis.
- **Product assumption (finding #6):** trang duyệt recipe (`/recipes/*`), hồ sơ user (`/users/*`), tìm kiếm (`/search`) coi là PUBLIC — khớp với API public và homepage public. Nếu chủ dự án muốn gate sau login thì bỏ Task 7.

---

### Task 1: Guard SECRET_KEY khi khởi động (#2)

**Files:**
- Modify: `backend/app/core/config.py`
- Test: `backend/tests/test_secret_key_validation.py`

**Interfaces:**
- Consumes: `Settings` (pydantic-settings) hiện có.
- Produces: `Settings` raise `ValidationError` khi `SECRET_KEY` yếu — không có API mới.

- [ ] **Step 1: Viết test thất bại**

Tạo `backend/tests/test_secret_key_validation.py`:

```python
import pytest
from pydantic import ValidationError

from app.core.config import Settings


def _base_env(monkeypatch, secret):
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:p@localhost:5432/db")
    monkeypatch.setenv("SECRET_KEY", secret)


def test_rejects_placeholder_key(monkeypatch):
    _base_env(monkeypatch, "your-super-secret-key-change-this-to-random-64-chars")
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_rejects_short_key(monkeypatch):
    _base_env(monkeypatch, "short")
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_accepts_strong_key(monkeypatch):
    _base_env(monkeypatch, "a" * 48)
    s = Settings(_env_file=None)
    assert len(s.SECRET_KEY) >= 32
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `cd backend && pytest tests/test_secret_key_validation.py -v`
Expected: `test_rejects_placeholder_key` và `test_rejects_short_key` FAIL (chưa có validator, key xấu được chấp nhận).

- [ ] **Step 3: Thêm validator vào `config.py`**

Ở đầu file `backend/app/core/config.py`, đổi import:

```python
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
```

Thêm phương thức vào trong class `Settings` (đặt ngay sau khai báo các field, trước các `@property`):

```python
    @field_validator("SECRET_KEY")
    @classmethod
    def _validate_secret_key(cls, v: str) -> str:
        placeholders = ("change-this", "your-super-secret", "changeme")
        low = v.lower()
        if not v or any(p in low for p in placeholders):
            raise ValueError(
                "SECRET_KEY là placeholder — đặt một chuỗi ngẫu nhiên ≥32 ký tự trong .env"
            )
        if len(v) < 32:
            raise ValueError("SECRET_KEY phải dài ít nhất 32 ký tự")
        return v
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `cd backend && pytest tests/test_secret_key_validation.py -v`
Expected: 3 PASS.

- [ ] **Step 5: Cập nhật `.env.example` để hướng dẫn tạo key**

Trong `backend/.env.example`, đổi dòng `SECRET_KEY=...` thành:

```
# Tạo bằng: python -c "import secrets; print(secrets.token_urlsafe(48))"
SECRET_KEY=CHANGE_ME_run_the_command_above_to_generate_a_64_char_key
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/core/config.py backend/tests/test_secret_key_validation.py backend/.env.example
git commit -m "feat(security): fail-fast validation for weak SECRET_KEY"
```

> ⚠️ **Lưu ý vận hành:** nếu `backend/.env` hiện dùng key placeholder/ngắn, app sẽ KHÔNG khởi động sau thay đổi này. Trước khi restart backend, tạo key thật: `python -c "import secrets; print(secrets.token_urlsafe(48))"` và dán vào `backend/.env`. (Đổi key sẽ vô hiệu hóa mọi JWT đang phát hành → user phải đăng nhập lại — chấp nhận được.)

---

### Task 2: Global exception handler + API error envelope (#4)

**Files:**
- Create: `backend/app/core/exceptions.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_error_envelope.py`

**Interfaces:**
- Produces:
  - `AppException(status_code: int, code: str, message: str)` — HTTPException con, mang `code` tùy biến.
  - `register_exception_handlers(app: FastAPI) -> None` — đăng ký handler cho `StarletteHTTPException` và `RequestValidationError`.
- Consumes: không.

- [ ] **Step 1: Viết test thất bại**

Tạo `backend/tests/test_error_envelope.py`:

```python
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.core.exceptions import AppException, register_exception_handlers


def _client() -> TestClient:
    app = FastAPI()
    register_exception_handlers(app)

    class Body(BaseModel):
        n: int

    @app.get("/not-found")
    def not_found():
        raise HTTPException(status_code=404, detail="Không tìm thấy")

    @app.get("/coded")
    def coded():
        raise AppException(status_code=404, code="RECIPE_NOT_FOUND", message="Công thức không tồn tại")

    @app.post("/validate")
    def validate(body: Body):
        return {"ok": body.n}

    return TestClient(app, raise_server_exceptions=False)


def test_http_exception_wrapped_in_envelope():
    r = _client().get("/not-found")
    assert r.status_code == 404
    body = r.json()
    assert body["success"] is False
    assert body["error"]["code"] == "NOT_FOUND"
    assert body["error"]["message"] == "Không tìm thấy"


def test_app_exception_custom_code():
    r = _client().get("/coded")
    assert r.json()["error"]["code"] == "RECIPE_NOT_FOUND"


def test_validation_error_envelope():
    r = _client().post("/validate", json={"n": "not-an-int"})
    assert r.status_code == 422
    body = r.json()
    assert body["success"] is False
    assert body["error"]["code"] == "VALIDATION_ERROR"
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `cd backend && pytest tests/test_error_envelope.py -v`
Expected: FAIL với `ModuleNotFoundError: app.core.exceptions`.
(Nếu lỗi `RuntimeError: TestClient requires httpx` → chạy `pip install httpx` rồi thử lại.)

- [ ] **Step 3: Tạo `backend/app/core/exceptions.py`**

```python
from fastapi import FastAPI, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.requests import Request

_STATUS_CODE_MAP = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMITED",
}


class AppException(HTTPException):
    """HTTPException mang thêm mã lỗi nghiệp vụ (vd RECIPE_NOT_FOUND)."""

    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(status_code=status_code, detail=message)
        self.code = code


def _code_for(status_code: int) -> str:
    if status_code >= 500:
        return "INTERNAL_ERROR"
    return _STATUS_CODE_MAP.get(status_code, "ERROR")


async def _http_exception_handler(request: Request, exc: StarletteHTTPException):
    code = getattr(exc, "code", None) or _code_for(exc.status_code)
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "error": {"code": code, "message": exc.detail}},
        headers=getattr(exc, "headers", None),
    )


async def _validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Dữ liệu không hợp lệ",
                "details": jsonable_encoder(exc.errors()),
            },
        },
    )


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(StarletteHTTPException, _http_exception_handler)
    app.add_exception_handler(RequestValidationError, _validation_exception_handler)
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `cd backend && pytest tests/test_error_envelope.py -v`
Expected: 3 PASS.

- [ ] **Step 5: Đăng ký handler trong `main.py`**

Trong `backend/app/main.py`, sau khi tạo `app = FastAPI(...)` (ngay trước `app.add_middleware(CORSMiddleware, ...)`), thêm:

```python
from app.core.exceptions import register_exception_handlers

register_exception_handlers(app)
```

- [ ] **Step 6: Xác minh thủ công trên app đang chạy**

Restart backend, rồi:
Run: `curl -s http://localhost:8000/api/v1/recipes/00000000-0000-0000-0000-000000000000`
Expected: `{"success":false,"error":{"code":"NOT_FOUND","message":"Công thức không tồn tại"}}`

- [ ] **Step 7: Commit**

```bash
git add backend/app/core/exceptions.py backend/app/main.py backend/tests/test_error_envelope.py
git commit -m "feat(api): global exception handlers emit success/error envelope"
```

---

### Task 3: Frontend đọc envelope lỗi (#4, frontend)

**Files:**
- Modify: `frontend/lib/api.ts`

**Interfaces:**
- Consumes: envelope lỗi từ Task 2.
- Produces: `extractError(err: unknown): string` — export từ `frontend/lib/api.ts`.

- [ ] **Step 1: Thêm helper `extractError` vào `api.ts`**

Ở cuối `frontend/lib/api.ts`, TRƯỚC dòng `export default api;`, thêm:

```typescript
/**
 * Đọc message lỗi từ response. Ưu tiên envelope mới
 * ({success:false, error:{message}}), fallback {detail} cũ để tương thích ngược.
 */
export function extractError(err: unknown): string {
  const e = err as {
    response?: { data?: { error?: { message?: string }; detail?: string } };
  };
  return (
    e?.response?.data?.error?.message ||
    e?.response?.data?.detail ||
    "Đã có lỗi xảy ra, vui lòng thử lại."
  );
}
```

- [ ] **Step 2: Kiểm typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: không có lỗi mới liên quan `api.ts`.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/api.ts
git commit -m "feat(web): extractError helper reads error envelope with detail fallback"
```

> Ghi chú cho reviewer: các call-site đang đọc `err.response.data.detail` trực tiếp vẫn chạy (fallback giữ tương thích). Việc migrate chúng sang `extractError` là dọn dẹp tùy chọn, KHÔNG bắt buộc trong plan này.

---

### Task 4: Health check ping DB thật (#3)

**Files:**
- Modify: `backend/app/main.py:132-141`
- Test: `backend/tests/test_health.py`

**Interfaces:**
- Produces: `api_health_check(db: AsyncSession)` — coroutine trả `dict` (DB ok) hoặc `JSONResponse` 503 (DB lỗi).
- Consumes: `get_db` dependency hiện có.

- [ ] **Step 1: Viết test thất bại**

Tạo `backend/tests/test_health.py`:

```python
import asyncio
from unittest.mock import AsyncMock

from fastapi.responses import JSONResponse

from app.main import api_health_check


def test_health_reports_connected_when_db_ok():
    db = AsyncMock()  # db.execute(...) awaits fine
    res = asyncio.run(api_health_check(db))
    assert res["success"] is True
    assert res["data"]["database"] == "connected"


def test_health_returns_503_when_db_down():
    db = AsyncMock()
    db.execute.side_effect = Exception("db down")
    res = asyncio.run(api_health_check(db))
    assert isinstance(res, JSONResponse)
    assert res.status_code == 503
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `cd backend && pytest tests/test_health.py -v`
Expected: FAIL — `api_health_check` hiện không nhận tham số `db` (TypeError).

- [ ] **Step 3: Sửa endpoint trong `main.py`**

Thêm import ở đầu vùng import (cạnh các import FastAPI):

```python
from fastapi import Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
```

Thay thế toàn bộ hàm `api_health_check` hiện tại ([main.py:132-141]) bằng:

```python
@app.get("/api/v1/health")
async def api_health_check(db: AsyncSession = Depends(get_db)):
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        return JSONResponse(
            status_code=503,
            content={
                "success": False,
                "error": {"code": "DB_UNAVAILABLE", "message": "Không kết nối được cơ sở dữ liệu"},
            },
        )
    return {
        "success": True,
        "data": {"status": "ok", "database": "connected", "version": "1.0.0"},
    }
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `cd backend && pytest tests/test_health.py -v`
Expected: 2 PASS.

- [ ] **Step 5: Xác minh thủ công**

Restart backend rồi: Run: `curl -s http://localhost:8000/api/v1/health`
Expected: `{"success":true,"data":{"status":"ok","database":"connected","version":"1.0.0"}}`

- [ ] **Step 6: Commit**

```bash
git add backend/app/main.py backend/tests/test_health.py
git commit -m "fix(reliability): health check pings DB instead of hardcoded status"
```

---

### Task 5: Rate limiting (#1)

**Files:**
- Modify: `backend/requirements.txt`
- Create: `backend/app/core/rate_limit.py`
- Modify: `backend/app/main.py`, `backend/app/api/v1/auth.py`, `backend/app/api/v1/ai.py`, `backend/app/api/v1/newsletter.py`
- Test: `backend/tests/test_rate_limit.py`

**Interfaces:**
- Produces:
  - `limiter: Limiter` — instance dùng chung để decorate route.
  - `register_rate_limiting(app: FastAPI) -> None` — gắn limiter + middleware + handler 429 (envelope).
- Consumes: `AppException`/envelope không trực tiếp; handler tự trả envelope.

- [ ] **Step 1: Thêm dependency**

Trong `backend/requirements.txt`, thêm dòng:

```
slowapi==0.1.9
```

Cài: Run `cd backend && pip install "slowapi==0.1.9"`
Expected: cài thành công (kéo theo `limits`).

- [ ] **Step 2: Viết test thất bại**

Tạo `backend/tests/test_rate_limit.py`:

```python
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from app.core.rate_limit import limiter, register_rate_limiting


def _client() -> TestClient:
    app = FastAPI()
    register_rate_limiting(app)

    @app.get("/ping")
    @limiter.limit("2/minute")
    async def ping(request: Request):
        return {"ok": True}

    return TestClient(app, raise_server_exceptions=False)


def test_returns_429_envelope_after_limit():
    client = _client()
    assert client.get("/ping").status_code == 200
    assert client.get("/ping").status_code == 200
    r = client.get("/ping")
    assert r.status_code == 429
    body = r.json()
    assert body["success"] is False
    assert body["error"]["code"] == "RATE_LIMITED"
```

- [ ] **Step 3: Chạy test để xác nhận FAIL**

Run: `cd backend && pytest tests/test_rate_limit.py -v`
Expected: FAIL — `ModuleNotFoundError: app.core.rate_limit`.

- [ ] **Step 4: Tạo `backend/app/core/rate_limit.py`**

```python
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address
from starlette.requests import Request

limiter = Limiter(key_func=get_remote_address)


async def _rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={
            "success": False,
            "error": {"code": "RATE_LIMITED", "message": "Quá nhiều yêu cầu, vui lòng thử lại sau."},
        },
    )


def register_rate_limiting(app: FastAPI) -> None:
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_handler)
    app.add_middleware(SlowAPIMiddleware)
```

- [ ] **Step 5: Chạy test để xác nhận PASS**

Run: `cd backend && pytest tests/test_rate_limit.py -v`
Expected: PASS.

- [ ] **Step 6: Đăng ký trong `main.py`**

Trong `backend/app/main.py`, ngay sau `register_exception_handlers(app)` (Task 2 Step 5), thêm:

```python
from app.core.rate_limit import register_rate_limiting

register_rate_limiting(app)
```

- [ ] **Step 7: Áp giới hạn cho auth endpoints**

Trong `backend/app/api/v1/auth.py`:

Đổi import dòng 1 thành:
```python
from fastapi import APIRouter, Depends, Request
```
Thêm import:
```python
from app.core.rate_limit import limiter
```

Thêm `request: Request` làm tham số đầu và decorator `@limiter.limit(...)` cho 3 route (đặt decorator NGAY DƯỚI `@router.post`):

```python
@router.post("/register", status_code=201)
@limiter.limit("5/minute")
async def register(request: Request, body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    ...

@router.post("/login")
@limiter.limit("5/minute")
async def login(request: Request, body: LoginRequest, db: AsyncSession = Depends(get_db)):
    ...

@router.post("/staff-login")
@limiter.limit("5/minute")
async def staff_login(request: Request, body: LoginRequest, db: AsyncSession = Depends(get_db)):
    ...
```
(Giữ nguyên phần thân hàm; chỉ thêm `request: Request` vào chữ ký và decorator.)

- [ ] **Step 8: Áp giới hạn cho AI và newsletter**

Trong `backend/app/api/v1/ai.py`: thêm `from fastapi import Request` (nếu thiếu) và `from app.core.rate_limit import limiter`. Với route `@router.post("/recognize")` (dòng ~30) và `@router.post("/recognize-url")` (dòng ~62), thêm `@limiter.limit("20/minute")` dưới decorator router và `request: Request` làm tham số đầu của hàm.

Trong `backend/app/api/v1/newsletter.py`: tương tự, với route `@router.post("/subscribe")` (dòng ~27) thêm `@limiter.limit("5/minute")` và `request: Request`.

> Nếu một route đã có tham số `request: Request` sẵn thì không thêm trùng.

- [ ] **Step 9: Xác minh thủ công**

Restart backend. Run 6 lần liên tiếp:
`for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w "%{http_code} " -X POST http://localhost:8000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"x@x.com","password":"wrong"}'; done; echo`
Expected: vài lần đầu `401`, lần thứ 6 `429`.

- [ ] **Step 10: Commit**

```bash
git add backend/requirements.txt backend/app/core/rate_limit.py backend/app/main.py backend/app/api/v1/auth.py backend/app/api/v1/ai.py backend/app/api/v1/newsletter.py backend/tests/test_rate_limit.py
git commit -m "feat(security): rate-limit auth, AI, and newsletter endpoints"
```

---

### Task 6: Verify N+1 (#5)

**Files:**
- Read/audit: `backend/app/services/recipe_service.py`, `backend/app/services/meal_plan_service.py`, `backend/app/services/social_service.py`
- Create (nếu phát hiện thiếu eager-load): sửa đúng service + `backend/tests/test_no_n_plus_one.py`
- Create (kết quả audit): `docs/superpowers/notes/2026-07-11-n-plus-one-audit.md`

**Interfaces:** không thay đổi public interface trừ khi thêm `selectinload`.

- [ ] **Step 1: Audit các truy cập quan hệ**

Run: `cd backend && grep -rnE "\.(author|steps|ingredients|user|recipe)\b" app/services/*.py | grep -viE "selectinload|joinedload|outerjoin|back_populates|relationship|=|import"`
Đọc mỗi hit: xác định nó chạy trong vòng lặp sau khi query xong mà quan hệ CHƯA được eager-load (join hoặc selectinload) hay không.

- [ ] **Step 2: Ghi kết quả audit**

Tạo `docs/superpowers/notes/2026-07-11-n-plus-one-audit.md` liệt kê: mỗi endpoint list/detail đã kiểm, chiến lược load hiện tại (join / selectinload / lazy), và kết luận "sạch" hay "cần vá". (Đã biết trước: `get_recipes` list dùng `outerjoin(User)`; detail dùng `selectinload(ingredients, steps, author)` → sạch.)

- [ ] **Step 3: Vá chỗ sót (chỉ khi Step 1 tìm thấy lazy-load thật)**

Với mỗi query trả nhiều bản ghi rồi truy cập `.author`/`.steps`/`.ingredients` mà chưa eager-load, thêm `.options(selectinload(Recipe.<rel>))` vào statement. Nếu KHÔNG tìm thấy → bỏ qua step này, ghi "không có chỗ sót" vào note.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/notes/2026-07-11-n-plus-one-audit.md
# thêm file service nếu có sửa ở Step 3
git commit -m "docs(perf): N+1 audit for recipe/meal-plan/social queries"
```

---

### Task 7: Public-route allowlist trong middleware (#6)

**Files:**
- Modify: `frontend/proxy.ts:18-19`

**Interfaces:** không đổi chữ ký; chỉ mở rộng allowlist.

> **Trước khi làm:** xác nhận với chủ dự án rằng recipe/user/search pages nên xem được khi CHƯA đăng nhập (mặc định: có — khớp API public + homepage public). Nếu KHÔNG → bỏ Task này.

- [ ] **Step 1: Xác nhận hành vi hiện tại (baseline)**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/recipes/246623fc-bbc6-47c4-8cf1-db93365d1591`
Expected (trước sửa): `307` (redirect về login dù đây là recipe public).

- [ ] **Step 2: Mở rộng allowlist trong `proxy.ts`**

Trong `frontend/proxy.ts`, thay 2 dòng ([proxy.ts:18-19]):

```typescript
const PUBLIC_EXACT = new Set(["/", "/recognize"]);
const PUBLIC_PREFIXES = ["/auth/", "/recognize/"];
```

thành:

```typescript
const PUBLIC_EXACT = new Set(["/", "/recognize", "/search", "/recipes", "/users"]);
const PUBLIC_PREFIXES = ["/auth/", "/recognize/", "/recipes/", "/users/", "/search"];
```

- [ ] **Step 3: Xác minh sau sửa**

Restart frontend (`npm run dev`) rồi:
Run: `curl -s -o /dev/null -w "recipe:%{http_code}\n" http://localhost:3000/recipes/246623fc-bbc6-47c4-8cf1-db93365d1591`
Expected: `200` (recipe public xem được khi chưa login).
Run: `curl -s -o /dev/null -w "protected:%{http_code}\n" http://localhost:3000/me/profile`
Expected: `307` (route cần auth vẫn bị chặn — không hồi quy bảo mật).

- [ ] **Step 4: Commit**

```bash
git add frontend/proxy.ts
git commit -m "fix(web): allow public browsing of recipe/user/search routes"
```

> Ghi chú: route KHÔNG tồn tại ở cấp cao nhất (vd `/khong-ton-tai-abc`) với user CHƯA login vẫn redirect về login — đây là giới hạn của Next middleware (chạy trước routing, không phân biệt được 404 với route-protected). Chấp nhận; user ĐÃ login sẽ thấy đúng `not-found.tsx` (404).

---

## Self-Review

**Spec coverage:**
- #2 SECRET_KEY guard → Task 1 ✅
- #3 Health check DB → Task 4 ✅
- #4 Error envelope (backend) → Task 2 ✅; (frontend) → Task 3 ✅
- #1 Rate limiting → Task 5 ✅
- #5 Verify N+1 → Task 6 ✅
- #6 307/allowlist → Task 7 ✅

**Type consistency:** `register_exception_handlers`, `register_rate_limiting`, `limiter`, `AppException`, `extractError`, `api_health_check(db)` dùng nhất quán giữa các task và test. ✅

**Placeholder scan:** không có TBD/TODO; mọi step code có nội dung thật. Task 6 Step 3 có nhánh điều kiện (chỉ vá khi tìm thấy) — hợp lý cho task verify, không phải placeholder. ✅
