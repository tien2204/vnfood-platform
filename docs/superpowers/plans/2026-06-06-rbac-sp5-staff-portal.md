# RBAC SP5 — Staff Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/staff/*` console (collaborator review + admin management) with a role context-switcher and full admin account CRUD, wiring the SP2/SP2b/SP3 endpoints into UI.

**Architecture:** Mostly frontend. Move the existing `/admin/*` pages under a role-aware `/staff/*` shell; add collaborator review-queue/detail, admin stage-2 + change-request review, account CRUD, and a switcher widget. Backend adds only field exposure (`claimed_by`, CR `payload`) and admin account CRUD endpoints. No migrations.

**Tech Stack:** Next.js (modified — see `frontend/AGENTS.md`: use ONLY existing patterns, no new Next APIs), SWR, axios (`lib/api`), sonner, Tailwind, lucide-react; FastAPI, SQLAlchemy async, passlib (`app/core/security.py`).

**Prerequisites:** Docker Postgres up. Backend venv `backend/.venv`. Frontend deps installed. Branch `feat/canonical-recipes`.

**Reference facts (verified — do not redefine):**
- Password hashing: `app/core/security.py` exposes `hash_password(plain)` / `verify_password(plain, hashed)` (bcrypt).
- `roles.ROLES` = the 3 valid role strings; `require_admin` / `require_collaborator` (from `app.core.deps`) return a `User`.
- `RecipeCardWithStatus` (`app/schemas/recipe.py`) already has `claimed_by_name`; built by `_build_recipe_service._build_recipe_card_with_status(recipe, author, claimed_by_name=None)` and populated in `list_review_queue` (collaborator stage resolves names).
- `ChangeRequestOut` (`app/schemas/change_request.py`) built by `change_request_service._to_out(cr, target_title, requester_name)`; `cr.payload` is the stored JSONB (a `RecipeCreate` dump or None).
- Frontend: `lib/api` (axios, injects bearer, refreshes on 401); `useUser()` → `{ user, isLoggedIn, isAdmin, isLoading, logout, mutate }` where `user.id`/`user.role` come from `localStorage` user_info; `decodeJWT(token)` → `{ sub, role, exp }`. Existing admin pages use `useSWR` + `api.get/patch` + `sonner`.
- `components/layout/ConditionalLayout.tsx` hides Navbar/Footer when `pathname.startsWith("/admin")`.
- `middleware.ts` currently gates `/admin` to `role==="admin"`.

---

## File Structure

**Backend (modify):**
- `app/core/security.py` — add `generate_temp_password()`.
- `app/schemas/recipe.py` — `RecipeCardWithStatus += claimed_by`.
- `app/services/recipe_service.py` — populate `claimed_by` in the card builder + queue.
- `app/schemas/change_request.py` — `ChangeRequestOut += payload`.
- `app/services/change_request_service.py` — populate `payload` in `_to_out`.
- `app/schemas/admin.py` (new) — admin user CRUD bodies/outputs.
- `app/services/admin_service.py` — create/update/reset/delete user functions.
- `app/api/v1/admin.py` — the 4 account routes.

**Frontend (move + create):**
- `components/admin/AdminLayout.tsx` → `components/staff/StaffLayout.tsx` (role-aware).
- `app/admin/*` → `app/staff/*` (move 5 pages) + `app/staff/layout.tsx`.
- New: `app/staff/page.tsx`, `app/staff/review/page.tsx`, `app/staff/review/[id]/page.tsx`, `app/staff/proposals/page.tsx`, `app/staff/admin-review/page.tsx`, `app/staff/change-requests/page.tsx`, `app/staff/users/new/page.tsx`.
- New: `components/layout/ContextSwitcher.tsx`; `components/recipes/RecipeContent.tsx` (extracted read-only render).
- Modify: `middleware.ts`, `components/layout/ConditionalLayout.tsx`, `components/layout/Navbar.tsx`, `lib/types.ts`, `app/me/change-requests/page.tsx` (redirect), `app/recipes/[id]/propose-edit/page.tsx` + `app/recipes/propose-new/page.tsx` (success redirect).

---

## Task 1: Backend field exposure (`claimed_by`, CR `payload`)

**Files:** `app/schemas/recipe.py`, `app/services/recipe_service.py`, `app/schemas/change_request.py`, `app/services/change_request_service.py`

- [ ] **Step 1: Add `claimed_by` to the card schema**

In `app/schemas/recipe.py`, `RecipeCardWithStatus` — add the field after `claimed_by_name`:

```python
class RecipeCardWithStatus(RecipeCardOut):
    """RecipeCard extended with moderation fields — for owner/admin/reviewer views."""
    status: str
    reject_reason: str | None = None
    created_at: datetime
    claimed_by_name: str | None = None
    claimed_by: str | None = None

    model_config = {"from_attributes": True}
```

- [ ] **Step 2: Populate `claimed_by` in the card builder**

In `app/services/recipe_service.py`, `_build_recipe_card_with_status` — pass the id through. Change the signature and the constructor call:

```python
def _build_recipe_card_with_status(
    recipe: Recipe, author: Optional[User], claimed_by_name: Optional[str] = None
) -> RecipeCardWithStatus:
    author_out = None
    if author:
        author_out = AuthorOut(
            id=author.id,
            full_name=author.full_name,
            avatar_url=author.avatar_url,
        )
    return RecipeCardWithStatus(
        id=recipe.id,
        title=recipe.title,
        image_url=recipe.image_url,
        avg_rating=recipe.avg_rating,
        rating_count=recipe.rating_count,
        cooking_time=recipe.cooking_time,
        servings=recipe.servings,
        difficulty=recipe.difficulty,
        source=recipe.source,
        author=author_out,
        save_count=recipe.save_count,
        status=recipe.status,
        reject_reason=recipe.reject_reason,
        created_at=recipe.created_at,
        claimed_by_name=claimed_by_name,
        claimed_by=str(recipe.claimed_by) if recipe.claimed_by else None,
    )
```

(The `list_review_queue` call site already passes `claimed_by_name`; no change needed there — `recipe.claimed_by` is read directly off the row.)

- [ ] **Step 3: Add `payload` to `ChangeRequestOut`**

In `app/schemas/change_request.py`, add to `ChangeRequestOut` (after `requested_by_name`):

```python
class ChangeRequestOut(BaseModel):
    id: uuid.UUID
    type: str
    target_recipe_id: Optional[uuid.UUID] = None
    target_title: Optional[str] = None
    status: str
    reject_reason: Optional[str] = None
    requested_by_name: Optional[str] = None
    payload: Optional[dict] = None
    created_at: datetime

    model_config = {"from_attributes": True}
```

- [ ] **Step 4: Populate `payload` in the serializer**

In `app/services/change_request_service.py`, `_to_out` — pass `cr.payload`:

```python
def _to_out(cr: RecipeChangeRequest, target_title: str | None, requester_name: str | None) -> ChangeRequestOut:
    return ChangeRequestOut(
        id=cr.id, type=cr.type, target_recipe_id=cr.target_recipe_id,
        target_title=target_title, status=cr.status, reject_reason=cr.reject_reason,
        requested_by_name=requester_name, payload=cr.payload, created_at=cr.created_at,
    )
```

- [ ] **Step 5: Verify imports compile**

Run (PowerShell from repo root):
```powershell
cd backend; .venv\Scripts\python -c "import app.services.recipe_service, app.services.change_request_service, app.schemas.recipe, app.schemas.change_request; print('ok')"
```
Expected: `ok`

- [ ] **Step 6: Commit**

```powershell
cd backend; git add app/schemas/recipe.py app/services/recipe_service.py app/schemas/change_request.py app/services/change_request_service.py; git commit -m "feat(rbac-sp5): expose claimed_by on review card + payload on change-request"
```

---

## Task 2: Backend admin account CRUD

**Files:** `app/core/security.py`, `app/schemas/admin.py` (new), `app/services/admin_service.py`, `app/api/v1/admin.py`

- [ ] **Step 1: Add the temp-password generator**

In `app/core/security.py`, append:

```python
import secrets


def generate_temp_password(length: int = 12) -> str:
    """URL-safe temp password for admin-created accounts (shown once)."""
    return secrets.token_urlsafe(length)[:length]
```

(If `import secrets` is more idiomatic at the top of the file, place it with the other imports instead.)

- [ ] **Step 2: Create the admin schemas**

Create `app/schemas/admin.py`:

```python
import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class AdminUserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=1, max_length=200)
    role: str = "collaborator"


class AdminUserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=1, max_length=200)
    email: Optional[EmailStr] = None


class AdminUserOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str | None
    role: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class CreatedUserOut(BaseModel):
    user: AdminUserOut
    temp_password: str


class TempPasswordOut(BaseModel):
    temp_password: str
```

> If `EmailStr` raises an import error, `email-validator` is missing. Check first: `cd backend; .venv\Scripts\python -c "from pydantic import EmailStr; print('ok')"`. If it fails, replace `EmailStr` with `str` in this file (the frontend already validates email format and the model already exists elsewhere as plain `str`).

- [ ] **Step 3: Add the service functions**

In `app/services/admin_service.py`, add these functions (top of file already imports `select`, `User`, `func`, `AsyncSession`; if `from sqlalchemy import delete` is not present, add it to the existing sqlalchemy import line). Append near the other user functions:

```python
async def create_admin_user(
    db: AsyncSession, email: str, full_name: str, role: str, hashed_password: str
) -> User:
    exists = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if exists is not None:
        raise HTTPException(status_code=409, detail="Email đã tồn tại")
    user = User(
        id=uuid.uuid4(), email=email, full_name=full_name,
        role=role, hashed_password=hashed_password, is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def update_admin_user(
    db: AsyncSession, user_id: str, full_name: str | None, email: str | None
) -> User | None:
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        return None
    if email is not None and email != user.email:
        clash = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if clash is not None:
            raise HTTPException(status_code=409, detail="Email đã tồn tại")
        user.email = email
    if full_name is not None:
        user.full_name = full_name
    await db.commit()
    await db.refresh(user)
    return user


async def reset_admin_user_password(db: AsyncSession, user_id: str, hashed_password: str) -> User | None:
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        return None
    user.hashed_password = hashed_password
    await db.commit()
    await db.refresh(user)
    return user


async def delete_admin_user(db: AsyncSession, user_id: str) -> bool:
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        return False
    await db.delete(user)
    await db.commit()
    return True
```

> Verify the imports `HTTPException` and `uuid` exist at the top of `admin_service.py`; if `HTTPException` is missing, add `from fastapi import HTTPException`. If `uuid` is missing, add `import uuid`.

- [ ] **Step 4: Add the routes**

In `app/api/v1/admin.py`, add imports at the top:

```python
from app.core.security import generate_temp_password, hash_password
from app.schemas.admin import AdminUserCreate, AdminUserUpdate, AdminUserOut, CreatedUserOut, TempPasswordOut
```

Then add these routes in the `# ── Users ──` section (after `update_user_role`):

```python
@router.post("/users")
async def create_user(
    body: AdminUserCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    if body.role not in roles.ROLES:
        raise HTTPException(400, detail="Role không hợp lệ (user | collaborator | admin)")
    temp = generate_temp_password()
    user = await admin_service.create_admin_user(
        db, email=str(body.email), full_name=body.full_name, role=body.role,
        hashed_password=hash_password(temp),
    )
    return {"success": True, "data": CreatedUserOut(user=AdminUserOut.model_validate(user), temp_password=temp).model_dump(mode="json")}


@router.patch("/users/{user_id}")
async def edit_user(
    user_id: str,
    body: AdminUserUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    user = await admin_service.update_admin_user(
        db, user_id, full_name=body.full_name, email=str(body.email) if body.email else None
    )
    if not user:
        raise HTTPException(404, detail="User không tồn tại")
    return {"success": True, "data": AdminUserOut.model_validate(user).model_dump(mode="json")}


@router.post("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    temp = generate_temp_password()
    user = await admin_service.reset_admin_user_password(db, user_id, hash_password(temp))
    if not user:
        raise HTTPException(404, detail="User không tồn tại")
    return {"success": True, "data": TempPasswordOut(temp_password=temp).model_dump(mode="json")}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    if str(current_admin.id) == user_id:
        raise HTTPException(400, detail="Không thể xóa chính mình")
    ok = await admin_service.delete_admin_user(db, user_id)
    if not ok:
        raise HTTPException(404, detail="User không tồn tại")
    return {"success": True, "message": "Đã xóa tài khoản"}
```

- [ ] **Step 5: Verify the app imports + routes register**

```powershell
cd backend; .venv\Scripts\python -c "from app.main import app; print([r.path for r in app.routes if '/admin/users' in r.path])"
```
Expected: includes `/api/v1/admin/users` (POST+GET), `/api/v1/admin/users/{user_id}` (GET/PATCH/DELETE), `/api/v1/admin/users/{user_id}/reset-password`.

- [ ] **Step 6: Smoke the account lifecycle (self-cleaning)**

Create `backend/_smoke_sp5_admin.py`:

```python
"""SP5 admin account CRUD smoke — self-cleaning."""
import asyncio
import uuid

from fastapi import HTTPException
from sqlalchemy import delete, select

from app.core.database import AsyncSessionLocal
from app.core.security import hash_password, generate_temp_password, verify_password
from app.models.user import User
from app.services import admin_service as a

SUFFIX = uuid.uuid4().hex[:8]
EMAIL = f"sp5_{SUFFIX}@test.local"
EMAIL2 = f"sp5b_{SUFFIX}@test.local"


def check(cond, msg):
    print(("PASS" if cond else "FAIL"), "-", msg)
    assert cond, msg


async def main():
    created_ids = []
    try:
        async with AsyncSessionLocal() as db:
            temp = generate_temp_password()
            u = await a.create_admin_user(db, EMAIL, "SP5 CTV", "collaborator", hash_password(temp))
            created_ids.append(u.id)
            check(u.role == "collaborator" and verify_password(temp, u.hashed_password), "create + temp pw hashes")

            # duplicate email -> 409
            try:
                await a.create_admin_user(db, EMAIL, "dup", "user", hash_password("x")); check(False, "dup should 409")
            except HTTPException as e:
                check(e.status_code == 409, "duplicate email 409")

            # edit
            u2 = await a.update_admin_user(db, str(u.id), full_name="SP5 Renamed", email=EMAIL2)
            check(u2.full_name == "SP5 Renamed" and u2.email == EMAIL2, "edit full_name+email")

            # reset password
            newhash_user = await a.reset_admin_user_password(db, str(u.id), hash_password("brandnew123"))
            check(verify_password("brandnew123", newhash_user.hashed_password), "reset password")

            # delete
            ok = await a.delete_admin_user(db, str(u.id))
            gone = (await db.execute(select(User).where(User.id == u.id))).scalar_one_or_none()
            check(ok and gone is None, "delete account")
            created_ids.clear()

        print("\nALL SP5 ADMIN SMOKE CHECKS PASSED")
    finally:
        if created_ids:
            async with AsyncSessionLocal() as cdb:
                await cdb.execute(delete(User).where(User.id.in_(created_ids)))
                await cdb.commit()


if __name__ == "__main__":
    asyncio.run(main())
```

Run: `cd backend; .venv\Scripts\python _smoke_sp5_admin.py`
Expected: all `PASS` + `ALL SP5 ADMIN SMOKE CHECKS PASSED`. If any FAIL, fix the implementation (not the test). Then delete: `cd backend; Remove-Item _smoke_sp5_admin.py`.

- [ ] **Step 7: Commit**

```powershell
cd backend; git add app/core/security.py app/schemas/admin.py app/services/admin_service.py app/api/v1/admin.py; git commit -m "feat(rbac-sp5): admin account CRUD (create temp-pw/edit/reset/delete) with self-guard"
```

---

## Task 3: Frontend types + move admin→staff + role-aware StaffLayout + middleware

**Files:** `lib/types.ts`, `components/admin/AdminLayout.tsx`→`components/staff/StaffLayout.tsx`, `app/admin/*`→`app/staff/*`, `app/staff/layout.tsx`, `app/staff/page.tsx`, `middleware.ts`, `components/layout/ConditionalLayout.tsx`

- [ ] **Step 1: Update types**

In `lib/types.ts`:
- `RecipeCardWithStatus` — add `claimed_by_name?: string | null;` and `claimed_by?: string | null;`.
- `ChangeRequest` — add `payload?: RecipeCreate | null;`.
- Append admin types:

```typescript
export interface AdminUserDetailLite {
  id: string;
  email: string;
  full_name: string | null;
  role: "user" | "collaborator" | "admin";
  is_active: boolean;
  created_at: string;
}

export interface AdminUserCreate {
  email: string;
  full_name: string;
  role: "user" | "collaborator" | "admin";
}

export interface CreatedUserResponse {
  user: AdminUserDetailLite;
  temp_password: string;
}

export interface AdminUserUpdate {
  full_name?: string;
  email?: string;
}
```

- [ ] **Step 2: Move the admin pages to `/staff` (git mv)**

```powershell
cd frontend
git mv app/admin app/staff
git mv components/admin/AdminLayout.tsx components/staff/StaffLayout.tsx
```

The dashboard page is `app/staff/page.tsx` (was `/admin`). It will become the **admin dashboard**, but `/staff` index must redirect by role — so rename the dashboard to `dashboard`:

```powershell
cd frontend
New-Item -ItemType Directory app/staff/dashboard -Force
git mv app/staff/page.tsx app/staff/dashboard/page.tsx
```

- [ ] **Step 3: Rewrite `app/staff/layout.tsx`**

Overwrite `app/staff/layout.tsx` (was `app/admin/layout.tsx`, now moved) so it imports the renamed layout:

```tsx
import StaffLayout from "@/components/staff/StaffLayout";

export const metadata = { title: "Staff — VNFood" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <StaffLayout>{children}</StaffLayout>;
}
```

- [ ] **Step 4: Make `StaffLayout` role-aware**

Overwrite `components/staff/StaffLayout.tsx` with a role-filtered version. Keep the existing visual structure but: (a) read role via `useUser`, (b) split nav into collaborator + admin groups, (c) title by role, (d) footer link "Về trang người dùng".

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Users, BookOpen, MessageSquare, Leaf, Menu, X, ChefHat,
  LogOut, ClipboardCheck, ClipboardList, FileCheck2, Inbox,
} from "lucide-react";
import { clearTokens } from "@/lib/auth";
import { useUser } from "@/lib/hooks/useUser";

interface NavItem { href: string; label: string; icon: typeof Users; exact?: boolean; }

const COLLAB_ITEMS: NavItem[] = [
  { href: "/staff/review", label: "Hàng đợi duyệt", icon: Inbox },
  { href: "/staff/proposals", label: "Đề xuất của tôi", icon: ClipboardList },
];
const ADMIN_ITEMS: NavItem[] = [
  { href: "/staff/dashboard", label: "Tổng quan", icon: LayoutDashboard, exact: true },
  { href: "/staff/admin-review", label: "Chờ đăng", icon: ClipboardCheck },
  { href: "/staff/change-requests", label: "Duyệt đề xuất", icon: FileCheck2 },
  { href: "/staff/users", label: "Người dùng", icon: Users },
  { href: "/staff/recipes", label: "Công thức", icon: BookOpen },
  { href: "/staff/comments", label: "Bình luận", icon: MessageSquare },
  { href: "/staff/ingredients", label: "Nguyên liệu", icon: Leaf },
];

function NavLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  const pathname = usePathname();
  const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
        active ? "bg-[#E85D26] text-white shadow-sm shadow-[#E85D26]/30"
               : "text-[#7C6A56] hover:bg-[#F7F0E8] hover:text-[#1C1209]"}`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {item.label}
    </Link>
  );
}

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const { user } = useUser();
  const isAdmin = user?.role === "admin";
  const title = isAdmin ? "Quản trị" : "Cộng tác viên";

  async function handleLogout() {
    await clearTokens();
    router.push("/auth/login");
  }

  const SidebarContent = ({ onNav }: { onNav?: () => void }) => (
    <div className="flex flex-col h-full">
      <div className="px-4 py-5 border-b border-[#E8DDD4]">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-[#E85D26] rounded-lg flex items-center justify-center">
            <ChefHat className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-[#1C1209] font-heading leading-none">VNFood</p>
            <p className="text-[10px] text-[#7C6A56] uppercase tracking-wider mt-0.5">{title}</p>
          </div>
        </Link>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {COLLAB_ITEMS.map((item) => <NavLink key={item.href} item={item} onClick={onNav} />)}
        {isAdmin && (
          <>
            <p className="px-4 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[#B5A593]">Quản trị</p>
            {ADMIN_ITEMS.map((item) => <NavLink key={item.href} item={item} onClick={onNav} />)}
          </>
        )}
      </nav>
      <div className="px-3 py-4 border-t border-[#E8DDD4]">
        <Link href="/" className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-[#7C6A56] hover:bg-[#F7F0E8] hover:text-[#1C1209] transition-all mb-1">
          <ChefHat className="w-4 h-4" />
          Về trang người dùng
        </Link>
        <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-[#7C6A56] hover:bg-red-50 hover:text-red-600 transition-all">
          <LogOut className="w-4 h-4" />
          Đăng xuất
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FFFBF5] flex">
      <aside className="hidden lg:flex lg:flex-col w-56 shrink-0 bg-white border-r border-[#E8DDD4] fixed inset-y-0 left-0 z-30">
        <SidebarContent />
      </aside>
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-[#E8DDD4] flex flex-col transform transition-transform duration-200 lg:hidden ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8DDD4]">
          <span className="font-bold text-[#1C1209] font-heading">{title}</span>
          <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-lg hover:bg-[#F7F0E8]">
            <X className="w-4 h-4 text-[#7C6A56]" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto"><SidebarContent onNav={() => setSidebarOpen(false)} /></div>
      </aside>
      <div className="flex-1 lg:ml-56 flex flex-col min-h-screen">
        <header className="lg:hidden sticky top-0 z-20 bg-white border-b border-[#E8DDD4] px-4 py-3 flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg hover:bg-[#F7F0E8] text-[#7C6A56]">
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-semibold text-[#1C1209] font-heading">VNFood {title}</span>
        </header>
        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Add the `/staff` index redirect**

Create `app/staff/page.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/hooks/useUser";

export default function StaffIndex() {
  const router = useRouter();
  const { user, isLoading } = useUser();
  useEffect(() => {
    if (isLoading) return;
    router.replace(user?.role === "admin" ? "/staff/dashboard" : "/staff/review");
  }, [user, isLoading, router]);
  return <p className="p-8 text-[#7C6A56]">Đang chuyển hướng…</p>;
}
```

- [ ] **Step 6: Update all internal `/admin` references to `/staff`**

Find every remaining `/admin` link/route reference in the moved pages and elsewhere, and update to `/staff`:

```powershell
cd frontend
rg -n "[\"'`]/admin" app components --glob "!**/node_modules/**"
```
For each hit in `app/staff/**`, `components/staff/**`, and any other component that links into the portal, replace the leading `/admin` path segment with `/staff` (e.g. `/admin/users/${id}` → `/staff/users/${id}`). **Do NOT** change API call URLs that start with `/admin/` (those are backend endpoints under `/api/v1/admin/...`, e.g. `api.get("/admin/users?...")` — leave them). Only change Next.js route paths (`href`, `router.push`, `router.replace`, `<Link>`).

Tip to distinguish: route paths appear in `href=`, `router.push(`, `router.replace(`, `redirect(`; API paths appear in `api.get(`, `api.post(`, `api.patch(`, `api.delete(`. Update the former, keep the latter.

- [ ] **Step 7: Update `ConditionalLayout` prefix**

In `components/layout/ConditionalLayout.tsx`, change the admin check to staff:

```tsx
const isStaff = pathname.startsWith("/staff");
// ...
if (isStaff) {
  return <>{children}</>;
}
```

- [ ] **Step 8: Rewrite middleware gating + `/admin`→`/staff` redirect**

In `middleware.ts`, replace the `ADMIN_RE` constant and the admin gate block. Full new file:

```typescript
import { NextRequest, NextResponse } from "next/server";

interface JWTPayload { sub: string; role: string; exp: number; }

function decodeJWT(token: string): JWTPayload | null {
  try {
    const part = token.split(".")[1];
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "==".slice(0, (4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded)) as JWTPayload;
  } catch {
    return null;
  }
}

const STAFF_RE = /^\/staff(\/.*)?$/;
// Sub-paths inside /staff that require role === "admin".
const STAFF_ADMIN_RE = /^\/staff\/(dashboard|users|recipes|comments|ingredients|admin-review|change-requests)(\/.*)?$/;

const PUBLIC_EXACT = new Set(["/", "/recognize"]);
const PUBLIC_PREFIXES = ["/auth/", "/recognize/"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Legacy /admin/* → /staff/* (preserve any bookmarks).
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const dest = pathname.replace(/^\/admin/, "/staff");
    return NextResponse.redirect(new URL(dest + search, request.url));
  }

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const nextParam = encodeURIComponent(pathname + search);
  const token = request.cookies.get("access_token")?.value;
  if (!token) {
    return NextResponse.redirect(new URL(`/auth/login?next=${nextParam}`, request.url));
  }

  const payload = decodeJWT(token);
  if (!payload || payload.exp * 1000 < Date.now()) {
    const res = NextResponse.redirect(new URL(`/auth/login?next=${nextParam}`, request.url));
    res.cookies.delete("access_token");
    return res;
  }

  if (STAFF_RE.test(pathname)) {
    const isStaff = payload.role === "collaborator" || payload.role === "admin";
    if (!isStaff) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    if (STAFF_ADMIN_RE.test(pathname) && payload.role !== "admin") {
      return NextResponse.redirect(new URL("/staff/review", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
```

- [ ] **Step 9: Typecheck**

```powershell
cd frontend; npx tsc --noEmit
```
Expected: no errors. (If errors reference still-`/admin` route strings or a missing type, fix them.)

- [ ] **Step 10: Commit**

```powershell
cd frontend; git add -A; git commit -m "feat(rbac-sp5): move admin portal to role-aware /staff console + middleware gating + redirect"
```

---

## Task 4: Context-switcher widget

**Files:** `components/layout/ContextSwitcher.tsx` (new), `components/layout/Navbar.tsx`, `components/staff/StaffLayout.tsx`

- [ ] **Step 1: Create the switcher**

Create `components/layout/ContextSwitcher.tsx`:

```tsx
"use client";

import { useRouter, usePathname } from "next/navigation";
import { LayoutGrid, Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useUser } from "@/lib/hooks/useUser";

interface Ctx { key: string; label: string; href: string; }

export default function ContextSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useUser();
  if (!user || user.role === "user") return null;

  const staffLabel = user.role === "admin" ? "Quản trị" : "Cộng tác viên";
  const staffHref = user.role === "admin" ? "/staff/dashboard" : "/staff/review";
  const contexts: Ctx[] = [
    { key: "user", label: "Người dùng", href: "/" },
    { key: "staff", label: staffLabel, href: staffHref },
  ];
  const currentKey = pathname.startsWith("/staff") ? "staff" : "user";
  const current = contexts.find((c) => c.key === currentKey) ?? contexts[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1.5 border-2 border-[#2c1810] bg-white px-2.5 py-1.5 text-sm font-medium text-[#2c1810] shadow-block-sm hover:bg-[#fff5e6] outline-none cursor-pointer">
        <LayoutGrid className="w-4 h-4 text-[#ff6b35]" />
        <span className="hidden sm:inline">{current.label}</span>
        <ChevronDown className="w-3.5 h-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {contexts.map((c) => (
          <DropdownMenuItem
            key={c.key}
            className="gap-2 cursor-pointer"
            onClick={() => router.push(c.href)}
          >
            <Check className={`w-4 h-4 ${c.key === currentKey ? "text-[#ff6b35]" : "opacity-0"}`} />
            {c.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Mount it in the consumer Navbar**

In `components/layout/Navbar.tsx`, import it and render it in the right-side actions area (just before the AI Scan link). Add near the top imports:
```tsx
import ContextSwitcher from "./ContextSwitcher";
```
Then inside the `<div className="flex items-center gap-2 ml-auto">`, immediately before the `{/* AI Scan */}` block, add:
```tsx
{!isLoading && isLoggedIn && <ContextSwitcher />}
```

- [ ] **Step 3: Mount it in the StaffLayout header**

In `components/staff/StaffLayout.tsx`, import `ContextSwitcher` and render it in the desktop content area top. Replace the mobile-only `<header>` block so a switcher shows on desktop too: add a slim top bar above `<main>` containing the switcher right-aligned. Concretely, change the content wrapper:

```tsx
      <div className="flex-1 lg:ml-56 flex flex-col min-h-screen">
        <header className="sticky top-0 z-20 bg-white border-b border-[#E8DDD4] px-4 py-3 flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-1.5 rounded-lg hover:bg-[#F7F0E8] text-[#7C6A56]">
            <Menu className="w-5 h-5" />
          </button>
          <span className="lg:hidden font-semibold text-[#1C1209] font-heading">VNFood {title}</span>
          <div className="ml-auto"><ContextSwitcher /></div>
        </header>
        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
```
Add the import: `import ContextSwitcher from "@/components/layout/ContextSwitcher";`.

- [ ] **Step 4: Typecheck + commit**

```powershell
cd frontend; npx tsc --noEmit
git add components/layout/ContextSwitcher.tsx components/layout/Navbar.tsx components/staff/StaffLayout.tsx; git commit -m "feat(rbac-sp5): context-switcher widget in navbar + staff header"
```

---

## Task 5: Shared RecipeContent + collaborator review queue + review detail

**Files:** `components/recipes/RecipeContent.tsx` (new), `app/staff/review/page.tsx` (new), `app/staff/review/[id]/page.tsx` (new), `app/staff/proposals/page.tsx` (new), `app/me/change-requests/page.tsx` (redirect)

- [ ] **Step 1: Extract a read-only `RecipeContent` component**

Create `components/recipes/RecipeContent.tsx` — renders ingredients + steps read-only from a `RecipeDetail`:

```tsx
import type { RecipeDetail } from "@/lib/types";

export default function RecipeContent({ recipe }: { recipe: RecipeDetail }) {
  return (
    <div className="space-y-6">
      {recipe.description && (
        <p className="text-[#3a2a1a] whitespace-pre-line">{recipe.description}</p>
      )}
      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h3 className="font-bold text-[#1C1209] mb-2">Nguyên liệu</h3>
          <ul className="space-y-1 text-sm text-[#3a2a1a]">
            {recipe.ingredients.map((ing) => (
              <li key={ing.id} className="flex gap-2">
                <span className="text-[#E85D26]">•</span>
                <span>{ing.display_text}</span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="font-bold text-[#1C1209] mb-2">Các bước</h3>
          <ol className="space-y-2 text-sm text-[#3a2a1a]">
            {recipe.steps.map((s) => (
              <li key={s.step_number} className="flex gap-2">
                <span className="font-semibold text-[#E85D26]">{s.step_number}.</span>
                <span className="whitespace-pre-line">{s.content}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build the collaborator review queue page**

Create `app/staff/review/page.tsx`:

```tsx
"use client";

import Link from "next/link";
import { toast } from "sonner";
import useSWR from "swr";
import api from "@/lib/api";
import { useUser } from "@/lib/hooks/useUser";
import type { RecipeCardWithStatus, PaginatedResponse } from "@/lib/types";

const KEY = "/recipes/review/queue/collaborator?page=1&limit=50";

async function fetcher(url: string) {
  const res = await api.get<PaginatedResponse<RecipeCardWithStatus>>(url);
  return res.data;
}

function errMsg(e: unknown, fallback: string) {
  const anyE = e as { response?: { data?: { detail?: string; error?: { message?: string } } } };
  return anyE?.response?.data?.error?.message ?? anyE?.response?.data?.detail ?? fallback;
}

export default function ReviewQueuePage() {
  const { user } = useUser();
  const { data, mutate, isLoading } = useSWR(KEY, fetcher);
  const isAdmin = user?.role === "admin";

  async function claim(id: string) {
    try {
      await api.post(`/recipes/${id}/review/claim`);
      toast.success("Đã nhận xử lý");
      mutate();
    } catch (e) {
      toast.error(errMsg(e, "Không nhận được"));
      mutate();
    }
  }
  async function release(id: string) {
    try {
      await api.post(`/recipes/${id}/review/release`);
      toast.success("Đã nhả");
      mutate();
    } catch (e) {
      toast.error(errMsg(e, "Không nhả được"));
      mutate();
    }
  }

  if (isLoading) return <p className="text-[#7C6A56]">Đang tải…</p>;
  const items = data?.data ?? [];

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold text-[#1C1209] mb-4">Hàng đợi duyệt</h1>
      {items.length === 0 && <p className="text-[#7C6A56]">Không có công thức chờ duyệt.</p>}
      <div className="space-y-3">
        {items.map((r) => {
          const mine = r.claimed_by && user && r.claimed_by === user.id;
          const claimedOther = r.claimed_by && !mine;
          return (
            <div key={r.id} className="bg-white border border-[#E8DDD4] rounded-xl p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[#1C1209] truncate">{r.title}</p>
                <p className="text-xs text-[#7C6A56]">
                  {claimedOther ? `🔒 ${r.claimed_by_name} đang xử lý` : mine ? "Bạn đang xử lý" : "Chưa nhận"}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {(mine || isAdmin) && (
                  <Link href={`/staff/review/${r.id}`} className="px-3 py-1.5 text-sm rounded-lg bg-[#E85D26] text-white">Mở duyệt</Link>
                )}
                {!r.claimed_by && (
                  <button onClick={() => claim(r.id)} className="px-3 py-1.5 text-sm rounded-lg border border-[#E85D26] text-[#E85D26]">Nhận xử lý</button>
                )}
                {(mine || (isAdmin && r.claimed_by)) && (
                  <button onClick={() => release(r.id)} className="px-3 py-1.5 text-sm rounded-lg border border-[#E8DDD4] text-[#7C6A56]">Nhả</button>
                )}
                {claimedOther && !isAdmin && (
                  <span className="px-3 py-1.5 text-sm rounded-lg bg-[#F7F0E8] text-[#B5A593]">Đang khóa</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build the review-detail page (both stages)**

Create `app/staff/review/[id]/page.tsx`:

```tsx
"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import useSWR from "swr";
import api from "@/lib/api";
import RecipeContent from "@/components/recipes/RecipeContent";
import { useUser } from "@/lib/hooks/useUser";
import type { ApiResponse, RecipeDetail } from "@/lib/types";

function errMsg(e: unknown, fallback: string) {
  const anyE = e as { response?: { data?: { detail?: string; error?: { message?: string } } } };
  return anyE?.response?.data?.error?.message ?? anyE?.response?.data?.detail ?? fallback;
}

export default function ReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useUser();
  const isAdmin = user?.role === "admin";
  const { data, mutate, isLoading } = useSWR(`/recipes/${id}`, async (u) => (await api.get<ApiResponse<RecipeDetail>>(u)).data.data);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (isLoading) return <p className="text-[#7C6A56]">Đang tải…</p>;
  if (!data) return <p className="text-[#7C6A56]">Không tải được công thức.</p>;

  const r = data;
  const mine = r.status === "pending_collaborator"; // claim ownership re-checked server-side on action

  async function act(path: string, body: object, okMsg: string, back: string) {
    setBusy(true);
    try {
      await api.post(`/recipes/${id}/${path}`, body);
      toast.success(okMsg);
      router.push(back);
    } catch (e) {
      toast.error(errMsg(e, "Thao tác thất bại"));
      mutate();
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <button onClick={() => router.back()} className="text-sm text-[#7C6A56] mb-3">← Quay lại</button>
      <h1 className="text-2xl font-bold text-[#1C1209] mb-1">{r.title}</h1>
      <p className="text-xs text-[#7C6A56] mb-4">Trạng thái: {r.status}</p>
      <RecipeContent recipe={r} />

      <div className="sticky bottom-0 mt-6 bg-[#FFFBF5] border-t border-[#E8DDD4] py-3 flex gap-2">
        {r.status === "pending_collaborator" && (
          <>
            <button disabled={busy} onClick={() => act("review/approve", {}, "Đã chuyển chờ admin", "/staff/review")} className="px-4 py-2 rounded-lg bg-[#2e7d32] text-white disabled:opacity-50">Duyệt</button>
            <button disabled={busy} onClick={() => setRejecting(true)} className="px-4 py-2 rounded-lg bg-red-600 text-white disabled:opacity-50">Từ chối</button>
          </>
        )}
        {r.status === "pending_admin" && isAdmin && (
          <>
            <button disabled={busy} onClick={() => act("publish", {}, "Đã đăng", "/staff/admin-review")} className="px-4 py-2 rounded-lg bg-[#2e7d32] text-white disabled:opacity-50">Đăng</button>
            <button disabled={busy} onClick={() => setRejecting(true)} className="px-4 py-2 rounded-lg bg-red-600 text-white disabled:opacity-50">Từ chối</button>
          </>
        )}
        {!(r.status === "pending_collaborator" || (r.status === "pending_admin" && isAdmin)) && (
          <p className="text-sm text-[#7C6A56]">Không còn trong hàng đợi của bạn.</p>
        )}
      </div>

      {rejecting && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setRejecting(false)}>
          <div className="bg-white rounded-xl p-4 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-[#1C1209] mb-2">Lý do từ chối</h3>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} className="w-full border border-[#E8DDD4] rounded-lg p-2 text-sm" rows={3} />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setRejecting(false)} className="px-3 py-1.5 text-sm text-[#7C6A56]">Hủy</button>
              <button
                disabled={busy || !reason.trim()}
                onClick={() => {
                  const path = r.status === "pending_admin" ? "admin-reject" : "review/reject";
                  const back = r.status === "pending_admin" ? "/staff/admin-review" : "/staff/review";
                  act(path, { reason }, "Đã từ chối", back);
                }}
                className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white disabled:opacity-50"
              >Xác nhận</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

> Note: `mine` is computed but actual claim-ownership is enforced server-side (the action returns 403/409 → toast). This keeps the page simple; the queue already prevents non-claimers from reaching the action.

- [ ] **Step 4: Build `/staff/proposals` (reuse the change-request list)**

The existing `app/me/change-requests/page.tsx` renders the collaborator's change requests. Create `app/staff/proposals/page.tsx` with the same data fetch + list UI (read its current content and reproduce it here, calling `GET /recipe-change-requests/mine`). Then change `app/me/change-requests/page.tsx` to redirect:

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function MyChangeRequestsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/staff/proposals"); }, [router]);
  return <p className="p-8 text-[#7C6A56]">Đang chuyển hướng…</p>;
}
```

For `app/staff/proposals/page.tsx`, mirror the existing me/change-requests list (same `GET /recipe-change-requests/mine` fetch, same card rendering). Keep it inside the staff shell (no extra layout needed — `app/staff/layout.tsx` wraps it).

- [ ] **Step 5: Update propose success redirects**

In `app/recipes/[id]/propose-edit/page.tsx` and `app/recipes/propose-new/page.tsx`, change the post-submit `router.push("/me/change-requests")` to `router.push("/staff/proposals")`.

- [ ] **Step 6: Typecheck + commit**

```powershell
cd frontend; npx tsc --noEmit
git add -A; git commit -m "feat(rbac-sp5): collaborator review queue + review detail + proposals page + RecipeContent"
```

---

## Task 6: Admin stage-2 review + change-request review pages

**Files:** `app/staff/admin-review/page.tsx` (new), `app/staff/change-requests/page.tsx` (new)

- [ ] **Step 1: Stage-2 publish queue**

Create `app/staff/admin-review/page.tsx`:

```tsx
"use client";

import Link from "next/link";
import useSWR from "swr";
import api from "@/lib/api";
import type { RecipeCardWithStatus, PaginatedResponse } from "@/lib/types";

const KEY = "/recipes/review/queue/admin?page=1&limit=50";

export default function AdminReviewPage() {
  const { data, isLoading } = useSWR(KEY, async (u) => (await api.get<PaginatedResponse<RecipeCardWithStatus>>(u)).data);
  if (isLoading) return <p className="text-[#7C6A56]">Đang tải…</p>;
  const items = data?.data ?? [];
  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold text-[#1C1209] mb-4">Chờ đăng (admin duyệt)</h1>
      {items.length === 0 && <p className="text-[#7C6A56]">Không có công thức chờ đăng.</p>}
      <div className="space-y-3">
        {items.map((r) => (
          <div key={r.id} className="bg-white border border-[#E8DDD4] rounded-xl p-4 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[#1C1209] truncate">{r.title}</p>
              <p className="text-xs text-[#7C6A56]">CTV đã duyệt · chờ đăng</p>
            </div>
            <Link href={`/staff/review/${r.id}`} className="px-3 py-1.5 text-sm rounded-lg bg-[#E85D26] text-white shrink-0">Mở</Link>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Change-request review queue**

Create `app/staff/change-requests/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import useSWR from "swr";
import api from "@/lib/api";
import type { ChangeRequest, PaginatedResponse } from "@/lib/types";

const KEY = "/recipe-change-requests?page=1&limit=50";

function errMsg(e: unknown, fallback: string) {
  const anyE = e as { response?: { data?: { detail?: string; error?: { message?: string } } } };
  return anyE?.response?.data?.error?.message ?? anyE?.response?.data?.detail ?? fallback;
}

const TYPE_LABEL: Record<string, string> = { create: "Tạo mới", edit: "Chỉnh sửa", delete: "Xóa" };

export default function ChangeRequestReviewPage() {
  const { data, mutate, isLoading } = useSWR(KEY, async (u) => (await api.get<PaginatedResponse<ChangeRequest>>(u)).data);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  async function approve(id: string) {
    try { await api.post(`/recipe-change-requests/${id}/approve`); toast.success("Đã duyệt & áp dụng"); mutate(); }
    catch (e) { toast.error(errMsg(e, "Duyệt thất bại")); }
  }
  async function reject(id: string) {
    try { await api.post(`/recipe-change-requests/${id}/reject`, { reason }); toast.success("Đã từ chối"); setRejectId(null); setReason(""); mutate(); }
    catch (e) { toast.error(errMsg(e, "Từ chối thất bại")); }
  }

  if (isLoading) return <p className="text-[#7C6A56]">Đang tải…</p>;
  const items = data?.data ?? [];

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold text-[#1C1209] mb-4">Duyệt đề xuất (công thức hệ thống)</h1>
      {items.length === 0 && <p className="text-[#7C6A56]">Không có đề xuất chờ duyệt.</p>}
      <div className="space-y-3">
        {items.map((cr) => (
          <div key={cr.id} className="bg-white border border-[#E8DDD4] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 text-xs rounded bg-[#F7F0E8] text-[#7C6A56]">{TYPE_LABEL[cr.type] ?? cr.type}</span>
              <span className="text-sm font-semibold text-[#1C1209]">{cr.payload?.title ?? cr.target_title ?? "—"}</span>
              <span className="ml-auto text-xs text-[#7C6A56]">{cr.requested_by_name}</span>
            </div>
            {cr.target_recipe_id && (
              <Link href={`/recipes/${cr.target_recipe_id}`} className="text-xs text-[#E85D26] underline">Xem công thức hiện tại</Link>
            )}
            {(cr.type === "create" || cr.type === "edit") && cr.payload && (
              <div className="mt-2 text-xs text-[#7C6A56]">
                <p>{cr.payload.ingredients?.length ?? 0} nguyên liệu · {cr.payload.steps?.length ?? 0} bước</p>
              </div>
            )}
            <div className="flex gap-2 mt-3">
              <button onClick={() => approve(cr.id)} className="px-3 py-1.5 text-sm rounded-lg bg-[#2e7d32] text-white">Duyệt</button>
              <button onClick={() => setRejectId(cr.id)} className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white">Từ chối</button>
            </div>
            {rejectId === cr.id && (
              <div className="mt-2 flex gap-2">
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do" className="flex-1 border border-[#E8DDD4] rounded-lg px-2 py-1 text-sm" />
                <button disabled={!reason.trim()} onClick={() => reject(cr.id)} className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white disabled:opacity-50">Xác nhận</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

```powershell
cd frontend; npx tsc --noEmit
git add app/staff/admin-review app/staff/change-requests; git commit -m "feat(rbac-sp5): admin stage-2 publish queue + change-request review pages"
```

---

## Task 7: Admin account CRUD UI

**Files:** `app/staff/users/new/page.tsx` (new), `app/staff/users/page.tsx` (add button), `app/staff/users/[id]/page.tsx` (add edit/reset/delete)

- [ ] **Step 1: Create-account form**

Create `app/staff/users/new/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import api from "@/lib/api";
import type { ApiResponse, CreatedUserResponse } from "@/lib/types";

function errMsg(e: unknown, fallback: string) {
  const anyE = e as { response?: { data?: { detail?: string; error?: { message?: string } } } };
  return anyE?.response?.data?.error?.message ?? anyE?.response?.data?.detail ?? fallback;
}

export default function NewUserPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"user" | "collaborator" | "admin">("collaborator");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedUserResponse | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post<ApiResponse<CreatedUserResponse>>("/admin/users", { email, full_name: fullName, role });
      setCreated(res.data.data);
      toast.success("Đã tạo tài khoản");
    } catch (e2) {
      toast.error(errMsg(e2, "Tạo thất bại"));
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <div className="max-w-md">
        <h1 className="text-xl font-bold text-[#1C1209] mb-3">Tài khoản đã tạo</h1>
        <div className="bg-white border border-[#E8DDD4] rounded-xl p-4 space-y-2">
          <p className="text-sm"><b>Email:</b> {created.user.email}</p>
          <p className="text-sm"><b>Vai trò:</b> {created.user.role}</p>
          <div className="bg-[#FFF7ED] border border-[#E85D26]/40 rounded-lg p-3">
            <p className="text-xs text-[#7C6A56] mb-1">Mật khẩu tạm (chỉ hiển thị 1 lần — gửi cho người dùng):</p>
            <code className="text-sm font-mono text-[#1C1209] break-all">{created.temp_password}</code>
            <button onClick={() => { navigator.clipboard.writeText(created.temp_password); toast.success("Đã copy"); }} className="ml-2 text-xs text-[#E85D26] underline">Copy</button>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={() => router.push("/staff/users")} className="px-3 py-1.5 text-sm rounded-lg bg-[#E85D26] text-white">Về danh sách</button>
          <button onClick={() => { setCreated(null); setEmail(""); setFullName(""); setRole("collaborator"); }} className="px-3 py-1.5 text-sm rounded-lg border border-[#E8DDD4] text-[#7C6A56]">Tạo tiếp</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md">
      <h1 className="text-xl font-bold text-[#1C1209] mb-4">Tạo tài khoản</h1>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-sm text-[#7C6A56] mb-1">Email</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border border-[#E8DDD4] rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm text-[#7C6A56] mb-1">Họ tên</label>
          <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full border border-[#E8DDD4] rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm text-[#7C6A56] mb-1">Vai trò</label>
          <select value={role} onChange={(e) => setRole(e.target.value as typeof role)} className="w-full border border-[#E8DDD4] rounded-lg px-3 py-2 text-sm">
            <option value="collaborator">Cộng tác viên</option>
            <option value="user">Người dùng</option>
            <option value="admin">Quản trị</option>
          </select>
        </div>
        <button disabled={busy} className="px-4 py-2 rounded-lg bg-[#E85D26] text-white disabled:opacity-50">Tạo tài khoản</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Add the "Tạo tài khoản" button to the users list**

In `app/staff/users/page.tsx`, add a button near the page heading linking to `/staff/users/new`. Add the import `import Link from "next/link";` if not present, then place near the top of the rendered list header:
```tsx
<Link href="/staff/users/new" className="px-3 py-1.5 text-sm rounded-lg bg-[#E85D26] text-white">+ Tạo tài khoản</Link>
```
(Place it in the existing header row; match the page's existing layout.)

- [ ] **Step 3: Add edit / reset-password / delete to the user detail page**

In `app/staff/users/[id]/page.tsx`, add three actions. First update the `AdminUser`/detail `role` type union to include `"collaborator"` if it's hard-coded as `"user" | "admin"`. Then add handlers (reuse the page's existing `userId`/`api`/`mutate`/`toast`):

```tsx
// inside the component:
const [editing, setEditing] = useState(false);
const [fullName, setFullName] = useState("");
const [email, setEmail] = useState("");

async function saveEdit() {
  try {
    await api.patch(`/admin/users/${userId}`, { full_name: fullName || undefined, email: email || undefined });
    toast.success("Đã cập nhật");
    setEditing(false);
    mutate();
  } catch (e) {
    toast.error((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Cập nhật thất bại");
  }
}

async function resetPassword() {
  try {
    const res = await api.post<{ data: { temp_password: string } }>(`/admin/users/${userId}/reset-password`);
    window.prompt("Mật khẩu tạm mới (copy gửi cho người dùng):", res.data.data.temp_password);
  } catch {
    toast.error("Đặt lại mật khẩu thất bại");
  }
}

async function deleteUser() {
  if (!window.confirm("Xóa vĩnh viễn tài khoản này?")) return;
  try {
    await api.delete(`/admin/users/${userId}`);
    toast.success("Đã xóa tài khoản");
    router.push("/staff/users");
  } catch (e) {
    toast.error((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Xóa thất bại");
  }
}
```

Render these controls in the action area (match existing styles). Gate **Delete** so it doesn't show for the current admin viewing their own detail page (compare `userId` to the logged-in user's id from `useUser`). Example button block:

```tsx
<div className="flex flex-wrap gap-2">
  <button onClick={() => { setEditing(true); setFullName(detail?.full_name ?? ""); setEmail(detail?.email ?? ""); }} className="px-3 py-1.5 text-sm rounded-lg border border-[#E8DDD4]">Sửa</button>
  <button onClick={resetPassword} className="px-3 py-1.5 text-sm rounded-lg border border-[#E8DDD4]">Đặt lại mật khẩu</button>
  {currentUser?.id !== userId && (
    <button onClick={deleteUser} className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white">Xóa tài khoản</button>
  )}
</div>
{editing && (
  <div className="mt-3 space-y-2 max-w-sm">
    <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Họ tên" className="w-full border border-[#E8DDD4] rounded-lg px-3 py-2 text-sm" />
    <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full border border-[#E8DDD4] rounded-lg px-3 py-2 text-sm" />
    <div className="flex gap-2">
      <button onClick={saveEdit} className="px-3 py-1.5 text-sm rounded-lg bg-[#E85D26] text-white">Lưu</button>
      <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-sm rounded-lg text-[#7C6A56]">Hủy</button>
    </div>
  </div>
)}
```

Add the necessary state imports (`useState`) and `useUser` (`const { user: currentUser } = useUser();`) and `useRouter` if not already used in this file. Field names: the detail object exposes `full_name` and `email` (confirm against the page's existing interface; reuse its variable name instead of `detail` if it differs).

- [ ] **Step 4: Typecheck + commit**

```powershell
cd frontend; npx tsc --noEmit
git add app/staff/users; git commit -m "feat(rbac-sp5): admin account CRUD UI (create+temp pw, edit, reset, delete)"
```

---

## Task 8: Full typecheck/build + manual verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck the whole frontend**

```powershell
cd frontend; npx tsc --noEmit
```
Expected: no errors. Fix any (most likely: residual `/admin` route strings, or `AdminUser.role` unions missing `"collaborator"`).

- [ ] **Step 2: Production build**

```powershell
cd frontend; npm run build
```
Expected: build succeeds (all `/staff/*` routes compiled, no missing-module / type errors). If the build flags an unused import or a server/client boundary issue, fix it.

- [ ] **Step 3: Backend imports sanity**

```powershell
cd backend; .venv\Scripts\python -c "from app.main import app; print('routes:', len([r for r in app.routes]))"
```
Expected: prints a route count, no import error.

- [ ] **Step 4: Manual click-through (record results)**

Start backend (`uvicorn app.main:app --reload --port 8000`) + frontend (`npm run dev`). Verify, signed in as each role:
- **collaborator:** switcher shows Người dùng/Cộng tác viên → `/staff` lands on `/staff/review`; claim a pending recipe → "Bạn đang xử lý"; open → Duyệt → moves to admin stage; release works; a recipe claimed by another shows 🔒 locked. Admin-only nav items are absent. Visiting `/staff/users` redirects to `/staff/review`.
- **admin:** switcher shows Người dùng/Quản trị → `/staff` lands on `/staff/dashboard`; `/staff/admin-review` → open → Đăng publishes; `/staff/change-requests` → approve applies, reject with reason works, AI-class delete proposal shows the guard toast; `/staff/users` → Tạo tài khoản → temp password shown + copy; open a user → Sửa / Đặt lại mật khẩu / Xóa; cannot delete self (button hidden + API 400). `/admin` and `/admin/users` redirect to `/staff` equivalents.

- [ ] **Step 5: Update session-state + commit**

Append an SP5 "done" entry to `.claude/session-state.md` (mirror the SP3 entry style: routes moved to `/staff`, switcher, review screens, admin account CRUD, backend field exposure). Commit:
```powershell
git add .claude/session-state.md; git commit -m "docs(session-state): RBAC SP5 staff portal done"
```

---

## Self-Review (completed by plan author)

**1. Spec coverage:**
- Unified `/staff` console + role-filtered nav → Task 3 (StaffLayout). ✓
- Move 5 admin pages + `/admin→/staff` redirect → Task 3 (git mv + middleware). ✓
- Middleware gating split (collaborator+ vs admin subtree) → Task 3 Step 8. ✓
- Context-switcher widget (2-entry per role, Navbar + console header) → Task 4. ✓
- Collaborator review queue (claim/release/lock, mine-vs-other via `claimed_by`) → Task 5 + Task 1 (`claimed_by` field). ✓
- Unified review-detail (both stages by status×role) → Task 5 Step 3. ✓
- `/staff/proposals` + `/me/change-requests` redirect + propose redirects → Task 5 Steps 4-5. ✓
- Admin stage-2 publish queue → Task 6 Step 1. ✓
- CR review with `payload` → Task 6 Step 2 + Task 1 (`payload` field). ✓
- Admin account CRUD (create temp-pw/edit/reset/delete + self-guards) → Task 2 (backend) + Task 7 (UI). ✓
- Types → Task 3 Step 1. ✓
- Verification (smoke + tsc + build + manual) → Tasks 2/8. ✓

**2. Placeholder scan:** Page MOVES use mechanical git mv + explicit link-rewrite (Step 6 of Task 3) rather than re-pasting unchanged 300-line pages — this is complete and actionable. `/staff/proposals` and the users-list/detail edits say "reproduce/match the existing page" because they extend existing files whose full current content the implementer reads in-place; every NEW behavior has full code. No TBD/TODO.

**3. Type consistency:** `claimed_by` (string|null) used identically in schema (Task 1), type (Task 3), and queue UI (Task 5). `payload` (dict↔RecipeCreate) in Task 1 + Task 6. `CreatedUserResponse`/`temp_password`, `AdminUserCreate` consistent Task 2↔3↔7. Route paths: claim/release/approve/reject/publish/admin-reject match the SP2/SP3 endpoints; admin user routes match Task 2 definitions. API URLs (`/admin/...`, `/recipe-change-requests/...`) kept distinct from Next route paths (`/staff/...`) — called out explicitly in Task 3 Step 6.
