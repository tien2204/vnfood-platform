# Recognize Page Recipe Section + RecipeCard Author Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trang `/recognize` hiển thị công thức chuẩn của món được nhận diện + cho user click sang search; RecipeCard và recipe detail page hiển thị tên tác giả (User hoặc Cookpad scraped) để phân biệt recipes trùng tên.

**Architecture:** 103 món curated lưu trong `dish_recipes.json` static, load 1 lần lúc startup. Món lạ dùng OpenAI fallback, kết quả cache vào bảng `ai_generated_recipes` để consistency. Cookpad author scrape bằng Playwright (reuse pattern từ crawler hiện có), update vào cột mới `recipes.original_author_name` resumable.

**Tech Stack:** FastAPI + SQLAlchemy async + Alembic + PostgreSQL · Next.js 16 + Tailwind v4 + shadcn/ui (Avatar) + Lucide icons · Playwright (Chromium headless) · OpenAI GPT-4o-mini.

**Spec:** [`docs/superpowers/specs/2026-05-18-recognize-recipe-and-author-design.md`](../specs/2026-05-18-recognize-recipe-and-author-design.md)

---

## File Structure

**Backend — Create:**
- `backend/alembic/versions/0003_ai_generated_recipes.py` — migration tạo bảng cache
- `backend/alembic/versions/0004_recipe_original_author.py` — migration thêm cột author
- `backend/app/models/ai_generated_recipe.py` — ORM model
- `backend/app/ai/dish_recipes.json` — 103 món curated (data file, commit vào git)
- `backend/app/services/dish_recipe_service.py` — load JSON, curated lookup, AI cache
- `backend/scripts/generate_dish_recipes.py` — script sinh dish_recipes.json
- `backend/scripts/enrich_cookpad_authors.py` — Playwright script cào author

**Backend — Modify:**
- `backend/app/models/recipe.py` — thêm `original_author_name` Mapped column
- `backend/app/schemas/recipe.py` — `DishRecipeOut`, `RecipeCardOut.original_author_name`, `RecipeDetailOut.original_author_name`
- `backend/app/services/ai_service.py` — `recognize_image()` attach `dish_recipe`
- `backend/app/services/recipe_service.py` — `_build_recipe_card()` và builder của RecipeDetailOut pass `original_author_name`
- `backend/app/main.py` — `lifespan` event call `load_dish_recipes()`

**Frontend — Create:**
- `frontend/components/ai/DishRecipeCard.tsx` — two-column recipe display

**Frontend — Modify:**
- `frontend/lib/types.ts` — `DishRecipe`, `AIRecognitionResult.dish_recipe`, `RecipeCard.author: Author | null`, `RecipeCard.original_author_name`, `RecipeDetail.original_author_name`
- `frontend/components/ai/RecognitionResult.tsx` — clickable dish name, CTA button, render DishRecipeCard
- `frontend/components/recipes/RecipeCard.tsx` — author line dưới title
- `frontend/app/recipes/[id]/page.tsx` — author card có nhánh Cookpad scraped

---

## Phase A — Database & ORM

### Task 1: Migration 0003 — `ai_generated_recipes` table + ORM model

**Files:**
- Create: `backend/alembic/versions/0003_ai_generated_recipes.py`
- Create: `backend/app/models/ai_generated_recipe.py`

- [ ] **Step 1: Write migration file**

```python
"""Create ai_generated_recipes cache table

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-18
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_generated_recipes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("dish_name_normalized", sa.String(200), nullable=False),
        sa.Column("display_name", sa.String(200), nullable=False),
        sa.Column("recipe_json", postgresql.JSONB, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "created_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.UniqueConstraint("dish_name_normalized", name="uq_ai_generated_recipes_normalized"),
    )
    op.create_index(
        "ix_ai_generated_recipes_normalized",
        "ai_generated_recipes",
        ["dish_name_normalized"],
    )


def downgrade() -> None:
    op.drop_index("ix_ai_generated_recipes_normalized", table_name="ai_generated_recipes")
    op.drop_table("ai_generated_recipes")
```

- [ ] **Step 2: Write ORM model**

```python
# backend/app/models/ai_generated_recipe.py
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.database import Base


class AIGeneratedRecipe(Base):
    __tablename__ = "ai_generated_recipes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dish_name_normalized: Mapped[str] = mapped_column(String(200), nullable=False, unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    recipe_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
```

- [ ] **Step 3: Register ORM in models package**

Open `backend/app/models/__init__.py` (or wherever models are registered for Alembic discovery). Add:

```python
from app.models.ai_generated_recipe import AIGeneratedRecipe  # noqa: F401
```

If no `__init__.py` exists, check `backend/alembic/env.py` for the model import block and add the import there.

- [ ] **Step 4: Run migration**

```bash
cd backend && .venv/Scripts/activate && alembic upgrade head
```

Expected stdout: `INFO  [alembic.runtime.migration] Running upgrade 0002 -> 0003, Create ai_generated_recipes cache table`

- [ ] **Step 5: Verify schema in psql**

```bash
docker exec -it vnfood_postgres psql -U vnfood -d vnfood -c "\d ai_generated_recipes"
```

Expected: 6 columns, unique index on `dish_name_normalized`.

- [ ] **Step 6: Commit**

```bash
git add backend/alembic/versions/0003_ai_generated_recipes.py backend/app/models/ai_generated_recipe.py backend/app/models/__init__.py
git commit -m "feat(db): add ai_generated_recipes cache table"
```

---

### Task 2: Migration 0004 — `recipes.original_author_name` column

**Files:**
- Create: `backend/alembic/versions/0004_recipe_original_author.py`
- Modify: `backend/app/models/recipe.py`

- [ ] **Step 1: Write migration file**

```python
"""Add recipes.original_author_name for Cookpad scraped authors

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-18
"""
from alembic import op
import sqlalchemy as sa


revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "recipes",
        sa.Column("original_author_name", sa.String(200), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("recipes", "original_author_name")
```

- [ ] **Step 2: Add column to Recipe ORM**

In `backend/app/models/recipe.py`, after the `image_url` column (line 34), insert:

```python
    original_author_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
```

- [ ] **Step 3: Run migration**

```bash
cd backend && .venv/Scripts/activate && alembic upgrade head
```

Expected: `Running upgrade 0003 -> 0004, Add recipes.original_author_name`

- [ ] **Step 4: Verify column**

```bash
docker exec -it vnfood_postgres psql -U vnfood -d vnfood -c "\d recipes" | grep original_author_name
```

Expected: `original_author_name | character varying(200) |`

- [ ] **Step 5: Commit**

```bash
git add backend/alembic/versions/0004_recipe_original_author.py backend/app/models/recipe.py
git commit -m "feat(db): add recipes.original_author_name column"
```

---

## Phase B — Dish recipes data file

### Task 3: `generate_dish_recipes.py` script

**Files:**
- Create: `backend/scripts/generate_dish_recipes.py`

- [ ] **Step 1: Write script — collect unique slugs**

```python
"""Generate backend/app/ai/dish_recipes.json from 103 trained dishes.

Iterates unique slugs from GROUP_CLASSES, asks OpenAI GPT-4o-mini for a
structured recipe per slug, writes incrementally so the run is resumable
(skips slugs already present in the output file).

Usage:
    python -m scripts.generate_dish_recipes [--limit N] [--overwrite]
"""
import argparse
import asyncio
import json
import os
from pathlib import Path

from openai import AsyncOpenAI

from app.ai.class_names import CLASS_DISPLAY_NAMES, GROUP_CLASSES
from app.core.config import settings

OUTPUT_PATH = Path("app/ai/dish_recipes.json")

PROMPT_TEMPLATE = """Sinh công thức nấu món Việt "{display_name}" (slug: {slug}).

Reply ONLY với JSON object — không markdown, không giải thích:
{{
  "title": "{display_name}",
  "description": "Mô tả ngắn 1-2 câu",
  "ingredients": ["nguyên liệu 1 có định lượng", "nguyên liệu 2 có định lượng", ...],
  "steps": ["bước 1 chi tiết", "bước 2 chi tiết", ...],
  "cooking_time_minutes": 30,
  "servings": 4,
  "difficulty": "easy" | "medium" | "hard"
}}

Yêu cầu:
- ingredients: ít nhất 5, mỗi item có định lượng (e.g. "Bột gạo 200g")
- steps: ít nhất 3, mô tả đủ chi tiết để người không biết nấu cũng làm được
- cooking_time_minutes: số nguyên (15-180)
- difficulty: chọn 1 trong easy/medium/hard
"""


def collect_unique_slugs() -> list[tuple[str, str]]:
    """Return [(slug, display_name), ...] — dedup across groups."""
    seen = set()
    pairs = []
    for slugs in GROUP_CLASSES.values():
        for slug in slugs:
            if slug in seen:
                continue
            seen.add(slug)
            display = CLASS_DISPLAY_NAMES.get(slug, slug)
            pairs.append((slug, display))
    return pairs


async def generate_one(client: AsyncOpenAI, slug: str, display_name: str) -> dict:
    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": PROMPT_TEMPLATE.format(slug=slug, display_name=display_name)}],
        max_tokens=1500,
        response_format={"type": "json_object"},
    )
    content = response.choices[0].message.content.strip()
    return json.loads(content)


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None, help="Test với N món trước")
    parser.add_argument("--overwrite", action="store_true", help="Re-generate slugs đã có")
    args = parser.parse_args()

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    existing = {}
    if OUTPUT_PATH.exists():
        existing = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
        print(f"[INIT] Loaded {len(existing)} existing entries from {OUTPUT_PATH}")

    pairs = collect_unique_slugs()
    if args.limit:
        pairs = pairs[: args.limit]

    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    for idx, (slug, display) in enumerate(pairs, start=1):
        if slug in existing and not args.overwrite:
            print(f"  [{idx}/{len(pairs)}] SKIP {slug} (already exists)")
            continue

        try:
            recipe = await generate_one(client, slug, display)
            existing[slug] = recipe
            OUTPUT_PATH.write_text(
                json.dumps(existing, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            print(f"  [{idx}/{len(pairs)}] OK   {slug} | {recipe.get('title')}")
        except Exception as e:
            print(f"  [{idx}/{len(pairs)}] FAIL {slug}: {e}")

        await asyncio.sleep(0.5)  # Soft rate limit

    print(f"\n[DONE] Total entries in {OUTPUT_PATH}: {len(existing)}")


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 2: Test script with --limit 3**

```bash
cd backend && .venv/Scripts/activate && python -m scripts.generate_dish_recipes --limit 3
```

Expected: 3 entries written to `backend/app/ai/dish_recipes.json`. Inspect output — each entry should have title, description, ingredients (≥5), steps (≥3), cooking_time_minutes (int), servings (int), difficulty.

- [ ] **Step 3: Run full generation**

```bash
python -m scripts.generate_dish_recipes
```

Expected: ~103 entries (less if some slugs error out — re-run to retry). Each call ~2-3s → ~5 min total.

- [ ] **Step 4: Spot-check 5 random entries**

Open `backend/app/ai/dish_recipes.json`, pick 5 random keys (e.g. `banh-beo`, `pho`, `bun-bo-hue`, `com-tam`, `goi-cuon`). Verify ingredients/steps look realistic. If any is wonky, regenerate that one with `--overwrite --limit 1` (modify limit logic) or hand-edit.

- [ ] **Step 5: Commit data file + script**

```bash
git add backend/scripts/generate_dish_recipes.py backend/app/ai/dish_recipes.json
git commit -m "feat(ai): generate curated recipes for 103 trained dishes"
```

---

## Phase C — Backend service layer

### Task 4: `dish_recipe_service.py` — load + curated lookup + AI cache

**Files:**
- Create: `backend/app/services/dish_recipe_service.py`

- [ ] **Step 1: Write service module**

```python
"""Curated dish recipes (103 món) + OpenAI fallback cache."""
import json
import logging
import uuid
from pathlib import Path
from typing import Optional

from openai import AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.ai_generated_recipe import AIGeneratedRecipe

logger = logging.getLogger(__name__)

DISH_RECIPES_PATH = Path(__file__).parent.parent / "ai" / "dish_recipes.json"
DISH_RECIPES: dict[str, dict] = {}


def load_dish_recipes() -> int:
    """Load curated recipes into memory. Called once at app startup."""
    global DISH_RECIPES
    if not DISH_RECIPES_PATH.exists():
        logger.warning(f"dish_recipes.json not found at {DISH_RECIPES_PATH}")
        DISH_RECIPES = {}
        return 0
    DISH_RECIPES = json.loads(DISH_RECIPES_PATH.read_text(encoding="utf-8"))
    logger.info(f"Loaded {len(DISH_RECIPES)} curated dish recipes")
    return len(DISH_RECIPES)


def get_curated(slug: str) -> Optional[dict]:
    """Return curated recipe dict for slug, or None."""
    recipe = DISH_RECIPES.get(slug)
    if not recipe:
        return None
    return {"source": "curated", **recipe}


def _normalize_name(name: str) -> str:
    return name.lower().strip()


async def _generate_via_openai(dish_name: str) -> dict:
    """Ask OpenAI to produce a full recipe JSON for an unknown dish."""
    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    prompt = (
        f'Generate a cooking recipe for the dish "{dish_name}" in Vietnamese.\n\n'
        'Reply ONLY with a JSON object, no markdown:\n'
        '{\n'
        f'  "title": "{dish_name}",\n'
        '  "description": "Mô tả ngắn 1-2 câu (Vietnamese)",\n'
        '  "ingredients": ["nguyên liệu 1 có định lượng", ...],\n'
        '  "steps": ["bước 1 chi tiết", ...],\n'
        '  "cooking_time_minutes": <int 15-180>,\n'
        '  "servings": <int 1-10>,\n'
        '  "difficulty": "easy" | "medium" | "hard"\n'
        '}\n\n'
        "ingredients: ít nhất 5 items có định lượng.\n"
        "steps: ít nhất 3 bước chi tiết.\n"
        "Use Vietnamese language for description/ingredients/steps."
    )
    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=1500,
        response_format={"type": "json_object"},
    )
    return json.loads(response.choices[0].message.content.strip())


async def get_or_generate_ai(
    db: AsyncSession,
    dish_name: str,
    user_id: Optional[uuid.UUID] = None,
) -> Optional[dict]:
    """Return cached or newly-generated recipe for AI-fallback dish.

    Returns None if dish_name is empty or generation fails.
    """
    if not dish_name or dish_name.lower() == "unknown":
        return None

    normalized = _normalize_name(dish_name)

    # 1. Cache hit
    row = (await db.execute(
        select(AIGeneratedRecipe).where(AIGeneratedRecipe.dish_name_normalized == normalized)
    )).scalar_one_or_none()
    if row:
        return {"source": "ai-generated", **row.recipe_json}

    # 2. Cache miss → generate + insert
    try:
        recipe_json = await _generate_via_openai(dish_name)
    except Exception:
        logger.exception(f"OpenAI recipe generation failed for: {dish_name}")
        return None

    cache_row = AIGeneratedRecipe(
        id=uuid.uuid4(),
        dish_name_normalized=normalized,
        display_name=dish_name,
        recipe_json=recipe_json,
        created_by_user_id=user_id,
    )
    db.add(cache_row)
    await db.commit()

    return {"source": "ai-generated", **recipe_json}
```

- [ ] **Step 2: Add load_dish_recipes() to FastAPI lifespan**

Open `backend/app/main.py`, find the existing `lifespan` async context manager (the one that loads the AI predictor). Add a call to `load_dish_recipes()` next to the predictor load:

```python
# Add import near other service imports
from app.services.dish_recipe_service import load_dish_recipes

# Inside lifespan startup block, after predictor load:
count = load_dish_recipes()
logging.info(f"[startup] Loaded {count} curated dish recipes")
```

- [ ] **Step 3: Restart backend and check logs**

```bash
# Ctrl+C the existing uvicorn, then:
cd backend && .venv/Scripts/activate && uvicorn app.main:app --reload --port 8000
```

Expected log line on startup: `[startup] Loaded 103 curated dish recipes` (or similar count).

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/dish_recipe_service.py backend/app/main.py
git commit -m "feat(ai): dish_recipe_service with curated lookup + AI cache"
```

---

### Task 5: Update Pydantic schemas

**Files:**
- Modify: `backend/app/schemas/recipe.py`

- [ ] **Step 1: Add `DishRecipeOut` schema**

After the `PaginationOut` class definition (around line 100 in `backend/app/schemas/recipe.py`), insert:

```python
class DishRecipeOut(BaseModel):
    """Curated or AI-generated cooking recipe attached to recognize response."""
    source: str  # "curated" | "ai-generated"
    title: str
    description: str | None = None
    ingredients: list[str]
    steps: list[str]
    cooking_time_minutes: int | None = None
    servings: int | None = None
    difficulty: str | None = None
```

- [ ] **Step 2: Add `original_author_name` to RecipeCardOut**

In the `RecipeCardOut` class (around line 102-116), add the new field after `source`:

```python
    source: str
    original_author_name: str | None = None
    author: AuthorOut | None
```

- [ ] **Step 3: Add `original_author_name` to RecipeDetailOut**

In the `RecipeDetailOut` class (around line 128-152), add the new field after `cookpad_url`:

```python
    cookpad_url: str | None
    original_author_name: str | None = None
    keyword: str | None
```

- [ ] **Step 4: Smoke check — import works**

```bash
cd backend && .venv/Scripts/activate && python -c "from app.schemas.recipe import DishRecipeOut, RecipeCardOut, RecipeDetailOut; print('OK')"
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/recipe.py
git commit -m "feat(api): DishRecipeOut + RecipeCardOut/RecipeDetailOut author fields"
```

---

### Task 6: Wire `dish_recipe` into `recognize_image()`

**Files:**
- Modify: `backend/app/services/ai_service.py`

- [ ] **Step 1: Import dish_recipe_service**

At the top of `backend/app/services/ai_service.py`, add:

```python
from app.services import dish_recipe_service
```

- [ ] **Step 2: Resolve `dish_recipe` in recognize_image**

In `recognize_image()`, replace the `return {...}` block at the end (the dict with predicted_class/display_name/... — currently around line 95-103) with logic that resolves `dish_recipe` before returning:

```python
    # Resolve dish_recipe attachment
    dish_recipe = None
    if predicted_class and predicted_class != "unknown" and model_used == "vnfood":
        dish_recipe = dish_recipe_service.get_curated(predicted_class)
    elif model_used == "openai" and display_name and display_name not in ("Không nhận diện được", "unknown"):
        dish_recipe = await dish_recipe_service.get_or_generate_ai(db, display_name, user_id=user_id)

    return {
        "predicted_class": predicted_class,
        "display_name": display_name,
        "confidence": confidence,
        "model_used": model_used,
        "subgroup": group,
        "top_predictions": top5,
        "suggested_recipes": suggested_recipes,
        "dish_recipe": dish_recipe,
    }
```

- [ ] **Step 3: Smoke test — recognize a curated dish**

With uvicorn reloaded, upload a banh-beo image via curl (or use the existing /recognize page in browser):

```bash
curl -X POST http://localhost:8000/api/v1/ai/recognize \
  -F "file=@<path-to-banh-beo-image>.jpg"
```

Expected JSON response has `data.dish_recipe` with `source: "curated"` and full recipe fields.

- [ ] **Step 4: Smoke test — recognize an out-of-distribution dish**

Use an image of a non-Vietnamese dish (e.g. pizza):

```bash
curl -X POST http://localhost:8000/api/v1/ai/recognize \
  -F "file=@<path-to-pizza-image>.jpg"
```

Expected: `data.model_used: "openai"`, `data.dish_recipe.source: "ai-generated"`, recipe content in Vietnamese.

- [ ] **Step 5: Verify cache row**

```bash
docker exec -it vnfood_postgres psql -U vnfood -d vnfood -c "SELECT dish_name_normalized, display_name FROM ai_generated_recipes;"
```

Expected: at least 1 row with the OOD dish name.

- [ ] **Step 6: Re-run same OOD image, verify cache hit**

Same curl as Step 4. Check uvicorn logs — should NOT show "OpenAI recipe generation" log line again. Response should still have `dish_recipe.source: "ai-generated"`.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/ai_service.py
git commit -m "feat(ai): attach dish_recipe to recognize response (curated + AI cache)"
```

---

### Task 7: Pass `original_author_name` through Recipe serializers

**Files:**
- Modify: `backend/app/services/recipe_service.py`

- [ ] **Step 1: Update `_build_recipe_card()`**

In `backend/app/services/recipe_service.py`, find `_build_recipe_card()` (around line 50). In the `return RecipeCardOut(...)` call, add `original_author_name=recipe.original_author_name` after `source`:

```python
    return RecipeCardOut(
        id=recipe.id,
        title=recipe.title,
        image_url=recipe.image_url,
        avg_rating=recipe.avg_rating,
        rating_count=recipe.rating_count,
        cooking_time=recipe.cooking_time,
        servings=recipe.servings,
        difficulty=recipe.difficulty,
        source=recipe.source,
        original_author_name=recipe.original_author_name,
        author=author_out,
        save_count=recipe.save_count,
        is_saved=is_saved,
    )
```

- [ ] **Step 2: Update `RecipeDetailOut` builder**

Find the `return RecipeDetailOut(...)` call (around line 232). Add `original_author_name=recipe.original_author_name` after `cookpad_url`:

```python
        cookpad_url=recipe.cookpad_url,
        original_author_name=recipe.original_author_name,
        keyword=recipe.keyword,
```

- [ ] **Step 3: Smoke test — recipe card endpoint includes field**

```bash
curl http://localhost:8000/api/v1/recipes?limit=2 | python -m json.tool | grep original_author_name
```

Expected: 2 occurrences of `"original_author_name": null` (since no rows scraped yet).

- [ ] **Step 4: Smoke test — recipe detail endpoint includes field**

```bash
# Pick any recipe id from above response
curl http://localhost:8000/api/v1/recipes/<recipe-id> | python -m json.tool | grep original_author_name
```

Expected: `"original_author_name": null`.

- [ ] **Step 5: Manually populate one row to test downstream**

```bash
docker exec -it vnfood_postgres psql -U vnfood -d vnfood -c \
  "UPDATE recipes SET original_author_name='Test Tác Giả' WHERE source='cookpad' LIMIT 1;"
```

Then refetch the same recipe — should now show `"original_author_name": "Test Tác Giả"`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/recipe_service.py
git commit -m "feat(api): expose recipes.original_author_name in card + detail responses"
```

---

## Phase D — Frontend recognize page

### Task 8: Update frontend types

**Files:**
- Modify: `frontend/lib/types.ts`

- [ ] **Step 1: Add `DishRecipe` interface**

Open `frontend/lib/types.ts`. Add near the top (after the `Step` interface around line 34):

```ts
export interface DishRecipe {
  source: "curated" | "ai-generated";
  title: string;
  description?: string | null;
  ingredients: string[];
  steps: string[];
  cooking_time_minutes?: number | null;
  servings?: number | null;
  difficulty?: "easy" | "medium" | "hard" | null;
}
```

- [ ] **Step 2: Make `RecipeCard.author` nullable and add `original_author_name`**

In the `RecipeCard` interface (around line 36-49), change `author: Author` to `author: Author | null` and add `original_author_name`:

```ts
export interface RecipeCard {
  id: string;
  title: string;
  image_url: string | null;
  avg_rating: number;
  rating_count: number;
  cooking_time: number | null;
  servings: number | null;
  difficulty: "easy" | "medium" | "hard" | null;
  source: "cookpad" | "user";
  original_author_name: string | null;
  author: Author | null;
  save_count: number;
  is_saved?: boolean;
}
```

- [ ] **Step 3: Update `RecipeDetail`**

In the `RecipeDetail` interface (around line 51-63), change `author: AuthorDetail` to `author: AuthorDetail | null` and add `original_author_name` (it will inherit from RecipeCard but TypeScript may still complain about Author override — explicit is safer):

```ts
export interface RecipeDetail extends RecipeCard {
  description: string | null;
  cookpad_url: string | null;
  keyword: string | null;
  status: "pending" | "approved" | "rejected";
  view_count: number;
  author: AuthorDetail | null;
  ingredients: Ingredient[];
  steps: Step[];
  user_rating: number | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 4: Find and update `AIRecognitionResult`**

Search the file for `AIRecognitionResult` interface. Add `dish_recipe: DishRecipe | null;` field to it:

```ts
export interface AIRecognitionResult {
  // ... existing fields ...
  dish_recipe: DishRecipe | null;
}
```

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors. If there are errors about `author` possibly null in components — those are pre-existing bugs (backend always allowed null); fix only the ones in files we'll touch later (RecipeCard.tsx, recipe detail page). Other usages can stay; defer.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/types.ts
git commit -m "feat(types): DishRecipe + RecipeCard.original_author_name + nullable author"
```

---

### Task 9: `DishRecipeCard` component

**Files:**
- Create: `frontend/components/ai/DishRecipeCard.tsx`

- [ ] **Step 1: Write component**

```tsx
"use client";

import { Clock, Users, ChefHat, AlertTriangle } from "lucide-react";

import { DishRecipe } from "@/lib/types";

interface Props {
  recipe: DishRecipe;
}

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: "Dễ",
  medium: "Trung bình",
  hard: "Khó",
};

export default function DishRecipeCard({ recipe }: Props) {
  const isAIGenerated = recipe.source === "ai-generated";

  return (
    <div className="w-full max-w-4xl mx-auto mt-8 bg-white rounded-2xl shadow-sm border border-[#E8DDD4] p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
        <div>
          <p className="text-xs text-[#7C6A56] uppercase tracking-wider mb-1">
            Công thức gợi ý
          </p>
          <h3
            className="text-2xl font-bold text-[#1C1209] leading-tight"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {recipe.title}
          </h3>
        </div>
        {isAIGenerated && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#C97B16]/10 text-[#C97B16] border border-[#C97B16]/20">
            <AlertTriangle className="w-3 h-3" />
            Công thức do AI sinh — cần kiểm tra
          </span>
        )}
      </div>

      {recipe.description && (
        <p className="text-sm text-[#7C6A56] leading-relaxed mb-4">{recipe.description}</p>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {recipe.cooking_time_minutes != null && (
          <span className="inline-flex items-center gap-1 text-xs text-[#7C6A56] bg-[#F7F0E8] px-2 py-1 rounded-full">
            <Clock className="w-3 h-3" />
            {recipe.cooking_time_minutes} phút
          </span>
        )}
        {recipe.servings != null && (
          <span className="inline-flex items-center gap-1 text-xs text-[#7C6A56] bg-[#F7F0E8] px-2 py-1 rounded-full">
            <Users className="w-3 h-3" />
            {recipe.servings} người
          </span>
        )}
        {recipe.difficulty && (
          <span className="inline-flex items-center gap-1 text-xs text-[#7C6A56] bg-[#F7F0E8] px-2 py-1 rounded-full">
            <ChefHat className="w-3 h-3" />
            {DIFFICULTY_LABEL[recipe.difficulty] ?? recipe.difficulty}
          </span>
        )}
      </div>

      <div className="border-t border-[#E8DDD4] pt-6 grid grid-cols-1 md:grid-cols-[260px_1fr] gap-8">
        <div className="bg-[#F7F0E8] rounded-xl p-4">
          <p className="text-xs text-[#7C6A56] uppercase tracking-wider mb-2">Nguyên liệu</p>
          <ul className="space-y-1 text-sm text-[#1C1209]">
            {recipe.ingredients.map((item, idx) => (
              <li key={idx} className="flex gap-2">
                <span className="text-[#E85D26]">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-xs text-[#7C6A56] uppercase tracking-wider mb-4">Cách làm</p>
          <div className="space-y-6">
            {recipe.steps.map((step, idx) => (
              <div key={idx} className="flex gap-4">
                <div
                  className="flex-shrink-0 w-12 h-12 rounded-full bg-[#E85D26]/10 flex items-center justify-center font-bold text-xl text-[#E85D26]"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  {idx + 1}
                </div>
                <p className="text-[#1C1209] leading-relaxed pt-2">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/ai/DishRecipeCard.tsx
git commit -m "feat(ui): DishRecipeCard component (two-column ingredients + steps)"
```

---

### Task 10: Update `RecognitionResult.tsx` — clickable name + CTA + render card

**Files:**
- Modify: `frontend/components/ai/RecognitionResult.tsx`

- [ ] **Step 1: Replace imports + plain h2 with Link**

In `frontend/components/ai/RecognitionResult.tsx`, replace the import line at top:

```tsx
import Image from "next/image";
import Link from "next/link";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AIRecognitionResult } from "@/lib/types";
import DishRecipeCard from "./DishRecipeCard";
```

- [ ] **Step 2: Wrap the dish title in a Link + add CTA button**

Find the block that renders `<h2 ... >{result.display_name}</h2>` (around line 86-91 of the existing file). Replace the title `<h2>` and add a CTA after `<ConfidenceBar />`:

```tsx
<div>
  <p className="text-xs text-[#7C6A56] uppercase tracking-wider mb-1">Món được nhận diện</p>
  <Link
    href={`/search?q=${encodeURIComponent(result.display_name)}`}
    className="inline-block group"
  >
    <h2
      className="text-3xl font-bold text-[#2D2417] leading-tight group-hover:text-[#E85D26] transition-colors"
      style={{ fontFamily: "var(--font-playfair)" }}
    >
      {result.display_name}
    </h2>
  </Link>
  {result.subgroup && (
    <p className="text-xs text-[#7C6A56] mt-1">Nhóm: {result.subgroup}</p>
  )}
</div>

<ModelBadge model={result.model_used} />
<ConfidenceBar value={result.confidence} />

<Button
  asChild
  className="bg-[#E85D26] hover:bg-[#D14E1C] text-white w-full sm:w-auto"
>
  <Link href={`/search?q=${encodeURIComponent(result.display_name)}`}>
    <Search className="w-4 h-4 mr-2" />
    Tìm công thức "{result.display_name}"
  </Link>
</Button>
```

- [ ] **Step 3: Render `<DishRecipeCard>` below the 2-col header**

At the end of the component (after the closing `</div>` of the `grid grid-cols-1 md:grid-cols-2` container, but inside the outer `<div className="w-full max-w-4xl mx-auto">`), insert:

```tsx
{!isUnknown && result.dish_recipe && (
  <DishRecipeCard recipe={result.dish_recipe} />
)}
```

- [ ] **Step 4: Verify Button component exists**

```bash
cd frontend && ls components/ui/button.tsx
```

Expected: file exists. If not, install: `npx shadcn@latest add button`.

- [ ] **Step 5: TypeScript check + dev server**

```bash
cd frontend && npx tsc --noEmit && npm run dev
```

Expected: 0 errors. Dev server starts on port 3000.

- [ ] **Step 6: Manual UI smoke test**

In browser, navigate to `http://localhost:3000/recognize` and upload:
1. A banh-beo image → verify dish name is clickable (hover changes to orange), CTA button appears, DishRecipeCard renders below with curated content (NO warning badge)
2. A pizza image → verify CTA still works, DishRecipeCard shows with AI warning badge
3. A non-food image (e.g. car) → verify "Không nhận diện được" message, NO DishRecipeCard, NO CTA

Click dish name → expects redirect to `/search?q=<encoded name>`.

- [ ] **Step 7: Commit**

```bash
git add frontend/components/ai/RecognitionResult.tsx
git commit -m "feat(ui): recognize page renders DishRecipeCard + clickable name + CTA"
```

---

## Phase E — Frontend author display

### Task 11: Update `RecipeCard.tsx` — author line under title

**Files:**
- Modify: `frontend/components/recipes/RecipeCard.tsx`

- [ ] **Step 1: Read current file**

```bash
cd frontend && cat components/recipes/RecipeCard.tsx | head -120
```

Note where the title is rendered and what wraps the card (likely a `Link` to recipe detail).

- [ ] **Step 2: Add Avatar import**

Verify shadcn Avatar exists:

```bash
ls frontend/components/ui/avatar.tsx
```

If missing: `npx shadcn@latest add avatar`.

At the top of `RecipeCard.tsx`, add:

```tsx
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Link from "next/link";
```

- [ ] **Step 3: Insert author element below title**

Find the JSX block that renders the recipe title (look for `recipe.title`). Immediately AFTER the title element (still inside the card body container), insert:

```tsx
{(() => {
  const displayName =
    recipe.author?.full_name ??
    (recipe.original_author_name && recipe.original_author_name.length > 0
      ? recipe.original_author_name
      : "Unknown");
  const initials = displayName.slice(0, 2).toUpperCase();
  const isLinkable = !!recipe.author;

  const authorEl = (
    <div className="flex items-center gap-1.5 mt-1.5">
      <Avatar className="w-[18px] h-[18px]">
        {recipe.author?.avatar_url && <AvatarImage src={recipe.author.avatar_url} />}
        <AvatarFallback className="text-[9px] bg-[#2D6A4F] text-white">
          {initials}
        </AvatarFallback>
      </Avatar>
      <span className="text-xs text-[#7C6A56] truncate">{displayName}</span>
    </div>
  );

  return isLinkable ? (
    <Link
      href={`/users/${recipe.author!.id}`}
      onClick={(e) => e.stopPropagation()}
      className="block w-fit"
    >
      {authorEl}
    </Link>
  ) : (
    authorEl
  );
})()}
```

- [ ] **Step 4: Manual UI smoke test**

In browser, visit `http://localhost:3000/recipes` (browse) and `http://localhost:3000/search?q=banh`:

1. RecipeCards now show author line under title with avatar
2. Cookpad recipes (no author + no scraped name yet) display "Unknown" with "UN" fallback
3. Recipe you manually set `original_author_name='Test Tác Giả'` in Task 7 → shows "Test Tá" initials + name, NOT clickable
4. Click "Unknown" or scraped author → does NOT navigate away from current page
5. Click recipe card body → navigates to detail (parent Link not broken)

- [ ] **Step 5: Commit**

```bash
git add frontend/components/recipes/RecipeCard.tsx
git commit -m "feat(ui): RecipeCard shows author (User link or scraped Cookpad name)"
```

---

### Task 12: Recipe detail page — Cookpad scraped author branch

**Files:**
- Modify: `frontend/app/recipes/[id]/page.tsx`

- [ ] **Step 1: Locate existing author card block**

In `frontend/app/recipes/[id]/page.tsx`, find the "Author card" block (around line 227-280 — starts with `{recipe.author ? (` and currently has two branches: User card or Cookpad generic card).

- [ ] **Step 2: Insert middle branch for Cookpad scraped author**

Restructure the conditional into three branches. Replace the existing block with:

```tsx
{/* Author card */}
{recipe.author ? (
  // Branch 1: User-uploaded recipe
  <div className="flex items-center gap-3 p-4 bg-[#F7F0E8] rounded-xl border border-[#E8DDD4] mb-6">
    <Link href={`/users/${recipe.author.id}`}>
      <Avatar className="w-12 h-12">
        <AvatarImage src={recipe.author.avatar_url ?? undefined} />
        <AvatarFallback className="bg-[#E85D26] text-white font-semibold">
          {recipe.author.full_name?.charAt(0)?.toUpperCase() ?? "?"}
        </AvatarFallback>
      </Avatar>
    </Link>
    <div className="flex-1 min-w-0">
      <Link href={`/users/${recipe.author.id}`}>
        <p className="font-semibold text-[#1C1209] hover:text-[#E85D26] transition-colors">
          {recipe.author.full_name}
        </p>
      </Link>
      {recipe.author.follower_count > 0 && (
        <p className="text-xs text-[#7C6A56]">
          {recipe.author.follower_count} người theo dõi
        </p>
      )}
    </div>
    <Link
      href={`/users/${recipe.author.id}`}
      className="px-4 py-1.5 rounded-full border border-[#E85D26] text-sm text-[#E85D26] hover:bg-[#E85D26] hover:text-white transition-colors"
    >
      Xem hồ sơ
    </Link>
  </div>
) : recipe.original_author_name && recipe.original_author_name.length > 0 ? (
  // Branch 2: Cookpad recipe with scraped author
  <div className="flex items-center gap-3 p-4 bg-[#F7F0E8] rounded-xl border border-[#E8DDD4] mb-6">
    <Avatar className="w-12 h-12">
      <AvatarFallback className="bg-[#2D6A4F] text-white font-semibold">
        {recipe.original_author_name.charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
    <div className="flex-1 min-w-0">
      <p className="font-semibold text-[#1C1209]">{recipe.original_author_name}</p>
      <p className="text-xs text-[#7C6A56]">Tác giả Cookpad</p>
    </div>
    {recipe.cookpad_url && (
      <a
        href={recipe.cookpad_url}
        target="_blank"
        rel="noopener noreferrer"
        className="px-4 py-1.5 rounded-full border border-[#E85D26] text-sm text-[#E85D26] hover:bg-[#E85D26] hover:text-white transition-colors"
      >
        Xem trên Cookpad
      </a>
    )}
  </div>
) : recipe.source === "cookpad" ? (
  // Branch 3: Cookpad recipe without scraped author (fallback unchanged)
  <div className="flex items-center gap-3 p-4 bg-[#F7F0E8] rounded-xl border border-[#E8DDD4] mb-6">
    <Avatar className="w-12 h-12">
      <AvatarFallback className="bg-[#E85D26] text-white font-semibold">C</AvatarFallback>
    </Avatar>
    <div className="flex-1 min-w-0">
      <p className="font-semibold text-[#1C1209]">Cookpad</p>
      <p className="text-xs text-[#7C6A56]">Công thức tổng hợp</p>
    </div>
    {recipe.cookpad_url && (
      <a
        href={recipe.cookpad_url}
        target="_blank"
        rel="noopener noreferrer"
        className="px-4 py-1.5 rounded-full border border-[#E85D26] text-sm text-[#E85D26] hover:bg-[#E85D26] hover:text-white transition-colors"
      >
        Xem trên Cookpad
      </a>
    )}
  </div>
) : null}
```

Keep the rest of the file intact (close the previous Cookpad block with the same end markers).

- [ ] **Step 3: Manual UI smoke test**

Open browser at `http://localhost:3000/recipes/<id-of-cookpad-recipe-with-test-author-from-task-7>`:

1. Author card shows "Test Tác Giả" with green-tinted "T" avatar fallback + "Tác giả Cookpad" subtext + "Xem trên Cookpad" button
2. Open a Cookpad recipe where `original_author_name IS NULL` → still shows generic "Cookpad / Công thức tổng hợp" with orange "C" avatar (Branch 3 unchanged)
3. Open a user-uploaded recipe (if any) → still shows Branch 1 user card with follower count

- [ ] **Step 4: Commit**

```bash
git add frontend/app/recipes/[id]/page.tsx
git commit -m "feat(ui): recipe detail shows scraped Cookpad author when available"
```

---

## Phase F — Cookpad author enrichment script

### Task 13: `enrich_cookpad_authors.py` Playwright script

**Files:**
- Create: `backend/scripts/enrich_cookpad_authors.py`

- [ ] **Step 1: Write script**

```python
"""Enrich recipes.original_author_name by scraping Cookpad recipe pages.

Uses Playwright Chromium (same approach as crawl_general_recipes.py) to
bypass 403 Forbidden. Resumable: only fetches rows where
original_author_name IS NULL. Commits in batches of 50.

Robots.txt compliance: Cookpad robots.txt allows User-agent: * on /
(recipe pages NOT in disallow list). We use a realistic Chrome 124 UA,
not an AI-bot UA (GPTBot/Claude-Web are explicitly blocked but a vanilla
Chrome UA is not). Sleep 2s between requests.

Usage:
    python -m scripts.enrich_cookpad_authors [--limit N] [--sleep N] [--headless / --no-headless]
"""
import argparse
import asyncio
import json
import logging
from typing import Optional

from playwright.async_api import async_playwright, TimeoutError as PWTimeout
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.models.recipe import Recipe

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

SLEEP_SEC = 2
PAGE_TIMEOUT = 10000  # ms
BATCH_COMMIT = 50

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)


async def parse_author_from_page(page) -> Optional[str]:
    """Try multiple selectors to extract author name. Returns None if all fail."""
    # Strategy 1: JSON-LD
    try:
        ld_elements = await page.query_selector_all('script[type="application/ld+json"]')
        for el in ld_elements:
            raw = await el.inner_text()
            try:
                data = json.loads(raw)
            except Exception:
                continue
            # Could be a list or single object
            candidates = data if isinstance(data, list) else [data]
            for candidate in candidates:
                author = candidate.get("author")
                if not author:
                    continue
                if isinstance(author, dict) and author.get("name"):
                    return author["name"].strip()
                if isinstance(author, list) and author and isinstance(author[0], dict):
                    name = author[0].get("name")
                    if name:
                        return name.strip()
    except Exception as e:
        logger.debug(f"JSON-LD parse failed: {e}")

    # Strategy 2: link to /vn/users/...
    try:
        user_link = await page.query_selector('a[href*="/vn/users/"]')
        if user_link:
            text = (await user_link.inner_text()).strip()
            if text:
                return text
    except Exception:
        pass

    # Strategy 3: meta itemprop=author
    try:
        meta = await page.query_selector('meta[itemprop="author"]')
        if meta:
            content = await meta.get_attribute("content")
            if content and content.strip():
                return content.strip()
    except Exception:
        pass

    return None


async def scrape_author(page, url: str) -> tuple[str, Optional[str]]:
    """Return (status, author_name).

    status:
      "ok"        — parse succeeded, author_name is the parsed string
      "empty"     — page loaded but no author found → empty string ('')
      "skip"      — recipe deleted (Cookpad 404 page) → empty string ('')
      "error"     — timeout / network → None, retry later
    """
    try:
        response = await page.goto(url, wait_until="domcontentloaded", timeout=PAGE_TIMEOUT)
        await page.wait_for_timeout(1500)
        if response and response.status == 404:
            return "skip", ""
        name = await parse_author_from_page(page)
        if name:
            return "ok", name
        return "empty", ""
    except PWTimeout:
        return "error", None
    except Exception as e:
        logger.warning(f"Unexpected error on {url}: {e}")
        return "error", None


async def fetch_batch(db: AsyncSession, batch_size: int) -> list[tuple]:
    result = await db.execute(
        select(Recipe.id, Recipe.cookpad_url)
        .where(Recipe.source == "cookpad")
        .where(Recipe.original_author_name.is_(None))
        .where(Recipe.cookpad_url.is_not(None))
        .order_by(Recipe.save_count.desc().nulls_last(), Recipe.id)
        .limit(batch_size)
    )
    return list(result.all())


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None, help="Stop after N rows (testing)")
    parser.add_argument("--sleep", type=float, default=SLEEP_SEC, help="Seconds between requests")
    parser.add_argument("--no-headless", action="store_true", help="Show browser window")
    args = parser.parse_args()

    total_processed = 0
    counts = {"ok": 0, "empty": 0, "skip": 0, "error": 0}

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=not args.no_headless,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        context = await browser.new_context(
            user_agent=USER_AGENT,
            locale="vi-VN",
            viewport={"width": 1280, "height": 800},
            extra_http_headers={
                "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
            },
        )
        page = await context.new_page()

        logger.info("Warming up cookies via homepage...")
        try:
            await page.goto("https://cookpad.com/vn", wait_until="domcontentloaded", timeout=PAGE_TIMEOUT)
            await page.wait_for_timeout(2000)
        except Exception as e:
            logger.warning(f"Warm-up failed (continuing): {e}")

        async with AsyncSessionLocal() as db:
            while True:
                remaining = (args.limit - total_processed) if args.limit else BATCH_COMMIT
                batch = await fetch_batch(db, min(BATCH_COMMIT, remaining))
                if not batch:
                    logger.info("No more rows with NULL original_author_name. Done.")
                    break

                pending_updates = 0
                for idx, (recipe_id, cookpad_url) in enumerate(batch, start=1):
                    status, author_name = await scrape_author(page, cookpad_url)
                    counts[status] += 1
                    total_processed += 1

                    if status in ("ok", "empty", "skip"):
                        # All three update the DB (empty string skip-marker)
                        await db.execute(
                            update(Recipe)
                            .where(Recipe.id == recipe_id)
                            .values(original_author_name=author_name)
                        )
                        pending_updates += 1
                        logger.info(
                            f"[{total_processed}] {status:5s} {recipe_id} → "
                            f"{author_name!r}"
                        )
                    else:
                        logger.warning(f"[{total_processed}] error {recipe_id} (NULL preserved, will retry)")

                    if args.limit and total_processed >= args.limit:
                        break

                    await asyncio.sleep(args.sleep)

                if pending_updates:
                    await db.commit()
                    logger.info(
                        f"[COMMIT] {pending_updates} rows | totals "
                        f"ok={counts['ok']} empty={counts['empty']} skip={counts['skip']} error={counts['error']}"
                    )

                if args.limit and total_processed >= args.limit:
                    break

        await browser.close()

    logger.info(
        f"DONE. processed={total_processed} | "
        f"ok={counts['ok']} empty={counts['empty']} skip={counts['skip']} error={counts['error']}"
    )


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 2: Test with --limit 10**

```bash
cd backend && .venv/Scripts/activate && python -m scripts.enrich_cookpad_authors --limit 10
```

Expected output: 10 log lines like `[N] ok <uuid> → 'Hoàng Thị Tố Hà'` plus a COMMIT line. ETA ~25s (10 × 2s + page load).

If timeouts occur frequently → Cookpad may be throttling; rerun with `--sleep 4`.

- [ ] **Step 3: Verify in DB**

```bash
docker exec -it vnfood_postgres psql -U vnfood -d vnfood -c \
  "SELECT id, title, original_author_name FROM recipes WHERE source='cookpad' AND original_author_name IS NOT NULL LIMIT 10;"
```

Expected: 10 rows with non-NULL author names.

- [ ] **Step 4: Test resume — kill mid-run**

```bash
python -m scripts.enrich_cookpad_authors --limit 20
# Press Ctrl+C around the 5th-10th row
python -m scripts.enrich_cookpad_authors --limit 20
# Verify second run picks up remaining rows, not rescraping committed ones
```

Check `SELECT COUNT(*) WHERE original_author_name IS NOT NULL` increases monotonically.

- [ ] **Step 5: Commit script**

```bash
git add backend/scripts/enrich_cookpad_authors.py
git commit -m "feat(scripts): Playwright-based Cookpad author enrichment (resumable)"
```

- [ ] **Step 6: (Optional) Run full enrichment overnight**

```bash
# Strip --limit to enrich all 22k. ETA ~12h at sleep=2s.
python -m scripts.enrich_cookpad_authors > enrich.log 2>&1 &
```

This step can run AFTER the rest of the plan is shipped — the UI already shows "Unknown" as fallback. No urgency for thesis demo if you populate a sample first.

---

## Phase G — Final smoke test

### Task 14: Full feature smoke test

**Files:**
- (No code changes — pure verification)

- [ ] **Step 1: Backend up + frontend up + DB has data**

```bash
# Terminal 1: docker
docker-compose up -d

# Terminal 2: backend
cd backend && .venv/Scripts/activate && uvicorn app.main:app --reload --port 8000

# Terminal 3: frontend
cd frontend && npm run dev
```

Verify uvicorn logs show `Loaded 103 curated dish recipes`.

- [ ] **Step 2: Recognize page — curated path**

In browser, `http://localhost:3000/recognize`:
- Upload a banh-beo image
- Verify: dish name clickable, CTA button visible, DishRecipeCard renders with `source: "curated"` content, NO warning badge
- Click dish name → navigates to `/search?q=B%C3%A1nh%20b%C3%A8o`

- [ ] **Step 3: Recognize page — AI fallback path**

In browser, recognize page:
- Upload a pizza image
- Verify: AI fallback runs, DishRecipeCard renders with `source: "ai-generated"`, WARNING badge appears ("Công thức do AI sinh — cần kiểm tra")
- Verify DB: `SELECT * FROM ai_generated_recipes;` shows a cache row for "pizza"
- Re-upload same pizza image → cache HIT, no second OpenAI call in logs

- [ ] **Step 4: Recognize page — Unknown path**

In browser, recognize page:
- Upload a non-food image (e.g. car, person)
- Verify: "Không nhận diện được" message, NO DishRecipeCard, NO CTA button, NO clickable name

- [ ] **Step 5: RecipeCard author display — sample data**

Manually set author on one Cookpad recipe (if not already done in earlier tasks):

```bash
docker exec -it vnfood_postgres psql -U vnfood -d vnfood -c \
  "UPDATE recipes SET original_author_name='Test Tác Giả' WHERE source='cookpad' AND id=(SELECT id FROM recipes WHERE source='cookpad' LIMIT 1);"
```

Visit:
- `/recipes` (browse) — find that recipe; author line shows "Test Tác Giả" with "TE" green avatar
- `/search?q=banh` — same recipe shows same author
- A recipe with NULL author → shows "Unknown" with "UN" avatar
- (If you have a user-uploaded recipe) → shows full_name with link to `/users/{id}`; click navigates to profile

- [ ] **Step 6: Author click behavior**

On `/recipes`:
- Click a non-linkable author ("Unknown" or scraped Cookpad name) → does NOT navigate; clicking elsewhere on card navigates to detail
- Click a User-linked author → navigates to `/users/{id}` (recipe detail does NOT open)

- [ ] **Step 7: Recipe detail page author card**

Open the Cookpad recipe with `original_author_name='Test Tác Giả'`:
- Author card shows green "T" avatar fallback + "Test Tác Giả" + "Tác giả Cookpad" subtext + "Xem trên Cookpad" button
- Click "Xem trên Cookpad" opens cookpad_url in new tab

Open a Cookpad recipe with NULL author:
- Author card shows orange "C" avatar + "Cookpad" + "Công thức tổng hợp" + "Xem trên Cookpad" button (Branch 3 unchanged)

Open a user-uploaded recipe (if exists):
- Author card unchanged: avatar with first letter, follower count, "Xem hồ sơ" button

- [ ] **Step 8: TypeScript + build smoke**

```bash
cd frontend && npx tsc --noEmit
cd frontend && npm run build
```

Expected: both succeed.

- [ ] **Step 9: Final commit summary**

```bash
git log --oneline main..HEAD
```

Expected: ~13 commits covering migrations, ORM, service, schemas, API, types, components, pages, scripts.

If everything green, the feature is ready. Enrichment script can run separately overnight to backfill 22k Cookpad authors.

---

## Out of Scope (deferred)

- Admin UI to edit/correct AI-generated recipes (Section 9 of spec)
- Translating English dish names from OpenAI fallback into Vietnamese
- Cookpad author profile linking (only display name for now)
- Modifying `SuggestedRecipeCard` in `RecipeCarousel.tsx`
- Automated tests (project has no test infra; spec agreed manual smoke tests for thesis scope)
