# Facet filter (vùng miền / dịp nấu / loại món / chế độ ăn) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 4 facet filters to the `/recipes` browse page — region, occasion, dish-type, diet — backed by new `ARRAY(String)` columns tagged from MNMN taxonomy (crawl) + LLM-fill for the non-MNMN canonicals.

**Architecture:** Migration 0010 adds `regions/occasions/dish_types/diets`. `crawl_facets.py` crawls the 4 MNMN taxonomy sitemaps, derives a raw-term vocab (`facet_vocab.json`), and tags canonicals by joining taxonomy recipe URLs → `Recipe.cookpad_url` (source=monngonmoingay) → `canonical_dish_slug` → canonical row. `backfill_facets.py` LLM-classifies the canonicals still NULL per facet into that same vocab. `list_recipes` gains 4 comma-list params filtered with Postgres array-overlap `&&`; the browse page renders multi-select chip groups from a generated `frontend/lib/facets.ts`.

**Tech Stack:** FastAPI + SQLAlchemy async (Postgres ARRAY, `&&` overlap), Alembic manual migration, httpx + sitemap/JSON-LD crawl (reuse `crawl_mnmn.py`), OpenAI `gpt-4o-mini`, Next.js 16 client component, URL search params.

**Branch:** `feat/canonical-recipes`. Backend cmds from `backend/`: `$env:PYTHONUTF8=1; .venv\Scripts\python.exe ...`. Frontend from `frontend/`. Do NOT commit `.claude/settings*`, `backups/`, `cookpad_recipe/*.json`.

**Facet reference table (use verbatim everywhere):**

| facet key / URL param | DB column | MNMN sitemap (substring) | UI label |
|---|---|---|---|
| `region` | `regions` | `vungmien` | Vùng miền |
| `occasion` | `occasions` | `dipnau` | Dịp nấu |
| `dish_type` | `dish_types` | `loaimon` | Loại món |
| `diet` | `diets` | `dinhduong` | Chế độ ăn |

Values stored in columns = **term slugs** (e.g. `mien-bac`); UI maps slug→label via `facets.ts`. `classify_facets` returns only slugs from the facet's allowed list.

---

### Task 1: Migration 0010 + ORM columns

**Files:**
- Create: `backend/alembic/versions/0010_recipe_facets.py`
- Modify: `backend/app/models/recipe.py` (next to `meal_types`, line ~60)

- [ ] **Step 1: Write the migration** (mirror `0009_recipe_meal_types.py`):

```python
"""recipes facet tags: regions / occasions / dish_types / diets

Revision ID: 0010
Revises: 0009
Create Date: 2026-06-04
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None

_COLS = ("regions", "occasions", "dish_types", "diets")


def upgrade() -> None:
    for col in _COLS:
        op.add_column("recipes", sa.Column(col, postgresql.ARRAY(sa.String()), nullable=True))


def downgrade() -> None:
    for col in reversed(_COLS):
        op.drop_column("recipes", col)
```

- [ ] **Step 2: Add the 4 ORM columns.** In `backend/app/models/recipe.py`, immediately after the `meal_types` line (`meal_types: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)`), add:

```python
    regions: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    occasions: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    dish_types: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    diets: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
```

(`ARRAY` and `String` are already imported in this file.)

- [ ] **Step 3: Apply the migration (from `backend/`)**

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -m alembic upgrade head
```
Expected: `Running upgrade 0009 -> 0010`.

- [ ] **Step 4: Verify columns exist + ORM imports clean (from `backend/`)**

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -c "import asyncio; from sqlalchemy import text; from app.core.database import AsyncSessionLocal
async def m():
 async with AsyncSessionLocal() as db:
  r=(await db.execute(text(\"select column_name from information_schema.columns where table_name='recipes' and column_name in ('regions','occasions','dish_types','diets') order by 1\"))).scalars().all()
  print('cols:', r)
asyncio.run(m())"
```
Expected: `cols: ['diets', 'dish_types', 'occasions', 'regions']`.

- [ ] **Step 5: Commit**

```bash
git add backend/alembic/versions/0010_recipe_facets.py backend/app/models/recipe.py
git commit -m "feat(facet): migration 0010 + ORM regions/occasions/dish_types/diets (ARRAY)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `crawl_facets.py` — crawl MNMN taxonomy, build vocab, tag canonicals

**Files:** Create `backend/scripts/crawl_facets.py`

This reuses the sitemap/httpx pattern from `crawl_mnmn.py` (`BASE`, `SITEMAP_INDEX`, `LOC_RE`, an httpx `get()`).

- [ ] **Step 1: Create the script**

```python
"""Crawl monngonmoingay.com taxonomy sitemaps (vungmien/dipnau/loaimon/dinhduong),
derive a raw-term vocab per facet, and tag canonical recipes.

For each facet sitemap -> term pages (e.g. /vung-mien/mien-bac/) -> recipe URLs.
A recipe URL is matched to its raw MNMN recipe via Recipe.cookpad_url
(source='monngonmoingay'), then to its canonical via canonical_dish_slug, and the
term slug is unioned into the canonical's facet column.

Outputs:
  - cookpad_recipe/facet_vocab.json : {facet: [{"value": slug, "label": text}, ...]}
  - tags recipes.regions / occasions / dish_types / diets for canonicals.

Idempotent: each canonical's facet column is rebuilt as the union of all crawled
terms for that canonical (overwrites, no duplicate accumulation).

Run from backend:
    python -m scripts.crawl_facets
"""
import asyncio
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

import httpx  # noqa: E402
from sqlalchemy import select, update  # noqa: E402
from app.core.database import AsyncSessionLocal  # noqa: E402
from app.models.recipe import Recipe  # noqa: E402

BASE = "https://monngonmoingay.com"
SITEMAP_INDEX = f"{BASE}/sitemap_index.xml"
LOC_RE = re.compile(r"<loc>(.*?)</loc>", re.I | re.S)
OUT = Path(__file__).resolve().parents[2] / "cookpad_recipe" / "facet_vocab.json"

# facet -> (sitemap substring, DB column)
FACETS = {
    "region": ("vungmien", "regions"),
    "occasion": ("dipnau", "occasions"),
    "dish_type": ("loaimon", "dish_types"),
    "diet": ("dinhduong", "diets"),
}
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0"}
# A term page URL looks like https://monngonmoingay.com/<taxonomy>/<term-slug>/
TERM_RE = re.compile(r"^https?://[^/]+/[^/]+/([^/]+)/?$")
# A recipe article URL (reuse crawl_mnmn's notion: a single-segment slug page)
ARTICLE_RE = re.compile(r"^https?://[^/]+/([^/]+)/?$")


def get(client: httpx.Client, url: str) -> str | None:
    try:
        r = client.get(url, timeout=20.0)
        r.raise_for_status()
        return r.text
    except Exception as e:
        print(f"  fetch fail {url}: {e}")
        return None


def slug_to_label(slug: str) -> str:
    return slug.replace("-", " ").strip().title()


def crawl() -> tuple[dict, dict]:
    """Return (vocab, url_terms).
    vocab: {facet: {term_slug: label}}; url_terms: {recipe_url: {facet: set(term_slug)}}.
    """
    vocab: dict[str, dict[str, str]] = {f: {} for f in FACETS}
    url_terms: dict[str, dict[str, set]] = defaultdict(lambda: defaultdict(set))
    with httpx.Client(headers=HEADERS, follow_redirects=True) as client:
        idx = get(client, SITEMAP_INDEX) or ""
        sub_sitemaps = LOC_RE.findall(idx)
        for facet, (needle, _col) in FACETS.items():
            subs = [u for u in sub_sitemaps if needle in u]
            print(f"[{facet}] sub-sitemaps: {len(subs)}")
            term_pages: list[str] = []
            for sm in subs:
                body = get(client, sm) or ""
                term_pages += LOC_RE.findall(body)
            term_pages = sorted({u for u in term_pages if TERM_RE.match(u)})
            print(f"[{facet}] term pages: {len(term_pages)}")
            for tp in term_pages:
                m = TERM_RE.match(tp)
                if not m:
                    continue
                slug = m.group(1)
                html = get(client, tp)
                if not html:
                    continue
                vocab[facet][slug] = slug_to_label(slug)
                # collect recipe article links on the term page
                links = set(re.findall(r'href="(https?://[^"]+)"', html))
                for ln in links:
                    # recipe article: single-segment path, not itself a taxonomy/term page
                    if ARTICLE_RE.match(ln) and not any(seg in ln for seg, _ in FACETS.values()):
                        url_terms[ln.rstrip("/") + "/"][facet].add(slug)
    return vocab, url_terms


async def tag_db(url_terms: dict) -> None:
    async with AsyncSessionLocal() as db:
        # url -> canonical_dish_slug (raw MNMN recipes)
        raw = (await db.execute(
            select(Recipe.cookpad_url, Recipe.canonical_dish_slug).where(
                Recipe.source == "monngonmoingay", Recipe.cookpad_url.isnot(None)
            )
        )).all()
        url_to_slug = {u.rstrip("/") + "/": s for (u, s) in raw if u and s}
        # canonical_dish_slug -> canonical id
        canon = (await db.execute(
            select(Recipe.canonical_dish_slug, Recipe.id).where(Recipe.is_canonical.is_(True))
        )).all()
        slug_to_canon = {s: i for (s, i) in canon}
        # accumulate per-canonical terms
        canon_terms: dict = defaultdict(lambda: {c: set() for _f, (_n, c) in FACETS.items()})
        cols = {f: c for f, (_n, c) in FACETS.items()}
        matched = 0
        for url, facets in url_terms.items():
            slug = url_to_slug.get(url)
            cid = slug_to_canon.get(slug) if slug else None
            if cid is None:
                continue
            matched += 1
            for f, terms in facets.items():
                canon_terms[cid][cols[f]] |= terms
        for cid, colmap in canon_terms.items():
            values = {col: sorted(s) for col, s in colmap.items() if s}
            if values:
                await db.execute(update(Recipe).where(Recipe.id == cid).values(**values))
        await db.commit()
        print(f"matched recipe urls: {matched}; canonicals tagged: {len(canon_terms)}")


def main() -> None:
    vocab, url_terms = crawl()
    OUT.write_text(json.dumps(
        {f: [{"value": s, "label": lbl} for s, lbl in sorted(terms.items())]
         for f, terms in vocab.items()},
        ensure_ascii=False, indent=2), encoding="utf-8")
    for f, terms in vocab.items():
        print(f"vocab[{f}]: {len(terms)} terms")
    print(f"wrote {OUT}")
    asyncio.run(tag_db(url_terms))


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the crawl + tag (real network + DB, several minutes), from `backend/`**

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -m scripts.crawl_facets
```
Expected: per-facet sub-sitemap/term counts, `vocab[region]: N terms` … for all 4, `wrote .../facet_vocab.json`, and `matched recipe urls: <K>; canonicals tagged: <M>` with M in the low thousands.
- **If no network in the sandbox:** report DONE_WITH_CONCERNS — the script + approach are committed; the user runs it. Do NOT fabricate `facet_vocab.json`; Task 4's generator handles a missing file by emitting an empty-term skeleton.

- [ ] **Step 3: Verify vocab + a tagged canonical (from `backend/`, only if Step 2 ran)**

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -c "import asyncio; from sqlalchemy import text; from app.core.database import AsyncSessionLocal
async def m():
 async with AsyncSessionLocal() as db:
  for col in ('regions','occasions','dish_types','diets'):
   n=(await db.execute(text(f'select count(*) from recipes where is_canonical and {col} is not null'))).scalar_one()
   print(col, 'tagged canonicals:', n)
asyncio.run(m())"
```
Expected: a non-trivial count for each column (hundreds–thousands). If Step 2 couldn't run, all are 0 — note it.

- [ ] **Step 4: Commit (script only — `facet_vocab.json` is NOT committed)**

```bash
git add backend/scripts/crawl_facets.py
git commit -m "feat(facet): crawl MNMN taxonomy -> facet_vocab.json + tag canonicals

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `backfill_facets.py` — LLM-fill canonicals still NULL per facet

**Files:** Create `backend/scripts/backfill_facets.py`

- [ ] **Step 1: Create the script**

```python
"""LLM-fill facet tags for canonical recipes still NULL per facet (the ~400
non-MNMN canonicals + any MNMN dish absent from a taxonomy). Classifies each
title into that facet's raw-term vocab (read from facet_vocab.json), reusing the
classify_meal_types pattern. Idempotent — only touches NULL rows.

Run from backend (after crawl_facets):
    python -m scripts.backfill_facets
"""
import asyncio
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

from openai import AsyncOpenAI  # noqa: E402
from sqlalchemy import select, update  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.database import AsyncSessionLocal  # noqa: E402
from app.models.recipe import Recipe  # noqa: E402

VOCAB_FILE = Path(__file__).resolve().parents[2] / "cookpad_recipe" / "facet_vocab.json"

# facet label (for the prompt) + DB column
FACETS = {
    "region": ("vùng miền (Bắc/Trung/Nam...)", "regions"),
    "occasion": ("dịp nấu (hằng ngày/đãi tiệc/lễ tết/ăn vặt...)", "occasions"),
    "dish_type": ("loại món (canh/kho/xào/nướng/chiên/gỏi/lẩu...)", "dish_types"),
    "diet": ("chế độ ăn (mặn/chay/ăn kiêng...)", "diets"),
}


async def classify_facets(client: AsyncOpenAI, title: str, facet_desc: str,
                          allowed: list[dict]) -> list[str]:
    """Return a subset of allowed term slugs that fit `title` for this facet."""
    labels = ", ".join(f'{t["value"]} ({t["label"]})' for t in allowed)
    try:
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{
                "role": "user",
                "content": (
                    f'Món ăn Việt Nam: "{title}". Phân loại theo {facet_desc}. '
                    f'Chỉ chọn trong danh sách (value): {labels}. '
                    'Trả JSON object {"values": [...]} gồm các value phù hợp '
                    '(có thể nhiều, hoặc rỗng nếu không chắc). Chỉ JSON.'
                ),
            }],
            response_format={"type": "json_object"},
            temperature=0,
        )
        allowed_set = {t["value"] for t in allowed}
        data = json.loads(resp.choices[0].message.content)
        return [v for v in (data.get("values") or []) if v in allowed_set]
    except Exception as e:
        print(f"    [ERR] classify {facet_desc}: {e}")
        return []


async def main() -> None:
    if not VOCAB_FILE.exists():
        print(f"missing {VOCAB_FILE} — run scripts.crawl_facets first")
        return
    vocab = json.loads(VOCAB_FILE.read_text(encoding="utf-8"))
    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    async with AsyncSessionLocal() as db:
        for facet, (desc, col) in FACETS.items():
            allowed = vocab.get(facet, [])
            if not allowed:
                print(f"[{facet}] no vocab — skip")
                continue
            rows = (await db.execute(
                select(Recipe.id, Recipe.title).where(
                    Recipe.is_canonical.is_(True),
                    getattr(Recipe, col).is_(None),
                )
            )).all()
            print(f"[{facet}] to fill: {len(rows)}")
            done = 0
            for rid, title in rows:
                terms = await classify_facets(client, title, desc, allowed)
                # store [] for "none chosen" so reruns don't re-query it
                await db.execute(update(Recipe).where(Recipe.id == rid).values(**{col: terms}))
                done += 1
                if done % 50 == 0:
                    await db.commit()
                    print(f"  [{facet}] {done}/{len(rows)}")
            await db.commit()
            print(f"[{facet}] DONE filled {done}")


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 2: Run it (real OpenAI, ~400×4 calls, a few min), from `backend/`**

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -m scripts.backfill_facets
```
Expected: per-facet `to fill: ~N`, progress, `DONE filled <N>`.
- If no network/OpenAI key or `facet_vocab.json` missing: report DONE_WITH_CONCERNS; the script stays committed for the user.

- [ ] **Step 3: Verify NULL→0 per facet (from `backend/`, only if Steps ran)**

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -c "import asyncio; from sqlalchemy import text; from app.core.database import AsyncSessionLocal
async def m():
 async with AsyncSessionLocal() as db:
  for col in ('regions','occasions','dish_types','diets'):
   n=(await db.execute(text(f'select count(*) from recipes where is_canonical and {col} is null'))).scalar_one()
   print(col, 'NULL canonicals:', n)
asyncio.run(m())"
```
Expected: `0` (or near 0) for each. If the LLM step couldn't run, these stay high — note it.

- [ ] **Step 4: Commit (script only)**

```bash
git add backend/scripts/backfill_facets.py
git commit -m "feat(facet): backfill_facets LLM-fill NULL canonicals into crawl vocab

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Generate `frontend/lib/facets.ts` from the vocab

**Files:** Create `backend/scripts/gen_facets_ts.py`, Create `frontend/lib/facets.ts`

- [ ] **Step 1: Create the generator** (`backend/scripts/gen_facets_ts.py`):

```python
"""Generate frontend/lib/facets.ts from cookpad_recipe/facet_vocab.json.
If the vocab file is missing, emits a valid skeleton (4 facets, empty term lists)
so the frontend still typechecks; rerun after crawl_facets to fill terms.

Run from backend:
    python -m scripts.gen_facets_ts
"""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[2]
VOCAB = ROOT / "cookpad_recipe" / "facet_vocab.json"
OUT = ROOT / "frontend" / "lib" / "facets.ts"

# order + UI label per facet (param == key)
META = [
    ("region", "Vùng miền"),
    ("occasion", "Dịp nấu"),
    ("dish_type", "Loại món"),
    ("diet", "Chế độ ăn"),
]


def main() -> None:
    vocab = json.loads(VOCAB.read_text(encoding="utf-8")) if VOCAB.exists() else {}
    facets = []
    for key, label in META:
        terms = vocab.get(key, [])
        facets.append({"key": key, "param": key, "label": label, "terms": terms})
    body = (
        "// AUTO-GENERATED by backend/scripts/gen_facets_ts.py — do not edit by hand.\n"
        "export type FacetTerm = { value: string; label: string };\n"
        "export type Facet = { key: string; param: string; label: string; terms: FacetTerm[] };\n\n"
        "export const FACETS: Facet[] = " + json.dumps(facets, ensure_ascii=False, indent=2) + ";\n"
    )
    OUT.write_text(body, encoding="utf-8")
    print(f"wrote {OUT} ({sum(len(f['terms']) for f in facets)} terms total)")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it (from `backend/`)**

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -m scripts.gen_facets_ts
```
Expected: `wrote .../frontend/lib/facets.ts (<N> terms total)`. If `facet_vocab.json` exists (Task 2 ran) N>0; otherwise N=0 (valid skeleton — note that the user reruns after crawl).

- [ ] **Step 3: Verify the generated TS is valid (from `frontend/`)**

```bash
npx tsc --noEmit
```
Expected: no NEW errors beyond the 3 known pre-existing files (`app/admin/page.tsx`, `app/me/profile/page.tsx`, `app/recognize/page.tsx`).

- [ ] **Step 4: Commit (generator + generated file)**

```bash
git add backend/scripts/gen_facets_ts.py frontend/lib/facets.ts
git commit -m "feat(facet): gen_facets_ts -> frontend/lib/facets.ts (vocab for chips)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: API — 4 facet params in `list_recipes` + list endpoint

**Files:** Modify `backend/app/services/recipe_service.py`, `backend/app/api/v1/recipes.py`

- [ ] **Step 1: Extend the imports in `recipe_service.py`.** Change the existing line `from sqlalchemy import delete, func, or_, select, text, update` to:

```python
from sqlalchemy import ARRAY, String, bindparam, delete, func, or_, select, text, update
```

- [ ] **Step 2: Add the 4 params to `list_recipes`.** In the signature, after `meal: Optional[str] = None,` add:

```python
    region: Optional[str] = None,
    occasion: Optional[str] = None,
    dish_type: Optional[str] = None,
    diet: Optional[str] = None,
```

- [ ] **Step 3: Add the overlap filters.** Immediately after the existing meal filter block (`if meal in ("sang", "trua", "toi"): ...`), add:

```python
    for _param, _col in (
        (region, "regions"),
        (occasion, "occasions"),
        (dish_type, "dish_types"),
        (diet, "diets"),
    ):
        if _param:
            _vals = [v for v in _param.split(",") if v]
            if _vals:
                stmt = stmt.where(
                    text(f"recipes.{_col} && :facet_{_col}").bindparams(
                        bindparam(f"facet_{_col}", value=_vals, type_=ARRAY(String))
                    )
                )
```

(`_col` is from a fixed internal allow-list, never user input — safe to interpolate. Values are bound.)

- [ ] **Step 4: Forward the params from the list endpoint.** In `backend/app/api/v1/recipes.py`, the `@router.get("")` handler (`async def list_recipes(...)`): after the `meal: Optional[str] = Query(default=None),` param add:

```python
    region: Optional[str] = Query(default=None),
    occasion: Optional[str] = Query(default=None),
    dish_type: Optional[str] = Query(default=None),
    diet: Optional[str] = Query(default=None),
```

and in the `recipe_service.list_recipes(...)` call (the one that already passes `meal=meal,`), add:

```python
        region=region, occasion=occasion, dish_type=dish_type, diet=diet,
```

- [ ] **Step 5: Smoke the filters (real DB), from `backend/`** — create temp `backend/scripts/_smoke_facet.py`:

```python
import asyncio
from sqlalchemy import select, text
from app.core.database import AsyncSessionLocal
from app.models.recipe import Recipe
from app.services.recipe_service import list_recipes

FACETS = (("region", "regions"), ("occasion", "occasions"),
          ("dish_type", "dish_types"), ("diet", "diets"))


async def main():
    async with AsyncSessionLocal() as db:
        for param, col in FACETS:
            term = (await db.execute(
                text(f"select unnest({col}) as t from recipes "
                     f"where is_canonical and {col} is not null limit 1")
            )).scalar_one_or_none()
            if term is None:
                print(f"{param}: no tagged data yet — skip")
                continue
            cards, pg = await list_recipes(db, page=1, limit=10, **{param: term})
            print(f"{param}={term}: total {pg.total}, sample {len(cards)}")
            for c in cards:
                mt = (await db.execute(
                    select(getattr(Recipe, col)).where(Recipe.id == c.id))).scalar_one()
                assert mt and term in mt, f"{c.title} {col}={mt}"
            print(f"  OK — all contain {term!r}")


asyncio.run(main())
```

Run: `$env:PYTHONUTF8=1; .venv\Scripts\python.exe -m scripts._smoke_facet`
Expected: for each facet with data, a non-zero total and `OK — all contain ...`. (Facets with no data print `skip`.) Then delete: `Remove-Item scripts\_smoke_facet.py`.
- If no facet has data yet (crawl/backfill didn't run), every line prints `skip` — that still proves the query builds without error; note it.

- [ ] **Step 6: Verify the app imports clean (from `backend/`)**

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -c "from app.main import app; print('ok')"
```
Expected: `ok`.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/recipe_service.py backend/app/api/v1/recipes.py
git commit -m "feat(facet): list_recipes region/occasion/dish_type/diet (&& overlap) + endpoint

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Frontend — multi-select facet chip groups on `/recipes`

**Files:** Modify `frontend/app/recipes/RecipeBrowse.tsx`

> Use only patterns already present in this file (useState, useCallback, useSearchParams, router.push). Do NOT introduce new Next.js APIs (this repo runs a modified Next.js — see `frontend/AGENTS.md`).

- [ ] **Step 1: Import the vocab.** Near the top imports (after `import type { PaginatedResponse, RecipeCard } from "@/lib/types";`), add:

```tsx
import { FACETS } from "@/lib/facets";
```

- [ ] **Step 2: Read the 4 facet params + an expand state.** After `const meal: string = searchParams.get("meal") ?? "";` add:

```tsx
  const region: string = searchParams.get("region") ?? "";
  const occasion: string = searchParams.get("occasion") ?? "";
  const dishType: string = searchParams.get("dish_type") ?? "";
  const diet: string = searchParams.get("diet") ?? "";
```

And after the `const [showFilters, setShowFilters] = useState(false);` line add:

```tsx
  const [expandedFacets, setExpandedFacets] = useState<Set<string>>(new Set());
```

- [ ] **Step 3: Add a multi-select toggle helper.** Immediately after the `updateParam` `useCallback` block, add:

```tsx
  const toggleFacet = useCallback(
    (param: string, value: string) => {
      const current = (searchParams.get(param) ?? "").split(",").filter(Boolean);
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      updateParam(param, next.join(","));
    },
    [searchParams, updateParam]
  );

  const toggleExpand = useCallback((key: string) => {
    setExpandedFacets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
```

- [ ] **Step 4: Send facets to the API + extend effect deps.** In the `useEffect`, after `if (meal) params.meal = meal;` add:

```tsx
    if (region) params.region = region;
    if (occasion) params.occasion = occasion;
    if (dishType) params.dish_type = dishType;
    if (diet) params.diet = diet;
```

and change the dependency array `}, [page, keyword, difficulty, sort, search, meal]);` to:

```tsx
  }, [page, keyword, difficulty, sort, search, meal, region, occasion, dishType, diet]);
```

- [ ] **Step 5: Include facets in `hasFilters`.** Change `const hasFilters = keyword || difficulty || search || meal;` to:

```tsx
  const hasFilters =
    keyword || difficulty || search || meal || region || occasion || dishType || diet;
```

- [ ] **Step 6: Render facet chip groups.** Immediately AFTER the existing `{/* Meal chips */}` block's closing `</div>`, add:

```tsx
      {/* Facet chips (region / occasion / dish-type / diet) */}
      {FACETS.map((f) => {
        if (f.terms.length === 0) return null;
        const selected = (searchParams.get(f.param) ?? "").split(",").filter(Boolean);
        const expanded = expandedFacets.has(f.key);
        const shown = expanded ? f.terms : f.terms.slice(0, 12);
        return (
          <div key={f.key} className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-sm font-medium text-[#6b5344] mr-1">{f.label}:</span>
            {shown.map((t) => {
              const active = selected.includes(t.value);
              return (
                <button
                  key={t.value}
                  onClick={() => toggleFacet(f.param, t.value)}
                  className={`border-2 px-3 py-1 text-sm font-bold transition-all ${
                    active
                      ? "border-[#2c1810] bg-[#2D6A4F] text-white shadow-block-sm"
                      : "border-[#2c1810] bg-[#fff5e6] text-[#2c1810] shadow-block-sm hover:bg-[#2D6A4F] hover:text-white"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
            {f.terms.length > 12 && (
              <button
                onClick={() => toggleExpand(f.key)}
                className="text-sm font-bold text-[#ff6b35] hover:underline"
              >
                {expanded ? "Thu gọn" : `Xem thêm (${f.terms.length - 12})`}
              </button>
            )}
          </div>
        );
      })}
```

- [ ] **Step 7: Typecheck (from `frontend/`)**

```bash
npx tsc --noEmit
```
Expected: no NEW errors (only the 3 known pre-existing files).

- [ ] **Step 8: Commit**

```bash
git add frontend/app/recipes/RecipeBrowse.tsx
git commit -m "feat(facet): multi-select facet chip groups on /recipes (OR within, AND across)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 9: Manual smoke (after restarting uvicorn + `npm run dev`)** — open `/recipes`: each non-empty facet shows a chip row; clicking chips toggles them (multiple within a facet = OR), URL gains `?region=a,b&dish_type=c`; facets AND with each other and with keyword/meal; "Xem thêm" expands long facets; "Xóa bộ lọc" (`router.push("/recipes")`) clears all.

---

## Self-Review

**Spec coverage:**
- Migration 0010 + 4 ARRAY cols + ORM → Task 1. ✓
- Crawl 4 taxonomy sitemaps → `facet_vocab.json` + tag via `cookpad_url`→`canonical_dish_slug`→canonical union → Task 2. ✓
- LLM-fill NULL canonicals into crawl vocab (allowed-labels), idempotent → Task 3. ✓
- Vocab artifact policy: `facet_vocab.json` NOT committed; generated `frontend/lib/facets.ts` committed → Task 4 (gen, skeleton-safe). ✓
- API: 4 comma-list params, `&&` overlap, AND across + with existing filters → Task 5. ✓
- Endpoint forwards 4 params → Task 5 Step 4. ✓
- Frontend multi-select chip groups, URL comma params, `hasFilters`, page reset (via `updateParam`), "Xem thêm" collapse > 12 → Task 6. ✓
- Verify: crawl counts, NULL→0, API overlap smoke, tsc, manual → Tasks 2/3/5/6 verify steps. ✓
- No-network fallbacks (crawl/backfill DONE_WITH_CONCERNS; skeleton facets.ts keeps frontend testable) → Tasks 2/3/4. ✓

**Placeholder scan:** Full code in every step; verify commands concrete; no-data/no-network failure modes called out explicitly.

**Type/name consistency:**
- Columns `regions/occasions/dish_types/diets` consistent: migration (Task 1) ↔ ORM (Task 1) ↔ crawl `FACETS` (Task 2) ↔ backfill `FACETS` (Task 3) ↔ API loop (Task 5). ✓
- URL/params `region/occasion/dish_type/diet` consistent: API params (Task 5) ↔ endpoint (Task 5) ↔ frontend reads + `params.*` + `f.param` (Task 6). Note `dish_type` URL param maps to local `dishType` var (Task 6 Step 2/4). ✓
- `facet_vocab.json` shape `{facet: [{value,label}]}` written by Task 2, read by Task 3 (`classify_facets` allowed) and Task 4 (`gen_facets_ts`). ✓
- `FACETS`/`Facet`/`FacetTerm` exported by `facets.ts` (Task 4) ↔ imported in Task 6. ✓
- `updateParam(key, value)` reused as-is (resets page when key≠"page"); `toggleFacet`/`toggleExpand` new, defined in Task 6 Step 3. ✓

**Known risk (flagged for execution):** the crawl's recipe-link extraction (`crawl_facets.py` Step 1, `re.findall(href=...)` + `ARTICLE_RE`) depends on MNMN term-page HTML structure. If a term page paginates or wraps recipe links unusually, the first real run may under-collect; the executing agent should eyeball `matched recipe urls` vs expected and adjust the link regex / add pagination following before the Task 2 commit. This is the one step that can't be fully verified without the live site.

No other gaps found.
