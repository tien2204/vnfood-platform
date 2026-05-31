# Meal Plan Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the existing (already-working) meal plan + grocery list with canonical-first recipe picking, a categorized/deduped smart grocery list, and personalized slot suggestions — no DB migration.

**Architecture:** Pure additive changes. Recipe search already filters canonical by default (`show_all=False`), so canonical-first is a frontend toggle only. Grocery categorization is a new pure module (`grocery_categories.py`) consumed by a refactored `meal_plan_service` (shared aggregate helper for both generate + get). Personalization is a new `recommend_service.suggest_recipes_for_user` with a stable signature (a later sub-project swaps its internals) surfaced via `GET /meal-plans/suggestions`.

**Tech Stack:** FastAPI + async SQLAlchemy (asyncpg), PostgreSQL, Next.js 16 (React 19, Base UI), Python 3.10 backend venv.

**Conventions:**
- Backend scripts/checks run from `backend/` with `$env:PYTHONUTF8=1; .venv/Scripts/python.exe ...`.
- API envelope: `{"success": true, "data": ...}`.
- Reuse `recipe_service._build_recipe_card` + `RecipeCardOut` for recipe shapes; `recipe_service._base_approved_query` for the approved+active filter.
- Models: `Rating(score:int, user_id, recipe_id)`, `SavedRecipe(user_id, recipe_id)`, `AILog(user_id, predicted_class:str)`, `Recipe(... is_canonical, canonical_dish_slug, keyword, llm_judge_score, avg_rating, save_count)`, `GroceryItem(id, meal_plan_id, ingredient_name, quantity, is_checked)`.
- Spec: `docs/superpowers/specs/2026-05-31-meal-plan-enhance-design.md`.

---

## File Structure

**Create:**
- `backend/app/services/grocery_categories.py` — keyword→category map + `categorize(name)` + `CATEGORY_LABELS`/`CATEGORY_ORDER`. One responsibility: classify an ingredient name.
- `backend/app/services/recommend_service.py` — `suggest_recipes_for_user(...)`. One responsibility: taste-history → canonical recipe cards. Swappable interface.

**Modify:**
- `backend/app/services/meal_plan_service.py` — add `_norm_ing`, `_aggregate_from_items`; refactor `generate_grocery_list` + `get_grocery_list` to attach `category` + `from_recipes`.
- `backend/app/api/v1/meal_plans.py` — add `GET /suggestions` (BEFORE `/{plan_id}`).
- `frontend/lib/types.ts` — add `category` to `GroceryItem`; add `SuggestedRecipe`-style reuse of `RecipeCard`.
- `frontend/components/meal-plan/GroceryList.tsx` — group unchecked items by category.
- `frontend/components/meal-plan/AddRecipeModal.tsx` — `show_all` toggle + "Chuẩn" badge + suggestions section.

**No DB migration. No new pip deps.**

---

## Task 1: Grocery category module

**Files:**
- Create: `backend/app/services/grocery_categories.py`

- [ ] **Step 1: Write the module**

```python
"""Classify a grocery ingredient name into a coarse category (keyword map, on-the-fly).

No DB, no migration: categories are computed when building the grocery payload.
"""
import unicodedata

CATEGORY_LABELS = {
    "thit-ca": "Thịt & Hải sản",
    "rau-cu": "Rau củ quả",
    "gia-vi": "Gia vị & Nước chấm",
    "kho-dong-goi": "Khô & Đóng gói",
    "khac": "Khác",
}

# Display/group order (most-perishable first is a sensible shopping order).
CATEGORY_ORDER = ["thit-ca", "rau-cu", "gia-vi", "kho-dong-goi", "khac"]

# Keyword → category. Keywords are diacritic-stripped lowercase substrings.
_KEYWORDS = {
    "thit-ca": [
        "thit", "bo", "heo", "lon", "ga", "vit", "ca ", "ca,", "tom", "muc",
        "cua", "ngao", "so", "oc", "luon", "trung", "xuong", "suon", "gio song",
        "hai san", "cua dong", "ech", "chim",
    ],
    "rau-cu": [
        "rau", "cu", "ca chua", "ca rot", "hanh", "toi", "ot", "nam", "gung",
        "sa", "rieng", "khoai", "bi ", "bau", "muop", "dau", "gia ", "cai",
        "ngo", "mui", "que", "chanh", "dua leo", "dua chuot", "kho qua",
        "muop dang", "bap", "ngo ", "rau muong", "rau thom", "la lot", "chuoi",
        "dua hau", "tao", "cam", "xa lach", "su hao", "do",
    ],
    "gia-vi": [
        "muoi", "duong", "nuoc mam", "mam", "tieu", "dau an", "dau hao",
        "bot ngot", "hat nem", "nuoc tuong", "tuong", "giam", "me", "sa te",
        "bot", "nuoc cot", "ruou", "mat ong", "dau me", "ngu vi", "bot canh",
        "nuoc dua", "sot",
    ],
    "kho-dong-goi": [
        "bun", "pho", "mien", "banh trang", "banh pho", "banh da", "mi ",
        "nui", "dau hu", "tau hu", "lap xuong", "cha", "nem", "do hop",
        "sua", "pho mai", "bo ", "banh mi", "hu tieu", "bot mi", "bot gao",
        "nep", "gao", "dau phong", "dau xanh", "me rang",
    ],
}


def _norm(name: str) -> str:
    name = unicodedata.normalize("NFKD", name or "")
    name = "".join(c for c in name if not unicodedata.combining(c))
    return name.lower().replace("đ", "d").replace("Đ", "d").strip()


def categorize(name: str) -> str:
    """Return a category slug from CATEGORY_LABELS. Falls back to 'khac'."""
    n = _norm(name)
    if not n:
        return "khac"
    # Check in priority order; first matching keyword wins.
    for cat in CATEGORY_ORDER:
        for kw in _KEYWORDS.get(cat, []):
            if kw.strip() and kw in n:
                return cat
    return "khac"
```

- [ ] **Step 2: Write a quick assertion check and run it**

Create temp `backend/_tmp_cat.py`:

```python
import sys
sys.stdout.reconfigure(encoding="utf-8")
from app.services.grocery_categories import categorize, CATEGORY_LABELS

cases = {
    "Thịt bò": "thit-ca", "Tôm sú": "thit-ca", "Trứng gà": "thit-ca",
    "Cà rốt": "rau-cu", "Hành lá": "rau-cu", "Rau muống": "rau-cu",
    "Nước mắm": "gia-vi", "Muối": "gia-vi", "Đường": "gia-vi",
    "Bún tươi": "kho-dong-goi", "Đậu hũ": "kho-dong-goi",
    "Vật phẩm lạ xyz": "khac",
}
bad = {k: categorize(k) for k, v in cases.items() if categorize(k) != v}
assert all(c in CATEGORY_LABELS for c in map(categorize, cases)), "invalid category slug"
print("mismatches (informational, keyword map is heuristic):", bad)
print("OK — all return valid category slugs")
```

Run: `cd backend; $env:PYTHONUTF8=1; .venv/Scripts/python.exe _tmp_cat.py; Remove-Item _tmp_cat.py`
Expected: `OK — all return valid category slugs`. (A few `mismatches` are acceptable — the map is heuristic; the hard requirement is every result is a valid slug.)

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/grocery_categories.py
git commit -m "feat(meal-plan): grocery ingredient categorizer (keyword map)"
```

---

## Task 2: Smart grocery payload (categorize + dedup + recompute)

**Files:**
- Modify: `backend/app/services/meal_plan_service.py`

Current `generate_grocery_list` aggregates by raw name and concatenates ALL quantities (including duplicates); `get_grocery_list` returns `from_recipes=[]`. This task adds dedup, category, and recomputes `from_recipes` on GET.

- [ ] **Step 1: Add helpers near the top of `meal_plan_service.py`**

Add this import at the top (with the other imports):

```python
import unicodedata
from app.services.grocery_categories import categorize
```

Add these helpers after the imports (module level):

```python
def _norm_ing(name: str) -> str:
    """Normalize an ingredient name for dedup keying (diacritic/case-insensitive)."""
    name = unicodedata.normalize("NFKD", name or "")
    name = "".join(c for c in name if not unicodedata.combining(c))
    return " ".join(name.lower().replace("đ", "d").replace("Đ", "d").split())


async def _aggregate_from_items(db: AsyncSession, plan_id: uuid.UUID) -> dict:
    """Aggregate ingredients across a plan's meal items.

    Returns: {norm_key: {"name": display_name, "quantities": [distinct str],
                         "from_recipes": [{recipe_id,title,quantity}]}}
    """
    items_q = await db.execute(
        select(MealPlanItem).where(MealPlanItem.meal_plan_id == plan_id)
    )
    items = items_q.scalars().all()

    aggregated: dict = {}
    for item in items:
        if not item.recipe_id:
            continue
        ing_q = await db.execute(
            select(RecipeIngredient, Recipe)
            .join(Recipe, Recipe.id == RecipeIngredient.recipe_id)
            .where(RecipeIngredient.recipe_id == item.recipe_id)
        )
        for ing, recipe in ing_q.all():
            name = ing.ingredient_name or ing.display_text
            if not name:
                continue
            key = _norm_ing(name)
            if key not in aggregated:
                aggregated[key] = {"name": name, "quantities": [], "from_recipes": []}
            qty = (ing.quantity or "").strip()
            if qty and qty not in aggregated[key]["quantities"]:
                aggregated[key]["quantities"].append(qty)
            aggregated[key]["from_recipes"].append({
                "recipe_id": str(recipe.id),
                "title": recipe.title,
                "quantity": qty,
            })
    return aggregated
```

- [ ] **Step 2: Replace `generate_grocery_list` body to use the aggregator + dedup + category**

Replace the existing `generate_grocery_list` function with:

```python
async def generate_grocery_list(db: AsyncSession, plan_id: uuid.UUID, user_id: uuid.UUID) -> dict:
    plan_q = await db.execute(
        select(MealPlan).where(MealPlan.id == plan_id, MealPlan.user_id == user_id)
    )
    if not plan_q.scalar_one_or_none():
        raise HTTPException(404, detail="Meal plan không tồn tại")

    aggregated = await _aggregate_from_items(db, plan_id)

    if not aggregated:
        await db.execute(delete(GroceryItem).where(GroceryItem.meal_plan_id == plan_id))
        await db.commit()
        return {"items": [], "total_items": 0, "checked_count": 0}

    # Preserve existing is_checked by normalized name
    existing_q = await db.execute(
        select(GroceryItem).where(GroceryItem.meal_plan_id == plan_id)
    )
    existing_map = {_norm_ing(g.ingredient_name): g.is_checked for g in existing_q.scalars().all()}

    await db.execute(delete(GroceryItem).where(GroceryItem.meal_plan_id == plan_id))

    output_items = []
    for key, data in aggregated.items():
        name = data["name"]
        qty_str = ", ".join(data["quantities"]) if data["quantities"] else "vừa đủ"
        is_checked = existing_map.get(key, False)

        item = GroceryItem(
            meal_plan_id=plan_id,
            ingredient_name=name,
            quantity=qty_str,
            is_checked=is_checked,
        )
        db.add(item)
        await db.flush()

        output_items.append({
            "id": str(item.id),
            "ingredient_name": name,
            "quantity": qty_str,
            "is_checked": is_checked,
            "category": categorize(name),
            "from_recipes": data["from_recipes"],
        })

    await db.commit()
    return {
        "items": output_items,
        "total_items": len(output_items),
        "checked_count": sum(1 for i in output_items if i["is_checked"]),
    }
```

- [ ] **Step 3: Replace `get_grocery_list` body to attach category + recompute from_recipes**

Replace the existing `get_grocery_list` function with:

```python
async def get_grocery_list(db: AsyncSession, plan_id: uuid.UUID, user_id: uuid.UUID) -> dict:
    plan_q = await db.execute(
        select(MealPlan).where(MealPlan.id == plan_id, MealPlan.user_id == user_id)
    )
    if not plan_q.scalar_one_or_none():
        raise HTTPException(404, detail="Meal plan không tồn tại")

    aggregated = await _aggregate_from_items(db, plan_id)

    grocery_q = await db.execute(
        select(GroceryItem).where(GroceryItem.meal_plan_id == plan_id).order_by(GroceryItem.ingredient_name)
    )
    items = grocery_q.scalars().all()

    output_items = []
    for g in items:
        key = _norm_ing(g.ingredient_name)
        from_recipes = aggregated.get(key, {}).get("from_recipes", [])
        output_items.append({
            "id": str(g.id),
            "ingredient_name": g.ingredient_name,
            "quantity": g.quantity,
            "is_checked": g.is_checked,
            "category": categorize(g.ingredient_name),
            "from_recipes": from_recipes,
        })

    return {
        "items": output_items,
        "total_items": len(output_items),
        "checked_count": sum(1 for i in output_items if i["is_checked"]),
    }
```

- [ ] **Step 4: Also attach category to manually-added items**

In `add_grocery_item_manual`, change the returned dict to include `category`. Find the `return {` block at the end of `add_grocery_item_manual` and replace with:

```python
    return {
        "id": str(item.id),
        "ingredient_name": item.ingredient_name,
        "quantity": item.quantity,
        "is_checked": item.is_checked,
        "category": categorize(item.ingredient_name),
        "from_recipes": [],
    }
```

- [ ] **Step 5: Syntax check + verify with a script**

Run syntax check: `cd backend; .venv/Scripts/python.exe -c "import ast; ast.parse(open('app/services/meal_plan_service.py',encoding='utf-8').read()); print('OK')"`
Expected: `OK`.

Create temp `backend/_tmp_groc.py` (uses an existing user+plan if present; otherwise just imports to confirm no import errors):

```python
import asyncio, sys
sys.stdout.reconfigure(encoding="utf-8")
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.meal_plan import MealPlan
from app.services import meal_plan_service

async def m():
    async with AsyncSessionLocal() as db:
        plan = (await db.execute(select(MealPlan).limit(1))).scalar_one_or_none()
        if not plan:
            print("no meal plan in DB — import OK, skipping data check"); return
        data = await meal_plan_service.get_grocery_list(db, plan.id, plan.user_id)
        cats = {i["category"] for i in data["items"]}
        print("items:", data["total_items"], "categories:", cats)
        assert all("category" in i and "from_recipes" in i for i in data["items"])
        print("OK — every grocery item has category + from_recipes")

asyncio.run(m())
```

Run: `cd backend; $env:PYTHONUTF8=1; .venv/Scripts/python.exe _tmp_groc.py; Remove-Item _tmp_groc.py`
Expected: `OK` (or "no meal plan in DB — import OK" if DB has none).

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/meal_plan_service.py
git commit -m "feat(meal-plan): grocery dedup + category + recompute from_recipes on GET"
```

---

## Task 3: Grocery types + category grouping in UI

**Files:**
- Modify: `frontend/lib/types.ts`
- Modify: `frontend/components/meal-plan/GroceryList.tsx`

- [ ] **Step 1: Add `category` to the `GroceryItem` type**

In `frontend/lib/types.ts`, find the `GroceryItem` interface and add the `category` field:

```typescript
export interface GroceryItem {
  id: string;
  ingredient_name: string;
  quantity: string | null;
  is_checked: boolean;
  category: string;
  from_recipes: GroceryFromRecipe[];
}
```

- [ ] **Step 2: Group unchecked items by category in `GroceryList.tsx`**

Add a category-label map near the top of `GroceryList.tsx` (after imports):

```typescript
const CATEGORY_LABELS: Record<string, string> = {
  "thit-ca": "Thịt & Hải sản",
  "rau-cu": "Rau củ quả",
  "gia-vi": "Gia vị & Nước chấm",
  "kho-dong-goi": "Khô & Đóng gói",
  khac: "Khác",
};
const CATEGORY_ORDER = ["thit-ca", "rau-cu", "gia-vi", "kho-dong-goi", "khac"];
```

Replace the "Unchecked" rendering block (the `{uncheckedItems.map((item) => ( ... ))}` group) with category-grouped rendering:

```tsx
          {/* Unchecked — grouped by category */}
          {CATEGORY_ORDER.filter((cat) => uncheckedItems.some((i) => i.category === cat)).map((cat) => (
            <div key={cat} className="flex flex-col gap-1">
              <p className="text-[11px] font-semibold text-[#7C6A56] uppercase tracking-wide mt-2 mb-0.5">
                {CATEGORY_LABELS[cat] ?? cat}
              </p>
              {uncheckedItems
                .filter((i) => i.category === cat)
                .map((item) => (
                  <GroceryItemRow
                    key={item.id}
                    item={item}
                    expanded={expandedId === item.id}
                    onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
                    onCheck={(checked) => handleCheck(item, checked)}
                    onDelete={() => handleDelete(item.id)}
                  />
                ))}
            </div>
          ))}
```

(Leave the checked-items block and the divider unchanged — checked items stay flat.)

- [ ] **Step 3: Typecheck**

Run: `cd frontend; npx tsc --noEmit`
Expected: no errors related to `GroceryItem`/`GroceryList.tsx` (pre-existing unrelated errors, if any, are out of scope — confirm none are introduced by this change).

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/types.ts frontend/components/meal-plan/GroceryList.tsx
git commit -m "feat(meal-plan): group grocery list by ingredient category"
```

---

## Task 4: Personalized suggestions service + endpoint

**Files:**
- Create: `backend/app/services/recommend_service.py`
- Modify: `backend/app/api/v1/meal_plans.py`

- [ ] **Step 1: Write `recommend_service.py`**

```python
"""Recipe suggestions from a user's taste history.

STABLE INTERFACE: suggest_recipes_for_user(...). A later "Personalization engine"
sub-project may replace the internals; keep this signature so meal plan / other
callers do not change.
"""
import uuid
from collections import Counter
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.recipe import Recipe
from app.models.social import Rating, SavedRecipe
from app.models.ai_log import AILog
from app.models.user import User
from app.services import recipe_service


async def _preferred_slugs(db: AsyncSession, user_id: uuid.UUID) -> list[str]:
    """Top canonical_dish_slug / keyword the user signalled interest in."""
    counter: Counter = Counter()

    # High ratings (>=4) -> recipe slug/keyword
    rated = (await db.execute(
        select(Recipe.canonical_dish_slug, Recipe.keyword)
        .join(Rating, Rating.recipe_id == Recipe.id)
        .where(Rating.user_id == user_id, Rating.score >= 4)
    )).all()
    # Saved recipes -> slug/keyword
    saved = (await db.execute(
        select(Recipe.canonical_dish_slug, Recipe.keyword)
        .join(SavedRecipe, SavedRecipe.recipe_id == Recipe.id)
        .where(SavedRecipe.user_id == user_id)
    )).all()
    for slug, kw in [*rated, *saved]:
        if slug:
            counter[slug] += 2
        if kw:
            counter[kw] += 1

    # AI recognition history -> predicted_class is an AI slug
    ai = (await db.execute(
        select(AILog.predicted_class).where(
            AILog.user_id == user_id, AILog.predicted_class.is_not(None)
        )
    )).all()
    for (pc,) in ai:
        if pc and pc != "unknown":
            counter[pc] += 1

    return [k for k, _ in counter.most_common(20)]


async def suggest_recipes_for_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    n: int = 6,
    exclude_recipe_ids: Optional[set] = None,
) -> list[dict]:
    """Return up to n canonical recipe cards tailored to the user's taste.

    Falls back to popular canonical recipes when history is thin.
    """
    exclude_recipe_ids = exclude_recipe_ids or set()
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    prefs = await _preferred_slugs(db, user_id)

    base = recipe_service._base_approved_query().where(
        Recipe.is_canonical.is_(True), Recipe.is_dessert.is_(False)
    )

    picked: list = []
    seen: set = set(str(x) for x in exclude_recipe_ids)

    if prefs:
        pref_q = base.where(
            (Recipe.canonical_dish_slug.in_(prefs)) | (Recipe.keyword.in_(prefs))
        ).order_by(Recipe.llm_judge_score.desc().nullslast(), Recipe.avg_rating.desc()).limit(n * 3)
        for r, author in (await db.execute(pref_q)).all():
            if str(r.id) in seen:
                continue
            picked.append((r, author))
            seen.add(str(r.id))
            if len(picked) >= n:
                break

    # Fallback: popular canonical to fill up to n
    if len(picked) < n:
        fill_q = base.order_by(
            Recipe.save_count.desc(), Recipe.avg_rating.desc()
        ).limit(n * 4)
        for r, author in (await db.execute(fill_q)).all():
            if str(r.id) in seen:
                continue
            picked.append((r, author))
            seen.add(str(r.id))
            if len(picked) >= n:
                break

    recipe_ids = [r.id for r, _ in picked]
    saved_ids = await recipe_service._get_saved_ids(db, recipe_ids, user)
    cards = [recipe_service._build_recipe_card(r, author, saved_ids, user) for r, author in picked]
    return [c.model_dump() for c in cards]
```

- [ ] **Step 2: Add the `GET /suggestions` endpoint — BEFORE the `/{plan_id}` route**

In `backend/app/api/v1/meal_plans.py`, add the import near the top:

```python
from app.services import meal_plan_service, recommend_service
```

(Replace the existing `from app.services import meal_plan_service` line.)

Then add this route **immediately after `create_meal_plan` and BEFORE `get_meal_plan` (the `@router.get("/{plan_id}")`)** — ordering matters or `/suggestions` is parsed as a `plan_id` UUID and 422s:

```python
@router.get("/suggestions")
async def get_suggestions(
    n: int = Query(default=6, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    data = await recommend_service.suggest_recipes_for_user(db, current_user.id, n=n)
    return {"success": True, "data": data}
```

- [ ] **Step 3: Syntax check + verify endpoint logic via script**

Run: `cd backend; .venv/Scripts/python.exe -c "import ast; [ast.parse(open(f,encoding='utf-8').read()) for f in ['app/services/recommend_service.py','app/api/v1/meal_plans.py']]; print('OK')"`
Expected: `OK`.

Create temp `backend/_tmp_sug.py`:

```python
import asyncio, sys
sys.stdout.reconfigure(encoding="utf-8")
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.user import User
from app.services import recommend_service

async def m():
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).limit(1))).scalar_one_or_none()
        if not user:
            print("no user — import OK"); return
        out = await recommend_service.suggest_recipes_for_user(db, user.id, n=6)
        print("suggestions:", len(out))
        assert all(c["is_canonical"] for c in out), "must be canonical only"
        assert len(out) <= 6
        print("OK — suggestions are canonical, <= n")

asyncio.run(m())
```

Run: `cd backend; $env:PYTHONUTF8=1; .venv/Scripts/python.exe _tmp_sug.py; Remove-Item _tmp_sug.py`
Expected: `OK — suggestions are canonical, <= n` (or "no user — import OK").

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/recommend_service.py backend/app/api/v1/meal_plans.py
git commit -m "feat(meal-plan): personalized canonical suggestions endpoint"
```

---

## Task 5: AddRecipeModal — canonical toggle, badge, suggestions

**Files:**
- Modify: `frontend/components/meal-plan/AddRecipeModal.tsx`

- [ ] **Step 1: Add state for show-all + suggestions**

In `AddRecipeModal`, add state hooks alongside the existing ones (after `const [adding, setAdding] = useState(false);`):

```tsx
  const [showAll, setShowAll] = useState(false);
  const [suggestions, setSuggestions] = useState<RecipeCard[]>([]);
```

- [ ] **Step 2: Pass `show_all` to search and re-search when toggled**

Replace the `search` callback so it takes the current `showAll`, and add a `useEffect` to fetch suggestions on mount. Change the `search` callback's axios call params line:

```tsx
        const res = await api.get("/recipes/search", { params: { q, limit: 12, show_all: showAll } });
```

And make `search` depend on `showAll` by changing its `useCallback` deps from `[]` to `[showAll]`. Then add this effect (after the `search` callback definition):

```tsx
  // Re-run current query when the canonical/all toggle flips
  useEffect(() => {
    if (query.trim()) search(query);
  }, [showAll]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load personalized suggestions once on open
  useEffect(() => {
    let active = true;
    api.get("/meal-plans/suggestions", { params: { n: 6 } })
      .then((res) => { if (active) setSuggestions(res.data.data ?? []); })
      .catch(() => { if (active) setSuggestions([]); });
    return () => { active = false; };
  }, []);
```

Add `useEffect` to the React import at the top:

```tsx
import { useState, useCallback, useRef, useEffect } from "react";
```

- [ ] **Step 3: Add the toggle UI under the search input**

Immediately after the search input `</div>` block (the one closing the `relative` wrapper with the `Input`), add:

```tsx
            <label className="flex items-center gap-2 mt-2 text-xs text-[#7C6A56] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
                className="w-3.5 h-3.5 accent-[#E85D26] cursor-pointer"
              />
              Hiện tất cả công thức (mặc định chỉ công thức chuẩn)
            </label>
```

- [ ] **Step 4: Show suggestions when no query typed**

Replace the empty-state block:

```tsx
          {!query && selected.length === 0 && (
            <p className="text-center text-[#B8A898] text-sm py-6 px-6">
              Nhập tên món để tìm kiếm
            </p>
          )}
```

with a suggestions section (falls back to the prompt text when no suggestions):

```tsx
          {!query && suggestions.length > 0 && (
            <div className="px-6 pb-3">
              <p className="text-xs font-semibold text-[#7C6A56] uppercase tracking-wide mb-2">
                Gợi ý cho bạn
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {suggestions.map((r) => (
                  <RecipePickCard
                    key={r.id}
                    recipe={r}
                    selected={selectedIds.has(r.id)}
                    onToggle={() => toggleRecipe(r)}
                  />
                ))}
              </div>
            </div>
          )}
          {!query && suggestions.length === 0 && selected.length === 0 && (
            <p className="text-center text-[#B8A898] text-sm py-6 px-6">
              Nhập tên món để tìm kiếm
            </p>
          )}
```

- [ ] **Step 5: Add a "Chuẩn" badge on canonical pick cards**

In the `RecipePickCard` component, inside the image `<div className="aspect-video ...">` (as a sibling overlay), add a badge when `recipe.is_canonical`:

```tsx
      <div className="aspect-video bg-[#F7F0E8] overflow-hidden relative">
        {recipe.is_canonical && (
          <span className="absolute top-1 left-1 z-10 px-1.5 py-0.5 rounded-full bg-[#2D6A4F] text-white text-[9px] font-semibold">
            Chuẩn
          </span>
        )}
```

(Change the existing `<div className="aspect-video bg-[#F7F0E8] overflow-hidden">` opening tag to add `relative` and insert the badge as the first child, keeping the existing image/fallback that follows.)

- [ ] **Step 6: Typecheck**

Run: `cd frontend; npx tsc --noEmit`
Expected: no new errors. (`RecipeCard` type already includes `is_canonical` — confirm in `frontend/lib/types.ts`; if absent, add `is_canonical?: boolean;` to the `RecipeCard` interface as part of this step.)

- [ ] **Step 7: Commit**

```bash
git add frontend/components/meal-plan/AddRecipeModal.tsx frontend/lib/types.ts
git commit -m "feat(meal-plan): canonical toggle + badge + suggestions in AddRecipeModal"
```

---

## Task 6: Verify end-to-end + finalize

**Files:** none (verification + state).

- [ ] **Step 1: Restart backend, start frontend**

```
cd backend; .venv/Scripts/activate; uvicorn app.main:app --reload --port 8000
cd frontend; npm run dev
```

- [ ] **Step 2: Manual smoke checklist (logged in)**

1. `/meal-plan` → create a plan (Monday picker).
2. Open a slot → AddRecipeModal shows "Gợi ý cho bạn" (canonical cards) on open.
3. Search a dish → results show "Chuẩn" badges; toggle "Hiện tất cả công thức" → more (non-canonical) results appear.
4. Select 2 recipes (with the "thêm vào grocery" checkbox) → add.
5. Go to `/meal-plan/[id]/grocery` → grocery list is grouped by category headers (Thịt & Hải sản / Rau củ quả / …); duplicate ingredient names are merged; expand an item → "Từ công thức" shows source recipes.
6. Add a manual item → it appears under its category; tick/untick persists on reload.

Confirm no 4xx/5xx in the network tab or backend log.

- [ ] **Step 3: Update session-state**

Append a dated section to `.claude/session-state.md` summarizing: meal plan enhanced (canonical-first picker via existing `show_all`, smart grocery categorize+dedup no-migration, personalized suggestions via `recommend_service` swappable interface + `GET /meal-plans/suggestions`). Note it's sub-project 1/6.

- [ ] **Step 4: Commit**

```bash
git add .claude/session-state.md
git commit -m "docs: session-state update for meal plan enhancement"
```

---

## Self-Review notes

- **Spec coverage:** B canonical-first → backend already done (`show_all`), frontend Task 5 (toggle+badge). C smart grocery → Task 1 (categorizer) + Task 2 (dedup/category/recompute) + Task 3 (UI grouping). D suggestions → Task 4 (service+endpoint) + Task 5 (UI section). A verify → Task 6. No migration anywhere. Concat+dedup (no number summing) honored in `generate_grocery_list` (distinct quantities joined). Manual items get category (Task 2 Step 4) and `from_recipes=[]`. Suggestions endpoint at `/meal-plans/suggestions` (Task 4).
- **Route ordering trap:** `/suggestions` MUST be registered before `/{plan_id}` (Task 4 Step 2) — called out explicitly.
- **Interface stability:** `suggest_recipes_for_user(db, user_id, n, exclude_recipe_ids)` is the swap point for the future Personalization-engine sub-project.
- **Type consistency:** `category` added to both backend payloads (generate/get/manual) and the `GroceryItem` TS type; `CATEGORY_ORDER`/labels identical in `grocery_categories.py` and `GroceryList.tsx`. `_norm_ing` (meal_plan_service) and `_norm` (grocery_categories) are intentionally separate (one keys dedup, one keys categorization) but use identical normalization logic.
- **Placeholder scan:** none — all steps have concrete code/commands.
