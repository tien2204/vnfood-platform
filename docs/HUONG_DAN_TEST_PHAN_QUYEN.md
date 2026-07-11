# Hướng dẫn test hệ thống phân quyền (RBAC 3 tầng + staff portal + staff login)

> Localhost. Tất cả tính năng RBAC: SP1 role · SP2 pipeline duyệt 2 tầng · SP2b change-request · SP3 claim-lock · SP5 staff portal `/staff` · SP4 variant-from-saved · trang đăng nhập nhân viên.

---

## 0. Khởi động

```powershell
# 1) Postgres (đã chạy sẵn — bỏ qua nếu docker ps thấy postgres healthy)
docker-compose up -d

# 2) Backend (terminal 1)
cd backend; .venv\Scripts\activate; uvicorn app.main:app --reload --port 8000

# 3) Frontend (terminal 2)
cd frontend; npm run dev
```
Mở http://localhost:3000

---

## 1. Tài khoản test

**Admin (đã có sẵn trong DB):**
- Email: `admin@vnfood.local`
- Mật khẩu: `Admin@123`
- Nếu chưa có / quên: `cd backend; .venv\Scripts\python scripts/seed_admin.py` (idempotent).

**User thường:** đăng ký mới tại http://localhost:3000/auth/register (vd `user1@test.local` / `User@123`).

**Cộng tác viên (CTV):** KHÔNG đăng ký được — admin tạo ở Bước 3 (mục B). Sau khi tạo sẽ có **mật khẩu tạm hiển thị 1 lần**.

---

## 2. Test trang ĐĂNG NHẬP NHÂN VIÊN (staff login)

URL: **http://localhost:3000/auth/staff-login** (biểu tượng khiên, nền tối — khác trang user).

| Đăng nhập bằng | Kỳ vọng |
|---|---|
| admin@vnfood.local | Vào thẳng `/staff/dashboard` (Tổng quan) |
| tài khoản CTV (sau Bước 3) | Vào thẳng `/staff/review` (Hàng đợi duyệt) |
| user thường (user1@test.local) | ❌ Toast "Tài khoản không có quyền truy cập khu vực nhân viên" — **KHÔNG đăng nhập** (navbar vẫn hiện nút Đăng nhập; localStorage không có `access_token`) |
| sai mật khẩu | Toast "Email hoặc mật khẩu không đúng" |

- Trang `/auth/login` (user thường) vẫn đăng nhập được cho MỌI role (cả admin/CTV) → cả 2 cửa đều mở.
- Trang `/auth/login` có link nhỏ "Đăng nhập nhân viên" → dẫn sang `/auth/staff-login`.

**Cách kiểm tra "không có session" khi user bị từ chối:** F12 → Application → Local Storage → `http://localhost:3000` → không thấy `access_token`.

---

## 3. Test STAFF PORTAL `/staff` (đăng nhập admin)

### A. Context-switcher (nút chuyển khu vực)
- Sau khi đăng nhập admin, ở Navbar (trang user) có nút **"Người dùng ▾"** → bấm → chọn **Quản trị** → vào `/staff/dashboard`.
- Trong portal (góc trên phải header) cũng có nút switcher → chọn **Người dùng** để quay lại trang chủ.
- Đăng nhập bằng USER thường → KHÔNG thấy nút switcher (chỉ role staff mới có).

### B. Quản lý tài khoản (admin CRUD) — `/staff/users`
1. Vào **Người dùng** trong sidebar → bấm **"+ Tạo tài khoản"**.
2. Nhập email (vd `ctv1@test.local`), họ tên, **Vai trò = Cộng tác viên** → Tạo.
3. → Màn hình hiện **mật khẩu tạm** (chỉ 1 lần) — bấm **Copy**, LƯU LẠI để đăng nhập CTV.
4. Mở chi tiết 1 user → thử **Sửa** (đổi họ tên/email) · **Đặt lại mật khẩu** (hiện mật khẩu tạm mới) · **Đổi vai trò** · **Khóa/Mở** · **Xóa tài khoản**.
5. Mở chi tiết CHÍNH admin đang đăng nhập → nút **Xóa** bị ẩn; thử đổi role/khóa chính mình → backend chặn (lỗi 400).

> Giờ bạn đã có tài khoản CTV `ctv1@test.local` + mật khẩu tạm → quay lại Bước 2 test staff-login cho role CTV.

### C. Phân quyền route (middleware)
Đăng nhập bằng **CTV** rồi gõ thẳng URL:
- `/staff/users`, `/staff/dashboard`, `/staff/change-requests` → bị đá về `/staff/review` (chỉ admin xem được).
- `/staff/review`, `/staff/proposals` → CTV vào được.
- Gõ `/admin` (URL cũ) → tự chuyển `/staff`.
- Chưa đăng nhập gõ `/staff/...` → đá về `/auth/login`.
- User thường gõ `/staff/...` → đá về trang chủ `/`.

---

## 4. Test PIPELINE DUYỆT 2 TẦNG (luồng chính)

**Vai trò:** user đăng → CTV duyệt (tầng 1) → admin đăng (tầng 2).

1. **(User)** Đăng nhập user thường → tạo công thức mới (nút Đăng công thức / `/recipes/new`) → điền đủ → Lưu.
   - Vào `/me/recipes` → công thức ở trạng thái **Riêng tư** (private).
   - Bấm **Gửi duyệt** → trạng thái **Chờ CTV duyệt** (pending_collaborator).
2. **(CTV)** Đăng nhập `ctv1` qua `/auth/staff-login` → `/staff/review`:
   - Thấy công thức trong hàng đợi → bấm **Nhận xử lý** (claim) → trạng thái "Bạn đang xử lý".
   - Bấm **Mở duyệt** → trang chi tiết → **Duyệt** (hoặc **Từ chối** + lý do).
   - Duyệt → công thức chuyển **Chờ admin đăng** (pending_admin), rời hàng đợi CTV.
3. **(Admin)** `/staff/admin-review` → thấy công thức → **Mở** → **Đăng**.
   - → Công thức **Approved**, lên trang cộng đồng (`/recipes` thấy, badge "Cộng đồng").
4. **(User)** `/me/recipes` → công thức giờ là **Đã duyệt**.

**Test từ chối:** ở bước 2 bấm Từ chối + lý do → user thấy trạng thái **Bị từ chối** + lý do ở `/me/recipes`, có thể sửa rồi Gửi duyệt lại.

---

## 5. Test CLAIM-LOCK (SP3) — cần 2 CTV

1. Tạo thêm CTV thứ 2 `ctv2@test.local` (Bước 3B).
2. Có ≥1 công thức ở hàng đợi (pending_collaborator).
3. **CTV1** bấm **Nhận xử lý** 1 công thức.
4. **CTV2** đăng nhập (trình duyệt khác / ẩn danh) → `/staff/review`:
   - Công thức đó hiện **🔒 {tên CTV1} đang xử lý**, nút bị khóa — CTV2 không Mở/Duyệt được.
5. CTV1 bấm **Nhả** → CTV2 refresh → giờ Nhận xử lý được.
6. **Admin** luôn vượt khóa: mở/duyệt/nhả bất kỳ công thức nào dù CTV khác đang giữ.

---

## 6. Test CHANGE-REQUEST (SP2b) — CTV đề xuất sửa recipe hệ thống

**Recipe hệ thống = recipe canonical/cookpad có sẵn.** CTV không sửa trực tiếp mà gửi đề xuất, admin duyệt.

1. **(CTV)** Mở 1 recipe bất kỳ ở `/recipes/...` → thấy nút **"Đề xuất sửa" / "Đề xuất xóa"** (chỉ role CTV/admin thấy).
   - Đề xuất sửa → form điền sẵn → chỉnh → Gửi.
   - Hoặc `/recipes/propose-new` → đề xuất tạo recipe hệ thống mới.
2. **(CTV)** `/staff/proposals` → xem các đề xuất của mình (chờ duyệt).
3. **(Admin)** `/staff/change-requests` → thấy đề xuất → xem nội dung (payload) → **Duyệt** (áp dụng thật vào recipe) hoặc **Từ chối** + lý do.
   - Thử **đề xuất xóa** 1 recipe là canonical DUY NHẤT của 1 lớp AI → admin bấm Duyệt → bị chặn (toast lỗi, không cho xóa).

---

## 7. Test VARIANT-FROM-SAVED (SP4) — tạo biến thể

1. **(User bất kỳ, đã đăng nhập)** Lưu (bookmark ♥) vài recipe → vào `/me/saved`.
2. Trên thẻ recipe đã lưu → bấm **"Tạo biến thể"** → form điền sẵn nội dung gốc + ô **"Nhãn biến thể"**.
   - (Cũng có nút "Tạo biến thể" trên trang chi tiết mỗi recipe.)
3. Sửa tùy ý → Lưu → công thức **biến thể riêng tư** xuất hiện ở `/me/recipes`.
4. **Gửi duyệt** biến thể → cho chạy qua pipeline (Bước 4) đến khi **Approved**.
5. Mở recipe **GỐC** → cuối trang có mục **"Biến thể từ cộng đồng"** liệt kê biến thể vừa duyệt.
6. Mở recipe **biến thể** → đầu trang hiện **"Phỏng theo: {recipe gốc}"** (link về gốc).
   - Lưu ý: biến thể chưa duyệt KHÔNG hiện trên recipe gốc (chỉ approved).

---

## 8. Checklist nhanh (đánh dấu khi pass)

- [ ] staff-login: admin→dashboard, CTV→review, user→bị từ chối (không session), sai pass→lỗi
- [ ] context-switcher: hiện với staff, ẩn với user; chuyển 2 chiều
- [ ] admin tạo CTV → có mật khẩu tạm 1 lần; sửa/reset/khóa/xóa user; không tự xóa được
- [ ] middleware: CTV bị chặn route admin; user bị chặn /staff; /admin→/staff
- [ ] pipeline: user gửi → CTV duyệt → admin đăng → lên cộng đồng; nhánh từ chối
- [ ] claim-lock: CTV2 thấy 🔒 khi CTV1 giữ; nhả thì chuyển được; admin vượt khóa
- [ ] change-request: CTV đề xuất → admin duyệt/áp dụng; chặn xóa canonical AI duy nhất
- [ ] variant: tạo từ /me/saved → /me/recipes → duyệt → hiện "Biến thể từ cộng đồng" + "Phỏng theo"

---

## Mẹo / xử lý lỗi

- **Mở 2 role cùng lúc:** dùng 1 cửa sổ thường (đăng nhập role này) + 1 cửa sổ ẩn danh (role khác). localStorage tách biệt theo cửa sổ ẩn danh.
- **Promote nhanh 1 user có sẵn thành CTV/admin** (thay vì tạo mới), chạy trong `backend`:
  ```powershell
  .venv\Scripts\python -c "import asyncio; from sqlalchemy import text; from app.core.database import AsyncSessionLocal
  async def m():
      async with AsyncSessionLocal() as s:
          await s.execute(text(\"update users set role='collaborator' where email='ctv1@test.local'\")); await s.commit(); print('done')
  asyncio.run(m())"
  ```
- **Quên mật khẩu tạm CTV:** admin → `/staff/users/{id}` → Đặt lại mật khẩu → mật khẩu tạm mới.
- **Đổi mật khẩu admin mặc định:** đăng nhập admin → `/me/profile` (hoặc admin tự đặt lại qua /staff/users).
- **Backend báo lỗi import sau khi pull:** chắc chắn đã `alembic upgrade head` (`cd backend; .venv\Scripts\python -m alembic upgrade head`).
