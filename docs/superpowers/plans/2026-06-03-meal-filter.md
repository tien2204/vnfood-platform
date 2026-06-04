# Meal Filter (sáng/trưa/tối) + backfill meal_types — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Filter recipes by meal (Sáng/Trưa/Tối) on the `/recipes` browse page, and backfill `meal_types` for the 358 canonical recipes still NULL.

**Architecture:** `list_recipes` gains a `meal` param filtering with Postgres `:meal = ANY(recipes.meal_types)`; the `GET /recipes` list endpoint forwards it. A one-off `backfill_meal_types.py` tags the NULL canonicals by reusing `classify_meal_types`. The browse page adds single-select meal chips synced to a `?meal=` URL param.

**Tech Stack:** FastAPI + SQLAlchemy async (Postgres array), OpenAI (`gpt-4o-mini`), Next.js 16 client component, URL search params.

**Branch:** `feat/canonical-recipes`. No migration (column exists). Backend cmds from `backend/`: `$env:PYTHONUTF8=1; .venv\Scripts\python.exe ...`. Frontend from `frontend/`.

---

### Task 1: `meal` filter in `list_recipes` + list endpoint

**Files:** Modify `backend/app/services/recipe_service.py`, `backend/app/api/v1/recipes.py`

- [ ] **Step 1: Add `meal` param to `list_recipes`.** In `recipe_service.py`, in the `list_recipes` signature add `meal: Optional[str] = None,` (after the `search: Optional[str] = None,` parameter). Then, after the existing difficulty filter line `if difficulty:\n        stmt = stmt.where(Recipe.difficulty == difficulty)`, add:

```python
    if meal in ("sang", "trua", "toi"):
        stmt = stmt.where(text(":meal = ANY(recipes.meal_types)").bindparams(meal=meal))
```

(`text` is already imported and used in this function.)

- [ ] **Step 2: Forward `meal` from the list endpoint.** In `backend/app/api/v1/recipes.py`, the `@router.get("")` handler (`async def list_recipes(...)`): add a query param `meal: Optional[str] = Query(default=None),` (e.g. after the `search` param), and pass `meal=meal,` into the `recipe_service.list_recipes(...)` call (next to `sort=sort, search=search,`).

- [ ] **Step 3: Smoke the filter (real DB — MNMN canonicals are already tagged), from `backend/`** — create temp `backend/scripts/_smoke_meal.py`:

```python
import asyncio
from app.core.database import AsyncSessionLocal
from app.services.recipe_service import list_recipes


async def main():
    async with AsyncSessionLocal() as db:
        cards, pg = await list_recipes(db, page=1, limit=10, meal="sang")
        print("meal=sang count:", len(cards), "total:", pg.total)
        for c in cards[:5]:
            print("  -", c.title)
        # every returned card must actually contain 'sang' (verify via a direct check)
        from sqlalchemy import select
        from app.models.recipe import Recipe
        for c in cards:
            mt = (await db.execute(select(Recipe.meal_types).where(Recipe.id == c.id))).scalar_one()
            assert mt and "sang" in mt, f"{c.title} meal_types={mt}"
        print("OK — all contain 'sang'")


asyncio.run(main())
```

Run: `$env:PYTHONUTF8=1; .venv\Scripts\python.exe -m scripts._smoke_meal`
Expected: a non-zero `total`, sample titles, and `OK — all contain 'sang'`. Then delete: `Remove-Item scripts\_smoke_meal.py`.

- [ ] **Step 4: Verify the endpoint param is wired (route imports clean), from `backend/`**

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -c "from app.main import app; print('ok')"
```
Expected: `ok`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/recipe_service.py backend/app/api/v1/recipes.py
git commit -m "feat(meal): list_recipes meal filter (ANY on meal_types array) + endpoint param"
```

---

### Task 2: `backfill_meal_types.py` — tag the 358 NULL canonicals

**Files:** Create `backend/scripts/backfill_meal_types.py`

- [ ] **Step 1: Create the script**

```python
"""One-off: backfill meal_types for canonical recipes still NULL (~358), by
reusing classify_meal_types (gpt-4o-mini). Idempotent — only touches NULL rows.

Run from backend:
    python -m scripts.backfill_meal_types
"""
import asyncio
import sys

sys.stdout.reconfigure(encoding="utf-8")

from openai import AsyncOpenAI
from sqlalchemy import select, update
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.recipe import Recipe
from scripts.canonicalize_mnmn import classify_meal_types


async def main() -> None:
    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            select(Recipe.id, Recipe.title).where(
                Recipe.is_canonical.is_(True), Recipe.meal_types.is_(None)
            )
        )).all()
        print(f"to backfill: {len(rows)}")
        done = 0
        for rid, title in rows:
            try:
                meals = await classify_meal_types(client, title)
                await db.execute(update(Recipe).where(Recipe.id == rid).values(meal_types=meals))
                done += 1
                if done % 50 == 0:
                    await db.commit()
                    print(f"  {done}/{len(rows)}")
            except Exception as e:
                print(f"  [ERR] {rid}: {e}")
        await db.commit()
        print(f"DONE. backfilled {done}")


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 2: Run it (real OpenAI, ~358 calls, ~3 min, ~$0.07), from `backend/`**

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -m scripts.backfill_meal_types
```
Expected: `to backfill: ~358`, progress lines, `DONE. backfilled <N>`.
- If no network/OpenAI key in the sandbox, report DONE_WITH_CONCERNS (code correct, couldn't run); the script stays committed for the user to run.

- [ ] **Step 3: Verify NULL→0 (from `backend/`)**

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -c "import asyncio; from sqlalchemy import text; from app.core.database import AsyncSessionLocal
async def m():
 async with AsyncSessionLocal() as db:
  print('canonical NULL meal_types:', (await db.execute(text('select count(*) from recipes where is_canonical and meal_types is null'))).scalar_one())
asyncio.run(m())"
```
Expected: `canonical NULL meal_types: 0` (or near 0 if a few LLM errors). If Step 2 couldn't run, this stays at ~358 — note it.

- [ ] **Step 4: Commit (script only)**

```bash
git add backend/scripts/backfill_meal_types.py
git commit -m "feat(meal): backfill_meal_types for NULL canonicals (reuse classify_meal_types)"
```

---

### Task 3: Frontend — meal chips on `/recipes`

**Files:** Modify `frontend/app/recipes/RecipeBrowse.tsx`

- [ ] **Step 1: Add a `MEALS` constant** near the existing `KEYWORDS`/`DIFFICULTIES`/`SORTS` consts:

```tsx
const MEALS = [
  { label: "Sáng", value: "sang" },
  { label: "Trưa", value: "trua" },
  { label: "Tối", value: "toi" },
];
```

- [ ] **Step 2: Read the `meal` param** — next to the other `searchParams.get(...)` reads (e.g. after `const search: string = searchParams.get("search") ?? "";`):

```tsx
  const meal: string = searchParams.get("meal") ?? "";
```

- [ ] **Step 3: Send `meal` to the API + add to effect deps.** In the `useEffect` that builds `params` and calls the API:
  - after `if (search) params.search = search;` add:
  ```tsx
    if (meal) params.meal = meal;
  ```
  - add `meal` to the dependency array: `}, [page, keyword, difficulty, sort, search, meal]);`

- [ ] **Step 4: Include meal in `hasFilters`.** Change `const hasFilters = keyword || difficulty || search;` to:

```tsx
  const hasFilters = keyword || difficulty || search || meal;
```

- [ ] **Step 5: Render the meal chip row.** Immediately AFTER the existing keyword-chips block (the `<div className="flex flex-wrap gap-2 mb-6">...keyword chips...</div>`), add a meal chip row (single-select; clicking the active one clears it):

```tsx
      {/* Meal chips */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <span className="text-sm font-medium text-[#6b5344] mr-1">Bữa:</span>
        {MEALS.map((m) => {
          const active = meal === m.value;
          return (
            <button
              key={m.value}
              onClick={() => updateParam("meal", active ? "" : m.value)}
              className={`border-2 px-3.5 py-1.5 text-sm font-bold transition-all ${
                active
                  ? "border-[#2c1810] bg-[#2D6A4F] text-white shadow-block-sm"
                  : "border-[#2c1810] bg-[#fff5e6] text-[#2c1810] shadow-block-sm hover:bg-[#2D6A4F] hover:text-white"
              }`}
            >
              {m.label}
            </button>
          );
        })}
      </div>
```

- [ ] **Step 6: Typecheck (from `frontend/`)**

```bash
npx tsc --noEmit
```
Expected: no NEW errors (only the 3 known pre-existing files: `app/admin/page.tsx`, `app/me/profile/page.tsx`, `app/recognize/page.tsx`).

- [ ] **Step 7: Commit**

```bash
git add frontend/app/recipes/RecipeBrowse.tsx
git commit -m "feat(meal): single-select meal chips on /recipes (AND with keyword)"
```

- [ ] **Step 8: Manual smoke (after restarting uvicorn + npm run dev)** — open `/recipes`, click "Sáng" → grid filters to breakfast dishes, URL gets `?meal=sang`; click "Sáng" again → clears; combine with a keyword chip → both apply (AND). The "Xóa bộ lọc" link (uses `router.push("/recipes")`) clears meal too.

---

## Self-Review

**Spec coverage:**
- `list_recipes` meal param + `:meal = ANY(meal_types)` bindparam, validated in {sang,trua,toi} → Task 1 Step 1. ✓
- `GET /recipes` list endpoint meal query param → Task 1 Step 2. ✓
- `backfill_meal_types.py` for NULL canonicals reusing `classify_meal_types`, idempotent → Task 2. ✓
- Single-select meal chips synced to `?meal=`, AND with keyword, reset page (via `updateParam` which sets page=1) → Task 3. ✓ (`updateParam` already resets page when key≠"page".)
- No migration → confirmed. ✓
- Verify backfill NULL→0, API ?meal=sang, tsc, manual → Tasks 1-3 verify steps. ✓

**Placeholder scan:** Full code in every step; verify commands concrete with expected output; the backfill no-network failure mode is called out explicitly.

**Type/name consistency:**
- `meal` param: `list_recipes(meal=...)` (Task 1) ↔ endpoint `meal=meal` (Task 1) ↔ frontend `params.meal` / `?meal=` (Task 3). ✓
- Allowed values `"sang"|"trua"|"toi"` consistent across backend filter (Task 1), backfill output (classify_meal_types returns these), and frontend `MEALS` values (Task 3). ✓
- `classify_meal_types(client, title)` signature matches its definition in `canonicalize_mnmn.py`. ✓
- `updateParam(key, value)` reused as-is from RecipeBrowse (resets page). ✓

No gaps found.
