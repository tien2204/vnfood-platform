# RBAC SP1 — Role Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `collaborator` role tier between `user` and `admin` — a single-source-of-truth role module, a `require_collaborator` guard (allows collaborator OR admin), and admin ability to assign the role. No migration, no UI.

**Architecture:** New `app/core/roles.py` holds the role constants + hierarchy. `app/core/deps.py` gains `require_collaborator` (role rank ≥ collaborator) and refactors `require_admin` to use the same hierarchy helper (behavior unchanged). The existing `PATCH /admin/users/{id}/role` validation widens from `("user","admin")` to the full role set so admins can promote/demote collaborators with existing tooling.

**Tech Stack:** FastAPI dependency guards, SQLAlchemy `User.role` (existing String column).

**Branch:** `feat/canonical-recipes`. Backend cmds from `backend/`: `$env:PYTHONUTF8=1; .venv\Scripts\python.exe ...`. No migration. Do NOT commit `.claude/settings*`, `backups/`, `cookpad_recipe/*.json`. Footer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Existing facts:** `deps.py` has `get_current_active_user` + `require_admin` (`if user.role != "admin": 403`). `UserOut.role` already exposed. `admin.py` `update_user_role` (lines ~161-177) has a self-demotion guard (`if str(current_admin.id) == user_id: 400`) then `if body.role not in ("user","admin"): 400`, then calls `admin_service.update_user_role(db, user_id, body.role)`.

---

### Task 1: `roles.py` module + `require_collaborator` guard

**Files:** Create `backend/app/core/roles.py`; Modify `backend/app/core/deps.py`

- [ ] **Step 1: Create `backend/app/core/roles.py`**

```python
"""Single source of truth for user roles + hierarchy (admin ⊇ collaborator ⊇ user)."""

USER = "user"
COLLABORATOR = "collaborator"
ADMIN = "admin"

ROLES = (USER, COLLABORATOR, ADMIN)  # valid role values for DB / API
ROLE_RANK = {USER: 0, COLLABORATOR: 1, ADMIN: 2}
ROLE_LABELS_VI = {USER: "Người dùng", COLLABORATOR: "Cộng tác viên", ADMIN: "Quản trị"}


def role_at_least(role: str, minimum: str) -> bool:
    """True if `role`'s rank >= `minimum`'s rank (unknown role -> below everything)."""
    return ROLE_RANK.get(role, -1) >= ROLE_RANK[minimum]
```

- [ ] **Step 2: Add `require_collaborator` + refactor `require_admin` in `deps.py`.** Add the import near the top (after `from app.models.user import User`):

```python
from app.core import roles
```

Replace the existing `require_admin` function with:

```python
async def require_admin(user: User = Depends(get_current_active_user)) -> User:
    if not roles.role_at_least(user.role, roles.ADMIN):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Không có quyền truy cập")
    return user


async def require_collaborator(user: User = Depends(get_current_active_user)) -> User:
    if not roles.role_at_least(user.role, roles.COLLABORATOR):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cần quyền cộng tác viên")
    return user
```

(`require_admin` behavior is unchanged — `role_at_least(role, ADMIN)` is true only for `admin`.)

- [ ] **Step 3: Smoke the role logic + guards (temp script), from `backend/`** — create `backend/scripts/_smoke_roles.py`:

```python
import asyncio
from types import SimpleNamespace
from fastapi import HTTPException
from app.core import roles
from app.core.deps import require_admin, require_collaborator


async def call(guard, role):
    return await guard(user=SimpleNamespace(role=role, is_active=True))


async def main():
    # hierarchy
    assert roles.role_at_least("admin", roles.COLLABORATOR) is True
    assert roles.role_at_least("collaborator", roles.COLLABORATOR) is True
    assert roles.role_at_least("user", roles.COLLABORATOR) is False
    assert roles.role_at_least("admin", roles.ADMIN) is True
    assert roles.role_at_least("collaborator", roles.ADMIN) is False
    assert roles.ROLES == ("user", "collaborator", "admin")

    # require_collaborator: collaborator + admin pass; user 403
    assert (await call(require_collaborator, "collaborator")).role == "collaborator"
    assert (await call(require_collaborator, "admin")).role == "admin"
    for bad in ("user", "weird"):
        try:
            await call(require_collaborator, bad)
            assert False, f"require_collaborator should 403 for {bad}"
        except HTTPException as e:
            assert e.status_code == 403

    # require_admin: only admin passes; collaborator 403 (not loosened)
    assert (await call(require_admin, "admin")).role == "admin"
    for bad in ("collaborator", "user"):
        try:
            await call(require_admin, bad)
            assert False, f"require_admin should 403 for {bad}"
        except HTTPException as e:
            assert e.status_code == 403

    print("OK — roles + guards behave correctly")


asyncio.run(main())
```

Run: `$env:PYTHONUTF8=1; .venv\Scripts\python.exe -m scripts._smoke_roles`
Expected: `OK — roles + guards behave correctly`. Then delete: `Remove-Item scripts\_smoke_roles.py`.

- [ ] **Step 4: Verify app imports clean (from `backend/`)**

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -c "from app.main import app; print('ok')"
```
Expected: `ok`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/roles.py backend/app/core/deps.py
git commit -m "feat(rbac-sp1): roles module + require_collaborator guard (admin>=collab>=user)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Admin can assign the `collaborator` role

**Files:** Modify `backend/app/api/v1/admin.py`

- [ ] **Step 1: Widen the role validation in `update_user_role`.** In `backend/app/api/v1/admin.py`, add the import near the other imports at the top:

```python
from app.core import roles
```

In `update_user_role` (the `@router.patch("/users/{user_id}/role")` handler), replace:

```python
    if body.role not in ("user", "admin"):
        raise HTTPException(400, detail="Role không hợp lệ (user | admin)")
```

with:

```python
    if body.role not in roles.ROLES:
        raise HTTPException(400, detail="Role không hợp lệ (user | collaborator | admin)")
```

(Leave the self-demotion guard `if str(current_admin.id) == user_id: ...` and the rest unchanged.)

- [ ] **Step 2: Smoke the service accepts `collaborator` (real DB, non-destructive), from `backend/`** — create `backend/scripts/_smoke_role_assign.py`:

```python
import asyncio
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.user import User
from app.services import admin_service


async def main():
    async with AsyncSessionLocal() as db:
        u = (await db.execute(select(User).limit(1))).scalar_one_or_none()
        if u is None:
            print("no users in DB — skip (validation still widened)")
            return
        original = u.role
        uid = str(u.id)
        try:
            updated = await admin_service.update_user_role(db, uid, "collaborator")
            assert updated is not None and updated.role == "collaborator", updated
            print(f"set {u.email} -> collaborator OK")
        finally:
            await admin_service.update_user_role(db, uid, original)  # restore
            print(f"restored -> {original}")


asyncio.run(main())
```

Run: `$env:PYTHONUTF8=1; .venv\Scripts\python.exe -m scripts._smoke_role_assign`
Expected: `set <email> -> collaborator OK` then `restored -> <original>` (or the `no users` skip line). Then delete: `Remove-Item scripts\_smoke_role_assign.py`.

- [ ] **Step 3: Verify app imports clean (from `backend/`)**

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -c "from app.main import app; print('ok')"
```
Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/v1/admin.py
git commit -m "feat(rbac-sp1): admin can assign collaborator role (validate against ROLES)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- `roles.py` (USER/COLLABORATOR/ADMIN, ROLES, ROLE_RANK, ROLE_LABELS_VI, role_at_least) → Task 1 Step 1. ✓
- `require_collaborator` (collab|admin) + `require_admin` refactor (behavior unchanged) → Task 1 Step 2. ✓
- Admin role-assignment widened to ROLES → Task 2 Step 1. ✓
- No migration, no UI → confirmed (only roles.py/deps.py/admin.py touched). ✓
- Verify: guard logic (collab/admin pass, user 403; admin-only stays admin-only), role_at_least, admin assign collaborator, app import → Tasks 1-2 verify steps. ✓

**Placeholder scan:** Full code in every step; temp smoke scripts have concrete asserts + expected output + cleanup; the `no users` skip path is explicit.

**Type/name consistency:**
- `roles.ROLES` / `roles.COLLABORATOR` / `roles.ADMIN` / `roles.role_at_least` used identically in deps.py (Task 1) and admin.py (Task 2). ✓
- `require_collaborator` defined Task 1, available for SP2/SP3 later. ✓
- `admin_service.update_user_role(db, user_id, role)` signature matches its existing definition (used in the endpoint + the smoke). ✓

No gaps found.
