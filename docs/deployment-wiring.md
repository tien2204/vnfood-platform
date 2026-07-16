# Hướng dẫn deploy & nối các thành phần (managed stack)

> Kiến trúc scale: **Vercel** (frontend) · **Render** (backend) · **Hugging Face** (AI) · **Supabase** (Postgres + Object Storage) · **Upstash** (Redis).
> Nguyên tắc: mỗi nền tảng tự cấp một URL/secret → bạn copy nó vào biến môi trường của nền tảng khác. "Nối" = điền đúng biến.

## Tôi (Claude) làm gì / bạn làm gì

| Việc | Ai làm |
|---|---|
| Tạo tài khoản 5 nền tảng, verify email, nhập thẻ (nếu cần) | **Bạn** (không ủy quyền được) |
| Bấm Deploy, copy URL/secret mà nền tảng cấp | **Bạn** |
| Sửa code để đọc cấu hình từ env (CORS, v.v.) | Claude |
| Chọn đúng biến nào nối vào đâu | Bảng bên dưới |

Free tier đủ để demo/bảo vệ: Supabase, Upstash, Hugging Face, Vercel **không cần thẻ**; Render có free tier (web service ngủ sau 15' không request — chấp nhận được cho demo).

---

## Thứ tự deploy (theo phụ thuộc)

Deploy từ dưới lên: thành phần bị phụ thuộc trước, frontend cuối.

### 1. Supabase — Postgres + Object Storage
1. Tạo project → chờ DB provision.
2. **Database URL:** Settings → Database → *Connection string* → chọn **Connection pooling** (URI dạng `...pooler.supabase.com:6543/postgres`). Dùng bản pooler, không dùng direct 5432.
   → điền vào backend `DATABASE_URL`.
3. **Storage:** Storage → tạo bucket `uploads` (đặt **Public** để ảnh xem được không cần ký).
4. **S3 credentials:** Storage → Settings → *S3 Connection* → bật, lấy `Endpoint`, `Region`, `Access key`, `Secret key`.
   → điền backend `S3_ENDPOINT_URL`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET=uploads`.
5. **Public base URL** ảnh: dạng `https://<project-ref>.supabase.co/storage/v1/object/public/uploads`
   → backend `S3_PUBLIC_BASE_URL` **và** frontend `NEXT_PUBLIC_UPLOAD_URL` (cùng giá trị này).

Sau đó chạy migration Alembic 1 lần trỏ vào DB Supabase (từ máy bạn hoặc job trên Render):
`DATABASE_URL=<supabase-pooler-url> alembic upgrade head`

### 2. Upstash — Redis (rate-limit dùng chung)
1. Create Database → Regional (chọn region gần Render).
2. Copy **`rediss://` URL** (TLS, có sẵn password).
   → backend `RATE_LIMIT_STORAGE_URI`.

### 3. Hugging Face — service AI
1. Thư mục `ai-service/` đã sẵn (FastAPI + Dockerfile). Tạo **Space** kiểu **Docker**.
2. Push `ai-service/` + **file weights** (`model_weights/*.pth`) lên Space (dùng git-lfs cho .pth).
3. Space Settings → **Secrets** → thêm `API_TOKEN` = một chuỗi ngẫu nhiên bạn tự đặt.
4. URL Space (dạng `https://<user>-<space>.hf.space`).
   → backend `AI_SERVICE_URL` = URL đó, `AI_SERVICE_TOKEN` = đúng `API_TOKEN` vừa đặt, `AI_BACKEND=http`.
   - Lưu ý cold start: free tier ngủ, request đầu chậm → `HttpPredictor` đã retry timeout dài. Muốn luôn sẵn sàng thì nâng tier.

### 4. Render — backend FastAPI
1. New → Web Service → trỏ repo, root = `backend/`.
2. Build: `pip install -r requirements.txt` · Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
3. **Environment** → điền toàn bộ biến ở bảng dưới.
4. Deploy → Render cấp URL dạng `https://<service>.onrender.com`.
   → dùng cho backend `APP_BASE_URL` và frontend `NEXT_PUBLIC_API_URL`.
5. Autoscale/replica: Settings → Scaling (bản trả phí). Backend stateless (JWT + storage/redis ngoài) nên scale ngang N replica an toàn.

### 5. Vercel — frontend Next.js
1. Import repo, root = `frontend/`.
2. Environment Variables: `NEXT_PUBLIC_API_URL` = URL Render, `NEXT_PUBLIC_UPLOAD_URL` = public base Supabase.
3. Deploy → Vercel cấp URL `https://<app>.vercel.app`.
   → **quay lại Render** thêm domain này vào `CORS_ORIGINS`, và set `FRONTEND_BASE_URL` = URL Vercel.
4. Redeploy backend để CORS nhận domain mới.

---

## Bảng biến môi trường — nối ở đâu

### Backend (Render → Environment)
| Biến | Giá trị lấy từ |
|---|---|
| `DATABASE_URL` | Supabase pooler URI (bước 1.2) |
| `SECRET_KEY` | tự sinh ngẫu nhiên ≥32 ký tự (`openssl rand -hex 32`) |
| `AI_BACKEND` | `http` |
| `AI_SERVICE_URL` | URL HF Space (3.4) |
| `AI_SERVICE_TOKEN` | = `API_TOKEN` đặt ở HF (3.3) |
| `RATE_LIMIT_STORAGE_URI` | Upstash `rediss://` (2.2) |
| `STORAGE_BACKEND` | `s3` |
| `S3_ENDPOINT_URL` `S3_REGION` `S3_ACCESS_KEY` `S3_SECRET_KEY` | Supabase S3 (1.4) |
| `S3_BUCKET` | `uploads` |
| `S3_PUBLIC_BASE_URL` | public base Supabase (1.5) |
| `DB_POOL_SIZE` | `5` (thấp vì đã qua pooler — tránh cạn kết nối khi nhiều replica) |
| `CORS_ORIGINS` | URL Vercel, ví dụ `https://<app>.vercel.app` (cần sửa code — xem dưới) |
| `APP_BASE_URL` | URL Render |
| `FRONTEND_BASE_URL` | URL Vercel |
| `SMTP_*` | Gmail app-password nếu dùng newsletter; bỏ trống thì tắt email |

### Frontend (Vercel → Environment)
| Biến | Giá trị |
|---|---|
| `NEXT_PUBLIC_API_URL` | URL Render (backend) |
| `NEXT_PUBLIC_UPLOAD_URL` | public base Supabase (1.5) |

---

## Sơ đồ nối (ai gọi ai)

```
Người dùng ──▶ Vercel (Next.js)
                  │  NEXT_PUBLIC_API_URL
                  ▼
              Render (FastAPI) ──AI_SERVICE_URL──▶ Hugging Face (EfficientNet)
                  ├──DATABASE_URL──────────────▶ Supabase Postgres
                  ├──S3_*──────────────────────▶ Supabase Storage
                  └──RATE_LIMIT_STORAGE_URI────▶ Upstash Redis
```

---

## Việc code phải sửa trước khi deploy

- **CORS hardcode localhost** (`backend/app/main.py`): cho đọc `CORS_ORIGINS` từ `.env` (danh sách ngăn cách dấu phẩy), fallback localhost cho dev. Bắt buộc, nếu không frontend Vercel bị chặn.
- (Kiểm) frontend đang trộn 2 nguồn ảnh: `NEXT_PUBLIC_API_URL + image_url` (ảnh cũ serve qua backend) và `NEXT_PUBLIC_UPLOAD_URL + image_url` (ảnh mới trên storage). Khi chuyển hẳn sang Supabase Storage, ảnh mới sẽ có URL tuyệt đối → nhánh `startsWith("http")` xử lý đúng; ảnh cũ import 22k có thể cần migrate path. Không chặn deploy demo.
