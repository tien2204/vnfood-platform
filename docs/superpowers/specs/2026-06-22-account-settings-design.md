# Thiết kế: Mở rộng trang cài đặt cá nhân `/me/profile`

> Ngày: 2026-06-22
> Trạng thái: Đã duyệt thiết kế, chờ review spec

## Bối cảnh

Trang `/me/profile` hiện chỉ có 1 form: avatar + tên hiển thị + bio
(`PUT /users/me/profile`). Thiếu so với settings page điển hình:
- Không hiển thị email (tên đăng nhập) đang đăng nhập, vai trò, ngày tham gia.
- Không có chức năng đổi mật khẩu — **dù backend đã có sẵn** `POST /auth/change-password`.
- Không có chức năng đổi email.

Phạm vi đã chốt với người dùng: **gọn & thực dụng** — thêm khối "Tài khoản"
(hiển thị) + đổi email + đổi mật khẩu. Không làm 2FA, phiên đăng nhập, thông báo,
quyền riêng tư, liên kết OAuth, vùng nguy hiểm (YAGNI cho đồ án).

Quyết định người dùng:
- Cho phép **đổi email**, bảo vệ bằng **nhập mật khẩu hiện tại** (không dùng luồng
  xác minh qua email vì dự án chưa có SMTP).
- Thêm **nút copy email**.

## Cách tiếp cận

`/me/profile` trở thành **trang cài đặt một trang gồm các card độc lập** — mỗi card
là một form riêng, submit riêng. (Phương án thay thế: chia tab Account/Security —
thừa cho phạm vi gọn, nên xếp dọc.)

## Cấu trúc trang — 4 card xếp dọc

### Card 1 — Hồ sơ công khai *(giữ nguyên logic hiện tại)*
- Avatar (ImageUploader), tên hiển thị (bắt buộc, ≤100), bio (≤500).
- Submit → `PUT /users/me/profile` → `refreshUser()`.

### Card 2 — Tài khoản *(mới, chỉ hiển thị, không gọi API)*
- **Email**: hiển thị `user.email`, kèm **nút copy** (icon) → copy vào clipboard,
  toast "Đã copy email".
- **Vai trò**: badge từ `user.role` (`user` → "Người dùng", `admin` → "Quản trị").
- **Ngày tham gia**: format `profile.created_at` (vd "Tham gia tháng 6, 2026").
- Toàn bộ dữ liệu đã có sẵn client-side → **không đụng backend**.

### Card 3 — Đổi email *(mới)*
- Input *email mới* (type=email) + input *mật khẩu hiện tại* (type=password).
- Submit → `POST /auth/change-email` `{ new_email, password }`.
- Thành công → `refreshUser()` + toast "Đổi email thành công", clear form.
- Lỗi 400 → `toast.error` với message từ backend.

### Card 4 — Đổi mật khẩu *(mới, backend đã có)*
- Input *mật khẩu hiện tại* + *mật khẩu mới* + *nhập lại mật khẩu mới*.
- Client validate: mật khẩu mới ≥8 ký tự, "nhập lại" khớp — trước khi gọi API.
- Submit → `POST /auth/change-password` `{ old_password, new_password }`.
- Thành công → toast "Đổi mật khẩu thành công", clear form.
- Lỗi 400 (mật khẩu cũ sai) → `toast.error`.

## Backend — việc mới (chỉ cho đổi email)

`backend/app/schemas/auth.py`:
```python
class ChangeEmailRequest(BaseModel):
    new_email: EmailStr
    password: str
```

`backend/app/services/auth_service.py`:
```python
async def change_email(db, user: User, new_email: str, password: str) -> None:
    if not verify_password(password, user.hashed_password):
        raise HTTPException(400, detail="Mật khẩu không đúng")
    if new_email == user.email:
        raise HTTPException(400, detail="Email mới trùng email hiện tại")
    existing = await db.execute(select(User).where(User.email == new_email))
    if existing.scalar_one_or_none():
        raise HTTPException(400, detail="Email đã được sử dụng")
    user.email = new_email
    db.add(user)
    await db.commit()
```
(Style bám theo `change_password` / `register_user` hiện có.)

`backend/app/api/v1/auth.py`:
```python
@router.post("/change-email")
async def change_email(
    body: ChangeEmailRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await auth_service.change_email(db, current_user, body.new_email, body.password)
    return {"success": True, "message": "Đổi email thành công"}
```

Token JWT dùng user-id (`sub`) nên đổi email **không** làm mất hiệu lực token;
frontend chỉ cần `refreshUser()` để cập nhật email hiển thị.

## Frontend — việc mới

- Tách `frontend/app/me/profile/page.tsx` thành 4 card. Card 1 giữ nguyên logic;
  card 2-4 thêm mới với state + handler riêng cho từng form.
- Thêm lệnh gọi API đổi email (gọi `api.post("/auth/change-email", ...)` trực tiếp
  hoặc thêm helper trong `lib/api.ts` theo pattern hiện có).
- Nút copy email dùng `navigator.clipboard.writeText`.

## Error handling

- Mọi lỗi backend trả `{ detail }` (400) → map ra `toast.error(detail)`.
- Validate client trước khi gọi: tên hiển thị không rỗng (card 1), mật khẩu mới ≥8
  và "nhập lại" khớp (card 4), email mới không rỗng (card 3).

## Testing

- Backend: test `change_email` cho 3 ca — sai mật khẩu (400), email trùng (400),
  thành công (email được cập nhật trong DB).
- Frontend: kiểm thử tay — đổi email, đổi mật khẩu, copy email, các thông báo lỗi.

## Ngoài phạm vi (YAGNI)

2FA, danh sách phiên đăng nhập, lịch sử login, tùy chọn thông báo, quyền riêng tư,
liên kết OAuth, xoá/vô hiệu hoá tài khoản, xác minh email qua SMTP.
