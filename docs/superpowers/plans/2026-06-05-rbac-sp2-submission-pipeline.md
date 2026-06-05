# RBAC SP2 — 2-Stage Submission Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** User-contributed recipes flow private → collaborator → admin → published community recipe (shown in main browse with attribution), plus a "Công thức của tôi" page.

**Architecture:** Extend the existing `Recipe.status` string into a 5-state machine (`private`/`pending_collaborator`/`pending_admin`/`approved`/`rejected`). `recipe_service` gains transition functions (each validates the source status → 409) guarded by ownership/`require_collaborator`/`require_admin` (SP1). Browse visibility widens to `is_canonical OR source='user'` so approved community recipes appear. A `/me/recipes` page + community badge cover the user-facing UI; reviewer screens are deferred to SP5 (their endpoints exist + are smoke-tested here).

**Tech Stack:** FastAPI + SQLAlchemy async, Next.js 16 client component. No schema migration (status is unconstrained String; `reject_reason`/`author_id`/`source`/`original_author_name`/`updated_at` all exist).

**Branch:** `feat/canonical-recipes`. Backend from `backend/`: `$env:PYTHONUTF8=1; .venv\Scripts\python.exe ...`. Frontend from `frontend/`. Do NOT commit `.claude/settings*`, `backups/`, `cookpad_recipe/*.json`. Footer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Existing facts:** `create_recipe` sets `status="pending"` (recipe_service ~608). `update_recipe` re-pends approved edits (`if was_approved and role!="admin": status="pending"`, ~662-664). Detail visibility guard (~278-283): non-approved → only `current_user` who is admin or author. Browse canonical-only filter `Recipe.is_canonical.is_(True), Recipe.is_dessert.is_(False)` appears in `list_recipes` (~119), `search_recipes` (~412), `get_featured_recipes` (~471). `approve_recipe` (admin) sets status+reject_reason. `or_` already imported. `RecipeCard` TS type has `source`/`is_canonical`/`original_author_name`.

---

### Task 1: State-machine transition functions in `recipe_service`

**Files:** Modify `backend/app/services/recipe_service.py`

- [ ] **Step 1: `create_recipe` default → `private`.** Change `status="pending",` (in `create_recipe`) to `status="private",`.

- [ ] **Step 2: `update_recipe` re-status → collaborator stage.** Replace the block:

```python
    if was_approved and current_user.role != "admin":
        recipe.status = "pending"
        recipe.reject_reason = None
```

with:

```python
    if was_approved and current_user.role != "admin":
        recipe.status = "pending_collaborator"
        recipe.reject_reason = None
```

- [ ] **Step 3: Add transition helpers + functions.** Append to `recipe_service.py` (after `approve_recipe`):

```python
async def _get_recipe_or_404(db: AsyncSession, recipe_id: uuid.UUID) -> Recipe:
    r = (await db.execute(select(Recipe).where(Recipe.id == recipe_id))).scalar_one_or_none()
    if r is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Công thức không tồn tại")
    return r


def _assert_status(recipe: Recipe, expected: tuple[str, ...], action: str) -> None:
    if recipe.status not in expected:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Sai trạng thái duyệt ('{recipe.status}') — không thể {action}",
        )


async def submit_recipe(db: AsyncSession, recipe_id: uuid.UUID, user: User) -> Recipe:
    r = await _get_recipe_or_404(db, recipe_id)
    if r.author_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Không có quyền")
    _assert_status(r, ("private", "rejected"), "gửi duyệt")
    r.status = "pending_collaborator"
    r.reject_reason = None
    await db.commit()
    await db.refresh(r)
    return r


async def withdraw_recipe(db: AsyncSession, recipe_id: uuid.UUID, user: User) -> Recipe:
    r = await _get_recipe_or_404(db, recipe_id)
    if r.author_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Không có quyền")
    _assert_status(r, ("pending_collaborator",), "thu hồi")
    r.status = "private"
    await db.commit()
    await db.refresh(r)
    return r


async def collaborator_approve(db: AsyncSession, recipe_id: uuid.UUID) -> Recipe:
    r = await _get_recipe_or_404(db, recipe_id)
    _assert_status(r, ("pending_collaborator",), "CTV duyệt")
    r.status = "pending_admin"
    await db.commit()
    await db.refresh(r)
    return r


async def collaborator_reject(db: AsyncSession, recipe_id: uuid.UUID, reason: str) -> Recipe:
    r = await _get_recipe_or_404(db, recipe_id)
    _assert_status(r, ("pending_collaborator",), "CTV từ chối")
    r.status = "rejected"
    r.reject_reason = reason
    await db.commit()
    await db.refresh(r)
    return r


async def admin_publish(db: AsyncSession, recipe_id: uuid.UUID) -> Recipe:
    r = await _get_recipe_or_404(db, recipe_id)
    _assert_status(r, ("pending_admin",), "admin đăng")
    r.status = "approved"
    r.source = "user"
    if not r.original_author_name and r.author_id:
        name = (await db.execute(select(User.full_name).where(User.id == r.author_id))).scalar_one_or_none()
        if name:
            r.original_author_name = name
    await db.commit()
    await db.refresh(r)
    return r


async def admin_reject(db: AsyncSession, recipe_id: uuid.UUID, reason: str) -> Recipe:
    r = await _get_recipe_or_404(db, recipe_id)
    _assert_status(r, ("pending_admin",), "admin từ chối")
    r.status = "rejected"
    r.reject_reason = reason
    await db.commit()
    await db.refresh(r)
    return r
```

- [ ] **Step 4: Legacy data-update (one-off, idempotent), from `backend/`**

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -c "import asyncio; from sqlalchemy import text; from app.core.database import AsyncSessionLocal
async def m():
 async with AsyncSessionLocal() as db:
  res=await db.execute(text(\"update recipes set status='pending_collaborator' where status='pending' and is_canonical=false\")); await db.commit(); print('legacy pending updated:', res.rowcount)
asyncio.run(m())"
```
Expected: `legacy pending updated: <N>` (often 0 in a fresh demo — fine).

- [ ] **Step 5: Smoke the full state machine (real DB, self-cleaning), from `backend/`** — create `backend/scripts/_smoke_pipeline.py`:

```python
import asyncio
import uuid
from types import SimpleNamespace
from fastapi import HTTPException
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.user import User
from app.models.recipe import Recipe
from app.services import recipe_service as rs


async def main():
    async with AsyncSessionLocal() as db:
        author = (await db.execute(select(User).limit(1))).scalar_one()
        owner = SimpleNamespace(id=author.id, role="user")
        other = SimpleNamespace(id=uuid.uuid4(), role="user")
        r = Recipe(id=uuid.uuid4(), title="SMOKE pipeline", source="user",
                   status="private", author_id=author.id)
        db.add(r); await db.commit()
        rid = r.id
        try:
            # wrong stage: publish a private -> 409
            try:
                await rs.admin_publish(db, rid); assert False
            except HTTPException as e: assert e.status_code == 409
            # non-owner submit -> 403
            try:
                await rs.submit_recipe(db, rid, other); assert False
            except HTTPException as e: assert e.status_code == 403
            # private -> submit -> pending_collaborator
            assert (await rs.submit_recipe(db, rid, owner)).status == "pending_collaborator"
            # withdraw -> private -> resubmit
            assert (await rs.withdraw_recipe(db, rid, owner)).status == "private"
            assert (await rs.submit_recipe(db, rid, owner)).status == "pending_collaborator"
            # collaborator approve -> pending_admin
            assert (await rs.collaborator_approve(db, rid)).status == "pending_admin"
            # admin publish -> approved + source=user
            pub = await rs.admin_publish(db, rid)
            assert pub.status == "approved" and pub.source == "user"
            # reject path: collab reject from wrong stage now -> 409
            try:
                await rs.collaborator_reject(db, rid, "x"); assert False
            except HTTPException as e: assert e.status_code == 409
            print("OK — state machine transitions + guards correct")
        finally:
            await db.delete(await db.get(Recipe, rid)); await db.commit()
            print("cleaned up smoke recipe")


asyncio.run(main())
```

Run: `$env:PYTHONUTF8=1; .venv\Scripts\python.exe -m scripts._smoke_pipeline`
Expected: `OK — state machine transitions + guards correct` then `cleaned up smoke recipe`. Then delete: `Remove-Item scripts\_smoke_pipeline.py`.

- [ ] **Step 6: Verify app imports (from `backend/`)**

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -c "from app.main import app; print('ok')"
```
Expected: `ok`.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/recipe_service.py
git commit -m "feat(rbac-sp2): recipe state machine (private->collab->admin->approved) transitions

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Visibility (community in browse + reviewer detail) + list functions

**Files:** Modify `backend/app/schemas/recipe.py`, `backend/app/services/recipe_service.py`

- [ ] **Step 0: Add the schemas FIRST** (the service builder below references `MyRecipeCardOut`). In `backend/app/schemas/recipe.py`, after the `RecipeCardOut` class add:

```python
class MyRecipeCardOut(RecipeCardOut):
    status: str
    reject_reason: str | None = None


class RejectBody(BaseModel):
    reason: str
```

(`BaseModel` is already imported in this file.)

- [ ] **Step 1: Widen the 3 browse filters to include approved community recipes.** In `list_recipes`, `search_recipes`, AND `get_featured_recipes`, each has a `not show_all` block containing `Recipe.is_canonical.is_(True),`. In ALL THREE, replace that single line `Recipe.is_canonical.is_(True),` with:

```python
            or_(Recipe.is_canonical.is_(True), Recipe.source == "user"),
```

(Leave `Recipe.is_dessert.is_(False),` and the surrounding `status='approved'` base query unchanged. Result: approved canonical + approved user-contributed show; Cookpad pool stays excluded.)

- [ ] **Step 2: Reviewer detail visibility.** In `get_recipe_detail`, replace the visibility guard:

```python
    if recipe.status != "approved":
        if not current_user:
            return None
        if current_user.role != "admin" and (author is None or current_user.id != author.id):
            return None
```

with (collaborators/admins may view in-review recipes):

```python
    if recipe.status != "approved":
        if not current_user:
            return None
        is_owner = author is not None and current_user.id == author.id
        if not is_owner and not roles.role_at_least(current_user.role, roles.COLLABORATOR):
            return None
```

Add the import at the top of `recipe_service.py` (near the other `app.` imports): `from app.core import roles`.

- [ ] **Step 3: Add `list_my_recipes` + `list_review_queue`.** Append to `recipe_service.py`:

```python
async def list_my_recipes(
    db: AsyncSession, user: User, page: int = 1, limit: int = 20,
) -> tuple[list, PaginationOut]:
    """The current user's own recipes, all statuses, newest-updated first."""
    limit = min(limit, 50)
    base = (
        select(Recipe, User)
        .outerjoin(User, Recipe.author_id == User.id)
        .where(Recipe.author_id == user.id)
    )
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (await db.execute(
        base.order_by(Recipe.updated_at.desc()).offset((page - 1) * limit).limit(limit)
    )).all()
    cards = [_build_my_recipe_card(r[0], r[1]) for r in rows]
    total_pages = (total + limit - 1) // limit if total > 0 else 0
    return cards, PaginationOut(page=page, limit=limit, total=total, total_pages=total_pages)


async def list_review_queue(
    db: AsyncSession, stage: str, page: int = 1, limit: int = 20,
) -> tuple[list, PaginationOut]:
    """Recipes awaiting review at a stage: 'collaborator' or 'admin' (FIFO)."""
    target = {"collaborator": "pending_collaborator", "admin": "pending_admin"}[stage]
    limit = min(limit, 50)
    base = (
        select(Recipe, User)
        .outerjoin(User, Recipe.author_id == User.id)
        .where(Recipe.status == target)
    )
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (await db.execute(
        base.order_by(Recipe.updated_at.asc()).offset((page - 1) * limit).limit(limit)
    )).all()
    cards = [_build_my_recipe_card(r[0], r[1]) for r in rows]
    total_pages = (total + limit - 1) // limit if total > 0 else 0
    return cards, PaginationOut(page=page, limit=limit, total=total, total_pages=total_pages)
```

- [ ] **Step 4: Add the `_build_my_recipe_card` builder.** Right after the existing `_build_recipe_card` function, add:

```python
def _build_my_recipe_card(recipe: Recipe, author: Optional[User]) -> "MyRecipeCardOut":
    base = _build_recipe_card(recipe, author, set(), None)
    return MyRecipeCardOut(**base.model_dump(), status=recipe.status, reject_reason=recipe.reject_reason)
```

Add `MyRecipeCardOut` to the schema import block at the top of `recipe_service.py` (the `from app.schemas.recipe import (...)` list).

- [ ] **Step 5: Smoke (real DB, self-cleaning), from `backend/`** — create `backend/scripts/_smoke_visibility.py`:

```python
import asyncio
import uuid
from types import SimpleNamespace
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.user import User
from app.models.recipe import Recipe
from app.services import recipe_service as rs


async def main():
    async with AsyncSessionLocal() as db:
        author = (await db.execute(select(User).limit(1))).scalar_one()
        community = Recipe(id=uuid.uuid4(), title="SMOKE community", source="user",
                           status="approved", is_canonical=False, is_dessert=False,
                           author_id=author.id, original_author_name=author.full_name)
        db.add(community); await db.commit()
        cid = community.id
        try:
            cards, pg = await rs.list_recipes(db, page=1, limit=50)
            assert any(c.id == cid for c in cards), "approved community recipe must appear in browse"
            print(f"browse includes community recipe (total {pg.total})")
            mine, _ = await rs.list_my_recipes(db, SimpleNamespace(id=author.id, role="user"))
            assert any(c.id == cid and c.status == "approved" for c in mine)
            print("list_my_recipes returns own recipe with status")
            print("OK — visibility correct")
        finally:
            await db.delete(await db.get(Recipe, cid)); await db.commit()
            print("cleaned up")


asyncio.run(main())
```

Run: `$env:PYTHONUTF8=1; .venv\Scripts\python.exe -m scripts._smoke_visibility`
Expected: `browse includes community recipe ...`, `list_my_recipes returns ...`, `OK — visibility correct`, `cleaned up`. Then delete: `Remove-Item scripts\_smoke_visibility.py`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/recipe.py backend/app/services/recipe_service.py
git commit -m "feat(rbac-sp2): community recipes in browse + reviewer detail visibility + my/queue lists

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Schemas + routes (transitions, /mine, review queues)

**Files:** Modify `backend/app/api/v1/recipes.py`

- [ ] **Step 1: Confirm schemas exist.** `MyRecipeCardOut` + `RejectBody` were added to `backend/app/schemas/recipe.py` in Task 2 Step 0. Verify they're present (`grep -n "class RejectBody" backend/app/schemas/recipe.py`). If missing, add them now (same code as Task 2 Step 0).

- [ ] **Step 2: Add the routes.** In `backend/app/api/v1/recipes.py`, add the import:

```python
from app.core.deps import get_current_active_user, get_optional_current_user, require_collaborator, require_admin
```

(extend the existing deps import line). Add `from app.schemas.recipe import RecipeCreate, RecipeUpdate, RejectBody`. Then add these routes — place them BEFORE the `@router.get("/{recipe_id}")` handler so the static paths aren't swallowed:

```python
@router.get("/mine")
async def my_recipes(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    cards, pagination = await recipe_service.list_my_recipes(db, current_user, page=page, limit=limit)
    return {"success": True, "data": cards, "pagination": pagination}


@router.get("/review/queue/collaborator")
async def review_queue_collaborator(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_collaborator),
):
    cards, pagination = await recipe_service.list_review_queue(db, "collaborator", page=page, limit=limit)
    return {"success": True, "data": cards, "pagination": pagination}


@router.get("/review/queue/admin")
async def review_queue_admin(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    cards, pagination = await recipe_service.list_review_queue(db, "admin", page=page, limit=limit)
    return {"success": True, "data": cards, "pagination": pagination}


@router.post("/{recipe_id}/submit")
async def submit_recipe_route(
    recipe_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    r = await recipe_service.submit_recipe(db, recipe_id, current_user)
    return {"success": True, "data": {"id": str(r.id), "status": r.status}, "message": "Đã gửi duyệt"}


@router.post("/{recipe_id}/withdraw")
async def withdraw_recipe_route(
    recipe_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    r = await recipe_service.withdraw_recipe(db, recipe_id, current_user)
    return {"success": True, "data": {"id": str(r.id), "status": r.status}, "message": "Đã thu hồi"}


@router.post("/{recipe_id}/review/approve")
async def collaborator_approve_route(
    recipe_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_collaborator),
):
    r = await recipe_service.collaborator_approve(db, recipe_id)
    return {"success": True, "data": {"id": str(r.id), "status": r.status}, "message": "CTV đã duyệt"}


@router.post("/{recipe_id}/review/reject")
async def collaborator_reject_route(
    recipe_id: uuid.UUID,
    body: RejectBody,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_collaborator),
):
    r = await recipe_service.collaborator_reject(db, recipe_id, body.reason)
    return {"success": True, "data": {"id": str(r.id), "status": r.status}, "message": "CTV đã từ chối"}


@router.post("/{recipe_id}/publish")
async def admin_publish_route(
    recipe_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    r = await recipe_service.admin_publish(db, recipe_id)
    return {"success": True, "data": {"id": str(r.id), "status": r.status}, "message": "Đã đăng"}


@router.post("/{recipe_id}/admin-reject")
async def admin_reject_route(
    recipe_id: uuid.UUID,
    body: RejectBody,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    r = await recipe_service.admin_reject(db, recipe_id, body.reason)
    return {"success": True, "data": {"id": str(r.id), "status": r.status}, "message": "Admin đã từ chối"}
```

- [ ] **Step 3: Update the `create_recipe` route message.** Change its message string to: `"Đã lưu (riêng tư) — bấm Gửi duyệt để đăng lên cộng đồng"`.

- [ ] **Step 4: Verify app imports + routes registered (from `backend/`)**

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -c "from app.main import app
paths={r.path for r in app.routes}
need=['/api/v1/recipes/mine','/api/v1/recipes/review/queue/collaborator','/api/v1/recipes/review/queue/admin','/api/v1/recipes/{recipe_id}/submit','/api/v1/recipes/{recipe_id}/publish']
missing=[p for p in need if p not in paths]
print('missing routes:', missing); print('ok' if not missing else 'FAIL')"
```
Expected: `missing routes: []` then `ok`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/recipes.py
git commit -m "feat(rbac-sp2): pipeline routes (submit/withdraw/review/publish) + /mine + queues

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Frontend — `/me/recipes` page + community badge

**Files:** Modify `frontend/lib/types.ts`, Create `frontend/app/me/recipes/page.tsx`, Modify `frontend/components/recipes/RecipeCard.tsx`, Modify `frontend/components/layout/Navbar.tsx`

- [ ] **Step 1: Types.** In `frontend/lib/types.ts`, update the `RecipeDetail.status` union to the new values and add a `MyRecipeCard` type. Change:

```ts
  status: "pending" | "approved" | "rejected";
```

to:

```ts
  status: "private" | "pending_collaborator" | "pending_admin" | "approved" | "rejected";
```

and after the `RecipeCard` interface add:

```ts
export type RecipeStatus =
  | "private"
  | "pending_collaborator"
  | "pending_admin"
  | "approved"
  | "rejected";

export interface MyRecipeCard extends RecipeCard {
  status: RecipeStatus;
  reject_reason?: string | null;
}
```

- [ ] **Step 2: Community badge in `RecipeCard.tsx`.** READ the file first. In the card body (near where `is_canonical`/title render), add a badge shown only for approved community recipes:

```tsx
      {!recipe.is_canonical && recipe.source === "user" && (
        <span className="inline-flex items-center gap-1 border-2 border-[#2c1810] bg-[#2D6A4F] px-2 py-0.5 text-[10px] font-bold text-white">
          Cộng đồng
          {recipe.original_author_name ? ` · ${recipe.original_author_name}` : ""}
        </span>
      )}
```

(Place it consistently with how the existing `CanonicalBadge`/labels are rendered in that file — match the surrounding markup.)

- [ ] **Step 3: Create `frontend/app/me/recipes/page.tsx`** (client page — uses only existing patterns; this repo runs a modified Next.js, no new Next APIs):

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import api from "@/lib/api";
import type { MyRecipeCard, PaginatedResponse } from "@/lib/types";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  private: { label: "Riêng tư", cls: "bg-[#ADB5BD] text-white" },
  pending_collaborator: { label: "Chờ CTV duyệt", cls: "bg-[#E85D26] text-white" },
  pending_admin: { label: "Chờ Admin duyệt", cls: "bg-[#C97B16] text-white" },
  approved: { label: "Đã đăng", cls: "bg-[#2D6A4F] text-white" },
  rejected: { label: "Bị từ chối", cls: "bg-[#C0392B] text-white" },
};

export default function MyRecipesPage() {
  const [recipes, setRecipes] = useState<MyRecipeCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<PaginatedResponse<MyRecipeCard>>("/recipes/mine", {
        params: { limit: "50" },
      });
      setRecipes(res.data.data);
    } catch {
      setRecipes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (id: string, path: string) => {
    setBusy(id);
    try {
      await api.post(`/recipes/${id}/${path}`);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const del = async (id: string) => {
    if (!confirm("Xóa công thức này?")) return;
    setBusy(id);
    try {
      await api.delete(`/recipes/${id}`);
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-[#2c1810]" style={{ fontFamily: "var(--font-heading)" }}>
        Công thức của tôi
      </h1>
      {loading ? (
        <p className="text-[#6b5344]">Đang tải…</p>
      ) : recipes.length === 0 ? (
        <p className="text-[#6b5344]">Chưa có công thức nào. Tạo công thức mới để bắt đầu.</p>
      ) : (
        <ul className="space-y-3">
          {recipes.map((r) => {
            const meta = STATUS_META[r.status] ?? { label: r.status, cls: "bg-[#ADB5BD] text-white" };
            return (
              <li key={r.id} className="border-2 border-[#2c1810] bg-white p-4 shadow-block-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 text-xs font-bold ${meta.cls}`}>{meta.label}</span>
                    <Link href={`/recipes/${r.id}`} className="font-bold text-[#2c1810] hover:text-[#E85D26]">
                      {r.title}
                    </Link>
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm">
                    {(r.status === "private" || r.status === "rejected") && (
                      <button disabled={busy === r.id} onClick={() => act(r.id, "submit")}
                        className="border-2 border-[#2c1810] bg-[#2D6A4F] px-3 py-1 font-bold text-white disabled:opacity-50">
                        Gửi duyệt
                      </button>
                    )}
                    {r.status === "pending_collaborator" && (
                      <button disabled={busy === r.id} onClick={() => act(r.id, "withdraw")}
                        className="border-2 border-[#2c1810] bg-white px-3 py-1 font-bold text-[#2c1810] disabled:opacity-50">
                        Thu hồi
                      </button>
                    )}
                    <Link href={`/recipes/${r.id}/edit`} className="border-2 border-[#2c1810] bg-white px-3 py-1 font-bold text-[#2c1810]">
                      Sửa
                    </Link>
                    <button disabled={busy === r.id} onClick={() => del(r.id)}
                      className="border-2 border-[#2c1810] bg-white px-3 py-1 font-bold text-[#C0392B] disabled:opacity-50">
                      Xóa
                    </button>
                  </div>
                </div>
                {r.status === "rejected" && r.reject_reason && (
                  <p className="mt-2 text-sm text-[#C0392B]">Lý do từ chối: {r.reject_reason}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

(If the edit route path differs from `/recipes/{id}/edit`, match the real one — check how the existing "edit recipe" link is built elsewhere; if there is no edit page yet, link to `/recipes/${r.id}` instead. Confirm before finalizing.)

- [ ] **Step 4: Navbar link.** READ `frontend/components/layout/Navbar.tsx`. In the logged-in user menu/dropdown (next to the existing profile link), add:

```tsx
<Link href="/me/recipes">Công thức của tôi</Link>
```

matching the surrounding link markup/styling in that menu.

- [ ] **Step 5: Typecheck (from `frontend/`)**

```bash
npx tsc --noEmit
```
Expected: no NEW errors — only the 3 known pre-existing files (`app/admin/page.tsx`, `app/me/profile/page.tsx`, `app/recognize/page.tsx`).

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/types.ts frontend/app/me/recipes/page.tsx frontend/components/recipes/RecipeCard.tsx frontend/components/layout/Navbar.tsx
git commit -m "feat(rbac-sp2): Công thức của tôi page + community badge + navbar link

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 7: Manual smoke (after restarting uvicorn + `npm run dev`)** — log in as a normal user, create a recipe → it does NOT appear on the homepage but shows in `/me/recipes` as "Riêng tư"; click "Gửi duyệt" → becomes "Chờ CTV duyệt"; (via API or DB) advance it to approved → it appears in `/recipes` with a "Cộng đồng" badge + contributor name.

---

## Self-Review

**Spec coverage:**
- 5-state machine + create default `private` + update re-status → Task 1 Steps 1-3. ✓
- 6 transition functions with source-status validation (409) + ownership (403) → Task 1 Step 3. ✓
- Legacy `pending → pending_collaborator` data-update → Task 1 Step 4. ✓
- Browse visibility `is_canonical OR source='user'` in list/search/featured → Task 2 Step 1. ✓
- Reviewer detail visibility (author OR ≥collaborator) → Task 2 Step 2. ✓
- `list_my_recipes` + `list_review_queue` + `MyRecipeCardOut` builder → Task 2 Steps 3-4. ✓
- Schemas (`MyRecipeCardOut`, `RejectBody`) → Task 3 Step 1. ✓
- 6 transition routes + `/mine` + 2 queue routes, static-before-`/{recipe_id}` ordering → Task 3 Step 2. ✓
- Frontend `/me/recipes` + status badges/actions + community badge + navbar → Task 4. ✓
- Verify: state-machine smoke (transitions+409+403), visibility smoke (community in browse, mine), route registration, tsc, manual → Tasks 1-4. ✓

**Placeholder scan:** Full code in every code step. Two "match the surrounding markup" notes (RecipeCard badge placement, Navbar link, edit-route path) are integration points where the implementer must read the real file — each gives the exact snippet + a concrete fallback, not a vague TODO.

**Type/name consistency:**
- Status values `private`/`pending_collaborator`/`pending_admin`/`approved`/`rejected` identical across service transitions (T1), queue mapping (T2), TS unions (T4). ✓
- `MyRecipeCardOut` defined in schema (T3 Step 1) ↔ imported/used in service builder (T2 Step 4) — NOTE: Task 2 uses `MyRecipeCardOut` which Task 3 defines. **Ordering fix:** the schema must exist before the service references it at import time. Implementer runs Task 2's app-import only after Task 3? No — reorder: see note below.
- Function names `submit_recipe`/`withdraw_recipe`/`collaborator_approve`/`collaborator_reject`/`admin_publish`/`admin_reject` identical in service (T1) ↔ routes (T3). ✓
- `list_my_recipes(db, user, page, limit)` / `list_review_queue(db, stage, page, limit)` signatures match between service (T2) and routes (T3). ✓

**Cross-task ordering issue found + fixed:** Task 2 Step 4's `_build_my_recipe_card` imports/uses `MyRecipeCardOut`, which is defined in Task 3 Step 1. To keep each task's app-import green, **move the schema additions (Task 3 Step 1: `MyRecipeCardOut` + `RejectBody`) to be done at the START of Task 2** (before Step 3). Update: Task 2 gains a Step 0 "add `MyRecipeCardOut` + `RejectBody` to `schemas/recipe.py` and import `MyRecipeCardOut` in recipe_service" — and Task 3 Step 1 becomes "verify the schemas exist (added in Task 2)". The executor should apply this reorder so Task 2 commits cleanly.

No other gaps.
