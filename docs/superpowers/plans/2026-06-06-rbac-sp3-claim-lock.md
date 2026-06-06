# RBAC SP3 — Claim-Lock on Collaborator Review Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a collaborator explicitly claim a `pending_collaborator` recipe so only they (or an admin) can approve/reject it; allow claimer/admin to release; auto-clear the claim whenever the recipe leaves the queue.

**Architecture:** Two nullable columns on `recipes` (`claimed_by`, `claimed_at`, migration 0014). Service functions `claim_recipe`/`release_claim` plus a `_assert_claimer` gate woven into the existing `collaborator_approve`/`collaborator_reject` (which gain a `user` param); the claim is nulled on every exit transition (approve→pending_admin, reject, withdraw). The collaborator review queue surfaces the claimer's name via a new optional `claimed_by_name` on the existing `RecipeCardWithStatus`. Two new POST routes; approve/reject routes pass the acting user. Backend only — reviewer UI is SP5.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic (manual migrations), PostgreSQL. Verification via a self-cleaning smoke script (the established convention in this repo for SP1/SP2/SP2b — there is no committed async-DB pytest harness; do NOT introduce one here).

**Prerequisites:** Docker Postgres running (`docker-compose up -d`). Backend venv at `backend/.venv`. Migration head is currently **0013**.

**Reference facts (already in the codebase — do not redefine):**
- `app.core.roles` exposes `COLLABORATOR`, `ADMIN`, `role_at_least(role, minimum)`. `recipe_service.py` already does `from app.core import roles`.
- `recipe_service._get_recipe_or_404(db, recipe_id)` and `_assert_status(recipe, expected_tuple, action)` (raises 409) exist.
- `require_collaborator` / `require_admin` (from `app.core.deps`) return a `User`; admin satisfies `require_collaborator` via role hierarchy.
- `AsyncSessionLocal` is in `app.core.database`.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `backend/alembic/versions/0014_recipe_claim_fields.py` | Add `claimed_by` + `claimed_at` to `recipes` | Create |
| `backend/app/models/recipe.py` | ORM columns for the claim fields | Modify |
| `backend/app/schemas/recipe.py` | `claimed_by_name` on `RecipeCardWithStatus` | Modify |
| `backend/app/services/recipe_service.py` | claim/release + claim gate + clear-on-transition + queue name | Modify |
| `backend/app/api/v1/recipes.py` | claim/release routes; pass user to approve/reject | Modify |
| `backend/_smoke_sp3.py` | Self-cleaning end-to-end smoke (deleted after Task 4) | Create then delete |

---

## Task 1: Migration 0014 + model columns

**Files:**
- Create: `backend/alembic/versions/0014_recipe_claim_fields.py`
- Modify: `backend/app/models/recipe.py`

- [ ] **Step 1: Write the migration**

Create `backend/alembic/versions/0014_recipe_claim_fields.py`:

```python
"""recipe claim fields (claim-lock on collaborator review queue)

Revision ID: 0014
Revises: 0013
Create Date: 2026-06-06
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("recipes", sa.Column("claimed_by", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("recipes", sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(
        "fk_recipes_claimed_by_users", "recipes", "users",
        ["claimed_by"], ["id"], ondelete="SET NULL",
    )
    op.create_index("ix_recipes_claimed_by", "recipes", ["claimed_by"])


def downgrade() -> None:
    op.drop_index("ix_recipes_claimed_by", table_name="recipes")
    op.drop_constraint("fk_recipes_claimed_by_users", "recipes", type_="foreignkey")
    op.drop_column("recipes", "claimed_at")
    op.drop_column("recipes", "claimed_by")
```

- [ ] **Step 2: Add the ORM columns**

In `backend/app/models/recipe.py`, add `from datetime import datetime` at the top (with the other imports, e.g. after line 1 `import uuid`). Then add these two columns to the `Recipe` class right after the `cooking_methods` column (currently line 67), before the `# Relationships` comment:

```python
    # Claim-lock (SP3): set while status == 'pending_collaborator', cleared on any exit transition
    claimed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
```

- [ ] **Step 3: Run the migration**

Run (PowerShell):
```powershell
cd backend; .venv\Scripts\python -m alembic upgrade head
```
Expected: ends with `Running upgrade 0013 -> 0014, recipe claim fields`.

- [ ] **Step 4: Verify the columns exist**

Run:
```powershell
cd backend; .venv\Scripts\python -c "import asyncio; from sqlalchemy import text; from app.core.database import AsyncSessionLocal; \
async def m():\
 async with AsyncSessionLocal() as s:\
  r=await s.execute(text(\"select column_name from information_schema.columns where table_name='recipes' and column_name in ('claimed_by','claimed_at') order by 1\"));\
  print([row[0] for row in r.all()])\
asyncio.run(m())"
```
Expected: `['claimed_at', 'claimed_by']`

(If the one-liner is awkward in your shell, write the same check as a temp `_chk.py` and delete it.)

- [ ] **Step 5: Commit**

```powershell
cd backend; git add alembic/versions/0014_recipe_claim_fields.py app/models/recipe.py; git commit -m "feat(rbac-sp3): add claimed_by/claimed_at to recipes (migration 0014)"
```

---

## Task 2: Schema field + service (claim/release, gate, clear, queue name)

**Files:**
- Modify: `backend/app/schemas/recipe.py:156-162` (`RecipeCardWithStatus`)
- Modify: `backend/app/services/recipe_service.py`

- [ ] **Step 1: Add `claimed_by_name` to the card schema**

In `backend/app/schemas/recipe.py`, change `RecipeCardWithStatus` (currently lines 156-162) to add one field:

```python
class RecipeCardWithStatus(RecipeCardOut):
    """RecipeCard extended with moderation fields — for owner/admin/reviewer views."""
    status: str
    reject_reason: str | None = None
    created_at: datetime
    claimed_by_name: str | None = None

    model_config = {"from_attributes": True}
```

- [ ] **Step 2: Add datetime import to the service**

In `backend/app/services/recipe_service.py`, add to the top imports (after `import uuid` on line 2):

```python
from datetime import datetime, timezone
```

- [ ] **Step 3: Add the `_assert_claimer` helper**

In `backend/app/services/recipe_service.py`, add this helper right after `_assert_status` (which ends at line 746):

```python
def _assert_claimer(recipe: Recipe, user: User, action: str) -> None:
    """Gate approve/reject: caller must hold the claim, unless admin (bypass)."""
    if roles.role_at_least(user.role, roles.ADMIN):
        return
    if recipe.claimed_by is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Hãy nhận xử lý công thức trước khi {action}",
        )
    if recipe.claimed_by != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Công thức đang được cộng tác viên khác xử lý",
        )
```

- [ ] **Step 4: Add `claim_recipe` and `release_claim`**

In `backend/app/services/recipe_service.py`, add these two functions right after `_assert_claimer`:

```python
async def claim_recipe(db: AsyncSession, recipe_id: uuid.UUID, user: User) -> Recipe:
    r = await _get_recipe_or_404(db, recipe_id)
    _assert_status(r, ("pending_collaborator",), "nhận xử lý")
    is_admin = roles.role_at_least(user.role, roles.ADMIN)
    if r.claimed_by is not None and r.claimed_by != user.id and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Công thức đang được cộng tác viên khác xử lý",
        )
    r.claimed_by = user.id
    r.claimed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(r)
    return r


async def release_claim(db: AsyncSession, recipe_id: uuid.UUID, user: User) -> Recipe:
    r = await _get_recipe_or_404(db, recipe_id)
    if r.claimed_by is None:
        return r  # already free — idempotent
    is_admin = roles.role_at_least(user.role, roles.ADMIN)
    if r.claimed_by != user.id and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ người đang xử lý hoặc admin mới được nhả",
        )
    r.claimed_by = None
    r.claimed_at = None
    await db.commit()
    await db.refresh(r)
    return r
```

- [ ] **Step 5: Gate + clear in `collaborator_approve` / `collaborator_reject`**

Replace the existing `collaborator_approve` and `collaborator_reject` (currently lines 772-788) with versions that take `user`, enforce the claim, and clear it:

```python
async def collaborator_approve(db: AsyncSession, recipe_id: uuid.UUID, user: User) -> Recipe:
    r = await _get_recipe_or_404(db, recipe_id)
    _assert_status(r, ("pending_collaborator",), "CTV duyệt")
    _assert_claimer(r, user, "duyệt")
    r.status = "pending_admin"
    r.claimed_by = None
    r.claimed_at = None
    await db.commit()
    await db.refresh(r)
    return r


async def collaborator_reject(db: AsyncSession, recipe_id: uuid.UUID, user: User, reason: str) -> Recipe:
    r = await _get_recipe_or_404(db, recipe_id)
    _assert_status(r, ("pending_collaborator",), "CTV từ chối")
    _assert_claimer(r, user, "từ chối")
    r.status = "rejected"
    r.reject_reason = reason
    r.claimed_by = None
    r.claimed_at = None
    await db.commit()
    await db.refresh(r)
    return r
```

- [ ] **Step 6: Clear the claim in `withdraw_recipe`**

In `withdraw_recipe` (currently lines 761-769), add the two clear lines after setting status to `private`:

```python
async def withdraw_recipe(db: AsyncSession, recipe_id: uuid.UUID, user: User) -> Recipe:
    r = await _get_recipe_or_404(db, recipe_id)
    if r.author_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Không có quyền")
    _assert_status(r, ("pending_collaborator",), "thu hồi")
    r.status = "private"
    r.claimed_by = None
    r.claimed_at = None
    await db.commit()
    await db.refresh(r)
    return r
```

- [ ] **Step 7: Surface `claimed_by_name` from the card builder + queue**

Change `_build_recipe_card_with_status` (currently lines 569-592) to accept an optional name and pass it through:

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
    )
```

Then update `list_review_queue` (currently lines 876-899) so it resolves claimer names and passes them in. Replace the body from the `rows = (...)` line through the `cards = [...]` line with:

```python
    rows = (await db.execute(
        base.order_by(Recipe.updated_at.asc()).offset((page - 1) * limit).limit(limit)
    )).all()
    claimer_ids = {r[0].claimed_by for r in rows if r[0].claimed_by is not None}
    name_map: dict[uuid.UUID, str | None] = {}
    if claimer_ids:
        name_rows = (await db.execute(
            select(User.id, User.full_name).where(User.id.in_(claimer_ids))
        )).all()
        name_map = {uid: full_name for uid, full_name in name_rows}
    cards = [
        _build_recipe_card_with_status(r[0], r[1], name_map.get(r[0].claimed_by))
        for r in rows
    ]
```

(The other two callers — `get_pending_recipes` and `get_my_recipes` — call `_build_recipe_card_with_status(r[0], r[1])` with two args; the new third param defaults to `None`, so they are unaffected. Leave them as-is.)

- [ ] **Step 8: Smoke-check the service imports/compile**

Run:
```powershell
cd backend; .venv\Scripts\python -c "import app.services.recipe_service, app.api.v1.recipes, app.schemas.recipe; print('ok')"
```
Expected: `ok` (no ImportError / SyntaxError). The routes still call `collaborator_approve(db, recipe_id)` here — that mismatch is fixed in Task 3, and this check only imports modules, so it passes.

- [ ] **Step 9: Commit**

```powershell
cd backend; git add app/schemas/recipe.py app/services/recipe_service.py; git commit -m "feat(rbac-sp3): claim/release service + claim gate on approve/reject + clear-on-transition + queue claimer name"
```

---

## Task 3: Routes — claim/release + pass acting user to approve/reject

**Files:**
- Modify: `backend/app/api/v1/recipes.py`

- [ ] **Step 1: Pass `current_user` into approve/reject**

In `backend/app/api/v1/recipes.py`, replace the two existing routes `collaborator_approve_route` (lines 186-193) and `collaborator_reject_route` (lines 196-204) with versions that capture the acting user (rename the injected `_` to `current_user`) and forward it:

```python
@router.post("/{recipe_id}/review/approve")
async def collaborator_approve_route(
    recipe_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_collaborator),
):
    r = await recipe_service.collaborator_approve(db, recipe_id, current_user)
    return {"success": True, "data": {"id": str(r.id), "status": r.status}, "message": "CTV đã duyệt"}


@router.post("/{recipe_id}/review/reject")
async def collaborator_reject_route(
    recipe_id: uuid.UUID,
    body: RejectBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_collaborator),
):
    r = await recipe_service.collaborator_reject(db, recipe_id, current_user, body.reason)
    return {"success": True, "data": {"id": str(r.id), "status": r.status}, "message": "CTV đã từ chối"}
```

- [ ] **Step 2: Add the claim + release routes**

In the same file, add these two routes immediately after `collaborator_reject_route` (i.e. before `admin_publish_route`). They must stay above the `/{recipe_id}` GET route so the static `/review/...` paths are matched first:

```python
@router.post("/{recipe_id}/review/claim")
async def claim_recipe_route(
    recipe_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_collaborator),
):
    r = await recipe_service.claim_recipe(db, recipe_id, current_user)
    return {
        "success": True,
        "data": {"id": str(r.id), "status": r.status,
                 "claimed_by": str(r.claimed_by) if r.claimed_by else None},
        "message": "Đã nhận xử lý",
    }


@router.post("/{recipe_id}/review/release")
async def release_claim_route(
    recipe_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_collaborator),
):
    r = await recipe_service.release_claim(db, recipe_id, current_user)
    return {
        "success": True,
        "data": {"id": str(r.id),
                 "claimed_by": str(r.claimed_by) if r.claimed_by else None},
        "message": "Đã nhả công thức",
    }
```

- [ ] **Step 3: Verify the app imports cleanly**

Run:
```powershell
cd backend; .venv\Scripts\python -c "from app.main import app; print([r.path for r in app.routes if 'review' in r.path])"
```
Expected: list includes `/api/v1/recipes/{recipe_id}/review/approve`, `/review/reject`, `/review/claim`, `/review/release`, `/review/queue/collaborator`, `/review/queue/admin`.

- [ ] **Step 4: Commit**

```powershell
cd backend; git add app/api/v1/recipes.py; git commit -m "feat(rbac-sp3): claim/release routes + pass acting user to approve/reject"
```

---

## Task 4: End-to-end smoke (self-cleaning) + final verify

**Files:**
- Create then delete: `backend/_smoke_sp3.py`

- [ ] **Step 1: Write the smoke script**

Create `backend/_smoke_sp3.py`:

```python
"""SP3 claim-lock smoke — self-cleaning. Run from backend/ with the venv python.

Exercises claim/release/approve/reject gate + clear-on-transition + queue name,
against temp users (collab A, collab B, admin) and a temp pending_collaborator
recipe. Deletes all temp rows in a finally block.
"""
import asyncio
import uuid

from fastapi import HTTPException
from sqlalchemy import delete

from app.core.database import AsyncSessionLocal
from app.models.recipe import Recipe, RecipeIngredient, RecipeStep
from app.models.user import User
from app.services import recipe_service as svc

SUFFIX = uuid.uuid4().hex[:8]


def _user(role: str, name: str) -> User:
    return User(
        id=uuid.uuid4(),
        email=f"sp3_{role}_{SUFFIX}@test.local",
        hashed_password="x",
        full_name=name,
        role=role,
        is_active=True,
    )


async def _seed_recipe(db, author_id) -> uuid.UUID:
    rid = uuid.uuid4()
    db.add(Recipe(
        id=rid, title=f"SP3 smoke dish {SUFFIX}", source="user",
        status="pending_collaborator", author_id=author_id,
    ))
    await db.flush()
    db.add(RecipeIngredient(id=uuid.uuid4(), recipe_id=rid, display_text="x", order_index=0))
    db.add(RecipeStep(id=uuid.uuid4(), recipe_id=rid, step_number=1, content="x"))
    await db.commit()
    return rid


async def _reset_pending(db, rid, author_id):
    r = await svc._get_recipe_or_404(db, rid)
    r.status = "pending_collaborator"
    r.claimed_by = None
    r.claimed_at = None
    r.author_id = author_id
    await db.commit()


def check(cond, msg):
    print(("PASS" if cond else "FAIL"), "-", msg)
    assert cond, msg


async def main():
    async with AsyncSessionLocal() as db:
        collab_a = _user("collaborator", "Collab A")
        collab_b = _user("collaborator", "Collab B")
        admin = _user("admin", "Admin Z")
        owner = _user("user", "Owner O")
        db.add_all([collab_a, collab_b, admin, owner])
        await db.commit()

        rid = await _seed_recipe(db, owner.id)
        recipe_ids = [rid]
        try:
            # 1. A claims
            r = await svc.claim_recipe(db, rid, collab_a)
            check(r.claimed_by == collab_a.id, "A claims -> claimed_by == A")

            # 2. B claims same -> 409
            try:
                await svc.claim_recipe(db, rid, collab_b); check(False, "B claim should 409")
            except HTTPException as e:
                check(e.status_code == 409, "B claim blocked 409")

            # 3. B approves -> 403
            try:
                await svc.collaborator_approve(db, rid, collab_b); check(False, "B approve should 403")
            except HTTPException as e:
                check(e.status_code == 403, "B approve blocked 403")

            # 4. A approves -> pending_admin + claim cleared
            r = await svc.collaborator_approve(db, rid, collab_a)
            check(r.status == "pending_admin" and r.claimed_by is None, "A approves -> pending_admin, claim cleared")

            # 5. release transfers lock: reset, A claims, A releases, B claims
            await _reset_pending(db, rid, owner.id)
            await svc.claim_recipe(db, rid, collab_a)
            r = await svc.release_claim(db, rid, collab_a)
            check(r.claimed_by is None, "A releases -> claim cleared")
            r = await svc.claim_recipe(db, rid, collab_b)
            check(r.claimed_by == collab_b.id, "B claims after release")

            # 6. admin force-releases B's claim
            r = await svc.release_claim(db, rid, admin)
            check(r.claimed_by is None, "admin force-release -> cleared")

            # 7. approve-without-claim: collaborator 409, admin bypass ok
            await _reset_pending(db, rid, owner.id)
            try:
                await svc.collaborator_approve(db, rid, collab_a); check(False, "approve-without-claim should 409")
            except HTTPException as e:
                check(e.status_code == 409, "collaborator approve-without-claim 409")
            r = await svc.collaborator_approve(db, rid, admin)
            check(r.status == "pending_admin", "admin approve-without-claim bypass ok")

            # 8. withdraw clears claim
            await _reset_pending(db, rid, owner.id)
            await svc.claim_recipe(db, rid, collab_a)
            r = await svc.withdraw_recipe(db, rid, owner)
            check(r.status == "private" and r.claimed_by is None, "withdraw -> private, claim cleared")

            # 9. queue shows claimed_by_name
            await _reset_pending(db, rid, owner.id)
            await svc.claim_recipe(db, rid, collab_a)
            cards, _ = await svc.list_review_queue(db, "collaborator", page=1, limit=50)
            mine = [c for c in cards if c.id == rid]
            check(len(mine) == 1 and mine[0].claimed_by_name == "Collab A", "queue card shows claimed_by_name == 'Collab A'")

            print("\nALL SP3 SMOKE CHECKS PASSED")
        finally:
            async with AsyncSessionLocal() as cdb:
                await cdb.execute(delete(RecipeStep).where(RecipeStep.recipe_id.in_(recipe_ids)))
                await cdb.execute(delete(RecipeIngredient).where(RecipeIngredient.recipe_id.in_(recipe_ids)))
                await cdb.execute(delete(Recipe).where(Recipe.id.in_(recipe_ids)))
                await cdb.execute(delete(User).where(User.id.in_([collab_a.id, collab_b.id, admin.id, owner.id])))
                await cdb.commit()


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 2: Run the smoke**

Run:
```powershell
cd backend; .venv\Scripts\python _smoke_sp3.py
```
Expected: every line prints `PASS - ...` and the script ends with `ALL SP3 SMOKE CHECKS PASSED`. If any line prints `FAIL`, fix the implementation (not the test) and re-run.

- [ ] **Step 3: Delete the smoke script**

```powershell
cd backend; Remove-Item _smoke_sp3.py
```

- [ ] **Step 4: Confirm no temp rows leaked**

Run:
```powershell
cd backend; .venv\Scripts\python -c "import asyncio; from sqlalchemy import text; from app.core.database import AsyncSessionLocal; \
async def m():\
 async with AsyncSessionLocal() as s:\
  r=await s.execute(text(\"select count(*) from users where email like 'sp3_%@test.local'\"));\
  print('leftover users:', r.scalar_one())\
asyncio.run(m())"
```
Expected: `leftover users: 0`

- [ ] **Step 5: Commit (smoke deletion is a no-op in git; commit nothing or note completion)**

The smoke script was never committed, so there is nothing to add. Verify a clean tree for the backend app code:
```powershell
git status --short
```
Expected: no `_smoke_sp3.py`, no stray files; only previously committed SP3 changes present.

---

## Self-Review (completed by plan author)

**1. Spec coverage:**
- Data model (`claimed_by`/`claimed_at`, migration 0014) → Task 1. ✓
- `claim_recipe` (status check, already-claimed 409, idempotent re-claim, admin bypass) → Task 2 Step 4. ✓
- `release_claim` (idempotent when free, claimer-or-admin 403) → Task 2 Step 4. ✓
- Claim gate on approve/reject (admin bypass, 409 unclaimed, 403 other-claimer) + clear on success → Task 2 Steps 3, 5. ✓
- Clear claim on withdraw → Task 2 Step 6. ✓
- `claimed_by_name` on `RecipeCardWithStatus` + populate in collaborator queue, None elsewhere → Task 2 Steps 1, 7. ✓
- Routes `/review/claim` + `/review/release`; approve/reject pass user → Task 3. ✓
- Error semantics (409/403 with the exact vi messages) → matched in Task 2 helper + functions. ✓
- Smoke covering the 9 spec scenarios → Task 4. ✓
- Out of scope (reviewer UI / portal / switcher = SP5) → no tasks here. ✓

**2. Placeholder scan:** No TBD/TODO; every code step shows full code; every command has expected output. ✓

**3. Type consistency:** `claim_recipe`/`release_claim`/`collaborator_approve`/`collaborator_reject` signatures used in Task 4 smoke and Task 3 routes match Task 2 definitions (all take `db, recipe_id, user[, reason]`). `_assert_claimer(recipe, user, action)` consistent. `_build_recipe_card_with_status(recipe, author, claimed_by_name=None)` — third arg optional, existing 2-arg callers unaffected. `claimed_by_name` field name identical in schema, builder, and smoke assertion. ✓
