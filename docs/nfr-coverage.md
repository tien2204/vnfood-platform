# Thống kê độ bao phủ Yêu cầu Phi chức năng (NFR) — VNFood Platform

> Cập nhật: 2026-07-11 · Môi trường: localhost dev (chưa deploy cloud)
> Nguồn: audit codebase thật + 7 commit remediation (nhánh `feat/monngonmoingay-restyle`)

## Bảng tổng quan

| Nhóm NFR | Mức bao phủ | Ghi chú |
|---|---|---|
| Bảo mật (Security) | 🟢 Tốt | Auth chắc + rate-limit + fail-fast SECRET_KEY |
| Hiệu suất (Performance) | 🟢 Đạt (quy mô nhỏ) | Async + pool + pagination + eager-load (0 N+1) |
| Độ tin cậy (Reliability) | 🟢 Đạt | Health check thật + error envelope + migrations + 39 test |
| Khả năng sử dụng (Usability) | 🟢 Tốt | UX states đầy đủ + i18n/responsive + envelope nhất quán |
| Khả năng mở rộng (Scalability) | 🟡 Một phần | Stateless auth OK; còn local storage + AI in-process |

---

## 1. Bảo mật (Security) — 🟢 Tốt

**Đã bao phủ:**
- Băm mật khẩu **bcrypt** — `backend/app/core/security.py:9-17`
- **JWT** access/refresh gắn `type` chống dùng nhầm token — `security.py:25-41`
- **RBAC**: `require_admin`, `role_at_least` — `backend/app/core/deps.py:43-46`
- **Tách cổng staff/consumer + chống enumeration** (login sai trả 401 chung) — `backend/app/services/auth_service.py:44-51`
- **Chống SQL injection**: toàn bộ query qua SQLAlchemy ORM parameterized
- **Validate upload**: content-type + extension + giới hạn size, đổi tên UUID — `backend/app/services/upload_service.py:14-37`
- **CORS whitelist** cụ thể (không dùng `*`) — `backend/app/main.py`
- ✅ **Rate limiting** (slowapi): auth 5/min, AI 20/min, newsletter 5/min — `backend/app/core/rate_limit.py` _(commit 7118f3e)_
- ✅ **Fail-fast SECRET_KEY**: chặn placeholder / key <32 ký tự khi khởi động — `backend/app/core/config.py` _(commit 8da0c38)_

**Chưa bao phủ (future work):** magic-byte check cho upload; account lockout; security headers (CSP/HSTS); token đang lưu localStorage song song httpOnly cookie; HTTPS (chấp nhận ở localhost).

## 2. Hiệu suất (Performance) — 🟢 Đạt ở quy mô nhỏ

**Đã bao phủ:**
- FastAPI **async** + asyncpg (non-blocking I/O)
- **Connection pooling**: `pool_size=10, max_overflow=20, pool_pre_ping=True` — `backend/app/core/database.py:7-13`
- **Pagination có cap** `limit = min(limit, 50)` — `backend/app/services/recipe_service.py:180`
- **Index DB** trên email/role/is_active — `backend/app/models/user.py:17-23`
- **Warm-load** model AI + Piper TTS lúc startup — `backend/app/main.py:39-69`
- ✅ **Không có N+1**: list dùng `outerjoin(User)`, detail dùng `selectinload(ingredients/steps/author)`; meal-plan/social/admin dùng batched `.in_()` map — đã audit toàn bộ, 0 gap — `docs/superpowers/notes/2026-07-11-n-plus-one-audit.md` _(commit b04f441)_

**Chưa bao phủ (future work):** caching layer (Redis); CDN cho ảnh; gzip/brotli; số liệu load test định lượng.

## 3. Độ tin cậy (Reliability) — 🟢 Đạt

**Đã bao phủ:**
- ✅ **Health check ping DB thật** (`SELECT 1`, trả 503 khi DB down) — `backend/app/main.py` _(commit ad49885)_
- ✅ **Error envelope nhất quán** mọi lỗi (404/422/429/503 + **500 chưa bắt**) → `{success:false, error:{code, message}}` — `backend/app/core/exceptions.py` _(commit a7549e4, eb99ad9)_
- **Startup fail-safe**: lỗi load AI/TTS/coverage đều log & tiếp tục — `backend/app/main.py:43-80`
- **Rollback** transaction khi lỗi — `backend/app/core/database.py:28-35`
- **Alembic migrations** 19+ bản (schema versioned) — `backend/alembic/versions/`
- **Test suite**: 39 test pass — `backend/tests/`
- Logging cấu hình sẵn — `backend/app/main.py:6-9`

**Chưa bao phủ (future work):** retry/circuit-breaker cho OpenAI Vision & SMTP; backup strategy; monitoring/alerting; redundancy (single instance).

## 4. Khả năng sử dụng (Usability) — 🟢 Tốt

**Đã bao phủ (xác minh trên app chạy thật):**
- `<html lang="vi">` + `<meta viewport>` + title/description — responsive & i18n & SEO
- **Loading states**: skeleton RecipeGrid/RecipeDetail/RecipeCard/UserProfile; loading ở 36 file
- **Empty/Error states**: `app/error.tsx`, `app/not-found.tsx`, `EmptyState` component
- **Accessibility**: `aria-*`/`role`/`alt`/`htmlFor` ở 47 file (nền shadcn/ui)
- Thông báo lỗi **tiếng Việt** thân thiện
- ✅ **API error envelope nhất quán** + frontend `extractError` (đọc envelope, fallback `detail`) — `frontend/lib/api.ts` _(commit 28892de)_

**Chưa bao phủ (future work):** điểm Lighthouse định lượng (a11y/perf); audit contrast/keyboard-nav đầy đủ.

## 5. Khả năng mở rộng (Scalability) — 🟡 Một phần

**Đã bao phủ:**
- **JWT stateless** (không session store server) → auth scale ngang tốt — `backend/app/core/security.py`
- Async + connection pool sẵn sàng chịu tải

**Chưa bao phủ (rào cản mở rộng — hướng phát triển):**
- 🔴 **File lưu local** `backend/uploads/` → chưa scale ngang; cần object storage (S3/MinIO)
- 🔴 **Model AI load in-process** → web & inference dính chặt; cần tách microservice inference
- 🔴 **Inference đồng bộ** → cần message queue (Celery/RQ) cho job nặng
- Rate-limit in-memory → production cần Redis backend (chia sẻ counter giữa instance)
- Postgres single node; chưa có config container orchestration/autoscale

---

## Phạm vi loại trừ có chủ đích
- **Finding #6 (public-route allowlist / 307)** đã loại khỏi phạm vi remediation theo quyết định chủ dự án — giữ nguyên hành vi middleware default-deny hiện tại.

## Truy vết
- Audit gốc + thiết kế: `docs/superpowers/specs/2026-07-11-nfr-remediation-design.md`
- Plan triển khai: `docs/superpowers/plans/2026-07-11-nfr-remediation.md`
- 7 commit remediation: `8da0c38, a7549e4, 28892de, ad49885, 7118f3e, b04f441, eb99ad9`
