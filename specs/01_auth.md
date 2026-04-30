# 01 — Authentication (Localhost — JWT tự handle)

## Stack
- Password hashing: `bcrypt` (passlib)
- JWT: `python-jose`
- Access token: 60 phút
- Refresh token: 7 ngày (lưu trong DB hoặc httpOnly cookie)

## Endpoints

### POST /api/v1/auth/register
```json
Request:  { "email": "", "password": "", "full_name": "" }
Response: { "success": true, "message": "Đăng ký thành công" }
```
Validation: email unique, password >= 8 ký tự

### POST /api/v1/auth/login
```json
Request:  { "email": "", "password": "" }
Response: {
  "success": true,
  "data": {
    "access_token": "eyJ...",
    "refresh_token": "eyJ...",
    "token_type": "bearer",
    "user": { "id": "", "email": "", "full_name": "", "role": "", "avatar_url": "" }
  }
}
```

### POST /api/v1/auth/refresh
```json
Request:  { "refresh_token": "eyJ..." }
Response: { "data": { "access_token": "eyJ...", "token_type": "bearer" } }
```

### POST /api/v1/auth/logout
- Header: Authorization Bearer
- Invalidate refresh token (xóa khỏi DB hoặc blacklist)

### POST /api/v1/auth/change-password (requires auth)
```json
Request: { "old_password": "", "new_password": "" }
```

## FastAPI Dependencies

```python
# core/deps.py
async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    # decode JWT → lấy user_id → query DB
    # raise 401 nếu invalid/expired

async def get_current_active_user(user = Depends(get_current_user)) -> User:
    # raise 403 nếu is_active = False

async def require_admin(user = Depends(get_current_active_user)) -> User:
    # raise 403 nếu role != 'admin'
```

## JWT Payload
```json
{ "sub": "user_uuid", "role": "user", "exp": 1234567890 }
```

## Frontend Pages
- `/auth/login`
- `/auth/register`

## Edge Cases
- Email đã tồn tại → 400 "Email đã được sử dụng"
- User bị ban → 403 "Tài khoản đã bị khóa"
- Token hết hạn → 401 → frontend tự call /refresh
- Sai password → 401 "Email hoặc mật khẩu không đúng"
