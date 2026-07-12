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
3. Đặt secret `AI_SERVICE_TOKEN` — **nên đặt** cho mọi deploy có thể truy cập từ mạng (endpoint /predict công khai nếu để trống).
4. Space chạy port 7860; URL công khai dạng `https://<user>-<space>.hf.space`.

## Kết nối từ backend
Đặt trong `backend/.env`:
```
AI_BACKEND=http
AI_SERVICE_URL=https://<user>-<space>.hf.space
AI_SERVICE_TOKEN=<token nếu có>
```

> Space free tier ngủ sau một lúc → request đầu chậm (cold start). Production nên giữ min-replica.
