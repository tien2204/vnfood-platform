# Thiết kế: Tách tầng AI sang service HTTP (Task D)

> Ngày: 2026-07-12
> Nhánh: `feat/scalability`
> Bối cảnh: hoàn tất chuỗi scale A/B/C/E; D là bước cuối — tách suy luận AI ra service riêng để scale độc lập.

## Bối cảnh & mục tiêu

Hiện `TastyVietnamPredictor` (EfficientNet 2 tầng) nạp **in-process** trong FastAPI:
`ai_service.recognize_image(db, predictor, image_bytes)` gọi `predictor.predict(pil_image) -> dict`,
rồi **resolve với DB** (dish_resolver, gợi ý recipe, ghi ai_logs).

Mục tiêu: cho phép chạy suy luận ở một **service AI riêng qua HTTP** (deploy Hugging Face), scale độc lập
khỏi tầng web — trong khi phần resolve-DB vẫn ở backend.

Phạm vi: **backend pluggable (adapter + toggle) + viết code service AI độc lập** để deploy. Việc deploy HF thật
là bước ops riêng, ngoài phạm vi spec này. Mặc định `local` (in-process) cho dev — không phá hành vi hiện tại.

Ngoài phạm vi (YAGNI): batch inference, cấu hình GPU, cache kết quả, autoscale — ghi nhận là hướng phát triển.

## Cách tiếp cận (đã chọn)

**Adapter cùng interface + toggle env** (Hướng 1). Tạo `HttpPredictor` có đúng chữ ký `.predict(pil_image) -> dict`
như `TastyVietnamPredictor`; lúc startup dựng local hay http tùy `AI_BACKEND`. `ai_service.py` **không đổi**.
Khớp đúng mẫu pluggable của A/B/C (storage/redis/db), blast radius nhỏ nhất, giữ nguyên hợp đồng dict downstream.

Đã cân nhắc & loại: (2) async client ở tầng service — non-blocking tốt hơn nhưng đụng `ai_service.py` và tách
logic theo backend; (3) proxy cả endpoint sang HF — không được vì resolve-DB phải ở backend.

## Kiến trúc & components

### Backend
- **`backend/app/ai/http_predictor.py`** (mới): class `HttpPredictor(service_url, token, timeout)`, method
  `predict(pil_image) -> dict`:
  - Encode `pil_image` → bytes (JPEG/PNG), `POST {service_url}/predict` multipart field `file`.
  - Nếu `token` set → header `Authorization: Bearer <token>`.
  - Parse JSON response → trả về dict đúng contract.
  - Lỗi timeout / connection / status ≥ 500 → `HTTPException(503, "AI service không sẵn sàng")`.
  - Cold start (Space ngủ): 1 lần retry với timeout dài hơn rồi mới 503.
  - Response thiếu field bắt buộc → `HTTPException(502, "AI service trả dữ liệu không hợp lệ")`.
- **`backend/app/main.py`** (lifespan): nếu `settings.AI_BACKEND == "http"` → `set_predictor(HttpPredictor(...))`
  (KHÔNG nạp torch); ngược lại giữ nguyên nhánh `TastyVietnamPredictor` hiện tại.
- **`backend/app/core/config.py`** (thêm field):
  - `AI_BACKEND: str = "local"`  (`"local"` | `"http"`)
  - `AI_SERVICE_URL: str = ""`
  - `AI_SERVICE_TOKEN: str = ""`
  - `AI_SERVICE_TIMEOUT: int = 30`

### Service AI độc lập (deploy HF)
- **`ai-service/`** (thư mục mới):
  - `app.py` — FastAPI nhỏ: `POST /predict` (multipart `file` → dict của `predict()`), `GET /health`.
    Nạp `TastyVietnamPredictor(weights_dir)` lúc startup; kiểm token nếu cấu hình.
  - `Dockerfile` — base python + torch CPU, copy weights + code, chạy uvicorn.
  - **Tái dùng** logic suy luận: `inference.py` + `class_names.py` (copy vào `ai-service/` hoặc cài backend như
    package). Quyết định: **copy** 2 file này vào `ai-service/` để service tự chứa, không phụ thuộc backend.
  - `requirements.txt` — torch, torchvision, pillow, fastapi, uvicorn, python-multipart.
  - `README.md` — hướng dẫn deploy HF Spaces (Docker) + biến môi trường.

## Luồng dữ liệu

`recognize_image` (không đổi) → `predictor.predict(pil_image)`:
- **local**: torch in-process (như hiện tại).
- **http**: `HttpPredictor` POST ảnh → service HF → nhận dict → trả về.

Phần sau (`dish_resolver.resolve_vnfood`, gợi ý recipe, ai_logs) **y nguyên** — chỉ đổi nguồn của `predict()`.

## Hợp đồng wire (backend ↔ service)

- **Request:** `POST {AI_SERVICE_URL}/predict`, multipart, field `file` = ảnh (bytes gốc người dùng gửi).
  Header `Authorization: Bearer <token>` nếu có.
- **Response 200:** JSON = đúng dict `predict()`:
  ```json
  {
    "needs_fallback": false,
    "group": "BANH",
    "group_confidence": 0.98,
    "predicted_class": "banh-mi",
    "display_name": "Bánh mì",
    "class_confidence": 0.91,
    "top5": [{"class": "banh-mi", "display_name": "Bánh mì", "confidence": 0.91}, ...]
  }
  ```
- **Health:** `GET /health` → `{"status": "ok"}` (200) khi model đã nạp.

## Xử lý lỗi

| Tình huống | Kết quả |
|---|---|
| Timeout / connection error | 1 retry timeout dài → vẫn lỗi ⇒ `HTTPException(503)` |
| Service trả status ≥ 500 | `HTTPException(503, "AI service không sẵn sàng")` |
| Response JSON thiếu field bắt buộc | `HTTPException(502, "AI service trả dữ liệu không hợp lệ")` |
| `AI_BACKEND=http` nhưng thiếu `AI_SERVICE_URL` | Fail-fast khi khởi tạo `HttpPredictor` (ValueError) |

Backend giữ 503 khi AI không sẵn sàng — khớp hành vi `get_predictor()` cũ, endpoint `/ai/recognize` không đổi contract.

## Testing

- **`HttpPredictor.predict`** (mock HTTP client):
  - POST đúng `{url}/predict`, có field `file`, có header token khi set.
  - Parse response 200 → dict đủ field, giá trị khớp.
  - Timeout/connection → `HTTPException` 503 (sau retry).
  - Status 500 → 503. Response thiếu field → 502.
- **Config toggle:** `AI_BACKEND` default `"local"`.
- **Service `ai-service/`:** test `POST /predict` với ảnh mẫu → response có đủ field bắt buộc (dùng predictor thật
  nếu có weights, hoặc monkeypatch predictor bằng stub trả dict cố định để không cần weights trong CI).
- Test theo phong cách hiện có (pytest + mock, `backend/tests/`), TDD.

## Rủi ro & lưu ý

- **Cold start HF Spaces** (free tier ngủ): request đầu chậm → retry + timeout dài giảm rủi ro; production nên
  giữ min-replica (ghi trong README service).
- **Trùng lặp code** `inference.py`/`class_names.py` giữa backend và `ai-service/`: chấp nhận (service tự chứa để
  deploy độc lập); nếu sau này cần đồng bộ, tách thành package chung — ngoài phạm vi.
- **Chi phí:** HF Spaces CPU free đủ demo; Inference Endpoint (GPU, always-on) là bản trả phí — không bắt buộc.
