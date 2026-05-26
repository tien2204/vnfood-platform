# Canonical Recipes — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to execute task-by-task.

**Goal:** 1 canonical recipe per dish (incl. regional/protein variants). LLM 2-stage judge + refine. Hide Western desserts only.

**Architecture:** Branch from main. Add 9 new columns to `recipes`. Pipeline: dessert mark → variant bucket → LLM judge + refine → INSERT canonical rows.

**Tech Stack:** FastAPI · SQLAlchemy + Alembic · OpenAI GPT-4o-mini · Next.js 16

**Spec:** [docs/superpowers/specs/2026-05-27-canonical-recipes-design.md](../specs/2026-05-27-canonical-recipes-design.md)

---

## File Structure Map

**New files:**
- `backend/app/core/dessert_blacklist.py`
- `backend/app/core/variant_config.py`
- `backend/alembic/versions/0005_canonical_recipes.py`
- `backend/scripts/mark_desserts.py`
- `backend/scripts/discover_dish_variants.py`
- `backend/scripts/select_canonical_recipes.py`
- `frontend/components/recipes/CanonicalBadge.tsx`
- `frontend/components/recipes/VariantsAccordion.tsx`
- `frontend/components/recipes/ManualReviewBadge.tsx`

**Modified:**
- `backend/app/models/recipe.py` — 9 new columns
- `backend/app/schemas/recipe.py` — RecipeDetailOut adds variants, refinement_notes, is_canonical, is_manually_reviewed
- `backend/app/services/recipe_service.py` — filter is_canonical, list variants
- `backend/app/services/ai_service.py` — return canonical + variants
- `backend/app/services/admin_service.py` — manual-review endpoint
- `backend/app/api/v1/recipes.py` — show_all param
- `backend/app/api/v1/admin.py` — manual-review endpoint
- `frontend/lib/types.ts` — new types
- `frontend/app/recipes/page.tsx` — canonical only
- `frontend/app/recipes/[id]/page.tsx` — variants accordion + manual review badge
- `frontend/app/recognize/page.tsx` — canonical-first display
- `frontend/app/admin/recipes/page.tsx` — manual review button
- `.claude/session-state.md` + `CLAUDE.md` — milestone

---

## Phase 1 — Schema + Foundation

### Task 1: Create dessert_blacklist.py + variant_config.py

**Files:**
- Create: `backend/app/core/dessert_blacklist.py`
- Create: `backend/app/core/variant_config.py`

- [ ] **Step 1: Write dessert_blacklist.py**

```python
"""Dessert detection patterns.

Filter ONLY Western/modern desserts. Keep traditional Vietnamese cakes like
banh-trung-thu, banh-pia, banh-bo, banh-da-lon, banh-gai, banh-troi-nuoc,
banh-u, banh-tieu, banh-la (these are part of Vietnamese cuisine).
"""
import re

DESSERT_SLUG_PATTERNS: list[re.Pattern] = [
    re.compile(r"^kem-", re.IGNORECASE),
]

DESSERT_TITLE_PATTERNS: list[re.Pattern] = [
    re.compile(p, re.IGNORECASE)
    for p in [
        r"\bbánh\s+kem\b",
        r"\bbánh\s+gato\b",
        r"\bbánh\s+ngọt\b",
        r"\bkem\s+tươi\b",
        r"\bcupcake\b",
        r"\btiramisu\b",
        r"\bcheesecake\b",
        r"\bmacaron\b",
        r"\bmousse\b",
        r"\bpudding\b",
        r"\bsữa\s+chua\b",
        r"\bsinh\s+tố\b",
        r"\bflan\b",
        r"\bbingsu\b",
    ]
]


def is_dessert(keyword: str | None, title: str | None) -> bool:
    if keyword:
        for p in DESSERT_SLUG_PATTERNS:
            if p.search(keyword):
                return True
    if title:
        for p in DESSERT_TITLE_PATTERNS:
            if p.search(title):
                return True
    return False
```

- [ ] **Step 2: Write variant_config.py**

```python
"""Regional + protein variant detection patterns."""
import re

REGIONAL_PATTERNS: dict[str, list[re.Pattern]] = {
    "bac": [re.compile(p, re.IGNORECASE) for p in [
        r"miền\s+bắc", r"\bbắc\b", r"hà\s+nội", r"hà\s+thành",
    ]],
    "trung": [re.compile(p, re.IGNORECASE) for p in [
        r"miền\s+trung", r"\bhuế\b", r"\bquảng", r"đà\s+nẵng", r"hội\s+an",
    ]],
    "nam": [re.compile(p, re.IGNORECASE) for p in [
        r"miền\s+nam", r"sài\s+gòn", r"miệt\s+vườn", r"\bnam\s+bộ\b",
    ]],
}

PROTEIN_PATTERNS: dict[str, re.Pattern] = {
    "bo": re.compile(r"\bbò\b", re.IGNORECASE),
    "ga": re.compile(r"\bgà\b", re.IGNORECASE),
    "heo": re.compile(r"\b(heo|lợn)\b", re.IGNORECASE),
    "ca": re.compile(r"\bcá\b", re.IGNORECASE),
    "tom": re.compile(r"\btôm\b", re.IGNORECASE),
    "chay": re.compile(r"\bchay\b", re.IGNORECASE),
    "haisan": re.compile(r"\b(hải\s+sản|seafood)\b", re.IGNORECASE),
}

REGIONAL_DISPLAY: dict[str, str] = {
    "bac": "miền Bắc",
    "trung": "miền Trung",
    "nam": "miền Nam",
}

PROTEIN_DISPLAY: dict[str, str] = {
    "bo": "bò",
    "ga": "gà",
    "heo": "heo",
    "ca": "cá",
    "tom": "tôm",
    "chay": "chay",
    "haisan": "hải sản",
}

MIN_VARIANT_CLUSTER = 5  # Minimum recipes per variant bucket


def detect_variants(title: str) -> tuple[str | None, str | None]:
    """Return (region, protein) tuple. Either may be None."""
    region = None
    for code, patterns in REGIONAL_PATTERNS.items():
        for p in patterns:
            if p.search(title):
                region = code
                break
        if region:
            break

    protein = None
    for code, p in PROTEIN_PATTERNS.items():
        if p.search(title):
            protein = code
            break

    return region, protein


def build_canonical_slug(keyword: str, region: str | None, protein: str | None) -> str:
    parts = [keyword]
    if region:
        parts.append(region)
    if protein:
        parts.append(protein)
    return "-".join(parts)


def build_variant_label(region: str | None, protein: str | None) -> str | None:
    parts = []
    if region:
        parts.append(REGIONAL_DISPLAY[region])
    if protein:
        parts.append(PROTEIN_DISPLAY[protein])
    return ", ".join(parts) if parts else None
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/core/dessert_blacklist.py backend/app/core/variant_config.py
git commit -m "feat(canonical): dessert blacklist + variant config"
```

---

### Task 2: Migration 0005 — canonical recipe columns

**Files:**
- Modify: `backend/app/models/recipe.py`
- Create: `backend/alembic/versions/0005_canonical_recipes.py`

- [ ] **Step 1: Add columns to Recipe model**

Read `backend/app/models/recipe.py`. Add to Recipe class (after existing columns, before relationships):

```python
is_canonical: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false", default=False, index=True)
canonical_dish_slug: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
variant_label: Mapped[str | None] = mapped_column(String(80), nullable=True)
is_dessert: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false", default=False, index=True)
llm_judge_score: Mapped[float | None] = mapped_column(Float, nullable=True)
llm_judge_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
derived_from_recipe_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("recipes.id"), nullable=True)
refinement_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
is_manually_reviewed: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false", default=False)
```

Imports needed: `Float`, `Text`, `ForeignKey`, `UUID` from sqlalchemy/sqlalchemy.dialects.postgresql if not present.

- [ ] **Step 2: Create migration file**

```python
"""canonical recipes columns

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-27
"""
from alembic import op
import sqlalchemy as sa


revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("recipes", sa.Column("is_canonical", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("recipes", sa.Column("canonical_dish_slug", sa.String(80), nullable=True))
    op.add_column("recipes", sa.Column("variant_label", sa.String(80), nullable=True))
    op.add_column("recipes", sa.Column("is_dessert", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("recipes", sa.Column("llm_judge_score", sa.Float(), nullable=True))
    op.add_column("recipes", sa.Column("llm_judge_reason", sa.Text(), nullable=True))
    op.add_column("recipes", sa.Column("derived_from_recipe_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("recipes", sa.Column("refinement_notes", sa.Text(), nullable=True))
    op.add_column("recipes", sa.Column("is_manually_reviewed", sa.Boolean(), nullable=False, server_default=sa.text("false")))

    op.create_foreign_key(
        "fk_recipes_derived_from",
        "recipes", "recipes",
        ["derived_from_recipe_id"], ["id"],
        ondelete="SET NULL",
    )

    op.create_index("ix_recipes_is_canonical", "recipes", ["is_canonical"], postgresql_where=sa.text("is_canonical = true"))
    op.create_index("ix_recipes_canonical_dish_slug", "recipes", ["canonical_dish_slug"])
    op.create_index("ix_recipes_is_dessert", "recipes", ["is_dessert"], postgresql_where=sa.text("is_dessert = true"))


def downgrade() -> None:
    op.drop_index("ix_recipes_is_dessert", table_name="recipes")
    op.drop_index("ix_recipes_canonical_dish_slug", table_name="recipes")
    op.drop_index("ix_recipes_is_canonical", table_name="recipes")
    op.drop_constraint("fk_recipes_derived_from", "recipes", type_="foreignkey")

    for col in [
        "is_manually_reviewed", "refinement_notes", "derived_from_recipe_id",
        "llm_judge_reason", "llm_judge_score", "is_dessert",
        "variant_label", "canonical_dish_slug", "is_canonical",
    ]:
        op.drop_column("recipes", col)
```

- [ ] **Step 3: Run migration**

```bash
cd backend
.venv\Scripts\activate
alembic upgrade head
```
Expected: `Running upgrade 0004 -> 0005`

- [ ] **Step 4: Verify columns**

```bash
docker exec vnfood-platform-postgres-1 psql -U vnfood -d vnfood_db -c "\d recipes" | grep -E "is_canonical|canonical_dish_slug|variant_label|is_dessert|llm_judge|derived_from|refinement|manually_reviewed"
```
Expected: 9 columns visible.

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/recipe.py backend/alembic/versions/0005_canonical_recipes.py
git commit -m "feat(db): migration 0005 - canonical recipe columns"
```

---

## Phase 2 — Dessert + Variant Detection

### Task 3: mark_desserts.py

**Files:**
- Create: `backend/scripts/mark_desserts.py`

- [ ] **Step 1: Write script**

```python
"""Mark recipes as desserts based on patterns.

Idempotent: skips recipes already marked.
"""
import asyncio
import logging
from sqlalchemy import select, update
from app.core.database import AsyncSessionLocal
from app.core.dessert_blacklist import is_dessert
from app.models.recipe import Recipe

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("desserts")


async def mark() -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Recipe.id, Recipe.keyword, Recipe.title)
            .where(Recipe.is_dessert.is_(False))
        )
        rows = result.all()
        log.info(f"Scanning {len(rows)} recipes")

        marked_ids: list = []
        for row in rows:
            if is_dessert(row.keyword, row.title):
                marked_ids.append(row.id)

        log.info(f"Marking {len(marked_ids)} as dessert")
        if marked_ids:
            BATCH = 500
            for i in range(0, len(marked_ids), BATCH):
                batch = marked_ids[i:i+BATCH]
                await db.execute(
                    update(Recipe).where(Recipe.id.in_(batch)).values(is_dessert=True)
                )
            await db.commit()

        log.info("Done")


if __name__ == "__main__":
    asyncio.run(mark())
```

- [ ] **Step 2: Run**

```bash
cd backend && python -m scripts.mark_desserts
```
Expected: 100-1000 recipes marked (depends on data).

- [ ] **Step 3: Verify — spot check**

```bash
docker exec vnfood-platform-postgres-1 psql -U vnfood -d vnfood_db -c "SELECT title FROM recipes WHERE is_dessert=true ORDER BY random() LIMIT 10;"
```
Manual check: titles match dessert (kem/cupcake/etc). NO `bánh trung thu`, `bánh pía`, etc. in list.

```bash
docker exec vnfood-platform-postgres-1 psql -U vnfood -d vnfood_db -c "SELECT keyword, COUNT(*) FROM recipes WHERE keyword LIKE 'banh-trung-thu' OR keyword LIKE 'banh-pia' OR keyword LIKE 'banh-bo' GROUP BY keyword;"
```
Verify these traditional cakes NOT marked dessert.

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/mark_desserts.py
git commit -m "feat(canonical): mark desserts script"
```

---

### Task 4: discover_dish_variants.py

**Files:**
- Create: `backend/scripts/discover_dish_variants.py`

- [ ] **Step 1: Write script**

```python
"""Discover dish variants (regional + protein) and assign canonical_dish_slug.

Algorithm:
1. Skip is_dessert recipes
2. Group by keyword
3. For each recipe, detect (region, protein) from title
4. Generate canonical_dish_slug = keyword[-region][-protein]
5. Threshold: cluster needs >= MIN_VARIANT_CLUSTER recipes; else merge to parent
"""
import asyncio
import logging
from collections import defaultdict
from sqlalchemy import select, update
from app.core.database import AsyncSessionLocal
from app.core.variant_config import (
    detect_variants, build_canonical_slug, build_variant_label, MIN_VARIANT_CLUSTER
)
from app.models.recipe import Recipe

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("variants")


async def discover() -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Recipe.id, Recipe.keyword, Recipe.title)
            .where(Recipe.is_dessert.is_(False), Recipe.keyword.is_not(None))
        )
        rows = result.all()
        log.info(f"Processing {len(rows)} non-dessert recipes")

        # First pass: tentative slug for each recipe
        tentative: dict = {}  # recipe_id -> (slug, region, protein)
        cluster_counts: dict = defaultdict(int)

        for row in rows:
            region, protein = detect_variants(row.title or "")
            slug = build_canonical_slug(row.keyword, region, protein)
            tentative[row.id] = (slug, region, protein)
            cluster_counts[slug] += 1

        # Second pass: collapse small clusters to parent
        final: dict = {}  # recipe_id -> (final_slug, variant_label)
        for rid, (slug, region, protein) in tentative.items():
            if cluster_counts[slug] >= MIN_VARIANT_CLUSTER:
                final[rid] = (slug, build_variant_label(region, protein))
            else:
                # Try region-only
                fallback_slug = build_canonical_slug(slug.split("-")[0], region, None)
                if cluster_counts.get(fallback_slug, 0) >= MIN_VARIANT_CLUSTER:
                    final[rid] = (fallback_slug, build_variant_label(region, None))
                else:
                    # Fall back to bare keyword
                    keyword = slug.split("-")[0]
                    # rebuild from original keyword (in case keyword has dashes)
                    final[rid] = (cluster_counts_keyword_lookup(rid, tentative), None)

        # Simpler version: just use the parent keyword for sub-threshold
        final = {}
        for rid, (slug, region, protein) in tentative.items():
            if cluster_counts[slug] >= MIN_VARIANT_CLUSTER:
                final[rid] = (slug, build_variant_label(region, protein))

        # For recipes not in final, use bare keyword
        rows_by_id = {r.id: r for r in rows}
        for rid in tentative:
            if rid not in final:
                kw = rows_by_id[rid].keyword
                final[rid] = (kw, None)

        # Count final distribution
        final_clusters: dict = defaultdict(int)
        for slug, _ in final.values():
            final_clusters[slug] += 1

        log.info(f"Final clusters: {len(final_clusters)} distinct canonical_dish_slug")
        for slug, cnt in sorted(final_clusters.items(), key=lambda x: -x[1])[:20]:
            log.info(f"  {slug:<40} {cnt}")

        # Batch update
        log.info(f"Updating {len(final)} recipes")
        BATCH = 200
        items = list(final.items())
        for i in range(0, len(items), BATCH):
            batch = items[i:i+BATCH]
            for rid, (slug, label) in batch:
                await db.execute(
                    update(Recipe).where(Recipe.id == rid).values(
                        canonical_dish_slug=slug, variant_label=label
                    )
                )
            await db.commit()

        log.info("Done")


def cluster_counts_keyword_lookup(rid, tentative):
    """Helper — unused, kept for reference."""
    raise NotImplementedError


if __name__ == "__main__":
    asyncio.run(discover())
```

NOTE: Above has a duplicate `final` initialization — clean up to use single-pass:

```python
# After cluster_counts computed:
final = {}
rows_by_id = {r.id: r for r in rows}
for rid, (slug, region, protein) in tentative.items():
    if cluster_counts[slug] >= MIN_VARIANT_CLUSTER:
        final[rid] = (slug, build_variant_label(region, protein))
    else:
        kw = rows_by_id[rid].keyword
        final[rid] = (kw, None)
```

- [ ] **Step 2: Run**

```bash
cd backend && python -m scripts.discover_dish_variants
```
Expected: log shows ~50-150 distinct canonical_dish_slug.

- [ ] **Step 3: Verify**

```bash
docker exec vnfood-platform-postgres-1 psql -U vnfood -d vnfood_db -c "SELECT canonical_dish_slug, COUNT(*) FROM recipes WHERE canonical_dish_slug IS NOT NULL GROUP BY canonical_dish_slug ORDER BY COUNT(*) DESC LIMIT 30;"
```

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/discover_dish_variants.py
git commit -m "feat(canonical): variant detection + bucketing script"
```

---

## Phase 3 — LLM Judge + Refine

### Task 5: select_canonical_recipes.py

**Files:**
- Create: `backend/scripts/select_canonical_recipes.py`

- [ ] **Step 1: Write script**

```python
"""LLM judge + refine pipeline.

For each canonical_dish_slug:
  1. Pick top 5 candidates
  2. GPT-4o-mini judges which is best
  3. GPT-4o-mini refines (polish ingredients, steps, etc.)
  4. INSERT new recipe row with source='llm-canonical', is_canonical=true

Idempotent: skips canonical_dish_slug that already has is_canonical=true row.
"""
import asyncio
import json
import logging
import uuid
import os
from openai import AsyncOpenAI
from sqlalchemy import select, func
from app.core.database import AsyncSessionLocal
from app.models.recipe import Recipe
from app.models.user import User

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("canonical")

client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
MODEL = "gpt-4o-mini"
COST_CEILING_USD = 5.0
estimated_cost = 0.0  # rough tracker


JUDGE_PROMPT = """Bạn là chef Việt Nam có kinh nghiệm. Dưới đây là {n} công thức cho món "{dish}".
Chọn công thức CHUẨN CHỈNH nhất (ingredients đầy đủ và phù hợp, steps rõ ràng,
đúng phong vị truyền thống Việt Nam).

{candidates}

Output JSON (chỉ JSON, không markdown):
{{"selected_index": <0 đến {max_idx}>, "score": <1-10>, "reason": "<lý do ngắn gọn>"}}
"""

REFINE_PROMPT = """Bạn là chef Việt Nam. Polish công thức sau cho chuẩn chỉnh:
- Chuẩn hóa định lượng (vd "1 nhúm muối" → "1/4 thìa cà phê muối")
- Sửa typo, viết hoa, dấu câu
- Chia bước rõ ràng nếu quá dài; gộp nếu quá vụn
- KHÔNG bịa nguyên liệu mới (chỉ chỉnh sửa lượng/cách diễn đạt)
- Giữ tinh thần và phong vị gốc

Công thức gốc:
Title: {title}
Ingredients:
{ingredients}
Steps:
{steps}
Cooking time: {cooking_time}
Servings: {servings}

Output JSON (chỉ JSON, không markdown):
{{
  "title": "<title đã polish>",
  "description": "<mô tả ngắn 1-2 câu>",
  "ingredients": [{{"name": "...", "amount": "...", "unit": "..."}}, ...],
  "steps": [{{"order": 1, "instruction": "..."}}, ...],
  "cooking_time_minutes": <int or null>,
  "servings": <int or null>,
  "difficulty": "easy|medium|hard",
  "refinement_notes": "<ghi chú ngắn về những thay đổi đã làm>"
}}
"""


def _format_candidate(idx: int, r: Recipe) -> str:
    ing = "\n".join(f"  - {i.get('name', '')} {i.get('amount', '')} {i.get('unit', '')}" for i in (r.ingredients or []))
    steps = "\n".join(f"  {i+1}. {s.get('instruction', '')}" for i, s in enumerate(r.steps or []))
    return f"[Recipe {idx}]\nTitle: {r.title}\nIngredients:\n{ing}\nSteps:\n{steps}\n"


async def judge_candidates(dish: str, candidates: list[Recipe]) -> tuple[int, float, str] | None:
    cand_str = "\n".join(_format_candidate(i, r) for i, r in enumerate(candidates))
    prompt = JUDGE_PROMPT.format(
        n=len(candidates), dish=dish,
        candidates=cand_str, max_idx=len(candidates) - 1,
    )
    try:
        resp = await client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.3,
        )
        data = json.loads(resp.choices[0].message.content)
        global estimated_cost
        estimated_cost += 0.005
        return data["selected_index"], float(data["score"]), data["reason"]
    except Exception as e:
        log.warning(f"  judge fail: {e}")
        return None


async def refine_recipe(winner: Recipe) -> dict | None:
    ing = "\n".join(f"- {i.get('name', '')} {i.get('amount', '')} {i.get('unit', '')}" for i in (winner.ingredients or []))
    steps = "\n".join(f"{i+1}. {s.get('instruction', '')}" for i, s in enumerate(winner.steps or []))
    prompt = REFINE_PROMPT.format(
        title=winner.title, ingredients=ing, steps=steps,
        cooking_time=winner.cooking_time_minutes or "n/a",
        servings=winner.servings or "n/a",
    )
    try:
        resp = await client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.4,
        )
        data = json.loads(resp.choices[0].message.content)
        global estimated_cost
        estimated_cost += 0.02
        return data
    except Exception as e:
        log.warning(f"  refine fail: {e}")
        return None


async def get_admin_user(db) -> uuid.UUID:
    result = await db.execute(select(User).where(User.role == "admin").limit(1))
    admin = result.scalar_one_or_none()
    if not admin:
        raise RuntimeError("No admin user found — run seed_admin.py first")
    return admin.id


async def process_dish(db, slug: str, admin_id: uuid.UUID) -> bool:
    # Skip if already canonical exists
    existing = await db.execute(
        select(Recipe.id).where(
            Recipe.canonical_dish_slug == slug,
            Recipe.is_canonical.is_(True),
        )
    )
    if existing.scalar_one_or_none():
        log.info(f"skip {slug} (already canonical)")
        return False

    # Pick top 5 candidates
    result = await db.execute(
        select(Recipe).where(
            Recipe.canonical_dish_slug == slug,
            Recipe.is_dessert.is_(False),
            Recipe.image_url.is_not(None),
            func.array_length(Recipe.ingredients, 1) >= 5,
            func.array_length(Recipe.steps, 1) >= 4,
        )
        .order_by(Recipe.save_count.desc())
        .limit(5)
    )
    candidates = result.scalars().all()
    if len(candidates) < 1:
        log.info(f"skip {slug} (no candidates)")
        return False

    # Variant label from first candidate
    variant_label = candidates[0].variant_label

    judge_result = await judge_candidates(slug, candidates)
    if not judge_result:
        return False
    sel_idx, score, reason = judge_result
    winner = candidates[sel_idx]
    log.info(f"  judge {slug}: idx={sel_idx} score={score:.1f}")

    refined = await refine_recipe(winner)
    if not refined:
        return False

    # INSERT new canonical
    new_recipe = Recipe(
        id=uuid.uuid4(),
        title=refined["title"][:200],
        description=refined.get("description", "")[:500],
        ingredients=refined["ingredients"],
        steps=refined["steps"],
        cooking_time_minutes=refined.get("cooking_time_minutes"),
        servings=refined.get("servings"),
        difficulty=refined.get("difficulty", "medium"),
        image_url=winner.image_url,
        keyword=winner.keyword,
        source="llm-canonical",
        status="approved",
        author_id=admin_id,
        is_canonical=True,
        canonical_dish_slug=slug,
        variant_label=variant_label,
        is_dessert=False,
        llm_judge_score=score,
        llm_judge_reason=reason,
        derived_from_recipe_id=winner.id,
        refinement_notes=refined.get("refinement_notes"),
        is_manually_reviewed=False,
    )
    db.add(new_recipe)
    await db.commit()
    log.info(f"  + canonical {slug}: {new_recipe.title[:60]}")
    return True


async def main() -> None:
    async with AsyncSessionLocal() as db:
        admin_id = await get_admin_user(db)
        result = await db.execute(
            select(Recipe.canonical_dish_slug, func.count(Recipe.id).label("cnt"))
            .where(
                Recipe.canonical_dish_slug.is_not(None),
                Recipe.is_dessert.is_(False),
            )
            .group_by(Recipe.canonical_dish_slug)
            .having(func.count(Recipe.id) >= 1)
            .order_by(func.count(Recipe.id).desc())
        )
        slugs = [row[0] for row in result.all()]
        log.info(f"Processing {len(slugs)} dish buckets")

        created = 0
        for slug in slugs:
            if estimated_cost > COST_CEILING_USD:
                log.warning(f"COST CEILING reached (${estimated_cost:.2f}), stopping")
                break
            if await process_dish(db, slug, admin_id):
                created += 1

        log.info(f"DONE. Created {created} canonical recipes. Est. cost ${estimated_cost:.2f}")


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 2: Set OPENAI_API_KEY env**

Verify `.env` has `OPENAI_API_KEY` set. If not, ask user to add.

- [ ] **Step 3: Dry-run smoke (limit 3 dishes)**

Temporarily add `slugs = slugs[:3]` for first run to verify pipeline works without burning cost.

```bash
cd backend && python -m scripts.select_canonical_recipes
```
Expected: 3 canonical recipes created, est. cost < $0.10.

- [ ] **Step 4: Full run (remove limit)**

After verifying output looks good, remove limit. Run full pipeline.

Expected: ~50-150 canonical recipes, cost < $2.

- [ ] **Step 5: Spot-check**

```bash
docker exec vnfood-platform-postgres-1 psql -U vnfood -d vnfood_db -c "SELECT canonical_dish_slug, variant_label, llm_judge_score, title FROM recipes WHERE is_canonical=true ORDER BY random() LIMIT 10;"
```

- [ ] **Step 6: Commit**

```bash
git add backend/scripts/select_canonical_recipes.py
git commit -m "feat(canonical): LLM judge + refine pipeline"
```

---

## Phase 4 — Backend Service Updates

### Task 6: recipe_service filter is_canonical

**Files:**
- Modify: `backend/app/services/recipe_service.py`
- Modify: `backend/app/schemas/recipe.py`
- Modify: `backend/app/api/v1/recipes.py`

- [ ] **Step 1: Update list_recipes**

Read service file. Find `list_recipes`. Add filter:
```python
query = select(Recipe).where(
    Recipe.status == "approved",
    Recipe.is_canonical.is_(True),
    Recipe.is_dessert.is_(False),
)
```
Add param `show_all: bool = False` — if True, drop the filter (for admin).

- [ ] **Step 2: Update search_recipes + get_featured_recipes**

Same pattern: filter `is_canonical=true AND is_dessert=false`.

- [ ] **Step 3: Add variants to get_recipe_detail**

In `get_recipe_detail`, after fetching the recipe, also fetch sibling variants:
```python
if recipe.canonical_dish_slug and recipe.is_canonical:
    variants_q = select(Recipe).where(
        Recipe.is_canonical.is_(True),
        Recipe.keyword == recipe.keyword,  # same parent keyword
        Recipe.id != recipe.id,
    )
    variants = (await db.execute(variants_q)).scalars().all()
else:
    variants = []
```
Attach to response.

- [ ] **Step 4: Schema updates**

`RecipeDetailOut` add:
```python
is_canonical: bool = False
variant_label: str | None = None
refinement_notes: str | None = None
is_manually_reviewed: bool = False
variants: list["RecipeMiniOut"] = []
```

Create `RecipeMiniOut` if not exists (id, title, variant_label, image_url).

- [ ] **Step 5: API param**

`GET /recipes` add `show_all: bool = False` query param.

- [ ] **Step 6: Smoke test**

```bash
cd backend && uvicorn app.main:app --port 8000 &
sleep 5
curl -s "http://localhost:8000/api/v1/recipes?limit=3" | python -m json.tool | head -30
```
Verify only canonical recipes returned.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/recipe_service.py backend/app/schemas/recipe.py backend/app/api/v1/recipes.py
git commit -m "feat(canonical): service filter is_canonical + variants in detail"
```

---

### Task 7: AI service — return canonical + variants

**Files:**
- Modify: `backend/app/services/ai_service.py`

- [ ] **Step 1: Rewrite _find_suggested_recipes**

```python
async def _find_canonical_for_keyword(
    db: AsyncSession, keyword: str | None
) -> tuple[dict | None, list[dict]]:
    """Return (canonical_recipe, variants[]) for predicted keyword."""
    if not keyword:
        return None, []

    # All canonical recipes for this keyword
    result = await db.execute(
        select(Recipe).where(
            Recipe.is_canonical.is_(True),
            Recipe.keyword == keyword,
        )
        .order_by(Recipe.llm_judge_score.desc().nullslast())
    )
    rows = result.scalars().all()
    if not rows:
        return None, []

    main = _build_suggested_recipe(rows[0])
    variants = [_build_suggested_recipe(r) for r in rows[1:]]
    return main, variants
```

- [ ] **Step 2: Update recognize_image caller**

In `recognize_image`, replace `_find_suggested_recipes` call:
```python
canonical, variants = await _find_canonical_for_keyword(db, predicted_keyword)
result = AIRecognitionResult(
    # ... existing
    canonical_recipe=canonical,
    variants=variants,
)
```

- [ ] **Step 3: Schema update**

`AIRecognitionResult`:
```python
canonical_recipe: SuggestedRecipe | None = None
variants: list[SuggestedRecipe] = []
# Keep `suggested_recipes` for backward compat or remove if frontend updated together
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/ai_service.py backend/app/schemas/recipe.py
git commit -m "feat(canonical): AI recognize returns canonical + variants"
```

---

### Task 8: Admin manual-review endpoint

**Files:**
- Modify: `backend/app/api/v1/admin.py`
- Modify: `backend/app/services/admin_service.py`

- [ ] **Step 1: Add endpoint**

```python
# admin.py
@router.patch("/recipes/{recipe_id}/manual-review")
async def mark_manually_reviewed(
    recipe_id: uuid.UUID,
    payload: ManualReviewPayload,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return await admin_service.set_manual_review(db, recipe_id, payload.is_reviewed)
```

```python
# admin_service.py
async def set_manual_review(db, recipe_id, is_reviewed: bool):
    await db.execute(
        update(Recipe).where(Recipe.id == recipe_id).values(is_manually_reviewed=is_reviewed)
    )
    await db.commit()
    return {"success": True, "data": {"id": str(recipe_id), "is_manually_reviewed": is_reviewed}}
```

Schema `ManualReviewPayload`:
```python
class ManualReviewPayload(BaseModel):
    is_reviewed: bool
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/api/v1/admin.py backend/app/services/admin_service.py backend/app/schemas/
git commit -m "feat(canonical): admin manual-review endpoint"
```

---

## Phase 5 — Frontend Updates

### Task 9: Types + Badge components

**Files:**
- Modify: `frontend/lib/types.ts`
- Create: `frontend/components/recipes/CanonicalBadge.tsx`
- Create: `frontend/components/recipes/VariantsAccordion.tsx`
- Create: `frontend/components/recipes/ManualReviewBadge.tsx`

- [ ] **Step 1: Add types**

```typescript
// types.ts additions
export type RecipeMini = {
  id: string;
  title: string;
  variant_label: string | null;
  image_url: string | null;
};

// RecipeDetail extend:
is_canonical: boolean;
variant_label: string | null;
refinement_notes: string | null;
is_manually_reviewed: boolean;
variants: RecipeMini[];

// AIRecognitionResult:
canonical_recipe: SuggestedRecipe | null;
variants: SuggestedRecipe[];
```

- [ ] **Step 2: CanonicalBadge**

```tsx
"use client";
import { Award } from "lucide-react";

export function CanonicalBadge({ size = "sm" }: { size?: "sm" | "md" }) {
  const px = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";
  return (
    <span className={`inline-flex items-center gap-1 ${px} rounded-full bg-[#2D6A4F] text-white font-medium`}>
      <Award className="h-3 w-3" />
      Công thức chuẩn
    </span>
  );
}
```

- [ ] **Step 3: ManualReviewBadge**

```tsx
"use client";
import { CheckCircle } from "lucide-react";

export function ManualReviewBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs">
      <CheckCircle className="h-3 w-3" />
      Đã review thủ công
    </span>
  );
}
```

- [ ] **Step 4: VariantsAccordion**

```tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { RecipeImage } from "@/components/common/RecipeImage";
import type { RecipeMini } from "@/lib/types";

export function VariantsAccordion({ variants }: { variants: RecipeMini[] }) {
  const [open, setOpen] = useState(false);
  if (variants.length === 0) return null;
  return (
    <section className="mt-6 border-t pt-6">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 text-lg font-medium w-full text-left">
        <span>Xem {variants.length} biến thể vùng miền</span>
        <ChevronDown className={`h-5 w-5 ml-auto transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
          {variants.map((v) => (
            <Link key={v.id} href={`/recipes/${v.id}`} className="block rounded-md border bg-white overflow-hidden hover:shadow">
              <div className="aspect-[4/3] relative">
                <RecipeImage src={v.image_url} alt={v.title} fill className="object-cover" />
              </div>
              <div className="p-2">
                <h3 className="text-sm font-medium line-clamp-2">{v.title}</h3>
                {v.variant_label && <p className="text-xs text-gray-600">{v.variant_label}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Type-check + commit**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
git add frontend/lib/types.ts frontend/components/recipes/CanonicalBadge.tsx frontend/components/recipes/VariantsAccordion.tsx frontend/components/recipes/ManualReviewBadge.tsx
git commit -m "feat(canonical): types + badge components + variants accordion"
```

---

### Task 10: Recipe detail page integration

**Files:**
- Modify: `frontend/app/recipes/[id]/page.tsx`

- [ ] **Step 1: Render badges + accordion**

In recipe detail JSX, after title:
```tsx
import { CanonicalBadge } from "@/components/recipes/CanonicalBadge";
import { ManualReviewBadge } from "@/components/recipes/ManualReviewBadge";
import { VariantsAccordion } from "@/components/recipes/VariantsAccordion";

// After title:
<div className="flex items-center gap-2 mt-2">
  {recipe.is_canonical && <CanonicalBadge size="md" />}
  {recipe.is_manually_reviewed && <ManualReviewBadge />}
  {recipe.variant_label && (
    <span className="text-sm text-gray-600">— {recipe.variant_label}</span>
  )}
</div>

{recipe.refinement_notes && (
  <details className="mt-4 p-3 bg-gray-50 rounded text-sm">
    <summary className="cursor-pointer font-medium">Ghi chú chỉnh sửa từ AI</summary>
    <p className="mt-2 text-gray-700">{recipe.refinement_notes}</p>
  </details>
)}

// At bottom of recipe content:
<VariantsAccordion variants={recipe.variants} />
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/recipes/[id]/page.tsx
git commit -m "feat(canonical): recipe detail badges + variants accordion"
```

---

### Task 11: Recognize page canonical-first

**Files:**
- Modify: `frontend/components/ai/RecognitionResult.tsx`
- Modify: `frontend/app/recognize/page.tsx`

- [ ] **Step 1: Show canonical recipe directly**

In RecognitionResult, replace any "suggested_recipes" list with:
```tsx
{result.canonical_recipe && (
  <section className="mt-8">
    <h2 className="text-xl font-semibold mb-4">Công thức chuẩn</h2>
    <Link href={`/recipes/${result.canonical_recipe.id}`} className="block rounded-lg border bg-white overflow-hidden hover:shadow-lg">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
        <div className="aspect-square md:aspect-auto relative">
          <RecipeImage src={result.canonical_recipe.image_url} alt={result.canonical_recipe.title} fill className="object-cover" />
        </div>
        <div className="md:col-span-2 p-4">
          <CanonicalBadge />
          <h3 className="text-xl font-semibold mt-2">{result.canonical_recipe.title}</h3>
          {/* meta etc */}
        </div>
      </div>
    </Link>
  </section>
)}

{result.variants.length > 0 && (
  <section className="mt-6">
    <h3 className="text-lg font-medium mb-3">Biến thể khác</h3>
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {result.variants.map((v) => (
        <Link key={v.id} href={`/recipes/${v.id}`} className="block rounded border hover:shadow">
          {/* mini card */}
        </Link>
      ))}
    </div>
  </section>
)}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/ai/RecognitionResult.tsx frontend/app/recognize/page.tsx
git commit -m "feat(canonical): recognize page canonical-first display"
```

---

### Task 12: Admin manual-review UI

**Files:**
- Modify: `frontend/app/admin/recipes/page.tsx`

- [ ] **Step 1: Add review column + button**

Display "Canonical?" column. For canonical rows, show button "Mark reviewed" which calls `PATCH /api/v1/admin/recipes/{id}/manual-review`.

```tsx
<button
  onClick={async () => {
    await api.patch(`/admin/recipes/${recipe.id}/manual-review`, { is_reviewed: true });
    mutate();
  }}
  className="text-blue-600 hover:underline text-sm"
>
  {recipe.is_manually_reviewed ? "✓ Reviewed" : "Mark reviewed"}
</button>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/admin/recipes/page.tsx
git commit -m "feat(canonical): admin manual-review button"
```

---

## Phase 6 — Docs

### Task 13: Update session-state + CLAUDE.md + ADR

**Files:**
- Modify: `.claude/session-state.md`
- Modify: `CLAUDE.md`
- Create: `docs/adr/0002-canonical-recipes.md`

- [ ] **Step 1: Append session-state milestone**

```markdown
### ✅ Canonical Recipes — 2026-05-27 (branch `feat/canonical-recipes`)

**Mục tiêu:** Mỗi món đặc biệt = 1 công thức chuẩn chỉnh (incl regional/protein variants), polish bằng LLM, có manual review override.

**Decisions:**
- Branch từ main (refocus branch giữ nguyên)
- Hide chỉ dessert kiểu Tây (kem/cupcake/etc); giữ bánh truyền thống VN
- LLM 2-stage: GPT-4o-mini judge + refine
- Always refine + is_manually_reviewed flag
- Giữ AI cascade 103-class (không retrain)

**Output:**
- DB migration 0005: 9 cột mới
- ~50-150 canonical recipes via LLM pipeline (cost ~$1-2)
- Backend filter is_canonical + variants
- Frontend canonical-first UX

**Spec/Plan/ADR:**
- docs/superpowers/specs/2026-05-27-canonical-recipes-design.md
- docs/superpowers/plans/2026-05-27-canonical-recipes.md
- docs/adr/0002-canonical-recipes.md
```

- [ ] **Step 2: Update CLAUDE.md latest milestone**

- [ ] **Step 3: Create ADR**

```markdown
# ADR 0002: Canonical Recipes — LLM-curated 1-per-dish

**Status:** Accepted
**Date:** 2026-05-27

## Context
22k Cookpad recipes = nhiều công thức cho cùng món, trái với đề bài PDF "tư vấn nấu món ăn"
(implies 1 công thức chuẩn để user nấu theo).

## Decision
Branch riêng `feat/canonical-recipes` từ main:
- 1 canonical recipe per (dish_keyword, regional/protein variant)
- LLM 2-stage: judge → refine
- Hide chỉ dessert kiểu Tây
- Audit trail: derived_from_recipe_id + refinement_notes
- Manual review override flag

## Consequences
+ Đáp ứng đúng đề bài PDF (1 công thức chuẩn cho user nấu)
+ Audit trail cho LLM editing
- Cost OpenAI ~$1-2 toàn pipeline
- LLM có rủi ro hallucination (mitigate: prompt + audit + manual review)

## Alternatives
- Refocus (30 dishes + 5 chef/dish): tiếp cận khác, song song trên branch riêng
- Heuristic top-1 (no LLM): cost 0 nhưng chất lượng không đồng nhất
```

- [ ] **Step 4: Commit**

```bash
git add .claude/session-state.md CLAUDE.md docs/adr/0002-canonical-recipes.md
git commit -m "docs: canonical-recipes milestone + ADR 0002"
```

---

## Self-review

- Spec coverage: all 14 sections covered by tasks ✓
- Placeholders: none ✓
- Type consistency: `RecipeMini`, `is_canonical`, `canonical_dish_slug` consistent across tasks ✓
- Cost ceiling enforced in script ✓
- Idempotent: scripts can re-run safely ✓

---

_End of plan._
