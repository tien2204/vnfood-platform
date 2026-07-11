# Thiết kế: Vá các finding phi chức năng (NFR Remediation)

> Ngày: 2026-07-11
> Nhánh: `feat/monngonmoingay-restyle`
> Bối cảnh: localhost dev (chưa deploy cloud). Mục tiêu nâng chuẩn 6 finding NFR phát hiện qua audit.

## Bối cảnh & mục tiêu

Audit NFR (Security / Performance / Reliability / Usability / Scalability) trên codebase thật
đã xác định 6 finding cần vá. Spec này thiết kế giải pháp cho đúng 6 finding đó, có test kèm theo,
theo đúng convention đã ghi trong `CLAUDE.md` (API envelope `{success, data}` / `{success:false, error:{code,message}}`).

Ngoài phạm vi: object storage cho ảnh, tách microservice AI, Redis cache, load test định lượng
(ghi nhận là "hướng phát triển", không làm trong plan này).

## Các finding & giải pháp

### #2 — Guard SECRET_KEY khi khởi động (Security)
**Vấn đề:** `SECRET_KEY` không được kiểm tra; placeholder `your-super-secret-key...` có thể lọt lên
môi trường thật mà app vẫn chạy → JWT ký bằng key đoán được.

**Giải pháp:** Thêm `@field_validator("SECRET_KEY")` trong `backend/app/core/config.py`. Raise `ValueError`
(fail-fast lúc khởi tạo `Settings`) khi key:
- rỗng, hoặc
- chứa chuỗi placeholder (`change-this`, `your-super-secret`, `changeme`), hoặc
- ngắn hơn 32 ký tự.

**Test:** unit test khởi tạo `Settings` với key xấu → mong đợi raise; key hợp lệ → pass.

### #3 — Health check ping DB thật (Reliability)
**Vấn đề:** `/api/v1/health` trả `database: "not_connected"` hardcoded — [main.py:132-141], không phản ánh
trạng thái DB thật, gây hiểu lầm khi monitor.

**Giải pháp:** Sửa endpoint để inject `get_db` và chạy `SELECT 1`:
- DB OK → `{success:true, data:{status:"ok", database:"connected", version}}`, HTTP 200.
- DB lỗi → `database:"error"`, HTTP 503.
Giữ `/health` (liveness đơn giản) như cũ; `/api/v1/health` thành readiness thật.

**Test:** integration test hit `/api/v1/health` với DB sống → `database:"connected"`.

### #4 + envelope — Global exception handler (Usability / API contract)
**Vấn đề:** Lỗi trả FastAPI mặc định `{"detail": "..."}` thay vì envelope
`{success:false, error:{code, message}}` mà `CLAUDE.md` quy định → hợp đồng API không nhất quán,
frontend phải parse 2 kiểu.

**Giải pháp (backend):** Tạo `backend/app/core/exceptions.py`:
- `AppException(status_code, code, message)` — exception nhẹ cho phép truyền `code` tùy biến
  (vd `RECIPE_NOT_FOUND`).
- Handler `HTTPException` → envelope; suy `code` từ status khi không có code rõ ràng
  (400→`BAD_REQUEST`, 401→`UNAUTHORIZED`, 403→`FORBIDDEN`, 404→`NOT_FOUND`, 409→`CONFLICT`, 429→`RATE_LIMITED`, 5xx→`INTERNAL_ERROR`).
- Handler `RequestValidationError` (422) → envelope, `code:"VALIDATION_ERROR"`, kèm chi tiết field.
- Đăng ký handlers trong `backend/app/main.py`.
- **Không** cần sửa từng `raise HTTPException` hiện có — handler bọc tập trung; các `raise` giữ nguyên
  `detail` làm `message`.

**Giải pháp (frontend):** Trong `frontend/lib/api.ts` thêm helper `extractError(err)`:
đọc `err.response?.data?.error?.message` trước, fallback `err.response?.data?.detail`, fallback message
mặc định. An toàn ngược (backward-compatible) trong lúc chuyển đổi.

**Test:** assert shape envelope cho 404 (recipe không tồn tại), 422 (payload sai), và 429 (sau khi thêm rate-limit).

### #1 — Rate limiting (Security)
**Vấn đề:** Không có rate limiting → brute-force login, spam AI inference / gửi email không bị chặn.

**Giải pháp:** Dùng `slowapi`, storage **in-memory** (đủ cho single-instance localhost; ghi chú:
production nên chuyển sang Redis backend để chia sẻ counter giữa instance).
- Khởi tạo `Limiter(key_func=get_remote_address)`, gắn `app.state.limiter` + `SlowAPIMiddleware`.
- Handler `RateLimitExceeded` → trả **429 theo đúng envelope** (`code:"RATE_LIMITED"`).
- Áp giới hạn:
  - `/auth/login`, `/auth/staff-login`, `/auth/register`: `5/minute` per IP.
  - `/ai/*` inference (nhận diện ảnh): ngưỡng thoáng hơn, vd `20/minute` per IP.
  - `/newsletter` (gửi mail): vd `5/minute` per IP.
- Ngưỡng cụ thể để trong config/hằng số để dễ chỉnh.

**Test:** gọi login vượt ngưỡng trong 1 phút → nhận 429 với envelope đúng.

### #5 — Verify N+1 (Performance)
**Trạng thái:** List/detail recipe **đã** eager-load (join `User`, `selectinload` ingredients/steps/author).
Không "fix" mù.

**Giải pháp:** Rà các endpoint còn lại có truy cập quan hệ ngoài eager-load:
- user profile (`get_user_recipes`), saved recipes, meal-plan (`meal_plan_service`).
Chỉ thêm `selectinload`/join ở đúng chỗ phát hiện lazy-load. Nếu không có → ghi nhận "đã sạch".

**Test:** 1 test bật đếm query (event listener SQLAlchemy hoặc `echo`) cho endpoint list, assert
số query không tăng theo số bản ghi (không N+1).

### #6 — Điều tra 307 trên route không tồn tại (Usability)
**Vấn đề:** `/khong-ton-tai-abc` trả 307 redirect thay vì render `not-found.tsx` (404).

**Giải pháp:** Đọc `frontend/middleware.ts`, kiểm `matcher`. Nếu matcher quá rộng nuốt public path →
thu hẹp để chỉ chặn route cần auth; route lạ rơi vào `not-found.tsx` (404). Nếu 307 là hành vi
đúng (vd redirect trailing/locale) → ghi nhận, không đổi.

## Thứ tự triển khai

1. #2 SECRET_KEY guard (độc lập, dễ)
2. #3 Health check DB (độc lập, dễ)
3. #4 Global exception handler + envelope (nền cho #1)
4. #1 Rate limiting (dùng envelope 429 từ #4)
5. #5 Verify N+1
6. #6 Điều tra 307

## Chiến lược test

- Backend: pytest trong `backend/tests/` (đã có hạ tầng: `conftest.py`, các `test_*.py`).
  - `test_secret_key_validation`, `test_health_db`, `test_error_envelope`, `test_rate_limit`, `test_no_n_plus_one`.
- Frontend: kiểm `extractError` xử lý cả 2 shape (unit nhỏ hoặc kiểm thủ công qua app đang chạy).
- Verify thủ công trên app đang chạy (backend :8000, frontend :3000) cho envelope & 429.

## Rủi ro & lưu ý

- **Envelope đổi hợp đồng lỗi:** helper `extractError` fallback `.detail` giữ tương thích ngược trong
  lúc chuyển; cần rà các nơi frontend đang đọc `.detail` trực tiếp.
- **Rate-limit in-memory** reset khi restart và không chia sẻ giữa instance — chấp nhận ở dev,
  ghi chú Redis cho prod.
- **SECRET_KEY guard** có thể làm app đang chạy với `.env` cũ (key ngắn) fail khi restart — đây là
  hành vi mong muốn; cập nhật `.env` thật + `.env.example` hướng dẫn tạo key 64-char.
