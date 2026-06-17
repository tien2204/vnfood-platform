# Taste-focused Recipe Descriptions (P3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the ~529 in-scope recipes a taste-focused description: an LLM judges each recipe's original `description` and, only when it fails to convey flavor/how-to-enjoy, writes a new one into a new `flavor_text` column; display prefers `flavor_text`, falls back to the original `description`.

**Architecture:** New nullable `recipes.flavor_text` column (original `description` untouched). A one-off LLM seed script (gpt-4o-mini, judge-and-rewrite) fills `flavor_text` only for weak descriptions. Two backend display builders coalesce `flavor_text or description` — no schema or frontend change.

**Tech Stack:** FastAPI (Python 3.11, pytest, Alembic, async SQLAlchemy), PostgreSQL, OpenAI SDK. Backend venv python = `.venv/Scripts/python` (run from `backend/`). DB is up. Session factory `AsyncSessionLocal` (`app.core.database`). OpenAI key in `settings.OPENAI_API_KEY`.

## Global Constraints
- Scope = recipes with `is_canonical = True AND ai_class_slug IS NOT NULL AND status = 'approved'` (~529).
- Never overwrite the existing `description` column; only write the new `flavor_text`.
- Runtime makes NO LLM calls (seed-time only).
- Windows console is cp1252 → any script that prints must `sys.stdout.reconfigure(encoding="utf-8")`.
- Alembic current head before this work = `0017`.

---

## File Structure
- Create `backend/alembic/versions/0018_recipe_flavor_text.py` — add column.
- Modify `backend/app/models/recipe.py` — add `flavor_text` column.
- Create `backend/scripts/seed_flavor_text.py` — one-off LLM judge-and-rewrite seeder (testable `build_prompt`).
- Create `backend/tests/test_seed_flavor_text.py` — prompt-builder unit test.
- Modify `backend/app/services/recipe_service.py` — coalesce in `get_recipe_detail`.
- Modify `backend/app/services/ai_service.py` — coalesce in `_build_dish_recipe_from_canonical`.

All work on current branch `feat/monngonmoingay-restyle`.

## Verification commands
- Backend tests: from `backend/`, `.venv/Scripts/python -m pytest tests/<file> -v`

---

### Task 1: Migration + model column

**Files:**
- Create: `backend/alembic/versions/0018_recipe_flavor_text.py`
- Modify: `backend/app/models/recipe.py`

**Interfaces:**
- Produces: `Recipe.flavor_text` (`Mapped[str | None]`, DB column `recipes.flavor_text TEXT NULL`) — consumed by Tasks 2 & 3.

- [ ] **Step 1: Create the migration**

Create `backend/alembic/versions/0018_recipe_flavor_text.py`:

```python
"""add recipes.flavor_text (taste-focused description override)

Revision ID: 0018
Revises: 0017
Create Date: 2026-06-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0018"
down_revision: Union[str, None] = "0017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("recipes", sa.Column("flavor_text", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("recipes", "flavor_text")
```

- [ ] **Step 2: Add the column to the model**

In `backend/app/models/recipe.py`, find:

```python
    description: Mapped[str | None] = mapped_column(Text)
```

Add directly below it:

```python
    flavor_text: Mapped[str | None] = mapped_column(Text)
```

- [ ] **Step 3: Run the migration**

Run (from `backend/`): `.venv/Scripts/python -m alembic upgrade head`
Expected: applies `0018`, no error.

- [ ] **Step 4: Verify the column exists**

Run (from `backend/`):
```bash
.venv/Scripts/python -c "import asyncio; from sqlalchemy import text; from app.core.database import engine
async def m():
    async with engine.connect() as c:
        print((await c.execute(text(\"select column_name from information_schema.columns where table_name='recipes' and column_name='flavor_text'\"))).scalar())
asyncio.run(m())"
```
Expected: prints `flavor_text`.

- [ ] **Step 5: Commit**

```bash
git add backend/alembic/versions/0018_recipe_flavor_text.py backend/app/models/recipe.py
git commit -m "feat(recipes): add flavor_text column + migration 0018"
```

---

### Task 2: Seed script (LLM judge-and-rewrite) + run

**Files:**
- Create: `backend/scripts/seed_flavor_text.py`
- Test: `backend/tests/test_seed_flavor_text.py`

**Interfaces:**
- Consumes: `Recipe.flavor_text` (Task 1); `app.core.database.AsyncSessionLocal`; `app.core.config.settings.OPENAI_API_KEY`.
- Produces: populated `recipes.flavor_text` for weak descriptions (consumed by Task 3 display + Task 4 QA). Testable `build_prompt(title: str, description: str | None, ingredients: list[str]) -> str`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_seed_flavor_text.py`:

```python
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

import seed_flavor_text as s


def test_build_prompt_mentions_title_and_inputs():
    p = s.build_prompt("Bánh bèo", "Là món ăn dân dã đặc trưng miền Trung.", ["Bột gạo", "Tôm khô"])
    assert "Bánh bèo" in p
    assert "Tôm khô" in p
    # instructs judge-and-rewrite with the keep flag + flavor_text key
    assert "keep" in p
    assert "flavor_text" in p


def test_build_prompt_handles_empty_description():
    p = s.build_prompt("Phở bò", None, [])
    assert "Phở bò" in p
    assert isinstance(p, str) and len(p) > 0
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `backend/`): `.venv/Scripts/python -m pytest tests/test_seed_flavor_text.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'seed_flavor_text'`.

- [ ] **Step 3: Create the script**

Create `backend/scripts/seed_flavor_text.py`:

```python
"""One-off: judge each in-scope recipe's description; rewrite weak ones into
recipes.flavor_text (taste-focused). Good descriptions are left as-is (NULL).

Run from backend/:  .venv/Scripts/python scripts/seed_flavor_text.py [--force]
Resume-safe: skips recipes that already have flavor_text unless --force.
Requires OPENAI_API_KEY.
"""
import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from openai import OpenAI  # noqa: E402
from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm import selectinload  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.database import AsyncSessionLocal  # noqa: E402
from app.models.recipe import Recipe  # noqa: E402

BATCH = 25


def build_prompt(title: str, description: str | None, ingredients: list[str]) -> str:
    ing = ", ".join(ingredients[:8]) if ingredients else "(không rõ)"
    desc = (description or "").strip() or "(trống)"
    return (
        f'Món: "{title}".\n'
        f"Nguyên liệu chính: {ing}.\n"
        f"Mô tả hiện tại: «{desc}»\n\n"
        "Nhiệm vụ: đánh giá mô tả hiện tại đã nói về VỊ và CÁCH THƯỞNG THỨC "
        "(ăn ra sao, vị thế nào, ăn kèm gì) chưa. Mô tả kiểu chatty/quảng cáo "
        '("nhà mình", "Món Ngon Mỗi Ngày", "cách làm…"), sáo rỗng, hoặc trống '
        "thì coi là CHƯA đạt.\n"
        "Trả về DUY NHẤT một JSON object, không markdown:\n"
        '{"keep": true}  nếu mô tả hiện tại ĐÃ tả vị tốt (giữ nguyên),\n'
        'hoặc {"keep": false, "flavor_text": "2-3 câu tiếng Việt tả VỊ + CÁCH '
        'THƯỞNG THỨC, cụ thể, tránh sáo rỗng"}  nếu CHƯA đạt.'
    )


def judge(client: OpenAI, title: str, description: str | None, ingredients: list[str]) -> str | None:
    """Return new flavor_text string, or None to keep the original."""
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": build_prompt(title, description, ingredients)}],
        max_tokens=400,
        response_format={"type": "json_object"},
    )
    data = json.loads(resp.choices[0].message.content.strip())
    if data.get("keep") is True:
        return None
    text = (data.get("flavor_text") or "").strip()
    return text or None


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="re-evaluate recipes that already have flavor_text")
    args = ap.parse_args()

    if not settings.OPENAI_API_KEY:
        raise SystemExit("OPENAI_API_KEY not set — cannot seed.")
    client = OpenAI(api_key=settings.OPENAI_API_KEY)

    async with AsyncSessionLocal() as db:
        stmt = (
            select(Recipe)
            .options(selectinload(Recipe.ingredients))
            .where(
                Recipe.is_canonical.is_(True),
                Recipe.ai_class_slug.isnot(None),
                Recipe.status == "approved",
            )
        )
        if not args.force:
            stmt = stmt.where(Recipe.flavor_text.is_(None))
        rows = (await db.execute(stmt)).scalars().all()
        print(f"{len(rows)} recipes to evaluate.")

        rewritten = 0
        for i, r in enumerate(rows, 1):
            ings = [ing.display_text for ing in r.ingredients]
            try:
                new_text = judge(client, r.title, r.description, ings)
            except Exception as e:  # noqa: BLE001
                print(f"[{i}/{len(rows)}] {r.title[:40]} FAILED: {e}")
                continue
            if new_text:
                r.flavor_text = new_text
                rewritten += 1
            if i % BATCH == 0:
                await db.commit()
                print(f"  …{i}/{len(rows)} (rewritten {rewritten})")
        await db.commit()
        print(f"Done. rewrote {rewritten}/{len(rows)} descriptions.")


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `backend/`): `.venv/Scripts/python -m pytest tests/test_seed_flavor_text.py -v`
Expected: PASS (2 tests). Imports the script (module-level OpenAI import is fine; no client constructed at import).

- [ ] **Step 5: Run the seeder against the 529 pool**

Run (from `backend/`): `.venv/Scripts/python scripts/seed_flavor_text.py`
Expected: prints `N recipes to evaluate.` (~528, the 1 already-null-description still evaluated), periodic progress, then `Done. rewrote M/N descriptions.` with no fatal error. Takes a few minutes (~500 LLM calls).

- [ ] **Step 6: Verify the rewrite is selective**

Run (from `backend/`):
```bash
.venv/Scripts/python -c "import io,sys; sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8'); import asyncio; from sqlalchemy import text; from app.core.database import engine
async def m():
    async with engine.connect() as c:
        async def q(s): return (await c.execute(text(s))).scalar()
        print('flavor_text set:', await q(\"select count(*) from recipes where flavor_text is not null\"))
        print('in-scope total:', await q(\"select count(*) from recipes where is_canonical and ai_class_slug is not null and status='approved'\"))
        r=(await c.execute(text(\"select title, flavor_text from recipes where flavor_text is not null limit 5\"))).all()
        for t,f in r: print(f'• [{t}] {f[:140]}')
asyncio.run(m())"
```
Expected: `flavor_text set` is a sizeable fraction but NOT all 529 (e.g. ~100–350); samples read as concrete taste descriptions.

- [ ] **Step 7: Commit**

```bash
git add backend/scripts/seed_flavor_text.py backend/tests/test_seed_flavor_text.py
git commit -m "feat(recipes): add + run flavor_text judge-and-rewrite seeder"
```

---

### Task 3: Display coalesce (detail page + DishRecipeCard)

**Files:**
- Modify: `backend/app/services/recipe_service.py:381`
- Modify: `backend/app/services/ai_service.py:253`

**Interfaces:**
- Consumes: `Recipe.flavor_text` (Task 1), populated by Task 2.

- [ ] **Step 1: Coalesce in the recipe-detail builder**

In `backend/app/services/recipe_service.py`, in `get_recipe_detail`'s `return RecipeDetailOut(`, find:

```python
        title=recipe.title,
        description=recipe.description,
        image_url=recipe.image_url,
```

Replace with:

```python
        title=recipe.title,
        description=recipe.flavor_text or recipe.description,
        image_url=recipe.image_url,
```

- [ ] **Step 2: Coalesce in the DishRecipeCard builder**

In `backend/app/services/ai_service.py`, in `_build_dish_recipe_from_canonical`'s returned dict, find:

```python
        "title": row.title,
        "description": row.description,
        "ingredients": ingredients,
```

Replace with:

```python
        "title": row.title,
        "description": row.flavor_text or row.description,
        "ingredients": ingredients,
```

- [ ] **Step 3: Verify imports + no regression**

Run (from `backend/`): `.venv/Scripts/python -c "import app.services.recipe_service, app.services.ai_service; print('ok')"`
Expected: prints `ok`.
Run (from `backend/`): `.venv/Scripts/python -m pytest tests/ -q`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/recipe_service.py backend/app/services/ai_service.py
git commit -m "feat(recipes): display flavor_text when present, fallback to description"
```

---

### Task 4: Manual verification

**Files:** none.

- [ ] **Step 1: Restart backend (new column) + frontend**

Backend (from `backend/`): `.venv/Scripts/uvicorn app.main:app --reload --port 8000`. Frontend: `npm run dev`.

- [ ] **Step 2: Recipe detail shows taste description**

Open a recipe whose original description was chatty/promotional (e.g. a "Bánh bao …" recipe that got a flavor_text — find one from Task 2 Step 6 samples) at `http://localhost:3000/recipes/<id>`. Confirm the description now reads as a concrete taste / how-to-enjoy blurb, not the old chatty intro.

- [ ] **Step 3: Good descriptions unchanged**

Open a recipe whose original description was already good (e.g. "Bánh bột lọc Huế") — its `flavor_text` should be NULL, so the page still shows the original good description (unchanged).

- [ ] **Step 4: DishRecipeCard on recognize**

On `/recognize`, recognize a dish whose canonical recipe got a `flavor_text`; the "CÔNG THỨC GỢI Ý" card's description reflects the taste-focused text.

- [ ] **Step 5: Final sweep**

Backend: `.venv/Scripts/python -m pytest tests/ -q` → pass.

---

## Self-Review

**Spec coverage:**
- `flavor_text` column + migration 0018 → Task 1. ✅
- Model column → Task 1. ✅
- Seed script: in-scope filter, judge-and-rewrite (keep=true → NULL; keep=false → write), resume-safe (`flavor_text IS NULL` unless `--force`), batch commit, utf-8 console → Task 2. ✅
- Run seeder on 529 → Task 2 Step 5. ✅
- Display coalesce at both sites (detail + DishRecipeCard), no schema/frontend change → Task 3. ✅
- Original `description` never overwritten → confirmed (script only sets `flavor_text`; display reads `flavor_text or description`). ✅
- No runtime LLM → seeder is one-off. ✅
- Testing: prompt-builder pytest + selective-rewrite DB check + manual → Tasks 2, 4. ✅

**Placeholder scan:** No TBD/TODO; all code complete.

**Type consistency:** `build_prompt(title, description, ingredients)` signature identical in script (Task 2) and test (Task 2). `judge(...) -> str | None` returns None to keep / text to rewrite, consumed correctly (`if new_text: r.flavor_text = new_text`). Column name `flavor_text` identical across migration, model, script, both display sites. Migration `0018` revises `0017` (current head). ✅
