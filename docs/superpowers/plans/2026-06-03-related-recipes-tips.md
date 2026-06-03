# Related Recipes + Standalone "Mách nhỏ" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** On the recipe detail page, show a "Món tương tự" (related recipes) section and pull the "Mách nhỏ" (tips) step out of the numbered steps into its own callout.

**Architecture:** Backend `get_related_recipes` ranks canonical recipes by an OR full-text match on the title (config `'simple'`, like `search_recipes`) with `canonical_dish_slug`/`keyword` boosts and a same-slug/keyword/popular fallback; exposed at `GET /api/v1/recipes/{id}/related`. Frontend `RelatedRecipes` lazily fetches it and reuses `RecipeGrid`. Tips extraction is frontend-only: split steps whose content starts with "Mách nhỏ" into a callout.

**Tech Stack:** FastAPI + SQLAlchemy async (PostgreSQL FTS), Next.js 16 client component, SWR, reuse of `_base_approved_query`/`_build_recipe_card`/`_get_saved_ids` + `RecipeGrid`/`RecipeCard`.

**Branch:** `feat/canonical-recipes`. No migration. Backend cmds from `backend/`: `$env:PYTHONUTF8=1; .venv\Scripts\python.exe ...`. Frontend from `frontend/`.

---

### Task 1: `get_related_recipes` service

**Files:** Modify `backend/app/services/recipe_service.py`

- [ ] **Step 1: Ensure `import re` at the top.** Read the import block; if `re` is not imported, add `import re` alongside the other stdlib imports (e.g. after `import uuid`).

- [ ] **Step 2: Add the helper + service** — append after the existing `list_recipes` function (or anywhere among the module-level async functions):

```python
def _title_or_tsquery(title: str) -> str:
    """OR tsquery from a title's word tokens (>=2 chars), deduped, e.g. 'pho | bo'."""
    toks = [t for t in re.findall(r"[0-9a-zA-Zà-ỹÀ-Ỹ]+", (title or "").lower()) if len(t) >= 2]
    return " | ".join(dict.fromkeys(toks))


async def get_related_recipes(
    db: AsyncSession,
    recipe_id: uuid.UUID,
    limit: int = 6,
    current_user: Optional[User] = None,
) -> list[RecipeCardOut]:
    """Canonical recipes similar to `recipe_id` by title FTS + slug/keyword boost."""
    limit = min(max(limit, 1), 12)
    recipe = (await db.execute(select(Recipe).where(Recipe.id == recipe_id))).scalar_one_or_none()
    if recipe is None:
        return []

    orq = _title_or_tsquery(recipe.title)
    slug = recipe.canonical_dish_slug or ""
    kw = recipe.keyword or ""

    rows: list = []
    seen: set[uuid.UUID] = {recipe.id}

    def _collect(result_rows) -> None:
        for r in result_rows:
            if r[0].id in seen:
                continue
            seen.add(r[0].id)
            rows.append(r)

    def _base():
        return _base_approved_query().where(
            Recipe.is_canonical.is_(True),
            Recipe.is_dessert.is_(False),
            Recipe.id != recipe.id,
        )

    # 1) Title FTS (OR) with slug/keyword boost.
    if orq:
        stmt = (
            _base()
            .where(
                text("to_tsvector('simple', recipes.title) @@ to_tsquery('simple', :worq)").bindparams(worq=orq)
            )
            .order_by(
                text("(recipes.canonical_dish_slug = :bslug) DESC").bindparams(bslug=slug),
                text("(recipes.keyword IS NOT NULL AND recipes.keyword = :bkw) DESC").bindparams(bkw=kw),
                text(
                    "ts_rank(to_tsvector('simple', recipes.title), to_tsquery('simple', :borq)) DESC"
                ).bindparams(borq=orq),
                Recipe.save_count.desc(),
            )
            .limit(limit)
        )
        _collect((await db.execute(stmt)).all())

    # 2) Fallbacks to guarantee results: same slug -> same keyword -> popular.
    if len(rows) < limit and slug:
        fb = _base().where(Recipe.id.notin_(list(seen)), Recipe.canonical_dish_slug == slug).limit(limit - len(rows))
        _collect((await db.execute(fb)).all())
    if len(rows) < limit and kw:
        fb = _base().where(Recipe.id.notin_(list(seen)), Recipe.keyword == kw).limit(limit - len(rows))
        _collect((await db.execute(fb)).all())
    if len(rows) < limit:
        fb = _base().where(Recipe.id.notin_(list(seen))).order_by(Recipe.save_count.desc()).limit(limit - len(rows))
        _collect((await db.execute(fb)).all())

    rows = rows[:limit]
    saved_ids = await _get_saved_ids(db, [r[0].id for r in rows], current_user)
    return [_build_recipe_card(r[0], r[1], saved_ids, current_user) for r in rows]
```

- [ ] **Step 3: Smoke (real DB, from `backend/`)** — create temp `backend/scripts/_smoke_related.py`:

```python
import asyncio
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.recipe import Recipe
from app.services.recipe_service import get_related_recipes


async def main():
    async with AsyncSessionLocal() as db:
        rid = (await db.execute(select(Recipe.id).where(
            Recipe.is_canonical.is_(True), Recipe.canonical_dish_slug == "pho"))).scalars().first()
        print("seed recipe id:", rid)
        cards = await get_related_recipes(db, rid, limit=6)
        print("related count:", len(cards))
        for c in cards:
            print("  -", c.title, "| canonical:", c.is_canonical, "| id:", c.id)
        assert all(c.is_canonical for c in cards), "all must be canonical"
        assert all(c.id != rid for c in cards), "must exclude self"
        print("OK")


asyncio.run(main())
```

Run: `$env:PYTHONUTF8=1; .venv\Scripts\python.exe -m scripts._smoke_related`
Expected: a seed id, `related count: 6` (or >0), each a canonical recipe, none equal to the seed, prints `OK`. Then delete the temp: `Remove-Item scripts\_smoke_related.py`.
- If `pho` has no canonical in this DB, change the seed slug to any present one (e.g. `banh-mi`); report if so.

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/recipe_service.py
git commit -m "feat(related): get_related_recipes (canonical FTS + slug/keyword boost + fallback)"
```

---

### Task 2: `GET /recipes/{recipe_id}/related` endpoint

**Files:** Modify `backend/app/api/v1/recipes.py`

- [ ] **Step 1: Add the endpoint** — insert right after the `get_recipe_detail` handler (the `@router.get("/{recipe_id}")` block, ends ~line 148):

```python
@router.get("/{recipe_id}/related")
async def get_related(
    recipe_id: uuid.UUID,
    limit: int = 6,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    cards = await recipe_service.get_related_recipes(db, recipe_id, limit=limit, current_user=current_user)
    return {"success": True, "data": cards}
```

(`uuid`, `Optional`, `Depends`, `AsyncSession`, `get_db`, `get_optional_current_user`, `recipe_service` are already imported in this file.)

- [ ] **Step 2: Verify route registered + import clean (from `backend/`)**

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -c "from app.main import app; print([r.path for r in app.routes if r.path.endswith('/related')])"
```
Expected: `['/api/v1/recipes/{recipe_id}/related']`.

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/v1/recipes.py
git commit -m "feat(related): GET /recipes/{id}/related endpoint"
```

---

### Task 3: Frontend — RelatedRecipes section + "Mách nhỏ" callout

**Files:**
- Create: `frontend/components/recipes/RelatedRecipes.tsx`
- Modify: `frontend/components/recipes/RecipeDetailClient.tsx`

- [ ] **Step 1: Create `frontend/components/recipes/RelatedRecipes.tsx`**

```tsx
"use client";

import useSWR from "swr";
import api from "@/lib/api";
import RecipeGrid from "./RecipeGrid";
import type { RecipeCard } from "@/lib/types";

function fetcher(url: string) {
  return api.get(url).then((r) => r.data.data as RecipeCard[]);
}

export default function RelatedRecipes({ recipeId }: { recipeId: string }) {
  const { data } = useSWR<RecipeCard[]>(`/recipes/${recipeId}/related`, fetcher);
  if (!data || data.length === 0) return null;
  return (
    <section className="mt-10">
      <h2
        className="text-xl font-bold text-[#1C1209] mb-4"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        Món tương tự
      </h2>
      <RecipeGrid recipes={data} />
    </section>
  );
}
```

(If `RecipeGrid`'s prop is not `recipes`, or `RecipeCard` is not the exported type name, read `RecipeGrid.tsx`/`lib/types.ts` and adjust the prop/type to match — do not invent names.)

- [ ] **Step 2: Import the component in `RecipeDetailClient.tsx`** — add near the other component imports at the top:

```tsx
import RelatedRecipes from "./RelatedRecipes";
```

- [ ] **Step 3: Extract tip steps.** In `RecipeDetailClient.tsx`, near the existing `const hasSteps = (recipe.steps?.length ?? 0) > 0;` line, add:

```tsx
  const TIP_RE = /^\s*mách nhỏ\s*[:.]/i;
  const tipSteps = recipe.steps.filter((s) => TIP_RE.test(s.content));
  const normalSteps = recipe.steps.filter((s) => !TIP_RE.test(s.content));
```

- [ ] **Step 4: Render normal steps + tip callout.** In the steps `TabsContent` (the block currently doing `recipe.steps.length > 0 ? (... recipe.steps.map((step, idx) => ...) ...)`):
  - Change the guard `recipe.steps.length > 0` → `normalSteps.length > 0`.
  - Change `recipe.steps.map(` → `normalSteps.map(`.
  - Change the tab-count label `Các bước ({recipe.steps.length})` → `Các bước ({normalSteps.length})`.
  - Immediately AFTER the steps list `</div>` (the `<div className="space-y-6 pb-4">...</div>` that closes the map), and still inside the steps `TabsContent`, add the tip callout:

```tsx
              {tipSteps.length > 0 && (
                <div className="mt-6 rounded-xl border border-[#E8DDD4] bg-[#F7F0E8] p-4">
                  <h3 className="font-semibold text-[#2D2417] mb-2">💡 Mách nhỏ</h3>
                  <div className="space-y-2">
                    {tipSteps.map((s, i) => (
                      <p key={i} className="text-[#1C1209] leading-relaxed">
                        {s.content.replace(TIP_RE, "").trim()}
                      </p>
                    ))}
                  </div>
                </div>
              )}
```

- [ ] **Step 5: Render RelatedRecipes** at the bottom of the main content column — after the `</Tabs>` close (around the desktop action-bar area; place it so it shows below the tabbed content). Add:

```tsx
          <RelatedRecipes recipeId={recipe.id} />
```

Place it inside the main content container (same column as the Tabs), after the Tabs block. If unsure of the exact column boundary, put it immediately after `</Tabs>`.

- [ ] **Step 6: Typecheck (from `frontend/`)**

```bash
npx tsc --noEmit
```
Expected: no NEW errors (only the 3 known pre-existing: `app/admin/page.tsx`, `app/me/profile/page.tsx`, `app/recognize/page.tsx`).

- [ ] **Step 7: Commit**

```bash
git add frontend/components/recipes/RelatedRecipes.tsx frontend/components/recipes/RecipeDetailClient.tsx
git commit -m "feat(related): RelatedRecipes section + standalone Mách nhỏ callout"
```

- [ ] **Step 8: Manual smoke (after restarting uvicorn + npm run dev)** — open a MNMN recipe detail: see "Món tương tự" grid (cards link to other recipes) + a "💡 Mách nhỏ" callout, and the numbered steps no longer contain the "Mách nhỏ" line. Open a Cookpad recipe: "Món tương tự" still shows; Mách nhỏ callout hidden.

---

## Self-Review

**Spec coverage:**
- Related: canonical-only FTS OR-tokens + slug/keyword boost + fallback → Task 1. ✓ Endpoint `/recipes/{id}/related` with `get_optional_current_user`, limit cap 12 → Task 1 (cap) + Task 2. ✓ Lazy `RelatedRecipes` reusing RecipeGrid, hidden when empty → Task 3 Steps 1-2,5. ✓
- Tips: frontend-only split of `/^\s*mách nhỏ\s*[:.]/i`, callout after steps, strip prefix, hidden if none → Task 3 Steps 3-4. ✓
- No migration → confirmed. ✓

**Placeholder scan:** Full code in every step; smoke + verify give exact commands/expected output. The two "read & adjust if names differ" notes (RecipeGrid prop, exact RelatedRecipes placement) are guardrails against wrong identifiers, not placeholders — the primary code is concrete.

**Type/name consistency:**
- `get_related_recipes(db, recipe_id, limit, current_user) -> list[RecipeCardOut]` defined Task 1, called identically in Task 2 + smoke. ✓
- Endpoint path `/{recipe_id}/related` (Task 2) matches frontend fetch `/recipes/${recipeId}/related` (Task 3). ✓ (axios baseURL already includes `/api/v1`.)
- Response `{success, data: cards}` (Task 2) ↔ fetcher `r.data.data as RecipeCard[]` (Task 3). ✓
- `TIP_RE` defined once (Task 3 Step 3), used in extraction + strip (Steps 3-4). ✓
- Reuses `_base_approved_query`, `_build_recipe_card`, `_get_saved_ids` (existing signatures), `RecipeGrid` default export with `recipes` prop. ✓

No gaps found.
