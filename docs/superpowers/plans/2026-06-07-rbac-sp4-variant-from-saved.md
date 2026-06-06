# RBAC SP4 — Variant-from-Saved Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any logged-in user fork an existing recipe into a pre-filled private draft linked via `derived_from_recipe_id`, with two-way lineage display.

**Architecture:** Activate the dormant `recipes.derived_from_recipe_id` column. Backend: two optional `RecipeCreate` fields + create validation, and two read fields on `RecipeDetailOut` resolved in `get_recipe_detail`. Frontend: a `/recipes/[id]/variant` page reusing `RecipeForm`+`submitOverride`, entry buttons on saved cards + detail, and "Phỏng theo"/"Biến thể từ cộng đồng" sections. No migration.

**Tech Stack:** FastAPI, SQLAlchemy async, Pydantic; Next.js (modified — `frontend/AGENTS.md`: only existing patterns), SWR, axios (`lib/api`), sonner.

**Prerequisites:** Docker Postgres up. Backend venv `backend/.venv`. Branch `feat/canonical-recipes`.

**Reference facts (verified):**
- `recipes.derived_from_recipe_id` (UUID FK→recipes.id, `ON DELETE SET NULL`) exists in the live DB (migration 0006). `variant_label` (String 80) also exists. **No migration needed.**
- `recipe_service.py`: `create_recipe(db, data, author_id)` builds a `Recipe(...)` (source="user", status="private"); `get_recipe_detail(db, recipe_id, current_user)` returns `RecipeDetailOut(...)` and already resolves canonical `variants` via `_build_recipe_mini`; helper `_build_recipe_mini(recipe)` → `RecipeMiniOut(id,title,variant_label,image_url)`; imports `select`, `status`, `HTTPException`, `Recipe`.
- `schemas/recipe.py`: `RecipeCreate` (title/description/image_url/cooking_time/servings/difficulty/keyword/ingredients/steps); `RecipeDetailOut` (has `variants: list[RecipeMiniOut] = []`); `RecipeMiniOut`.
- `RecipeForm` (`components/recipes/RecipeForm.tsx`): props `{ initial?: Partial<RecipeDetail>; recipeId?: string; mode: "create"|"edit"; submitOverride?: (payload: RecipeCreate) => Promise<void> }`. `propose-new` uses `<RecipeForm mode="create" submitOverride={fn} />`; `propose-edit` uses `initial={recipe}`.
- `RecipeGrid` → `RecipeCard` (the card wraps everything in a `<Link href="/recipes/{id}">`; the author element uses `stopPropagation`+`router.push` to be clickable inside the link).
- Detail page `app/recipes/[id]/page.tsx` is a **server component**; it has `isLoggedIn`/`currentUserId` from the JWT cookie, renders `<RecipeDetailClient>` then `{recipe.variants?.length && <VariantsAccordion variants={recipe.variants} />}` at the end.
- `VariantsAccordion` (`components/recipes/VariantsAccordion.tsx`): `({ variants }: { variants: RecipeMini[] })`, header text hardcoded `Xem {variants.length} biến thể`.
- `lib/types.ts`: `RecipeCreate`, `RecipeDetail` (has `variants: RecipeMini[]`), `RecipeMini` (`id,title,variant_label,image_url`).

---

## File Structure

**Backend:**
- `app/schemas/recipe.py` — `RecipeCreate` += 2 create fields; `RecipeDetailOut` += 2 read fields.
- `app/services/recipe_service.py` — `create_recipe` validates+sets; `get_recipe_detail` resolves `derived_from`/`derived_variants`.
- `app/models/recipe.py` — align `derived_from_recipe_id` annotation to `ondelete="SET NULL"` (cosmetic).

**Frontend:**
- `lib/types.ts` — `RecipeCreate` + `RecipeDetail` field additions.
- `app/recipes/[id]/variant/page.tsx` — new variant page.
- `components/recipes/RecipeGrid.tsx` + `RecipeCard.tsx` — optional `showVariantAction` prop.
- `app/me/saved/page.tsx` — pass `showVariantAction`.
- `components/recipes/VariantsAccordion.tsx` — optional `title` prop.
- `app/recipes/[id]/page.tsx` — "Tạo biến thể" link + "Phỏng theo" + "Biến thể từ cộng đồng".

---

## Task 1: Backend — `RecipeCreate` fields + `create_recipe` validation

**Files:** `app/schemas/recipe.py`, `app/services/recipe_service.py`, `app/models/recipe.py`

- [ ] **Step 1: Add the two optional fields to `RecipeCreate`**

In `app/schemas/recipe.py`, `RecipeCreate` currently ends with `ingredients` + `steps`. Add two fields (after `keyword`, before `ingredients`):

```python
class RecipeCreate(BaseModel):
    title: str = Field(..., min_length=5, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    image_url: Optional[str] = None
    cooking_time: Optional[int] = Field(None, ge=1, le=600)
    servings: Optional[int] = Field(None, ge=1, le=50)
    difficulty: Optional[str] = None
    keyword: Optional[str] = None
    derived_from_recipe_id: Optional[uuid.UUID] = None
    variant_label: Optional[str] = Field(None, max_length=80)
    ingredients: list[IngredientCreate] = Field(..., min_length=1, max_length=50)
    steps: list[StepCreate] = Field(..., min_length=1, max_length=30)
```

(`uuid` is already imported at the top of `schemas/recipe.py`.)

- [ ] **Step 2: Set + validate in `create_recipe`**

In `app/services/recipe_service.py`, `create_recipe(db, data, author_id)` — add a source-existence check at the top and set the two fields on the `Recipe(...)`. The function currently starts by building `recipe = Recipe(id=..., title=..., ..., status="private", author_id=author_id)`. Change to:

```python
async def create_recipe(
    db: AsyncSession,
    data: RecipeCreate,
    author_id: uuid.UUID,
) -> Recipe:
    if data.derived_from_recipe_id is not None:
        src = (await db.execute(
            select(Recipe).where(Recipe.id == data.derived_from_recipe_id)
        )).scalar_one_or_none()
        if src is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Công thức gốc không tồn tại")
    recipe = Recipe(
        id=uuid.uuid4(),
        title=data.title,
        description=data.description,
        image_url=data.image_url,
        cooking_time=data.cooking_time,
        servings=data.servings,
        difficulty=data.difficulty,
        keyword=data.keyword,
        source="user",
        status="private",
        author_id=author_id,
        derived_from_recipe_id=data.derived_from_recipe_id,
        variant_label=data.variant_label,
    )
    db.add(recipe)
    await db.flush()
    # ... (the rest — ingredients/steps loops + commit/refresh — stays exactly as it is)
```
Keep the existing ingredients/steps insertion loops and `await db.commit(); await db.refresh(recipe); return recipe` unchanged.

- [ ] **Step 3: Align the model FK annotation (cosmetic)**

In `app/models/recipe.py`, the `derived_from_recipe_id` column (~line 57) is `ForeignKey("recipes.id")`. Change to match the live DB:
```python
    derived_from_recipe_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("recipes.id", ondelete="SET NULL"), nullable=True)
```

- [ ] **Step 4: Verify compile**

```powershell
cd backend; .venv\Scripts\python -c "import app.services.recipe_service, app.schemas.recipe, app.models.recipe; print('ok')"
```
Expected: `ok`

- [ ] **Step 5: Smoke the create path (self-cleaning)**

Create `backend/_smoke_sp4_create.py`:
```python
"""SP4 variant create smoke — self-cleaning."""
import asyncio
import uuid

from fastapi import HTTPException
from sqlalchemy import delete

from app.core.database import AsyncSessionLocal
from app.models.recipe import Recipe, RecipeIngredient, RecipeStep
from app.models.user import User
from app.schemas.recipe import RecipeCreate, IngredientCreate, StepCreate
from app.services import recipe_service as svc

SUFFIX = uuid.uuid4().hex[:8]


def check(c, m):
    print(("PASS" if c else "FAIL"), "-", m); assert c, m


def _payload(title, derived=None):
    return RecipeCreate(
        title=title, ingredients=[IngredientCreate(display_text="x", order_index=0)],
        steps=[StepCreate(step_number=1, content="x")],
        derived_from_recipe_id=derived, variant_label="Phiên bản của tôi" if derived else None,
    )


async def main():
    ids = []
    async with AsyncSessionLocal() as db:
        owner = User(id=uuid.uuid4(), email=f"sp4_{SUFFIX}@t.local", hashed_password="x", full_name="O", role="user", is_active=True)
        db.add(owner); await db.commit()
        try:
            source = await svc.create_recipe(db, _payload(f"Mon goc {SUFFIX}"), owner.id)
            ids.append(source.id)
            variant = await svc.create_recipe(db, _payload(f"Bien the {SUFFIX}", derived=source.id), owner.id)
            ids.append(variant.id)
            check(variant.derived_from_recipe_id == source.id, "variant.derived_from == source")
            check(variant.variant_label == "Phiên bản của tôi", "variant_label set")
            check(variant.status == "private", "variant is private")
            try:
                await svc.create_recipe(db, _payload("Bogus", derived=uuid.uuid4()), owner.id); check(False, "bogus derived should 404")
            except HTTPException as e:
                check(e.status_code == 404, "bogus derived_from -> 404")
            print("\nALL SP4 CREATE SMOKE PASSED")
        finally:
            async with AsyncSessionLocal() as c:
                await c.execute(delete(RecipeStep).where(RecipeStep.recipe_id.in_(ids)))
                await c.execute(delete(RecipeIngredient).where(RecipeIngredient.recipe_id.in_(ids)))
                await c.execute(delete(Recipe).where(Recipe.id.in_(ids)))
                await c.execute(delete(User).where(User.id == owner.id))
                await c.commit()


if __name__ == "__main__":
    asyncio.run(main())
```
Run: `cd backend; .venv\Scripts\python _smoke_sp4_create.py` → expect all PASS + `ALL SP4 CREATE SMOKE PASSED`. If FAIL, fix implementation (not the test). Then delete: `cd backend; Remove-Item _smoke_sp4_create.py`.

- [ ] **Step 6: Commit**

```powershell
cd backend; git add app/schemas/recipe.py app/services/recipe_service.py app/models/recipe.py; git commit -m "feat(rbac-sp4): RecipeCreate derived_from/variant_label + create validation"
```

---

## Task 2: Backend — `RecipeDetailOut` lineage + `get_recipe_detail`

**Files:** `app/schemas/recipe.py`, `app/services/recipe_service.py`

- [ ] **Step 1: Add the two read fields to `RecipeDetailOut`**

In `app/schemas/recipe.py`, `RecipeDetailOut` already has `variants: list[RecipeMiniOut] = []`. Add (right after that line):
```python
    derived_from: Optional["RecipeMiniOut"] = None
    derived_variants: list[RecipeMiniOut] = []
```
(`RecipeMiniOut` is defined earlier in the file, so a plain `Optional[RecipeMiniOut] = None` works without quotes — use whichever the file's style prefers; both resolve.)

- [ ] **Step 2: Resolve lineage in `get_recipe_detail`**

In `app/services/recipe_service.py`, `get_recipe_detail` builds `variants` then returns `RecipeDetailOut(...)`. Just before the `return RecipeDetailOut(`, add:

```python
    # SP4 lineage
    derived_from = None
    if recipe.derived_from_recipe_id:
        src = (await db.execute(
            select(Recipe).where(Recipe.id == recipe.derived_from_recipe_id)
        )).scalar_one_or_none()
        if src is not None:
            derived_from = _build_recipe_mini(src)

    derived_variant_rows = (await db.execute(
        select(Recipe).where(
            Recipe.derived_from_recipe_id == recipe.id,
            Recipe.status == "approved",
        ).limit(20)
    )).scalars().all()
    derived_variants = [_build_recipe_mini(r) for r in derived_variant_rows]
```

Then add to the `RecipeDetailOut(...)` constructor (next to `variants=variants,`):
```python
        derived_from=derived_from,
        derived_variants=derived_variants,
```

- [ ] **Step 3: Verify compile**

```powershell
cd backend; .venv\Scripts\python -c "import app.services.recipe_service, app.schemas.recipe; print('ok')"
```
Expected: `ok`

- [ ] **Step 4: Smoke the detail lineage (self-cleaning)**

Create `backend/_smoke_sp4_detail.py`:
```python
"""SP4 detail lineage smoke — self-cleaning."""
import asyncio
import uuid

from sqlalchemy import delete

from app.core.database import AsyncSessionLocal
from app.models.recipe import Recipe, RecipeIngredient, RecipeStep
from app.models.user import User
from app.schemas.recipe import RecipeCreate, IngredientCreate, StepCreate
from app.services import recipe_service as svc

SUFFIX = uuid.uuid4().hex[:8]


def check(c, m):
    print(("PASS" if c else "FAIL"), "-", m); assert c, m


def _payload(title, derived=None):
    return RecipeCreate(
        title=title, ingredients=[IngredientCreate(display_text="x", order_index=0)],
        steps=[StepCreate(step_number=1, content="x")], derived_from_recipe_id=derived,
    )


async def main():
    ids = []
    async with AsyncSessionLocal() as db:
        owner = User(id=uuid.uuid4(), email=f"sp4d_{SUFFIX}@t.local", hashed_password="x", full_name="O", role="user", is_active=True)
        db.add(owner); await db.commit()
        try:
            # source must be approved to be visible in detail to the owner anyway; set approved
            source = await svc.create_recipe(db, _payload(f"Goc {SUFFIX}"), owner.id)
            ids.append(source.id)
            src = await svc._get_recipe_or_404(db, source.id); src.status = "approved"; await db.commit()
            variant = await svc.create_recipe(db, _payload(f"Bien the {SUFFIX}", derived=source.id), owner.id)
            ids.append(variant.id)

            # variant detail shows derived_from
            vd = await svc.get_recipe_detail(db, variant.id, owner)
            check(vd.derived_from is not None and vd.derived_from.id == source.id, "variant detail.derived_from == source")

            # private variant NOT listed on source
            sd = await svc.get_recipe_detail(db, source.id, owner)
            check(all(dv.id != variant.id for dv in sd.derived_variants), "private variant excluded from source.derived_variants")

            # approve variant -> appears on source
            v = await svc._get_recipe_or_404(db, variant.id); v.status = "approved"; await db.commit()
            sd2 = await svc.get_recipe_detail(db, source.id, owner)
            check(any(dv.id == variant.id for dv in sd2.derived_variants), "approved variant listed in source.derived_variants")

            print("\nALL SP4 DETAIL SMOKE PASSED")
        finally:
            async with AsyncSessionLocal() as c:
                await c.execute(delete(RecipeStep).where(RecipeStep.recipe_id.in_(ids)))
                await c.execute(delete(RecipeIngredient).where(RecipeIngredient.recipe_id.in_(ids)))
                await c.execute(delete(Recipe).where(Recipe.id.in_(ids)))
                await c.execute(delete(User).where(User.id == owner.id))
                await c.commit()


if __name__ == "__main__":
    asyncio.run(main())
```
Run: `cd backend; .venv\Scripts\python _smoke_sp4_detail.py` → expect all PASS + `ALL SP4 DETAIL SMOKE PASSED`. If FAIL, fix implementation. Then delete: `cd backend; Remove-Item _smoke_sp4_detail.py`.

- [ ] **Step 5: Commit**

```powershell
cd backend; git add app/schemas/recipe.py app/services/recipe_service.py; git commit -m "feat(rbac-sp4): expose derived_from + approved derived_variants on recipe detail"
```

---

## Task 3: Frontend types + variant page

**Files:** `lib/types.ts`, `app/recipes/[id]/variant/page.tsx` (new)

- [ ] **Step 1: Update types**

In `lib/types.ts`:
- In `RecipeCreate`, add: `derived_from_recipe_id?: string;` and `variant_label?: string;`.
- In `RecipeDetail`, add: `derived_from?: RecipeMini | null;` and `derived_variants?: RecipeMini[];`.

- [ ] **Step 2: Create the variant page**

Create `app/recipes/[id]/variant/page.tsx`:
```tsx
"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import RecipeForm from "@/components/recipes/RecipeForm";
import api from "@/lib/api";
import type { ApiResponse, RecipeDetail, RecipeCreate } from "@/lib/types";

export default function VariantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [source, setSource] = useState<RecipeDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [label, setLabel] = useState("Phiên bản của tôi");

  useEffect(() => {
    api.get<ApiResponse<RecipeDetail>>(`/recipes/${id}`)
      .then((r) => setSource(r.data.data))
      .catch(() => setFailed(true));
  }, [id]);

  async function submit(payload: RecipeCreate) {
    await api.post("/recipes", { ...payload, derived_from_recipe_id: id, variant_label: label || undefined });
    toast.success("Đã tạo biến thể (riêng tư) — bấm Gửi duyệt để đăng");
    router.push("/me/recipes");
  }

  if (failed) return <p className="p-8 text-[#7C6A56]">Không tải được công thức gốc. <a href="/recipes" className="text-[#E85D26] underline">Quay lại</a></p>;
  if (!source) return <p className="p-8 text-[#7C6A56]">Đang tải…</p>;

  return (
    <main className="min-h-screen bg-[#FFFBF5] py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-bold text-[#1C1209] mb-1">Tạo biến thể</h1>
        <p className="text-sm text-[#7C6A56] mb-4">Phỏng theo: {source.title}</p>
        <div className="mb-4">
          <label className="block text-sm text-[#7C6A56] mb-1">Nhãn biến thể</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={80}
            placeholder="VD: Phiên bản ít béo"
            className="w-full border border-[#E8DDD4] rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <RecipeForm initial={source} mode="create" submitOverride={submit} />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Typecheck**

```powershell
cd frontend; npx tsc --noEmit
```
Expected: 0 errors (the pre-existing 5 were fixed in SP5; the tree is clean). Fix anything new you introduce.

- [ ] **Step 4: Commit**

```powershell
cd frontend; git add lib/types.ts "app/recipes/[id]/variant/page.tsx"; git commit -m "feat(rbac-sp4): variant create page (pre-filled form + lineage) + types"
```

---

## Task 4: Frontend entry buttons + detail lineage display

**Files:** `components/recipes/RecipeGrid.tsx`, `components/recipes/RecipeCard.tsx`, `app/me/saved/page.tsx`, `components/recipes/VariantsAccordion.tsx`, `app/recipes/[id]/page.tsx`

- [ ] **Step 1: Thread `showVariantAction` through `RecipeGrid`**

In `components/recipes/RecipeGrid.tsx`, add the prop and pass it down:
```tsx
interface Props {
  recipes?: RecipeCardType[];
  loading?: boolean;
  skeletonCount?: number;
  onSaveChange?: (recipeId: string, isSaved: boolean, saveCount: number) => void;
  showVariantAction?: boolean;
}

export default function RecipeGrid({
  recipes,
  loading,
  skeletonCount = 8,
  onSaveChange,
  showVariantAction,
}: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
      {loading
        ? Array.from({ length: skeletonCount }).map((_, i) => (
            <RecipeCardSkeleton key={i} />
          ))
        : recipes?.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              showVariantAction={showVariantAction}
              onSaveChange={
                onSaveChange
                  ? (isSaved, saveCount) =>
                      onSaveChange(recipe.id, isSaved, saveCount)
                  : undefined
              }
            />
          ))}
    </div>
  );
}
```

- [ ] **Step 2: Add the variant action to `RecipeCard`**

In `components/recipes/RecipeCard.tsx`: add `showVariantAction?: boolean;` to `Props`, destructure it, and render a "Tạo biến thể" button inside the bottom content area. Because the whole card is a `<Link>`, the button must `preventDefault`+`stopPropagation` then `router.push` (mirroring the existing author element). Add this just after the author `<div className="mt-auto">…</div>` block, still inside the content `<div className="p-4 …">`:

```tsx
          {showVariantAction && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                router.push(`/recipes/${recipe.id}/variant`);
              }}
              className="mt-3 w-full text-center text-xs font-medium border-2 border-[#2c1810] bg-[#fff5e6] text-[#2c1810] py-1.5 hover:bg-[#ff6b35] hover:text-white transition-colors"
            >
              Tạo biến thể
            </button>
          )}
```
Update the destructure: `export default function RecipeCard({ recipe, onSaveChange, showVariantAction }: Props) {`.

- [ ] **Step 3: Enable it on the saved page**

In `app/me/saved/page.tsx`, pass the prop to the grid:
```tsx
          <RecipeGrid
            recipes={recipes}
            loading={isLoading}
            skeletonCount={PAGE_SIZE}
            onSaveChange={handleSaveChange}
            showVariantAction
          />
```

- [ ] **Step 4: Add an optional `title` to `VariantsAccordion`**

In `components/recipes/VariantsAccordion.tsx`, accept an optional title and use it for the toggle label:
```tsx
export function VariantsAccordion({ variants, title }: { variants: RecipeMini[]; title?: string }) {
  const [open, setOpen] = useState(false);
  if (variants.length === 0) return null;
```
And change the toggle `<span>` text:
```tsx
        <span>{title ?? `Xem ${variants.length} biến thể`}</span>
```
(Everything else in the component stays the same.)

- [ ] **Step 5: Add lineage display + "Tạo biến thể" to the detail page**

In `app/recipes/[id]/page.tsx`:

(a) **"Phỏng theo" link** — inside the header block, replace the canonical/review badges block so it also renders the source link. After the existing `{(recipe.is_canonical || ...) && (...)}` block (ends ~line 210), add:
```tsx
        {recipe.derived_from && (
          <p className="text-sm text-[#7C6A56] mb-4">
            Phỏng theo:{" "}
            <Link href={`/recipes/${recipe.derived_from.id}`} className="text-[#E85D26] underline">
              {recipe.derived_from.title}
            </Link>
          </p>
        )}
```

(b) **"Tạo biến thể" button** — for logged-in users. Right after the `<RecipeDetailClient ... />` element (~line 353), add:
```tsx
      {isLoggedIn && (
        <div className="mt-6">
          <Link
            href={`/recipes/${id}/variant`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#E85D26] text-[#E85D26] text-sm font-medium hover:bg-[#E85D26] hover:text-white transition-colors"
          >
            Tạo biến thể
          </Link>
        </div>
      )}
```

(c) **"Biến thể từ cộng đồng"** — after the existing canonical variants accordion (the `{recipe.variants && ...}` block at the end), add:
```tsx
      {recipe.derived_variants && recipe.derived_variants.length > 0 && (
        <VariantsAccordion variants={recipe.derived_variants} title="Biến thể từ cộng đồng" />
      )}
```

- [ ] **Step 6: Typecheck**

```powershell
cd frontend; npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 7: Commit**

```powershell
cd frontend; git add components/recipes/RecipeGrid.tsx components/recipes/RecipeCard.tsx app/me/saved/page.tsx components/recipes/VariantsAccordion.tsx "app/recipes/[id]/page.tsx"; git commit -m "feat(rbac-sp4): variant entry buttons (saved + detail) + Phỏng theo / Biến thể từ cộng đồng display"
```

---

## Task 5: Build verification + session-state

**Files:** none (verification) + `.claude/session-state.md`

- [ ] **Step 1: Full typecheck + production build**

```powershell
cd frontend; npx tsc --noEmit; npm run build
```
Expected: tsc 0 errors; build succeeds. Fix anything that surfaces.

- [ ] **Step 2: Backend imports sanity**

```powershell
cd backend; .venv\Scripts\python -c "from app.main import app; print('ok')"
```
Expected: `ok`.

- [ ] **Step 3: Manual click-through (record results)**

Start backend + frontend. As a logged-in user:
- `/me/saved` → a saved card shows "Tạo biến thể" → click → form pre-filled with the source's content + a "Nhãn biến thể" field → edit + Save → toast → lands on `/me/recipes` with a new private draft.
- Open the new draft → Gửi duyệt → (as collaborator/admin, approve through the pipeline) → it becomes approved.
- Open the **source** recipe detail → "Biến thể từ cộng đồng" lists the approved variant; open the **variant** → shows "Phỏng theo: [source]".
- On any recipe detail (logged-in) → "Tạo biến thể" button works.

- [ ] **Step 4: Update session-state + commit**

Append an SP4 "done" entry to `.claude/session-state.md` (mirror prior entries: derived_from activated, RecipeCreate fields, detail derived_from/derived_variants, variant page, entry buttons, no migration; note manual checklist). Commit:
```powershell
git add .claude/session-state.md; git commit -m "docs(session-state): RBAC SP4 variant-from-saved done — RBAC roadmap complete"
```

---

## Self-Review (completed by plan author)

**1. Spec coverage:**
- `derived_from_recipe_id`/`variant_label` on create → Task 1. ✓
- Source-existence 404 → Task 1 Step 2. ✓
- `derived_from` + approved-only `derived_variants` on detail → Task 2. ✓
- Types → Task 3 Step 1. ✓
- Variant page (pre-filled form + label + submitOverride merge) → Task 3 Step 2. ✓
- Entry buttons: saved cards (`showVariantAction`) + detail button → Task 4 Steps 1-3, 5b. ✓
- "Phỏng theo" + "Biến thể từ cộng đồng" display → Task 4 Steps 4, 5a, 5c. ✓
- No migration; model annotation alignment → Task 1 Step 3. ✓
- Testing (two backend smokes + tsc/build/manual) → Tasks 1/2/5. ✓

**2. Placeholder scan:** every code step has full code; commands have expected output. No TBD/TODO.

**3. Type consistency:** `derived_from_recipe_id` (snake, backend + create payload) vs `derived_from`/`derived_variants` (read fields) used consistently across Tasks 1-4. `showVariantAction` identical in RecipeGrid (Task 4.1), RecipeCard (4.2), saved page (4.3). `VariantsAccordion` `title?` prop defined (4.4) before use (4.5c). `submitOverride` merge posts `derived_from_recipe_id` (matching the `RecipeCreate` field name) — backend `create_recipe` reads `data.derived_from_recipe_id`. Consistent.
