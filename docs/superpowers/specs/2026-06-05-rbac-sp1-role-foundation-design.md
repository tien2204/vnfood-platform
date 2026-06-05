# Thiết kế — RBAC SP1: Role foundation (user / cộng tác viên / admin)

**Ngày:** 2026-06-05
**Branch:** `feat/canonical-recipes`
**Bối cảnh:** Đây là **sub-project 1/5** của hệ RBAC 3 tầng. Toàn bộ tính năng lớn (pipeline duyệt 2 tầng, review claim-lock, variant-from-saved, portal CTV/admin) được tách thành 5 sub-project, build tuần tự. SP1 chỉ làm **nền authorization**: thêm role `collaborator` + guard, không có workflow/UI mới.

**Hạ tầng có sẵn (tái dùng, KHÔNG xây lại):** JWT auth (`get_current_user`, `get_current_active_user`), `User.role` (String, default `user`, đã index), `require_admin` (`deps.py:42`), `UserOut.role` (đã expose role qua login/`/auth/me`), admin endpoint đổi role `PATCH /api/v1/admin/users/{id}/role` (validate `role in ("user","admin")`, `admin.py:170`).

---

## Quyết định đã chốt (với user)
- **5 sub-project, build tuần tự** (SP1 role → SP2 pipeline 2 tầng → SP3 claim-lock → SP4 variant-from-saved → SP5 portal). Mỗi SP có spec→plan→build riêng.
- **SP3 = claim-lock đơn giản** (1 CTV claim 1 recipe → CTV khác thấy bị khóa; duyệt/từ chối solo). **BỎ co-review** (A xin B duyệt cùng) — giảm state mạnh.
- **Hierarchy:** `admin ⊇ collaborator ⊇ user` (admin làm được mọi thứ CTV làm được).
- **CTV do admin gán** (không self-signup làm CTV).

### Non-goals (SP1)
- KHÔNG làm workflow duyệt, review, portal, UI (các SP sau).
- KHÔNG migration (cột `role` đã có; chỉ cho phép thêm giá trị `collaborator`).
- KHÔNG đổi `UserOut` (đã có `role`).

---

## Components

### 1. Role module — `backend/app/core/roles.py` (mới)
Single source of truth cho role:
```python
USER = "user"
COLLABORATOR = "collaborator"
ADMIN = "admin"

ROLES = (USER, COLLABORATOR, ADMIN)            # giá trị hợp lệ cho DB / API
ROLE_RANK = {USER: 0, COLLABORATOR: 1, ADMIN: 2}
ROLE_LABELS_VI = {USER: "Người dùng", COLLABORATOR: "Cộng tác viên", ADMIN: "Quản trị"}


def role_at_least(role: str, minimum: str) -> bool:
    """True nếu `role` có rank >= `minimum` (hierarchy admin⊇collaborator⊇user)."""
    return ROLE_RANK.get(role, -1) >= ROLE_RANK[minimum]
```

### 2. Guards — `backend/app/core/deps.py`
- Thêm `require_collaborator` (cho endpoint review SP2/SP3 dùng lại): cho phép role rank ≥ collaborator (tức collaborator HOẶC admin):
```python
async def require_collaborator(user: User = Depends(get_current_active_user)) -> User:
    if not role_at_least(user.role, COLLABORATOR):
        raise HTTPException(status_code=403, detail="Cần quyền cộng tác viên")
    return user
```
- `require_admin` GIỮ nguyên hành vi (chỉ admin) — refactor để dùng `role_at_least(user.role, ADMIN)` cho nhất quán (tùy chọn, không đổi behavior). Import `roles` ở đầu file.

### 3. Admin gán role — `backend/app/api/v1/admin.py` (`update_user_role`, ~line 162-170)
- Đổi validate `if body.role not in ("user", "admin")` → dùng `roles.ROLES` (tức `("user","collaborator","admin")`) để admin có thể gán/bỏ `collaborator`. Logic còn lại (không cho tự hạ quyền chính mình nếu có) giữ nguyên.

---

## Data flow
```
admin → PATCH /admin/users/{id}/role {role:"collaborator"}  (validate ∈ ROLES)
  → user.role = "collaborator"
login/auth.me → UserOut.role = "collaborator"  (đã có sẵn)
endpoint review (SP2/SP3) → Depends(require_collaborator) → cho collaborator|admin
```

## Error handling
- `require_collaborator`: role < collaborator → 403 "Cần quyền cộng tác viên". Token sai/khóa account → đã xử lý ở `get_current_active_user`.
- `update_user_role`: role ∉ ROLES → 400 (giữ pattern hiện tại).

## Verification
- Unit/smoke (script tạm `backend/`):
  - `require_collaborator`: user `collaborator`→pass, `admin`→pass, `user`→403; account khóa→403.
  - `require_admin`: chỉ `admin`→pass; `collaborator`→403 (không bị nới lỏng).
  - `role_at_least("admin","collaborator")`=True, `role_at_least("user","collaborator")`=False.
- API smoke: admin gọi `PATCH /admin/users/{id}/role {role:"collaborator"}` → 200, user.role đổi; `{role:"badrole"}` → 400.
- App import sạch (`from app.main import app`).

## Vị trí
SP1/5 — nền cho 4 SP sau. Sau SP1: hệ có 3 role hợp lệ + guard CTV, admin gán được CTV; chưa có workflow/UI mới (đúng chủ đích).

## Ghi chú vận hành
- Backend từ `backend/`: `$env:PYTHONUTF8=1; .venv\Scripts\python.exe ...`. Không migration.
- KHÔNG commit `.claude/settings*`, `backups/`, `cookpad_recipe/*.json`. Footer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
