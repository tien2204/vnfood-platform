# Scope /recipes to 103 Dishes + Variants (P2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Narrow `/recipes` (and recognize suggestion top-ups) from all 2,806 canonical recipes down to the ~521 belonging to the 103 AI dishes + their variants (+ user recipes), and make the category chips filter by the 8 dish groups.

**Architecture:** Tag every recipe with a new nullable `ai_class_slug` column (its parent 103-class, via exact-slug or accent-sensitive title-prefix), backfilled once. Browse/search/featured queries restrict the default pool to `(is_canonical AND ai_class_slug IS NOT NULL) OR source='user'`. A new `group` param filters by the 8 `GROUP_CLASSES` groups (`ai_class_slug IN slugs_for_group(group)`); frontend chips switch from `keyword` to `group`.

**Tech Stack:** FastAPI (Python 3.11, pytest, Alembic, async SQLAlchemy), PostgreSQL, Next.js 16 + TS frontend. Backend venv python = `.venv/Scripts/python` (run from `backend/`). DB is up (docker). Session factory: `AsyncSessionLocal` (`app.core.database`).

**Spec:** `docs/superpowers/specs/2026-06-17-scope-recipes-to-103-design.md`

---

## File Structure

**Backend (`backend/`):**
- Modify `app/ai/class_names.py` — add group helpers + `resolve_ai_class()` mapping.
- Create `alembic/versions/0017_recipe_ai_class_slug.py` — add column + index.
- Modify `app/models/recipe.py` — add `ai_class_slug` column.
- Create `scripts/tag_ai_class_slug.py` — one-off backfill.
- Modify `app/services/recipe_service.py` — pool filter (3 sites) + `group` param + `and_` import.
- Modify `app/services/ai_service.py` — align `_in_recipes_page_pool()`.
- Modify `app/api/v1/recipes.py` — add `group` query param.
- Create `tests/test_recipe_class_mapping.py`.

**Frontend (`frontend/`):**
- Modify `app/recipes/RecipeBrowse.tsx` — chips + select → `group`.

All work on current branch `feat/monngonmoingay-restyle`.

## Verification commands
- Backend tests: from `backend/`, `.venv/Scripts/python -m pytest tests/<file> -v`
- Frontend typecheck: from `frontend/`, `npx tsc --noEmit`; lint: `node ./node_modules/eslint/bin/eslint.js <files>`

---

### Task 1: Group helpers + resolve_ai_class mapping (class_names.py)

**Files:**
- Modify: `backend/app/ai/class_names.py`
- Test: `backend/tests/test_recipe_class_mapping.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_recipe_class_mapping.py`:

```python
from app.ai import class_names as cn


def test_valid_groups():
    assert cn.VALID_GROUPS == {
        "BANH", "BUN_PHO", "COM", "MON_KHO_NUONG",
        "CANH_CHAO", "XOI", "GOI_CUON", "DAC_BIET",
    }


def test_slugs_for_group():
    s = cn.slugs_for_group("BUN_PHO")
    assert "pho" in s and "hu-tieu" in s
    assert cn.slugs_for_group("NOPE") == []


def test_group_of_slug():
    assert cn.GROUP_OF_SLUG["pho"] == "BUN_PHO"
    assert cn.GROUP_OF_SLUG["com-tam"] == "COM"


def test_resolve_exact_slug_wins():
    assert cn.resolve_ai_class("bất kể tiêu đề", "pho") == "pho"


def test_resolve_title_prefix_longest_match():
    assert cn.resolve_ai_class("Bánh mì chảo đặc biệt", None) == "banh-mi-chao"
    assert cn.resolve_ai_class("Bánh mì thịt nướng", None) == "banh-mi"
    assert cn.resolve_ai_class("Phở gà Hà Nội", None) == "pho"
    assert cn.resolve_ai_class("Bún chả cá Nha Trang", None) == "bun-cha-ca"


def test_resolve_accent_sensitive_no_false_positive():
    assert cn.resolve_ai_class("Phô mai que", None) is None


def test_resolve_none():
    assert cn.resolve_ai_class("Vịt kho củ cải mặn", None) is None
    assert cn.resolve_ai_class(None, None) is None
    assert cn.resolve_ai_class("", None) is None
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `backend/`): `.venv/Scripts/python -m pytest tests/test_recipe_class_mapping.py -v`
Expected: FAIL — `AttributeError: module 'app.ai.class_names' has no attribute 'VALID_GROUPS'`.

- [ ] **Step 3: Implement — append to END of `backend/app/ai/class_names.py`**

```python


# ── Group / class-mapping helpers (P2: scope /recipes to 103) ──────────────────
ALL_103_SLUGS: set[str] = set(CLASS_DISPLAY_NAMES.keys())
VALID_GROUPS: set[str] = set(GROUP_CLASSES.keys())

# slug → group (a few slugs live in two groups; first group wins).
GROUP_OF_SLUG: dict[str, str] = {}
for _grp, _slug_list in GROUP_CLASSES.items():
    for _slug in _slug_list:
        GROUP_OF_SLUG.setdefault(_slug, _grp)

# display name → slug, plus display names sorted longest-first so a more specific
# dish ("Bánh mì chảo") matches before a shorter prefix ("Bánh mì").
_DISPLAY_TO_SLUG: dict[str, str] = {}
for _slug, _disp in CLASS_DISPLAY_NAMES.items():
    _DISPLAY_TO_SLUG.setdefault(_disp, _slug)
_DISPLAY_NAMES_LONGEST_FIRST: list[str] = sorted(
    _DISPLAY_TO_SLUG.keys(), key=len, reverse=True
)


def slugs_for_group(group: str) -> list[str]:
    """All 103-class slugs belonging to a GROUP_CLASSES group ([] if unknown)."""
    return list(GROUP_CLASSES.get(group, []))


def resolve_ai_class(title: str | None, canonical_dish_slug: str | None) -> str | None:
    """Map a recipe to its parent 103-class slug, or None if outside the 103.

    1. exact canonical_dish_slug ∈ 103 → that slug.
    2. else title starts with a class display name (accent-sensitive,
       case-insensitive, longest name first) → that class.
    3. else None.
    """
    if canonical_dish_slug in ALL_103_SLUGS:
        return canonical_dish_slug
    t = (title or "").strip().lower()
    if not t:
        return None
    for name in _DISPLAY_NAMES_LONGEST_FIRST:
        if t.startswith(name.lower()):
            return _DISPLAY_TO_SLUG[name]
    return None
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `backend/`): `.venv/Scripts/python -m pytest tests/test_recipe_class_mapping.py -v`
Expected: PASS (7 tests). `.lower()` is accent-preserving so "Phô" never matches "Phở".

- [ ] **Step 5: Commit**

```bash
git add backend/app/ai/class_names.py backend/tests/test_recipe_class_mapping.py
git commit -m "feat(recipes): add group helpers + resolve_ai_class title mapping"
```

---

### Task 2: Migration + model column

**Files:**
- Create: `backend/alembic/versions/0017_recipe_ai_class_slug.py`
- Modify: `backend/app/models/recipe.py`

- [ ] **Step 1: Create the migration**

Create `backend/alembic/versions/0017_recipe_ai_class_slug.py`:

```python
"""add recipes.ai_class_slug (parent 103-class tag)

Revision ID: 0017
Revises: 0016
Create Date: 2026-06-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0017"
down_revision: Union[str, None] = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("recipes", sa.Column("ai_class_slug", sa.String(length=80), nullable=True))
    op.create_index("ix_recipes_ai_class_slug", "recipes", ["ai_class_slug"])


def downgrade() -> None:
    op.drop_index("ix_recipes_ai_class_slug", table_name="recipes")
    op.drop_column("recipes", "ai_class_slug")
```

- [ ] **Step 2: Add the column to the model**

In `backend/app/models/recipe.py`, find:

```python
    canonical_dish_slug: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
```

Add directly below it:

```python
    ai_class_slug: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
```

- [ ] **Step 3: Run the migration**

Run (from `backend/`): `.venv/Scripts/python -m alembic upgrade head`
Expected: applies `0017`, no error.

- [ ] **Step 4: Verify the column exists**

Run (from `backend/`):
```bash
.venv/Scripts/python -c "import asyncio; from sqlalchemy import text; from app.core.database import engine
async def m():
    async with engine.connect() as c:
        print((await c.execute(text(\"select column_name from information_schema.columns where table_name='recipes' and column_name='ai_class_slug'\"))).scalar())
asyncio.run(m())"
```
Expected: prints `ai_class_slug`.

- [ ] **Step 5: Commit**

```bash
git add backend/alembic/versions/0017_recipe_ai_class_slug.py backend/app/models/recipe.py
git commit -m "feat(recipes): add ai_class_slug column + migration 0017"
```

---

### Task 3: Backfill script + run

**Files:**
- Create: `backend/scripts/tag_ai_class_slug.py`

- [ ] **Step 1: Create the script**

Create `backend/scripts/tag_ai_class_slug.py`:

```python
"""One-off: backfill recipes.ai_class_slug = parent 103-class slug (or NULL).

Run from backend/:  .venv/Scripts/python scripts/tag_ai_class_slug.py
Idempotent — re-running only updates rows whose computed tag changed.
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from sqlalchemy import select  # noqa: E402

from app.ai.class_names import resolve_ai_class  # noqa: E402
from app.core.database import AsyncSessionLocal  # noqa: E402
from app.models.recipe import Recipe  # noqa: E402


async def main() -> None:
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(select(Recipe))).scalars().all()
        changed = 0
        tagged = 0
        for r in rows:
            slug = resolve_ai_class(r.title, r.canonical_dish_slug)
            if slug is not None:
                tagged += 1
            if r.ai_class_slug != slug:
                r.ai_class_slug = slug
                changed += 1
        await db.commit()
        print(f"updated {changed} rows; {tagged}/{len(rows)} now have ai_class_slug")


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 2: Run the backfill**

Run (from `backend/`): `.venv/Scripts/python scripts/tag_ai_class_slug.py`
Expected: prints `updated N rows; M/<total> now have ai_class_slug` with no error.

- [ ] **Step 3: Verify the in-scope canonical count is sensible (~521)**

Run (from `backend/`):
```bash
.venv/Scripts/python -c "import asyncio; from sqlalchemy import text; from app.core.database import engine
async def m():
    async with engine.connect() as c:
        async def q(s): return (await c.execute(text(s))).scalar()
        print('canonical in-scope:', await q(\"select count(*) from recipes where is_canonical and ai_class_slug is not null and status='approved'\"))
        print('phô-mai false positives:', await q(\"select count(*) from recipes where ai_class_slug is not null and title ilike 'Phô %'\"))
asyncio.run(m())"
```
Expected: `canonical in-scope` ≈ 500–540; `phô-mai false positives` = 0.

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/tag_ai_class_slug.py
git commit -m "feat(recipes): add + run ai_class_slug backfill script"
```

---

### Task 4: Pool filter + group param (recipe_service) + recognize alignment

**Files:**
- Modify: `backend/app/services/recipe_service.py`
- Modify: `backend/app/services/ai_service.py`

- [ ] **Step 1: Add `and_` + class-helper imports to recipe_service**

In `backend/app/services/recipe_service.py`, find:

```python
from sqlalchemy import ARRAY, String, bindparam, delete, func, or_, select, text, update
```

Replace with:

```python
from sqlalchemy import ARRAY, String, and_, bindparam, delete, func, or_, select, text, update
```

Then find:

```python
from app.core import roles
```

Add directly below it:

```python
from app.ai.class_names import VALID_GROUPS, slugs_for_group
```

- [ ] **Step 2: Tighten the `list_recipes` default pool + add `group` param**

In `list_recipes`, find:

```python
    cooking_method: Optional[str] = None,
    current_user: Optional[User] = None,
    show_all: bool = False,
) -> tuple[list[RecipeCardOut], PaginationOut]:
    limit = min(limit, 50)
    stmt = _base_approved_query()

    if not show_all:
        stmt = stmt.where(
            or_(Recipe.is_canonical.is_(True), Recipe.source == "user"),
            Recipe.is_dessert.is_(False),
        )

    if keyword:
        stmt = stmt.where(Recipe.keyword == keyword)
```

Replace with:

```python
    cooking_method: Optional[str] = None,
    group: Optional[str] = None,
    current_user: Optional[User] = None,
    show_all: bool = False,
) -> tuple[list[RecipeCardOut], PaginationOut]:
    limit = min(limit, 50)
    stmt = _base_approved_query()

    if not show_all:
        stmt = stmt.where(
            or_(
                and_(Recipe.is_canonical.is_(True), Recipe.ai_class_slug.isnot(None)),
                Recipe.source == "user",
            ),
            Recipe.is_dessert.is_(False),
        )

    if group in VALID_GROUPS:
        stmt = stmt.where(Recipe.ai_class_slug.in_(slugs_for_group(group)))
    if keyword:
        stmt = stmt.where(Recipe.keyword == keyword)
```

- [ ] **Step 3: Tighten the `search_recipes` default pool**

In `search_recipes`, find:

```python
    if not show_all:
        stmt = stmt.where(
            or_(Recipe.is_canonical.is_(True), Recipe.source == "user"),
            Recipe.is_dessert.is_(False),
        )

    if q:
```

Replace with:

```python
    if not show_all:
        stmt = stmt.where(
            or_(
                and_(Recipe.is_canonical.is_(True), Recipe.ai_class_slug.isnot(None)),
                Recipe.source == "user",
            ),
            Recipe.is_dessert.is_(False),
        )

    if q:
```

- [ ] **Step 4: Tighten the `get_featured_recipes` default pool**

In `get_featured_recipes`, find:

```python
    if not show_all:
        base = base.where(
            or_(Recipe.is_canonical.is_(True), Recipe.source == "user"),
            Recipe.is_dessert.is_(False),
        )
```

Replace with:

```python
    if not show_all:
        base = base.where(
            or_(
                and_(Recipe.is_canonical.is_(True), Recipe.ai_class_slug.isnot(None)),
                Recipe.source == "user",
            ),
            Recipe.is_dessert.is_(False),
        )
```

- [ ] **Step 5: Align recognize suggestion pool in ai_service**

In `backend/app/services/ai_service.py`, find:

```python
from sqlalchemy import func, or_, select
```

Replace with:

```python
from sqlalchemy import and_, func, or_, select
```

Then find:

```python
def _in_recipes_page_pool():
    """Restrict to the same recipe pool the /recipes page shows (the ~2.8k curated
    set): canonical dishes or user-submitted recipes. This excludes the bulk
    non-canonical Cookpad rows so suggestions only link to listable recipes."""
    return or_(Recipe.is_canonical.is_(True), Recipe.source == "user")
```

Replace with:

```python
def _in_recipes_page_pool():
    """Restrict to the same recipe pool the /recipes page shows: canonical recipes
    tagged to one of the 103 AI dishes (ai_class_slug) or user-submitted recipes."""
    return or_(
        and_(Recipe.is_canonical.is_(True), Recipe.ai_class_slug.isnot(None)),
        Recipe.source == "user",
    )
```

- [ ] **Step 6: Verify imports + no regression**

Run (from `backend/`): `.venv/Scripts/python -c "import app.services.recipe_service, app.services.ai_service; print('ok')"`
Expected: prints `ok`.
Run (from `backend/`): `.venv/Scripts/python -m pytest tests/ -q`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/recipe_service.py backend/app/services/ai_service.py
git commit -m "feat(recipes): scope browse pool to ai_class_slug + add group filter + align suggestions"
```

---

### Task 5: API `group` query param

**Files:**
- Modify: `backend/app/api/v1/recipes.py`

- [ ] **Step 1: Add the `group` query param to the list endpoint**

In `backend/app/api/v1/recipes.py`, in the `list_recipes` route, find:

```python
    cooking_method: Optional[str] = Query(default=None),
    show_all: bool = Query(default=False, description="Include non-canonical recipes (Cookpad pool)"),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    cards, pagination = await recipe_service.list_recipes(
        db,
        page=page, limit=limit,
        keyword=keyword, source=source, difficulty=difficulty,
        sort=sort, search=search, meal=meal,
        region=region, occasion=occasion, dish_type=dish_type, diet=diet,
        main_ingredient=main_ingredient, cooking_method=cooking_method,
        current_user=current_user, show_all=show_all,
    )
```

Replace with:

```python
    cooking_method: Optional[str] = Query(default=None),
    group: Optional[str] = Query(default=None, description="Filter by dish group (GROUP_CLASSES code)"),
    show_all: bool = Query(default=False, description="Include non-canonical recipes (Cookpad pool)"),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    cards, pagination = await recipe_service.list_recipes(
        db,
        page=page, limit=limit,
        keyword=keyword, source=source, difficulty=difficulty,
        sort=sort, search=search, meal=meal,
        region=region, occasion=occasion, dish_type=dish_type, diet=diet,
        main_ingredient=main_ingredient, cooking_method=cooking_method,
        group=group,
        current_user=current_user, show_all=show_all,
    )
```

- [ ] **Step 2: Verify import + manual endpoint sanity (DB up)**

Run (from `backend/`): `.venv/Scripts/python -c "import app.api.v1.recipes; print('ok')"`
Expected: prints `ok`.

Optionally, with the backend running, `GET /api/v1/recipes?group=BUN_PHO&limit=5` should return only phở/bún/hủ tiếu-type recipes, and `GET /api/v1/recipes` total ≈ 521. (Confirmed in Task 7 manual QA if not running now.)

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/v1/recipes.py
git commit -m "feat(recipes): add group query param to GET /recipes"
```

---

### Task 6: Frontend chips + select → group

**Files:**
- Modify: `frontend/app/recipes/RecipeBrowse.tsx`

- [ ] **Step 1: Replace the KEYWORDS array with group-coded CATEGORIES**

In `frontend/app/recipes/RecipeBrowse.tsx`, find:

```tsx
const KEYWORDS = [
  { label: "Tất cả", value: "" },
  { label: "Bánh", value: "Bánh" },
  { label: "Bún / Phở", value: "Bún" },
  { label: "Cơm", value: "Cơm" },
  { label: "Canh", value: "Canh" },
  { label: "Món Khô", value: "Thịt" },
  { label: "Xôi", value: "Xôi" },
  { label: "Gỏi Cuốn", value: "Gỏi" },
  { label: "Đặc Biệt", value: "Đặc biệt" },
];
```

Replace with:

```tsx
const CATEGORIES = [
  { label: "Tất cả", value: "" },
  { label: "Bánh", value: "BANH" },
  { label: "Bún / Phở", value: "BUN_PHO" },
  { label: "Cơm", value: "COM" },
  { label: "Canh", value: "CANH_CHAO" },
  { label: "Món Khô", value: "MON_KHO_NUONG" },
  { label: "Xôi", value: "XOI" },
  { label: "Gỏi Cuốn", value: "GOI_CUON" },
  { label: "Đặc Biệt", value: "DAC_BIET" },
];
```

- [ ] **Step 2: Read the `group` param instead of `keyword`**

In `RecipeBrowse.tsx`, find:

```tsx
  const keyword: string = searchParams.get("keyword") ?? "";
```

Replace with:

```tsx
  const group: string = searchParams.get("group") ?? "";
```

- [ ] **Step 3: Send `group` in the request + update effect deps**

In `RecipeBrowse.tsx`, find:

```tsx
    if (keyword) params.keyword = keyword;
    if (difficulty) params.difficulty = difficulty;
```

Replace with:

```tsx
    if (group) params.group = group;
    if (difficulty) params.difficulty = difficulty;
```

Then find:

```tsx
  }, [page, keyword, difficulty, sort, search, searchParams]);
```

Replace with:

```tsx
  }, [page, group, difficulty, sort, search, searchParams]);
```

- [ ] **Step 4: Update `hasFilters`**

In `RecipeBrowse.tsx`, find:

```tsx
  const hasFilters = keyword || difficulty || search || facetCount > 0;
```

Replace with:

```tsx
  const hasFilters = group || difficulty || search || facetCount > 0;
```

- [ ] **Step 5: Point the "Danh mục" select at group**

In `RecipeBrowse.tsx`, find:

```tsx
            <Select
              value={keyword}
              onValueChange={(v) => updateParam("keyword", v === "__all__" ? "" : v ?? "")}
            >
              <SelectTrigger className="h-8 w-36 rounded-lg border border-border bg-card text-sm">
                <SelectValue placeholder="Tất cả" />
              </SelectTrigger>
              <SelectContent>
                {KEYWORDS.map((k) => (
                  <SelectItem key={k.value} value={k.value || "__all__"}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
```

Replace with:

```tsx
            <Select
              value={group}
              onValueChange={(v) => updateParam("group", v === "__all__" ? "" : v ?? "")}
            >
              <SelectTrigger className="h-8 w-36 rounded-lg border border-border bg-card text-sm">
                <SelectValue placeholder="Tất cả" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((k) => (
                  <SelectItem key={k.value} value={k.value || "__all__"}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
```

- [ ] **Step 6: Point the chip row at group**

In `RecipeBrowse.tsx`, find:

```tsx
      {/* Keyword chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        {KEYWORDS.map((k) => {
          const active = keyword === k.value;
          return (
            <button
              key={k.value}
              onClick={() => updateParam("keyword", k.value)}
```

Replace with:

```tsx
      {/* Category (group) chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        {CATEGORIES.map((k) => {
          const active = group === k.value;
          return (
            <button
              key={k.value}
              onClick={() => updateParam("group", k.value)}
```

- [ ] **Step 7: Verify typecheck + lint**

Run (from `frontend/`):
```bash
npx tsc --noEmit && node ./node_modules/eslint/bin/eslint.js app/recipes/RecipeBrowse.tsx
```
Expected: tsc PASS; eslint prints nothing (no `keyword`/`KEYWORDS` left → no unused-var errors).

- [ ] **Step 8: Commit**

```bash
git add frontend/app/recipes/RecipeBrowse.tsx
git commit -m "feat(recipes): category chips + select filter by dish group"
```

---

### Task 7: Manual verification

**Files:** none.

- [ ] **Step 1: Backend tests + run servers**

From `backend/`: `.venv/Scripts/python -m pytest tests/ -q` → all pass.
Start backend (`.venv/Scripts/uvicorn app.main:app --reload --port 8000`) + frontend (`npm run dev`).

- [ ] **Step 2: /recipes default pool**

Open `http://localhost:3000/recipes`. Confirm the count ("X công thức") dropped from 2,806 to ~521, and unrelated dishes (vịt kho củ cải, ức gà quinoa) no longer appear.

- [ ] **Step 3: Group chips**

Click "Bún / Phở" → only phở/bún/hủ tiếu/mì quảng-type recipes. Click "Món Khô" → bò kho / cá kho / thịt kho-type recipes (not empty). Click "Đặc Biệt" → DAC_BIET dishes. Each chip and the "Danh mục" dropdown stay in sync (both write `?group=`).

- [ ] **Step 4: Recognize suggestions still in-pool**

On `/recognize`, recognize a phở image → the suggested recipes and "biến thể" all link to recipes that exist in the scoped /recipes pool (no Cookpad-only orphans).

- [ ] **Step 5: Final sweep**

Backend: `.venv/Scripts/python -m pytest tests/ -q` → pass. Frontend: `npx tsc --noEmit` → pass.

---

## Self-Review

**Spec coverage:**
- `ai_class_slug` column + index (migration) → Task 2. ✅
- Backfill rule (exact-slug → title-prefix longest → null) → Task 1 (`resolve_ai_class`) + Task 3 (script/run). ✅
- Group helpers `GROUP_OF_SLUG`/`slugs_for_group`/`VALID_GROUPS` → Task 1. ✅
- Pool filter `(is_canonical AND ai_class_slug NOT NULL) OR user` on list+search+featured → Task 4. ✅
- `group` param + filter → Task 4 (service) + Task 5 (API). ✅
- Align `_in_recipes_page_pool` → Task 4 Step 5. ✅
- Frontend chips + select → group → Task 6. ✅
- UGC always shown (source='user' branch retained) → Task 4. ✅
- Preserve `is_dessert=False` in all 3 filters → Task 4 (kept). ✅
- `keyword` param/by-keyword untouched → not modified. ✅

**Placeholder scan:** No TBD/TODO; all code blocks complete.

**Type consistency:** `resolve_ai_class(title, canonical_dish_slug)` signature consistent (Task 1 def, Task 3 call). `slugs_for_group`/`VALID_GROUPS` defined Task 1, used Task 4. `group` param name consistent across service (Task 4), API (Task 5), frontend param `?group=` (Task 6). Migration revision `0017`/down `0016` matches alembic head. Column name `ai_class_slug` identical across migration, model, script, filters. ✅
