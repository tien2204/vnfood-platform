# Runbook triển khai hệ thống scale — điền vào chỗ trống

> Làm **tuần tự từ trên xuống**. Mỗi bước sinh ra một giá trị (URL / key) → ghi vào "Bảng giá trị" bên dưới → cuối cùng dán vào ô Environment của Render & Vercel.
> Kèm giải thích wiring đầy đủ: [deployment-wiring.md](deployment-wiring.md).

---

## Bảng giá trị (điền dần khi làm)

| # | Tên giá trị | Lấy ở bước | Giá trị của bạn |
|---|---|---|---|
| V1 | `DATABASE_URL` (Supabase pooler) | B1 | `__________` |
| V2 | `SECRET_KEY` (tự sinh) | B0 | `__________` |
| V3 | S3 endpoint | B2 | `__________` |
| V4 | S3 region | B2 | `__________` |
| V5 | S3 access key | B2 | `__________` |
| V6 | S3 secret key | B2 | `__________` |
| V7 | S3 public base URL (ảnh) | B2 | `__________` |
| V8 | `RATE_LIMIT_STORAGE_URI` (Upstash) | B3 | `__________` |
| V9 | `AI_SERVICE_TOKEN` (tự đặt) | B0 | `__________` |
| V10 | `AI_SERVICE_URL` (HF Space) | B4 | `__________` |
| V11 | URL backend (Render) | B5 | `__________` |
| V12 | URL frontend (Vercel) | B6 | `__________` |

---

## B0. Tự sinh 2 bí mật (làm trước, offline)

Chạy trên máy (Git Bash):

```bash
openssl rand -hex 32   # → dán vào V2 (SECRET_KEY)
openssl rand -hex 24   # → dán vào V9 (AI_SERVICE_TOKEN), bạn tự đặt tùy ý
```

---

## B1. Supabase — PostgreSQL

1. https://supabase.com → đăng nhập → **New project**. Đặt password DB (nhớ lại).
2. Chờ provision (~2 phút).
3. **Connect** → **Direct Connection string** → chọn **Session pooler** (port `5432`), Type = **URI**.
   - Copy chuỗi rồi **sửa 2 điểm** trước khi lưu vào **V1**:
     - Đổi đầu `postgresql://` → **`postgresql+asyncpg://`** (backend chạy async — bắt buộc).
     - Thay `[YOUR-PASSWORD]` bằng mật khẩu DB (bỏ dấu ngoặc). Có ký tự đặc biệt thì percent-encode.
   - V1 cuối: `postgresql+asyncpg://postgres.<ref>:<password>@aws-...pooler.supabase.com:5432/postgres`
   - ⚠️ Không dùng **Transaction pooler** (6543): pgbouncer transaction mode làm hỏng prepared statement của asyncpg. Session pooler hợp với server thường trú (Render) và không cần sửa code.

## B2. Supabase — Object Storage (S3)

1. **Storage** → **New bucket** → tên `uploads` → bật **Public bucket** → Save.
2. Storage → **Settings** (hoặc Project Settings → Storage) → mục **S3 Connection** / **S3 Access Keys**:
   - Copy **Endpoint** (dạng `https://<ref>.supabase.co/storage/v1/s3`) → **V3**
   - **Region** (vd `ap-southeast-1`) → **V4**
   - Tạo **New access key** → copy **Access key ID** → **V5**, **Secret** → **V6** (chỉ hiện 1 lần!)
3. Public base URL ảnh: `https://<ref>.supabase.co/storage/v1/object/public/uploads` → **V7**
   (thay `<ref>` bằng project ref của bạn).

## B3. Upstash — Redis

1. https://upstash.com → **Create Database** → Regional → chọn region gần Render (vd Singapore).
2. Trong trang DB, mục **Connect** → copy URL **`rediss://...`** (TLS, đã kèm password) → **V8**.

## B4. Hugging Face — service AI

> Code service đã có sẵn trong repo: thư mục `ai-service/` (FastAPI + Dockerfile, cổng 7860).

1. https://huggingface.co → **New Space** → SDK = **Docker** → Blank → đặt tên (vd `vnfood-ai`).
2. Space → **Settings** → **Variables and secrets** → **New secret**:
   - Name `API_TOKEN`, Value = **V9** (đúng chuỗi B0).
3. Đẩy code + weights lên Space (clone Space rồi copy `ai-service/*` + thư mục `model_weights/*.pth`):

```bash
git lfs install
git clone https://huggingface.co/spaces/<user>/vnfood-ai
cd vnfood-ai
# copy nội dung ai-service/ vào đây (app.py, inference.py, class_names.py, Dockerfile, requirements.txt)
# copy weights: tạo model_weights/ và bỏ 9 file .pth vào
git lfs track "*.pth"
git add .gitattributes . && git commit -m "deploy vnfood ai service"
git push
```

4. Chờ Space build & chạy (tab **Logs** báo `Uvicorn running`). URL Space:
   `https://<user>-vnfood-ai.hf.space` → **V10**.
5. Kiểm nhanh: mở `https://<user>-vnfood-ai.hf.space/health` → phải trả `{"status":"ok"}`.

## B5. Render — backend FastAPI

1. https://render.com → **New** → **Web Service** → kết nối GitHub repo → nhánh `feat/scalability` (hoặc `main` sau khi merge).
2. Cấu hình:
   - **Root Directory:** `backend`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Pre-Deploy Command** (chạy migration): `alembic upgrade head`
3. **Environment** → Add từng biến (xem khối paste dưới). Tạm để `CORS_ORIGINS` trống, điền sau B6.
4. **Create Web Service** → chờ deploy. URL dạng `https://<service>.onrender.com` → **V11**.
5. Kiểm: `https://<service>.onrender.com/api/v1/health` phải OK.
   > Autoscale/nhiều replica là toggle ở gói trả phí (Standard+). Free = 1 instance, ngủ sau 15' — đủ demo.

### Env dán vào Render

```
DATABASE_URL=<V1>
SECRET_KEY=<V2>
AI_BACKEND=http
AI_SERVICE_URL=<V10>
AI_SERVICE_TOKEN=<V9>
RATE_LIMIT_STORAGE_URI=<V8>
STORAGE_BACKEND=s3
S3_ENDPOINT_URL=<V3>
S3_REGION=<V4>
S3_ACCESS_KEY=<V5>
S3_SECRET_KEY=<V6>
S3_BUCKET=uploads
S3_PUBLIC_BASE_URL=<V7>
DB_POOL_SIZE=5
APP_BASE_URL=<V11>
FRONTEND_BASE_URL=<V12>          # điền sau khi có Vercel (B6), rồi redeploy
CORS_ORIGINS=<V12>              # điền sau khi có Vercel (B6), rồi redeploy
```

## B6. Vercel — frontend Next.js

1. https://vercel.com → **Add New Project** → import repo → **Root Directory:** `frontend`.
2. **Environment Variables:**
   ```
   NEXT_PUBLIC_API_URL=<V11>
   NEXT_PUBLIC_UPLOAD_URL=<V7>
   ```
3. **Deploy** → URL `https://<app>.vercel.app` → **V12**.

## B7. Nối vòng cuối (bắt buộc)

1. Về **Render** → Environment → điền `CORS_ORIGINS=<V12>` và `FRONTEND_BASE_URL=<V12>` → **Save** (Render tự redeploy).
2. Mở `https://<app>.vercel.app` → đăng ký/đăng nhập → thử **AI nhận diện ảnh** và **tải ảnh công thức**.
   - AI request đầu chậm (HF cold start) là bình thường.
   - Nếu trình duyệt báo lỗi CORS → kiểm lại V12 trong `CORS_ORIGINS` khớp đúng domain (kể cả `https://`).

---

## Thứ tự phụ thuộc (vì sao làm theo thứ tự này)

```
B0 (bí mật) → B1,B2 (Supabase) → B3 (Upstash) → B4 (HF) ──┐
                                                          ▼
                                                B5 (Render backend) ──► B6 (Vercel) ──► B7 (nối CORS)
```
Backend (B5) cần mọi URL/secret của B1–B4. Frontend (B6) cần URL backend. CORS (B7) cần URL frontend → nên vòng lại cuối.

## Checklist trước khi bấm deploy

- [ ] Đã merge/hoặc trỏ Render+Vercel vào nhánh có commit CORS env (`feat/scalability`, commit `1b5632f`).
- [ ] 9 file `.pth` đã lên HF Space (git-lfs), `/health` trả ok.
- [ ] `AI_SERVICE_TOKEN` ở Render == `API_TOKEN` secret ở HF Space.
- [ ] Migration chạy sạch (`alembic upgrade head` trong pre-deploy log).
- [ ] Bucket `uploads` là **Public**.
