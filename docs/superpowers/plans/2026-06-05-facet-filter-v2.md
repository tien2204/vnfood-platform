# Facet filter v2 (MNMN 6-category parity) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the `/recipes` filter to full parity with monngonmoingay.com — 6 categories (Nguyên liệu, Cách nấu, Dịp lễ, Món ăn, Vùng miền, Theo nhu cầu dinh dưỡng) with grouped-checkbox dropdown panels + "Lọc thông tin" apply, proper Vietnamese labels.

**Architecture:** Extends the v1 facet infra. Adds 2 columns (`main_ingredients`, `cooking_methods`); extends `crawl_facets.py` + `backfill_facets.py` to the `nguyenlieu`/`cachnau` sitemaps; rewrites `gen_facets_ts.py` to emit a hand-authored **grouped** config (labels/groups from the MNMN screenshots, slugs verified against the crawl); `list_recipes` gains 2 more `&&`-overlap params; the browse page replaces flat chips with a 6-button dropdown bar (new `FacetDropdown.tsx`, MNMN apply-button model) and drops the now-redundant meal chips.

**Tech Stack:** FastAPI + SQLAlchemy async (Postgres ARRAY `&&`), Alembic, httpx crawl, OpenAI `gpt-4o-mini`, Next.js 16 client component (standard React hooks only — repo runs a modified Next.js, see `frontend/AGENTS.md`).

**Branch:** `feat/canonical-recipes`. Backend cmds from `backend/`: `$env:PYTHONUTF8=1; .venv\Scripts\python.exe ...`. Frontend from `frontend/`. Keep Docker running during the backfill. Do NOT commit `.claude/settings*`, `backups/`, `cookpad_recipe/*.json` (incl. `facet_vocab.json`). Commit footer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**v1 facts (already in place):** 4 facet columns `regions/occasions/dish_types/diets` exist (migration 0011), tagged + LLM-filled (NULL=0). `crawl_facets.py` `FACETS` dict, `backfill_facets.py` `FACETS` dict, `gen_facets_ts.py`, `list_recipes` facet loop (lines ~135-148), and `RecipeBrowse.tsx` flat facet chips all exist. The current `frontend/lib/facets.ts` is the FLAT v1 shape.

**6 sitemaps → columns (verified):** region=`vungmien`, occasion=`dipnau`, dish_type=`loaimon`, diet=`dinhduong`, **main_ingredient=`nguyenlieu` (new)**, **cooking_method=`cachnau` (new)**.

---

### Task 1: Migration 0012 + ORM (2 new columns)

**Files:** Create `backend/alembic/versions/0012_recipe_facets_v2.py`; Modify `backend/app/models/recipe.py`

- [ ] **Step 1: Write the migration** (mirror `0011_recipe_facets.py`):

```python
"""recipe facets v2: main_ingredients + cooking_methods

Revision ID: 0012
Revises: 0011
Create Date: 2026-06-05
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None

_COLS = ("main_ingredients", "cooking_methods")


def upgrade() -> None:
    for col in _COLS:
        op.add_column("recipes", sa.Column(col, postgresql.ARRAY(sa.String()), nullable=True))


def downgrade() -> None:
    for col in reversed(_COLS):
        op.drop_column("recipes", col)
```

(Confirm the current alembic head is `0011` first: `... alembic heads`. If not, STOP and report — do not invent a revision.)

- [ ] **Step 2: Add the 2 ORM columns.** In `backend/app/models/recipe.py`, immediately after the existing `diets: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)` line, add:

```python
    main_ingredients: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    cooking_methods: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
```

- [ ] **Step 3: Apply the migration (from `backend/`)**

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -m alembic upgrade head
```
Expected: `Running upgrade 0011 -> 0012`.

- [ ] **Step 4: Verify columns exist (from `backend/`)**

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -c "import asyncio; from sqlalchemy import text; from app.core.database import AsyncSessionLocal
async def m():
 async with AsyncSessionLocal() as db:
  r=(await db.execute(text(\"select column_name from information_schema.columns where table_name='recipes' and column_name in ('main_ingredients','cooking_methods') order by 1\"))).scalars().all()
  print('cols:', r)
asyncio.run(m())"
```
Expected: `cols: ['cooking_methods', 'main_ingredients']`.

- [ ] **Step 5: Commit**

```bash
git add backend/alembic/versions/0012_recipe_facets_v2.py backend/app/models/recipe.py
git commit -m "feat(facet-v2): migration 0012 + ORM main_ingredients/cooking_methods

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Extend `crawl_facets.py` to nguyenlieu + cachnau, run crawl

**Files:** Modify `backend/scripts/crawl_facets.py`

- [ ] **Step 1: Add the 2 facets to the `FACETS` dict.** Change the existing dict to:

```python
# facet -> (sitemap substring, DB column)
FACETS = {
    "main_ingredient": ("nguyenlieu", "main_ingredients"),
    "cooking_method": ("cachnau", "cooking_methods"),
    "region": ("vungmien", "regions"),
    "occasion": ("dipnau", "occasions"),
    "dish_type": ("loaimon", "dish_types"),
    "diet": ("dinhduong", "diets"),
}
```

- [ ] **Step 2: Add the 2 new taxonomy roots to `TAXONOMY_INDEX_SLUGS`** (so their category root pages are skipped as recipe links):

```python
TAXONOMY_INDEX_SLUGS = {"vungmien", "dipnau", "loaimon", "dinhduong", "nguyenlieu", "cachnau"}
```

(No other crawl logic changes — single-segment term + `/page/N/` pagination + `cookpad_url`→`canonical_dish_slug` join all work as-is. Unmatched taxonomy cross-links are dropped by the join, so they cannot mis-tag.)

- [ ] **Step 3: Run the crawl (real network + DB, several min), from `backend/`**

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -m scripts.crawl_facets
```
Expected: 6 facets now print sub-sitemap/term counts; `vocab[main_ingredient]: ~24 terms`, `vocab[cooking_method]: 12 terms`, the 4 old facets unchanged; `wrote .../facet_vocab.json`; `matched recipe urls: <K>; canonicals tagged: <M>`.
- If no network: DONE_WITH_CONCERNS (script committed, not run). Do NOT fabricate `facet_vocab.json`.

- [ ] **Step 4: Verify the 2 new columns got tagged + facet_vocab has 6 keys (from `backend/`)**

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -c "import asyncio,json; from pathlib import Path; from sqlalchemy import text; from app.core.database import AsyncSessionLocal
v=json.loads(Path('../cookpad_recipe/facet_vocab.json').read_text(encoding='utf-8'))
print('vocab keys:', sorted(v.keys()), {k:len(x) for k,x in v.items()})
async def m():
 async with AsyncSessionLocal() as db:
  for col in ('main_ingredients','cooking_methods'):
   n=(await db.execute(text(f'select count(*) from recipes where is_canonical and {col} is not null'))).scalar_one()
   print(col,'tagged:',n)
asyncio.run(m())"
```
Expected: 6 vocab keys incl. `main_ingredient`/`cooking_method`; non-zero tagged counts for both new columns. (If Step 3 didn't run, both are 0 — note it.)

- [ ] **Step 5: Commit (script only)**

```bash
git add backend/scripts/crawl_facets.py
git commit -m "feat(facet-v2): crawl nguyenlieu + cachnau taxonomies (6 facets)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Extend `backfill_facets.py` to the 2 new facets, run

**Files:** Modify `backend/scripts/backfill_facets.py`

- [ ] **Step 1: Add the 2 facets to the `FACETS` dict** (prompt desc + column). Change the dict to:

```python
# facet label (for the prompt) + DB column
FACETS = {
    "main_ingredient": ("nguyên liệu chính (thịt/hải sản/rau củ/tinh bột/trứng/đậu hũ...)", "main_ingredients"),
    "cooking_method": ("cách nấu (chiên/nướng/xào/kho/hấp/hầm/lẩu/gỏi/quay/om/canh...)", "cooking_methods"),
    "region": ("vùng miền (Bắc/Trung/Nam...)", "regions"),
    "occasion": ("dịp nấu (hằng ngày/đãi tiệc/lễ tết/ăn vặt...)", "occasions"),
    "dish_type": ("loại món (canh/kho/xào/nướng/chiên/gỏi/lẩu...)", "dish_types"),
    "diet": ("chế độ ăn (mặn/chay/ăn kiêng...)", "diets"),
}
```

(`classify_facets` reads each facet's allowed terms from `facet_vocab.json` by key — the 2 new keys exist after Task 2. NULL-only idempotent loop is unchanged. The 4 old facets are already non-NULL from v1, so this run mainly fills the 2 new ones.)

- [ ] **Step 2: Run it (real OpenAI, can take 20-40 min; keep Docker up), from `backend/`**

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -m scripts.backfill_facets
```
Expected: `[main_ingredient] to fill: ~N` and `[cooking_method] to fill: ~N` with progress + `DONE filled`; the 4 old facets print small/zero `to fill`. (The executor may run this in the background.)
- If no network/OpenAI key: DONE_WITH_CONCERNS; script committed.

- [ ] **Step 3: Verify NULL→0 for all 6 facets (from `backend/`)**

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -c "import asyncio; from sqlalchemy import text; from app.core.database import AsyncSessionLocal
async def m():
 async with AsyncSessionLocal() as db:
  for col in ('main_ingredients','cooking_methods','regions','occasions','dish_types','diets'):
   n=(await db.execute(text(f'select count(*) from recipes where is_canonical and {col} is null'))).scalar_one()
   print(col,'NULL:',n)
asyncio.run(m())"
```
Expected: `0` (or near 0) for all 6. (If the run couldn't happen, the 2 new ones stay high — note it.)

- [ ] **Step 4: Commit (script only)**

```bash
git add backend/scripts/backfill_facets.py
git commit -m "feat(facet-v2): backfill main_ingredient + cooking_method facets

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: API — 2 new facet params in `list_recipes` + endpoint

**Files:** Modify `backend/app/services/recipe_service.py`, `backend/app/api/v1/recipes.py`

- [ ] **Step 1: Add the 2 params to `list_recipes`.** In `recipe_service.py`, in the signature after the existing `diet: Optional[str] = None,` add:

```python
    main_ingredient: Optional[str] = None,
    cooking_method: Optional[str] = None,
```

- [ ] **Step 2: Add the 2 columns to the existing overlap loop.** Change the existing facet loop tuple (currently `(region,"regions"),(occasion,"occasions"),(dish_type,"dish_types"),(diet,"diets")`) to include the 2 new ones:

```python
    for param, col in (
        (region, "regions"),
        (occasion, "occasions"),
        (dish_type, "dish_types"),
        (diet, "diets"),
        (main_ingredient, "main_ingredients"),
        (cooking_method, "cooking_methods"),
    ):
        if param:
            vals = [v.strip() for v in param.split(",") if v.strip()]
            if vals:
                stmt = stmt.where(
                    text(f"recipes.{col} && :facet_{col}").bindparams(
                        bindparam(f"facet_{col}", value=vals, type_=ARRAY(String))
                    )
                )
```

- [ ] **Step 3: Forward the 2 params from the list endpoint.** In `backend/app/api/v1/recipes.py` `@router.get("")` handler, after the existing `diet: Optional[str] = Query(default=None),` add:

```python
    main_ingredient: Optional[str] = Query(default=None),
    cooking_method: Optional[str] = Query(default=None),
```

and in the `recipe_service.list_recipes(...)` call, next to `region=region, occasion=occasion, dish_type=dish_type, diet=diet,` add:

```python
        main_ingredient=main_ingredient, cooking_method=cooking_method,
```

- [ ] **Step 4: Smoke the 2 new filters (real DB), from `backend/`** — create temp `backend/scripts/_smoke_facet2.py`:

```python
import asyncio
from sqlalchemy import select, text
from app.core.database import AsyncSessionLocal
from app.models.recipe import Recipe
from app.services.recipe_service import list_recipes

FACETS = (("main_ingredient", "main_ingredients"), ("cooking_method", "cooking_methods"))


async def main():
    async with AsyncSessionLocal() as db:
        for param, col in FACETS:
            term = (await db.execute(
                text(f"select unnest({col}) from recipes where is_canonical and {col} is not null limit 1")
            )).scalar_one_or_none()
            if term is None:
                print(f"{param}: no data yet — skip")
                continue
            cards, pg = await list_recipes(db, page=1, limit=10, **{param: term})
            print(f"{param}={term}: total {pg.total}, sample {len(cards)}")
            for c in cards:
                mt = (await db.execute(select(getattr(Recipe, col)).where(Recipe.id == c.id))).scalar_one()
                assert mt and term in mt, f"{c.title} {col}={mt}"
            print(f"  OK — all contain {term!r}")
        # AND across one new + one old facet
        mi = (await db.execute(text("select unnest(main_ingredients) from recipes where is_canonical and main_ingredients is not null limit 1"))).scalar_one_or_none()
        rg = (await db.execute(text("select unnest(regions) from recipes where is_canonical and regions is not null limit 1"))).scalar_one_or_none()
        if mi and rg:
            cards, pg = await list_recipes(db, page=1, limit=5, main_ingredient=mi, region=rg)
            print(f"AND main_ingredient={mi} & region={rg}: total {pg.total}")


asyncio.run(main())
```

Run: `$env:PYTHONUTF8=1; .venv\Scripts\python.exe -m scripts._smoke_facet2`
Expected: both new facets print a non-zero total + `OK — all contain ...`; the AND line prints a total. Then delete: `Remove-Item scripts\_smoke_facet2.py`.

- [ ] **Step 5: Verify app imports clean (from `backend/`)**

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -c "from app.main import app; print('ok')"
```
Expected: `ok`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/recipe_service.py backend/app/api/v1/recipes.py
git commit -m "feat(facet-v2): list_recipes main_ingredient + cooking_method (&& overlap) + endpoint

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Rewrite `gen_facets_ts.py` with the curated grouped CONFIG (commit script only)

**Files:** Modify `backend/scripts/gen_facets_ts.py`

> This task commits the rewritten generator ONLY. It does NOT regenerate `frontend/lib/facets.ts` (that happens in Task 6, atomically with the UI consumers, to keep `tsc` green). So `tsc` is unaffected here.

- [ ] **Step 1: Replace the whole file** with the curated-config generator (labels/groups from the MNMN screenshots; slugs verified against the crawl):

```python
"""Generate frontend/lib/facets.ts from a hand-authored curated CONFIG (the 6
MNMN filter categories with Vietnamese labels + group headers, from the MNMN UI).
Cross-checks every slug against cookpad_recipe/facet_vocab.json (the crawl output)
and warns on any slug missing from the crawl vocab.

Run from backend (after crawl_facets):
    python -m scripts.gen_facets_ts
"""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[2]
VOCAB = ROOT / "cookpad_recipe" / "facet_vocab.json"
OUT = ROOT / "frontend" / "lib" / "facets.ts"

# Curated config: each facet -> ordered groups -> terms {label, value(slug)}.
# A group with label None renders flat (no header). Order = MNMN UI order.
CONFIG = [
    {"key": "main_ingredient", "param": "main_ingredient", "label": "Nguyên liệu", "groups": [
        {"label": "Thịt", "terms": [
            ("Thịt Vịt", "thit-vit"), ("Thịt Bò", "mon-ngon-tu-thit-bo"),
            ("Thịt Heo", "mon-ngon-tu-thit-heo"), ("Thịt Gà", "mon-ngon-tu-thit-ga"),
            ("Các Loại Thịt Khác", "thit-khac")]},
        {"label": "Hải Sản", "terms": [
            ("Ốc", "mon-oc"), ("Ếch", "mon-ech"), ("Cá", "mon-ngon-tu-ca"),
            ("Tôm", "mon-ngon-tu-tom"), ("Mực/Bạch Tuộc", "mon-ngon-tu-muc"),
            ("Hải Sản Khác", "hai-san-khac")]},
        {"label": "Rau Củ Quả", "terms": [
            ("Các Loại Rau", "cac-loai-rau"), ("Cà Rốt", "mon-ngon-tu-ca-rot"),
            ("Củ Quả", "cu-qua"), ("Cà Chua", "mon-ngon-tu-ca-chua"),
            ("Nấm", "mon-ngon-tu-nam"), ("Rau Củ Quả Khác", "rau-cu-qua-khac")]},
        {"label": "Tinh Bột", "terms": [
            ("Phở/Bún/Hủ Tiếu/Miến", "pho-bun-hu-tieu-mien"), ("Gạo", "gao"),
            ("Bánh Mì", "mon-ngon-tu-banh-mi")]},
        {"label": "Khác", "terms": [
            ("Đậu Hũ", "mon-ngon-tu-dau-hu"), ("Trứng", "mon-ngon-tu-trung"),
            ("Khác", "nguyen-lieu-khac")]},
    ]},
    {"key": "cooking_method", "param": "cooking_method", "label": "Cách nấu", "groups": [
        {"label": None, "terms": [
            ("Quay/Rôti", "cac-mon-quay-ngon"), ("Nướng", "cac-mon-nuong-ngon"),
            ("Chiên", "cac-mon-chien-ngon"), ("Hấp/Tiềm", "cac-mon-hap-ngon"),
            ("Gỏi/Trộn", "cac-mon-goi-ngon"), ("Hầm", "cac-mon-ham-ngon"),
            ("Lẩu", "cac-mon-lau-ngon"), ("Món Xào", "cac-mon-xao-ngon"),
            ("Canh/Súp", "cach-mon-canh-ngon"), ("Om/Rim", "cac-mon-om-ngon"),
            ("Kho", "cac-mon-kho-ngon"), ("Khác", "cach-nau-khac")]},
    ]},
    {"key": "occasion", "param": "occasion", "label": "Dịp lễ", "groups": [
        {"label": "Lễ Tiệc", "terms": [
            ("20/10", "20-10"), ("Trung Thu", "trung-thu"), ("Ngày Hè", "ngay-he"),
            ("Lễ Hội Hóa Trang", "le-hoi-hoa-trang"), ("Tết", "mon-ngon-ngay-tet-moi"),
            ("Giáng Sinh", "mon-ngon-dip-giang-sinh"), ("Sinh Nhật", "mon-ngon-ngay-sinh-nhat"),
            ("Khác", "le-tiec-khac")]},
        {"label": "Ngày", "terms": [
            ("Bữa Sáng", "bua-sang"), ("Bữa Trưa", "bua-trua"), ("Bữa Tối", "bua-toi"),
            ("Cuối Tuần", "mon-ngon-cuoi-tuan"), ("Thực Đơn Hàng Ngày", "thuc-don-hang-ngay")]},
    ]},
    {"key": "dish_type", "param": "dish_type", "label": "Món ăn", "groups": [
        {"label": None, "terms": [
            ("Ăn Vặt", "an-vat"), ("Các Món Ăn Kèm/Món Phụ", "cac-mon-an-kem-mon-phu"),
            ("Món Chay", "cac-mon-chay-ngon"), ("Món Nhậu", "mon-nhau"), ("Món Mặn", "mon-man")]},
    ]},
    {"key": "region", "param": "region", "label": "Vùng miền", "groups": [
        {"label": None, "terms": [
            ("Món Á", "mon-a"), ("Món Âu", "mon-au"), ("Bắc", "mon-ngon-mien-bac"),
            ("Trung", "mon-ngon-mien-trung"), ("Nam", "mon-ngon-mien-nam")]},
    ]},
    {"key": "diet", "param": "diet", "label": "Theo nhu cầu dinh dưỡng", "groups": [
        {"label": None, "terms": [
            ("Hỗ Trợ Tim Và Mạch Máu", "ho-tro-tim-va-mach-mau"),
            ("Hỗ Trợ Hệ Tiêu Hóa", "ho-tro-he-tieu-hoa"),
            ("Hỗ Trợ Xây Dựng Khối Cơ Xương", "ho-tro-xay-dung-khoi-co-xuong"),
            ("Hỗ Trợ Cho Thận Khỏe Mạnh", "ho-tro-cho-than-khoe-manh"),
            ("Hỗ Trợ Cho Gan Khỏe Mạnh", "ho-tro-cho-gan-khoe-manh"),
            ("Giúp Làm Việc Trí Não Hiệu Quả", "giup-lam-viec-tri-nao-hieu-qua"),
            ("Giảm Khối Mỡ Thừa Của Cơ Thể", "giam-khoi-mo-thua-cua-co-the"),
            ("Bổ Máu", "bo-mau"), ("Cân Bằng Dinh Dưỡng", "can-bang-dinh-duong"),
            ("Bổ Mắt", "bo-mat"), ("Cảm Cúm", "cam-cum"), ("Loãng Xương", "loang-xuong-moi")]},
    ]},
]


def main() -> None:
    vocab = json.loads(VOCAB.read_text(encoding="utf-8")) if VOCAB.exists() else {}
    # cross-check slugs against the crawl vocab
    missing = []
    for f in CONFIG:
        known = {t["value"] for t in vocab.get(f["key"], [])}
        for g in f["groups"]:
            for _label, slug in g["terms"]:
                if known and slug not in known:
                    missing.append((f["key"], slug))
    if missing:
        print("WARNING: config slugs not found in crawl vocab (verify):")
        for k, s in missing:
            print(f"  [{k}] {s}")
    # build the emitted structure
    facets = []
    total = 0
    for f in CONFIG:
        groups = []
        for g in f["groups"]:
            terms = [{"label": lbl, "value": slug} for lbl, slug in g["terms"]]
            total += len(terms)
            grp = {"terms": terms}
            if g["label"] is not None:
                grp["label"] = g["label"]
            groups.append(grp)
        facets.append({"key": f["key"], "param": f["param"], "label": f["label"], "groups": groups})
    body = (
        "// AUTO-GENERATED by backend/scripts/gen_facets_ts.py — do not edit by hand.\n"
        "export type FacetTerm = { value: string; label: string };\n"
        "export type FacetGroup = { label?: string; terms: FacetTerm[] };\n"
        "export type Facet = { key: string; param: string; label: string; groups: FacetGroup[] };\n\n"
        "export const FACETS: Facet[] = " + json.dumps(facets, ensure_ascii=False, indent=2) + ";\n"
    )
    OUT.write_text(body, encoding="utf-8")
    print(f"wrote {OUT} ({total} terms, {len(facets)} facets); missing slugs: {len(missing)}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Sanity-check the script imports/parses (does NOT write facets.ts yet — we run it in Task 6), from `backend/`**

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -c "import ast; ast.parse(open('scripts/gen_facets_ts.py',encoding='utf-8').read()); print('parse ok')"
```
Expected: `parse ok`.

- [ ] **Step 3: Commit (script only — facets.ts unchanged here)**

```bash
git add backend/scripts/gen_facets_ts.py
git commit -m "feat(facet-v2): gen_facets_ts curated grouped config (6 categories, VN labels)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Frontend — regen grouped facets.ts + `FacetDropdown.tsx` + rewrite `RecipeBrowse.tsx` (atomic)

**Files:** Modify `frontend/lib/facets.ts` (regenerated), Create `frontend/components/recipes/FacetDropdown.tsx`, Modify `frontend/app/recipes/RecipeBrowse.tsx`

> This is ONE atomic task: regenerating `facets.ts` to the grouped shape breaks the old flat consumer, so the consumer rewrite + new component must land together. `tsc` is the gate at the end.

- [ ] **Step 1: Regenerate the grouped `facets.ts` (from `backend/`)**

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -m scripts.gen_facets_ts
```
Expected: `wrote .../frontend/lib/facets.ts (~61 terms, 6 facets); missing slugs: 0`. (If `missing slugs` > 0, STOP and report which slugs — a typo or a term MNMN renamed.)

- [ ] **Step 2: Create `frontend/components/recipes/FacetDropdown.tsx`** (one dropdown panel; MNMN apply-button model; standard React hooks only):

```tsx
"use client";

import { useState, useEffect, useRef } from "react";
import type { Facet } from "@/lib/facets";

interface Props {
  facet: Facet;
  selected: string[];               // committed slugs (from URL)
  open: boolean;
  onToggleOpen: () => void;
  onClose: () => void;
  onApply: (values: string[]) => void;
}

export default function FacetDropdown({
  facet, selected, open, onToggleOpen, onClose, onApply,
}: Props) {
  const [staged, setStaged] = useState<string[]>(selected);
  const ref = useRef<HTMLDivElement>(null);

  // re-sync staged selection whenever the panel (re)opens or the URL changes
  useEffect(() => {
    if (open) setStaged(selected);
  }, [open, selected]);

  // close on outside click
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose]);

  const count = selected.length;
  const toggle = (v: string) =>
    setStaged((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={onToggleOpen}
        className={`border-2 border-[#2c1810] px-3.5 py-1.5 text-sm font-bold shadow-block-sm transition-all ${
          count > 0
            ? "bg-[#2D6A4F] text-white"
            : "bg-[#fff5e6] text-[#2c1810] hover:bg-[#2D6A4F] hover:text-white"
        }`}
      >
        {facet.label}
        {count > 0 ? ` (${count})` : ""}
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-1 w-[min(92vw,28rem)] border-2 border-[#2c1810] bg-white p-4 shadow-block">
          {facet.groups.map((g, gi) => (
            <div key={gi} className="mb-3 last:mb-0">
              {g.label && (
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-[#6b5344]">
                  {g.label}
                </p>
              )}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {g.terms.map((t) => (
                  <label
                    key={t.value}
                    className="flex cursor-pointer items-center gap-2 text-sm text-[#2c1810]"
                  >
                    <input
                      type="checkbox"
                      checked={staged.includes(t.value)}
                      onChange={() => toggle(t.value)}
                      className="h-4 w-4 accent-[#2D6A4F]"
                    />
                    <span>{t.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              onApply(staged);
              onClose();
            }}
            className="mt-3 w-full border-2 border-[#2c1810] bg-[#ff6b35] py-2 text-sm font-bold text-white shadow-block-sm hover:bg-[#e85d26]"
          >
            Lọc thông tin
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Rewrite the facet section of `RecipeBrowse.tsx`.** Apply these precise edits:

  **(a) Replace the `import { FACETS } ...` line** (added in v1) — ensure it's present and add the component import after it:
  ```tsx
  import { FACETS } from "@/lib/facets";
  import FacetDropdown from "@/components/recipes/FacetDropdown";
  ```

  **(b) Remove the `MEALS` constant** (the `const MEALS = [...]` block).

  **(c) Remove the meal state read** `const meal: string = searchParams.get("meal") ?? "";` and the v1 per-facet reads `const region = ...; const occasion = ...; const dishType = ...; const diet = ...;`. Replace ALL of those with a single open-dropdown state (place after `const [expandedFacets...]` is removed — see (g)):
  ```tsx
  const [openFacet, setOpenFacet] = useState<string | null>(null);
  ```

  **(d) Remove the `expandedFacets` state** and the v1 `toggleFacet`/`toggleExpand` callbacks (they're replaced by the dropdown's own staged state). Add one apply helper after `updateParam`:
  ```tsx
  const applyFacet = useCallback(
    (param: string, values: string[]) => updateParam(param, values.join(",")),
    [updateParam]
  );
  ```

  **(e) In the data `useEffect`**, remove `if (meal) params.meal = meal;` and the v1 `if (region) ... if (diet) ...` block. Replace with a loop over the 6 facet params read straight from the URL:
  ```tsx
    FACETS.forEach((f) => {
      const v = searchParams.get(f.param);
      if (v) params[f.param] = v;
    });
  ```
  and change the dependency array to depend on the raw query string for facets: replace the old deps `[page, keyword, difficulty, sort, search, meal, region, occasion, dishType, diet]` with:
  ```tsx
  }, [page, keyword, difficulty, sort, search, searchParams]);
  ```
  (`searchParams` changes whenever any facet param changes — simplest correct dep.)

  **(f) Replace `hasFilters`** with:
  ```tsx
  const facetCount = FACETS.reduce(
    (n, f) => n + (searchParams.get(f.param) ?? "").split(",").filter(Boolean).length,
    0
  );
  const hasFilters = keyword || difficulty || search || facetCount > 0;
  ```

  **(g) Remove the entire v1 `{/* Meal chips */}` block and the v1 `{/* Facet chips ... */}` `{FACETS.map(...)}` block.** Replace both with the 6-button dropdown bar + counter:
  ```tsx
      {/* Facet dropdown bar (MNMN parity) */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {FACETS.map((f) => (
          <FacetDropdown
            key={f.key}
            facet={f}
            selected={(searchParams.get(f.param) ?? "").split(",").filter(Boolean)}
            open={openFacet === f.key}
            onToggleOpen={() => setOpenFacet((cur) => (cur === f.key ? null : f.key))}
            onClose={() => setOpenFacet(null)}
            onApply={(vals) => applyFacet(f.param, vals)}
          />
        ))}
        {facetCount > 0 && (
          <span className="ml-1 text-sm font-bold text-[#ff6b35]">
            Hiện Bộ Lọc: {facetCount}
          </span>
        )}
      </div>
  ```

  (Leave the keyword chips block, search bar, sort/difficulty filter bar, results grid, empty state, and pagination unchanged. "Xóa bộ lọc" already calls `router.push("/recipes")`, which clears all facet params.)

- [ ] **Step 4: Typecheck (from `frontend/`)**

```bash
npx tsc --noEmit
```
Expected: no NEW errors — only the 3 known pre-existing files (`app/admin/page.tsx`, `app/me/profile/page.tsx`, `app/recognize/page.tsx`). If `RecipeBrowse.tsx` or `FacetDropdown.tsx` or `lib/facets.ts` errors, fix before committing (common: a leftover reference to the removed `meal`/`region`/`dishType` vars or `toggleFacet`).

- [ ] **Step 5: Commit (regenerated facets.ts + component + browse together)**

```bash
git add frontend/lib/facets.ts frontend/components/recipes/FacetDropdown.tsx frontend/app/recipes/RecipeBrowse.tsx
git commit -m "feat(facet-v2): MNMN-style 6-category dropdown filter bar (Apply model), drop meal chips

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: Manual smoke (after restarting uvicorn + `npm run dev`)** — open `/recipes`: 6 category buttons (Nguyên liệu, Cách nấu, Dịp lễ, Món ăn, Vùng miền, Theo nhu cầu dinh dưỡng); click one → grouped-checkbox panel opens (Nguyên liệu shows Thịt/Hải Sản/… headers), check several → "Lọc thông tin" → URL gets `?main_ingredient=a,b`, grid filters, button shows `(N)`, counter "Hiện Bộ Lọc: N" updates; clicking outside closes without applying; another facet ANDs; "Xóa bộ lọc" clears all; no meal chips remain; keyword chips + search + sort still work.

---

## Self-Review

**Spec coverage:**
- 2 columns `main_ingredients`/`cooking_methods` + migration 0012 → Task 1. ✓
- Crawl nguyenlieu + cachnau (extend FACETS + TAXONOMY_INDEX_SLUGS), facet_vocab 6 keys, tag → Task 2. ✓
- LLM-fill 2 new facets, NULL→0 (6) → Task 3. ✓
- API 2 params + `&&` overlap (6-col allow-list) + endpoint forward; `meal` param left intact on backend → Task 4. ✓ (backend meal untouched.)
- Curated grouped CONFIG (labels/groups from screenshots, slugs verified) + gen rewrite + slug cross-check → Task 5. ✓
- Grouped `facets.ts` (FacetGroup type) → Task 6 Step 1. ✓
- `FacetDropdown.tsx` (staged checkboxes + Apply + outside-click close) → Task 6 Step 2. ✓
- RecipeBrowse: 6-button bar + counter, remove meal chips/var + stop sending meal, 6 URL params, hasFilters/deps, keep keyword/search/sort → Task 6 Step 3. ✓
- Verify: crawl counts, NULL→0, API smoke + AND, slug cross-check, tsc, manual → Tasks 2/3/4/5/6. ✓

**Placeholder scan:** Full code in every step; the one omitted MNMN term ("Tinh Bột Khác", no confirmed slug) is intentionally excluded per the spec, not a placeholder; verify commands have expected output; no-network/no-data and missing-slug failure modes called out.

**Type/name consistency:**
- Columns `main_ingredients`/`cooking_methods` consistent: migration (T1) ↔ ORM (T1) ↔ crawl FACETS (T2) ↔ backfill FACETS (T3) ↔ API loop (T4) ↔ CONFIG slugs map to these via facet keys. ✓
- Params `main_ingredient`/`cooking_method` consistent: service (T4) ↔ endpoint (T4) ↔ CONFIG `param` (T5) ↔ facets.ts `param` ↔ RecipeBrowse `f.param` (T6). ✓
- `facets.ts` shape (`FacetGroup` with optional `label`, `Facet.groups`) emitted by gen (T5) ↔ consumed by FacetDropdown + RecipeBrowse (T6). The old flat `Facet.terms` is fully removed; T6 updates the consumer in the same commit as the regen → no tsc gap. ✓
- `applyFacet(param, values)` / `openFacet` / `facetCount` defined in T6 Step 3, used in the same step's JSX. ✓
- Backend `list_recipes` `meal` param NOT removed (spec) — only frontend stops sending it (T6 removes the `meal` read + params). ✓

**Sequencing note (flagged for executor):** Task 5 commits the gen script WITHOUT regenerating `facets.ts`; Task 6 Step 1 regenerates it and Steps 2-3 update consumers in the same commit, so no intermediate commit has a broken `tsc`. The Task 3 backfill is long — the executor may background it; Tasks 4-6 depend only on Task 2 (crawl/vocab), not on the backfill finishing.

No gaps found.
