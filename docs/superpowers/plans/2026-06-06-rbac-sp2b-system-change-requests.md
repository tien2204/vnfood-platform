# RBAC SP2b — Collaborator Change-Requests on System Recipes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A collaborator proposes create/edit/delete of a system recipe; the change is staged as a `RecipeChangeRequest` and only applied when an admin approves (with an AI-class delete guard).

**Architecture:** New `RecipeChangeRequest` table (migration 0013) stores the proposed change (`type` + JSONB `payload` + `target_recipe_id`). `change_request_service` creates/lists requests and, on admin approval, applies them (insert a new canonical recipe / overwrite a target's content / delete a target — blocking deletion of an AI-class's sole canonical). A new router exposes collaborator (create + my-list) and admin (queue + approve/reject) endpoints. A minimal collaborator UI reuses `RecipeForm` via a `submitOverride` prop, plus a `/me/change-requests` list. The admin review screen is SP5.

**Tech Stack:** FastAPI + SQLAlchemy async (JSONB), Alembic, Next.js 16 client components. Reuses `require_collaborator`/`require_admin` (SP1), `RecipeCreate` schema, `CLASS_DISPLAY_NAMES`, `RecipeForm`.

**Branch:** `feat/canonical-recipes`. Backend from `backend/`: `$env:PYTHONUTF8=1; .venv\Scripts\python.exe ...`. Frontend from `frontend/`. Do NOT commit `.claude/settings*`, `backups/`, `cookpad_recipe/*.json`. Footer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Existing facts:** Migration head = `0012`. JSONB precedent: `app/models/ai_generated_recipe.py` (`from sqlalchemy.dialects.postgresql import JSONB, UUID`). `RecipeCreate` (schemas/recipe.py): `title`(min5), `description`, `image_url`, `cooking_time`, `servings`, `difficulty`, `keyword`, `ingredients: list[IngredientCreate]`(min1), `steps: list[StepCreate]`(min1); `IngredientCreate{display_text, ingredient_name?, quantity?, order_index}`, `StepCreate{step_number, content, image_url?, timer_seconds?}`. `CLASS_DISPLAY_NAMES` (app/ai/class_names.py): dict keyed by the 103 AI class slugs. `recipe_service.create_recipe` shows the RecipeIngredient/RecipeStep write pattern. `main.py` registers routers at lines 86-99. `RecipeForm` props: `{ initial?: Partial<RecipeDetail>, recipeId?, mode: "create"|"edit" }`; it builds a `payload` then `mode==="create"` POSTs `/recipes`, else PUTs `/recipes/{recipeId}` (lines ~199-212). `RejectBody{reason}` exists in schemas/recipe.py.

---

### Task 1: Model + migration 0013 (`recipe_change_requests`)

**Files:** Create `backend/app/models/recipe_change_request.py`, `backend/alembic/versions/0013_recipe_change_requests.py`

- [ ] **Step 1: Create the model**

```python
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.database import Base


class RecipeChangeRequest(Base):
    __tablename__ = "recipe_change_requests"
    __table_args__ = (
        Index("ix_rcr_status", "status"),
        Index("ix_rcr_requested_by", "requested_by"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    type: Mapped[str] = mapped_column(String(10), nullable=False)  # create | edit | delete
    target_recipe_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("recipes.id", ondelete="SET NULL"), nullable=True
    )
    payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    requested_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(10), nullable=False, server_default="pending")  # pending|approved|rejected
    reject_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
```

- [ ] **Step 2: Create the migration** (mirror `0011_recipe_facets.py` style):

```python
"""recipe_change_requests table (collaborator change-requests on system recipes)

Revision ID: 0013
Revises: 0012
Create Date: 2026-06-06
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "recipe_change_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("type", sa.String(length=10), nullable=False),
        sa.Column("target_recipe_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("recipes.id", ondelete="SET NULL"), nullable=True),
        sa.Column("payload", postgresql.JSONB(), nullable=True),
        sa.Column("requested_by", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False, server_default="pending"),
        sa.Column("reject_reason", sa.Text(), nullable=True),
        sa.Column("reviewed_by", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_rcr_status", "recipe_change_requests", ["status"])
    op.create_index("ix_rcr_requested_by", "recipe_change_requests", ["requested_by"])


def downgrade() -> None:
    op.drop_index("ix_rcr_requested_by", table_name="recipe_change_requests")
    op.drop_index("ix_rcr_status", table_name="recipe_change_requests")
    op.drop_table("recipe_change_requests")
```

(Confirm head is `0012` first: `... alembic heads`. If not, STOP and report.)

- [ ] **Step 3: Apply + verify (from `backend/`)**

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -m alembic upgrade head
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -c "import asyncio; from sqlalchemy import text; from app.core.database import AsyncSessionLocal
import app.models.recipe_change_request  # register model
async def m():
 async with AsyncSessionLocal() as db:
  n=(await db.execute(text(\"select count(*) from recipe_change_requests\"))).scalar_one(); print('table ok, rows:', n)
asyncio.run(m())"
```
Expected: `Running upgrade 0012 -> 0013`, then `table ok, rows: 0`.

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/recipe_change_request.py backend/alembic/versions/0013_recipe_change_requests.py
git commit -m "feat(rbac-sp2b): RecipeChangeRequest model + migration 0013

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Schema + `change_request_service` (create/list/approve-apply/reject)

**Files:** Create `backend/app/schemas/change_request.py`, `backend/app/services/change_request_service.py`

- [ ] **Step 1: Create the schemas** (`backend/app/schemas/change_request.py`):

```python
import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel

from app.schemas.recipe import RecipeCreate


class ChangeRequestCreate(BaseModel):
    type: Literal["create", "edit", "delete"]
    target_recipe_id: Optional[uuid.UUID] = None
    payload: Optional[RecipeCreate] = None


class ChangeRequestOut(BaseModel):
    id: uuid.UUID
    type: str
    target_recipe_id: Optional[uuid.UUID] = None
    target_title: Optional[str] = None
    status: str
    reject_reason: Optional[str] = None
    requested_by_name: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}
```

- [ ] **Step 2: Create the service** (`backend/app/services/change_request_service.py`):

```python
import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.class_names import CLASS_DISPLAY_NAMES
from app.models.recipe import Recipe, RecipeIngredient, RecipeStep
from app.models.recipe_change_request import RecipeChangeRequest
from app.models.user import User
from app.schemas.change_request import ChangeRequestCreate, ChangeRequestOut
from app.schemas.recipe import RecipeCreate


async def _get_cr_or_404(db: AsyncSession, cr_id: uuid.UUID) -> RecipeChangeRequest:
    cr = (await db.execute(
        select(RecipeChangeRequest).where(RecipeChangeRequest.id == cr_id)
    )).scalar_one_or_none()
    if cr is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Đề xuất không tồn tại")
    return cr


async def _get_recipe_or_404(db: AsyncSession, recipe_id: uuid.UUID) -> Recipe:
    r = (await db.execute(select(Recipe).where(Recipe.id == recipe_id))).scalar_one_or_none()
    if r is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Công thức không tồn tại")
    return r


async def create_change_request(
    db: AsyncSession, user: User, data: ChangeRequestCreate
) -> RecipeChangeRequest:
    if data.type in ("edit", "delete"):
        if data.target_recipe_id is None:
            raise HTTPException(status_code=422, detail="Thiếu target_recipe_id")
        await _get_recipe_or_404(db, data.target_recipe_id)  # 404 if missing
    if data.type in ("create", "edit") and data.payload is None:
        raise HTTPException(status_code=422, detail="Thiếu payload công thức")
    cr = RecipeChangeRequest(
        id=uuid.uuid4(),
        type=data.type,
        target_recipe_id=data.target_recipe_id,
        payload=data.payload.model_dump(mode="json") if data.payload else None,
        requested_by=user.id,
        status="pending",
    )
    db.add(cr)
    await db.commit()
    await db.refresh(cr)
    return cr


def _to_out(cr: RecipeChangeRequest, target_title: str | None, requester_name: str | None) -> ChangeRequestOut:
    return ChangeRequestOut(
        id=cr.id, type=cr.type, target_recipe_id=cr.target_recipe_id,
        target_title=target_title, status=cr.status, reject_reason=cr.reject_reason,
        requested_by_name=requester_name, created_at=cr.created_at,
    )


async def _list(db: AsyncSession, where, order, page: int, limit: int):
    limit = min(limit, 50)
    base = select(RecipeChangeRequest).where(where)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (await db.execute(
        base.order_by(order).offset((page - 1) * limit).limit(limit)
    )).scalars().all()
    # resolve target titles + requester names
    out = []
    for cr in rows:
        title = None
        if cr.target_recipe_id:
            title = (await db.execute(select(Recipe.title).where(Recipe.id == cr.target_recipe_id))).scalar_one_or_none()
        name = (await db.execute(select(User.full_name).where(User.id == cr.requested_by))).scalar_one_or_none()
        out.append(_to_out(cr, title, name))
    total_pages = (total + limit - 1) // limit if total > 0 else 0
    return out, total, total_pages


async def list_my_change_requests(db: AsyncSession, user: User, page: int = 1, limit: int = 20):
    return await _list(db, RecipeChangeRequest.requested_by == user.id,
                       RecipeChangeRequest.created_at.desc(), page, limit)


async def list_pending_change_requests(db: AsyncSession, page: int = 1, limit: int = 20):
    return await _list(db, RecipeChangeRequest.status == "pending",
                       RecipeChangeRequest.created_at.asc(), page, limit)


async def _write_ingredients_steps(db: AsyncSession, recipe_id: uuid.UUID, data: RecipeCreate) -> None:
    for i, ing in enumerate(data.ingredients):
        db.add(RecipeIngredient(
            id=uuid.uuid4(), recipe_id=recipe_id, display_text=ing.display_text,
            ingredient_name=ing.ingredient_name, quantity=ing.quantity, order_index=ing.order_index,
        ))
    for s in data.steps:
        db.add(RecipeStep(
            id=uuid.uuid4(), recipe_id=recipe_id, step_number=s.step_number,
            content=s.content, image_url=s.image_url or None, timer_seconds=s.timer_seconds,
        ))


async def approve_change_request(db: AsyncSession, cr_id: uuid.UUID, admin: User) -> RecipeChangeRequest:
    cr = await _get_cr_or_404(db, cr_id)
    if cr.status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Đề xuất đã được xử lý")

    if cr.type == "create":
        data = RecipeCreate(**cr.payload)
        new_id = uuid.uuid4()
        db.add(Recipe(
            id=new_id, title=data.title, description=data.description, image_url=data.image_url,
            cooking_time=data.cooking_time, servings=data.servings, difficulty=data.difficulty,
            keyword=data.keyword, source="collaborator", status="approved",
            is_canonical=True, author_id=cr.requested_by,
        ))
        await db.flush()
        await _write_ingredients_steps(db, new_id, data)

    elif cr.type == "edit":
        data = RecipeCreate(**cr.payload)
        target = await _get_recipe_or_404(db, cr.target_recipe_id)
        target.title = data.title
        target.description = data.description
        target.image_url = data.image_url
        target.cooking_time = data.cooking_time
        target.servings = data.servings
        target.difficulty = data.difficulty
        target.keyword = data.keyword
        from sqlalchemy import delete as sa_delete
        await db.execute(sa_delete(RecipeIngredient).where(RecipeIngredient.recipe_id == target.id))
        await db.execute(sa_delete(RecipeStep).where(RecipeStep.recipe_id == target.id))
        await _write_ingredients_steps(db, target.id, data)

    elif cr.type == "delete":
        target = await _get_recipe_or_404(db, cr.target_recipe_id)
        if target.is_canonical and target.canonical_dish_slug in CLASS_DISPLAY_NAMES:
            cnt = (await db.execute(
                select(func.count()).select_from(Recipe).where(
                    Recipe.is_canonical.is_(True),
                    Recipe.canonical_dish_slug == target.canonical_dish_slug,
                )
            )).scalar_one()
            if cnt <= 1:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Không thể xóa: canonical duy nhất cho lớp AI '{target.canonical_dish_slug}'",
                )
        await db.delete(target)

    cr.status = "approved"
    cr.reviewed_by = admin.id
    await db.commit()
    await db.refresh(cr)
    return cr


async def reject_change_request(db: AsyncSession, cr_id: uuid.UUID, admin: User, reason: str) -> RecipeChangeRequest:
    cr = await _get_cr_or_404(db, cr_id)
    if cr.status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Đề xuất đã được xử lý")
    cr.status = "rejected"
    cr.reject_reason = reason
    cr.reviewed_by = admin.id
    await db.commit()
    await db.refresh(cr)
    return cr
```

- [ ] **Step 3: Smoke the full workflow (real DB, self-cleaning), from `backend/`** — create `backend/scripts/_smoke_cr.py`:

```python
import asyncio
import uuid
from types import SimpleNamespace
from fastapi import HTTPException
from sqlalchemy import select, text
from app.core.database import AsyncSessionLocal
from app.models.user import User
from app.models.recipe import Recipe
from app.models.recipe_change_request import RecipeChangeRequest
from app.schemas.change_request import ChangeRequestCreate
from app.services import change_request_service as crs

PAYLOAD = {
    "title": "SMOKE system dish",
    "ingredients": [{"display_text": "200g gạo", "order_index": 0}],
    "steps": [{"step_number": 1, "content": "Nấu cơm"}],
}


async def main():
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).limit(1))).scalar_one()
        admin = SimpleNamespace(id=user.id, role="admin")
        collab = SimpleNamespace(id=user.id, role="collaborator")
        created_ids = []
        try:
            # CREATE → approve → new canonical exists
            cr = await crs.create_change_request(db, collab, ChangeRequestCreate(type="create", payload=PAYLOAD))
            await crs.approve_change_request(db, cr.id, admin)
            new = (await db.execute(select(Recipe).where(Recipe.title == "SMOKE system dish"))).scalar_one()
            assert new.is_canonical and new.status == "approved"
            created_ids.append(new.id)
            print("create→approve OK (new canonical inserted)")
            # EDIT → approve → title changed
            cr2 = await crs.create_change_request(db, collab, ChangeRequestCreate(
                type="edit", target_recipe_id=new.id, payload={**PAYLOAD, "title": "SMOKE edited"}))
            await crs.approve_change_request(db, cr2.id, admin)
            await db.refresh(new)
            assert new.title == "SMOKE edited"
            print("edit→approve OK (content overwritten)")
            # wrong-state approve → 409
            try:
                await crs.approve_change_request(db, cr2.id, admin); assert False
            except HTTPException as e: assert e.status_code == 409
            # AI-class delete guard: pick a canonical whose slug ∈ CLASS_DISPLAY_NAMES, sole canonical
            from app.ai.class_names import CLASS_DISPLAY_NAMES
            slug = (await db.execute(text(
                "select canonical_dish_slug from recipes where is_canonical and canonical_dish_slug = any(:slugs) "
                "group by canonical_dish_slug having count(*) = 1 limit 1"
            ).bindparams(slugs=list(CLASS_DISPLAY_NAMES.keys())))).scalar_one_or_none()
            if slug:
                ai_recipe = (await db.execute(select(Recipe).where(
                    Recipe.is_canonical.is_(True), Recipe.canonical_dish_slug == slug).limit(1))).scalar_one()
                crd = await crs.create_change_request(db, collab, ChangeRequestCreate(type="delete", target_recipe_id=ai_recipe.id))
                try:
                    await crs.approve_change_request(db, crd.id, admin); assert False, "should block AI-class delete"
                except HTTPException as e: assert e.status_code == 409
                await crs.reject_change_request(db, crd.id, admin, "test")  # clean the CR
                print(f"AI-class delete blocked (409) for slug '{slug}'")
            else:
                print("no sole-canonical AI slug found — skip delete-guard check")
            # DELETE of the smoke recipe (non-AI) → approve → gone
            crdel = await crs.create_change_request(db, collab, ChangeRequestCreate(type="delete", target_recipe_id=new.id))
            await crs.approve_change_request(db, crdel.id, admin)
            assert (await db.get(Recipe, new.id)) is None
            created_ids.clear()
            print("delete→approve OK (target removed)")
            print("OK — change-request workflow correct")
        finally:
            for rid in created_ids:
                obj = await db.get(Recipe, rid)
                if obj: await db.delete(obj)
            await db.execute(text("delete from recipe_change_requests where requested_by = :u").bindparams(u=user.id))
            await db.commit()
            print("cleaned up")


asyncio.run(main())
```

Run: `$env:PYTHONUTF8=1; .venv\Scripts\python.exe -m scripts._smoke_cr`
Expected: `create→approve OK`, `edit→approve OK`, `AI-class delete blocked (409) ...` (or skip line), `delete→approve OK`, `OK — change-request workflow correct`, `cleaned up`. Then delete: `Remove-Item scripts\_smoke_cr.py`.

- [ ] **Step 4: Verify app imports (from `backend/`)**

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -c "import app.services.change_request_service; from app.main import app; print('ok')"
```
Expected: `ok`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/change_request.py backend/app/services/change_request_service.py
git commit -m "feat(rbac-sp2b): change_request_service (create/list/approve-apply/reject) + AI-class delete guard

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Routes + main.py registration

**Files:** Create `backend/app/api/v1/recipe_change_requests.py`, Modify `backend/app/main.py`

- [ ] **Step 1: Create the router** (`backend/app/api/v1/recipe_change_requests.py`):

```python
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_collaborator, require_admin
from app.models.user import User
from app.schemas.change_request import ChangeRequestCreate
from app.schemas.recipe import RejectBody
from app.services import change_request_service as crs

router = APIRouter()


@router.post("")
async def create_change_request(
    data: ChangeRequestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_collaborator),
):
    cr = await crs.create_change_request(db, current_user, data)
    return {"success": True, "data": {"id": str(cr.id), "status": cr.status}, "message": "Đã gửi đề xuất"}


@router.get("/mine")
async def my_change_requests(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_collaborator),
):
    items, total, total_pages = await crs.list_my_change_requests(db, current_user, page, limit)
    return {"success": True, "data": [i.model_dump(mode="json") for i in items],
            "pagination": {"page": page, "limit": limit, "total": total, "total_pages": total_pages}}


@router.get("")
async def pending_change_requests(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    items, total, total_pages = await crs.list_pending_change_requests(db, page, limit)
    return {"success": True, "data": [i.model_dump(mode="json") for i in items],
            "pagination": {"page": page, "limit": limit, "total": total, "total_pages": total_pages}}


@router.post("/{cr_id}/approve")
async def approve_change_request(
    cr_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    cr = await crs.approve_change_request(db, cr_id, current_admin)
    return {"success": True, "data": {"id": str(cr.id), "status": cr.status}, "message": "Đã duyệt & áp dụng"}


@router.post("/{cr_id}/reject")
async def reject_change_request(
    cr_id: uuid.UUID,
    body: RejectBody,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    cr = await crs.reject_change_request(db, cr_id, current_admin, body.reason)
    return {"success": True, "data": {"id": str(cr.id), "status": cr.status}, "message": "Đã từ chối"}
```

- [ ] **Step 2: Register the router in `main.py`.** Add the import near the other router imports (line ~14-26):

```python
from app.api.v1.recipe_change_requests import router as change_requests_router
```

and the registration near the others (line ~86-99):

```python
app.include_router(change_requests_router, prefix="/api/v1/recipe-change-requests", tags=["change-requests"])
```

- [ ] **Step 3: Verify app imports + routes registered (from `backend/`)**

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -c "from app.main import app
paths={r.path for r in app.routes}
need=['/api/v1/recipe-change-requests','/api/v1/recipe-change-requests/mine','/api/v1/recipe-change-requests/{cr_id}/approve','/api/v1/recipe-change-requests/{cr_id}/reject']
missing=[p for p in need if p not in paths]
print('missing:', missing); print('ok' if not missing else 'FAIL')"
```
Expected: `missing: []` then `ok`. (Note `/mine` must be registered before `GET ""`/dynamic — both are distinct paths here, but `/mine` is a static subpath so it's safe.)

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/v1/recipe_change_requests.py backend/app/main.py
git commit -m "feat(rbac-sp2b): change-request routes (collaborator create/mine + admin queue/approve/reject)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Minimal collaborator frontend

**Files:** Modify `frontend/lib/types.ts`, `frontend/components/recipes/RecipeForm.tsx`, `frontend/components/layout/Navbar.tsx`, recipe detail page; Create `frontend/app/recipes/[id]/propose-edit/page.tsx`, `frontend/app/recipes/propose-new/page.tsx`, `frontend/app/me/change-requests/page.tsx`

- [ ] **Step 1: Types.** In `frontend/lib/types.ts`: change `User.role` from `"user" | "admin"` to `"user" | "collaborator" | "admin"`. After `RecipeCardWithStatus`, add:

```ts
export interface ChangeRequest {
  id: string;
  type: "create" | "edit" | "delete";
  target_recipe_id: string | null;
  target_title: string | null;
  status: "pending" | "approved" | "rejected";
  reject_reason: string | null;
  requested_by_name: string | null;
  created_at: string;
}
```

- [ ] **Step 2: Add `submitOverride` to `RecipeForm`.** READ `RecipeForm.tsx`. In its `Props` interface add:

```tsx
  submitOverride?: (payload: RecipeCreate) => Promise<void>;
```

(Import `RecipeCreate` from `@/lib/types` if not already.) In the submit handler, where it currently branches `if (mode === "create") { await api.post("/recipes", payload); ... } else { ... }`, wrap with the override:

```tsx
      if (submitOverride) {
        await submitOverride(payload);
        return;
      }
      if (mode === "create") {
```

(And add `submitOverride` to the destructured props: `function RecipeForm({ initial, recipeId, mode, submitOverride }: Props)`.) When `submitOverride` is provided the caller handles toast + navigation, so the override should do those.

- [ ] **Step 3: Propose-edit page** (`frontend/app/recipes/[id]/propose-edit/page.tsx`):

```tsx
"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import RecipeForm from "@/components/recipes/RecipeForm";
import api from "@/lib/api";
import type { ApiResponse, RecipeDetail, RecipeCreate } from "@/lib/types";

export default function ProposeEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);

  useEffect(() => {
    api.get<ApiResponse<RecipeDetail>>(`/recipes/${id}`).then((r) => setRecipe(r.data.data)).catch(() => setRecipe(null));
  }, [id]);

  async function submit(payload: RecipeCreate) {
    await api.post("/recipe-change-requests", { type: "edit", target_recipe_id: id, payload });
    toast.success("Đã gửi đề xuất sửa — chờ admin duyệt");
    router.push("/me/change-requests");
  }

  if (!recipe) return <p className="p-8 text-[#7C6A56]">Đang tải…</p>;
  return (
    <main className="min-h-screen bg-[#FFFBF5] py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-bold text-[#1C1209] mb-4">Đề xuất sửa: {recipe.title}</h1>
        <RecipeForm initial={recipe} recipeId={id} mode="edit" submitOverride={submit} />
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Propose-new page** (`frontend/app/recipes/propose-new/page.tsx`):

```tsx
"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import RecipeForm from "@/components/recipes/RecipeForm";
import api from "@/lib/api";
import type { RecipeCreate } from "@/lib/types";

export default function ProposeNewPage() {
  const router = useRouter();
  async function submit(payload: RecipeCreate) {
    await api.post("/recipe-change-requests", { type: "create", payload });
    toast.success("Đã gửi đề xuất công thức hệ thống mới — chờ admin duyệt");
    router.push("/me/change-requests");
  }
  return (
    <main className="min-h-screen bg-[#FFFBF5] py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-bold text-[#1C1209] mb-4">Đề xuất công thức hệ thống mới</h1>
        <RecipeForm mode="create" submitOverride={submit} />
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Collaborator buttons on the recipe detail page.** READ the recipe detail page (`frontend/app/recipes/[id]/page.tsx` or its detail component). Determine how the logged-in user/role is available (an auth context/hook — find the existing pattern, e.g. `useAuth()` returning `user`). Add, visible only when the user role is `collaborator` or `admin`, near the recipe actions:

```tsx
{(user?.role === "collaborator" || user?.role === "admin") && (
  <div className="flex gap-2">
    <Link href={`/recipes/${recipe.id}/propose-edit`} className="px-3 py-1.5 rounded-lg border border-[#E8DDD4] text-sm text-[#7C6A56] hover:text-[#E85D26]">Đề xuất sửa</Link>
    <button
      onClick={async () => {
        if (!confirm("Đề xuất xóa công thức hệ thống này?")) return;
        await api.post("/recipe-change-requests", { type: "delete", target_recipe_id: recipe.id });
        toast.success("Đã gửi đề xuất xóa — chờ admin duyệt");
      }}
      className="px-3 py-1.5 rounded-lg border border-[#E8DDD4] text-sm text-red-500 hover:border-red-300"
    >Đề xuất xóa</button>
  </div>
)}
```

(Adapt the role source + imports to the page's actual auth pattern. If the page is a server component, gate via the client sub-component that already has the user, or wrap in a small client component.)

- [ ] **Step 6: `/me/change-requests` page** (`frontend/app/me/change-requests/page.tsx`):

```tsx
"use client";

import Link from "next/link";
import useSWR from "swr";
import api from "@/lib/api";
import type { ChangeRequest, PaginatedResponse } from "@/lib/types";

const STATUS = {
  pending: { label: "Chờ duyệt", cls: "bg-yellow-100 text-yellow-700" },
  approved: { label: "Đã áp dụng", cls: "bg-green-100 text-green-700" },
  rejected: { label: "Bị từ chối", cls: "bg-red-100 text-red-700" },
} as const;

const TYPE_LABEL = { create: "Tạo mới", edit: "Sửa", delete: "Xóa" } as const;

async function fetcher(url: string) {
  return (await api.get<PaginatedResponse<ChangeRequest>>(url)).data;
}

export default function MyChangeRequestsPage() {
  const { data, isLoading } = useSWR("/recipe-change-requests/mine?limit=50", fetcher);
  const items = data?.data ?? [];

  return (
    <main className="min-h-screen bg-[#FFFBF5] py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-[#1C1209] font-heading">Đề xuất của tôi</h1>
          <Link href="/recipes/propose-new" className="px-4 py-2 rounded-xl bg-[#E85D26] text-white text-sm font-medium">
            + Đề xuất công thức mới
          </Link>
        </div>
        {isLoading ? (
          <p className="text-[#7C6A56]">Đang tải…</p>
        ) : items.length === 0 ? (
          <p className="text-[#7C6A56]">Chưa có đề xuất nào.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((cr) => {
              const st = STATUS[cr.status] ?? { label: cr.status, cls: "bg-gray-100 text-gray-700" };
              return (
                <li key={cr.id} className="border border-[#E8DDD4] bg-white rounded-xl p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-[#1C1209]">
                      {TYPE_LABEL[cr.type]} · {cr.target_title ?? "(công thức mới)"}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.cls}`}>{st.label}</span>
                  </div>
                  {cr.status === "rejected" && cr.reject_reason && (
                    <p className="mt-1.5 text-sm text-red-600">Lý do: {cr.reject_reason}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 7: Navbar link.** READ `Navbar.tsx`. In the logged-in user menu, add a link visible when the user role is `collaborator` or `admin`:

```tsx
{(user?.role === "collaborator" || user?.role === "admin") && (
  <Link href="/me/change-requests">Đề xuất của tôi</Link>
)}
```

(Match the menu's existing markup + how it reads the user role.)

- [ ] **Step 8: Typecheck (from `frontend/`)**

```bash
npx tsc --noEmit
```
Expected: no NEW errors — only the 3 known pre-existing files (`app/admin/page.tsx`, `app/me/profile/page.tsx`, `app/recognize/page.tsx`).

- [ ] **Step 9: Commit**

```bash
git add frontend/lib/types.ts frontend/components/recipes/RecipeForm.tsx frontend/components/layout/Navbar.tsx frontend/app/recipes/[id]/propose-edit/page.tsx frontend/app/recipes/propose-new/page.tsx frontend/app/me/change-requests/page.tsx frontend/app/recipes/[id]/page.tsx
git commit -m "feat(rbac-sp2b): collaborator propose edit/delete/create UI + /me/change-requests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

(Adjust the `git add` list to exactly the files you touched — e.g. if the detail-page buttons live in a sub-component, add that file instead.)

- [ ] **Step 10: Manual smoke (after restarting uvicorn + `npm run dev`)** — as a collaborator (admin assigns the role via `PATCH /admin/users/{id}/role`): open a system recipe → "Đề xuất sửa" → edit → submit → appears in `/me/change-requests` as "Chờ duyệt"; admin approves via API → the live recipe reflects the edit. "Đề xuất xóa" on an AI-class recipe → admin approve returns 409 (blocked).

---

## Self-Review

**Spec coverage:**
- `RecipeChangeRequest` model + migration 0013 (JSONB payload, FKs, indexes) → Task 1. ✓
- Schemas (`ChangeRequestCreate` with `payload: RecipeCreate`, `ChangeRequestOut`) → Task 2 Step 1. ✓
- Service create (validation 404/422) / my+pending lists / approve-apply (create=new canonical, edit=overwrite content+ing/steps, delete=hard) / reject; AI-class sole-canonical delete block (409); wrong-state 409 → Task 2 Step 2. ✓
- Routes: collaborator create + /mine; admin queue + approve/reject; guards → Task 3. ✓ + main.py registration. ✓
- Frontend: `User.role` += collaborator; `RecipeForm` submitOverride; propose-edit/propose-new pages; recipe-detail collaborator buttons; `/me/change-requests`; navbar → Task 4. ✓
- Verify: full workflow smoke (create/edit/delete/approve + AI-guard 409 + wrong-state 409), migration, route check, tsc, manual → Tasks 1-4. ✓

**Placeholder scan:** Full code in every code step. Task 4 Steps 5/7 ("adapt to the page's auth pattern") are genuine integration points — they give the exact JSX + condition and name the unknown (how the page reads `user.role`), which the implementer must read from the real file; that's a read-then-wire instruction, not a vague TODO. The smoke self-cleans and handles the no-AI-slug case explicitly.

**Type/name consistency:**
- `RecipeChangeRequest` fields identical in model (T1) ↔ migration DDL (T1) ↔ service queries (T2). ✓
- `ChangeRequestCreate{type,target_recipe_id,payload}` ↔ frontend POST bodies `{type, target_recipe_id, payload}` (T4). ✓
- `crs.create_change_request/list_my_change_requests/list_pending_change_requests/approve_change_request/reject_change_request` signatures identical in service (T2) ↔ router (T3). ✓
- `ChangeRequest` TS type fields ↔ `ChangeRequestOut` python fields (id/type/target_recipe_id/target_title/status/reject_reason/requested_by_name/created_at). ✓
- `submitOverride: (payload: RecipeCreate) => Promise<void>` ↔ called with the form's assembled `payload` (T4 Step 2) ↔ propose pages pass an async fn (T4 Steps 3-4). ✓
- AI-class slug source `CLASS_DISPLAY_NAMES` (keys) used in both the service guard (T2) and the smoke's slug pick (T2 Step 3). ✓

No gaps found.
