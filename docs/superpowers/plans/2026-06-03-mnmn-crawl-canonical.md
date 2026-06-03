# Crawl-all monngonmoingay → canonical expansion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crawl every recipe on monngonmoingay.com (MNMN), import them as raw recipes, and auto-discover/canonicalize the Vietnamese dishes they cover — adding new canonical dishes and replacing existing 405 canonical when a dish overlaps (MNMN wins) — each tagged with `meal_types`.

**Architecture:** Backend data pipeline reusing the existing canonical scripts. `crawl_mnmn.py` (httpx + sitemap + JSON-LD, no Playwright) → `mnmn_all.json`; `import_mnmn.py` imports raw (`source="monngonmoingay"`, `canonical_dish_slug = slugify(title)`); `canonicalize_mnmn.py` groups by slug, runs the existing LLM judge+refine, promotes a new canonical and on slug overlap demotes (not deletes) the old one — preserving 1-canonical-per-slug and the AI⊆lookup invariant. A new nullable `recipes.meal_types` column stores sáng/trưa/tối.

**Tech Stack:** Python 3.11, httpx, SQLAlchemy async, Alembic, OpenAI (`AsyncOpenAI`), reuse of `scripts.select_canonical_recipes` (judge/refine) + `fill_missing_canonical` patterns.

**Branch:** `feat/canonical-recipes`. Backend commands run from `backend/` on Windows PowerShell: `$env:PYTHONUTF8=1; .venv\Scripts\python.exe ...`.

**Verification note:** No backend test runner. The FULL crawl (~2000 pages) and FULL canonicalization (hundreds of dishes, real OpenAI cost + hours) are **long-running manual/background runs the user executes after merge** — each script supports a small `MNMN_LIMIT` so subagents verify CODE correctness on a tiny sample only. Crawled JSON under `cookpad_recipe/` is untracked (never committed); only `.py`/model/migration/schema files are committed.

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/alembic/versions/0009_recipe_meal_types.py` (new) | Migration: add `recipes.meal_types ARRAY(String)` nullable. |
| `backend/app/models/recipe.py` (modify) | Add `meal_types` mapped column. |
| `backend/scripts/crawl_mnmn.py` (new) | Enumerate MNMN sitemap → scrape JSON-LD Recipe → `cookpad_recipe/mnmn_all.json`. |
| `backend/scripts/import_mnmn.py` (new) | Import `mnmn_all.json` raw (`source=monngonmoingay`, slug from title). |
| `backend/scripts/canonicalize_mnmn.py` (new) | Group by slug → judge+refine → promote canonical (+meal_types); demote old on overlap. |
| `backend/app/schemas/recipe.py` (modify) | Expose `meal_types` on `RecipeDetailOut`. |
| `backend/app/services/recipe_service.py` (modify) | Pass `meal_types` into the detail builder. |

---

### Task 1: `meal_types` column (migration 0009 + model)

**Files:**
- Create: `backend/alembic/versions/0009_recipe_meal_types.py`
- Modify: `backend/app/models/recipe.py`

- [ ] **Step 1: Create the migration**

Create `backend/alembic/versions/0009_recipe_meal_types.py`:

```python
"""recipes.meal_types (sang/trua/toi tags for canonical dishes)

Revision ID: 0009
Revises: 0008
Create Date: 2026-06-03
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "recipes",
        sa.Column("meal_types", postgresql.ARRAY(sa.String()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("recipes", "meal_types")
```

- [ ] **Step 2: Add the model field**

In `backend/app/models/recipe.py`, after the line:

```python
    is_manually_reviewed: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false", default=False)
```

add:

```python
    meal_types: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
```

Then ensure `ARRAY` is imported. At the top of the file, find the SQLAlchemy import line (e.g. `from sqlalchemy import ...`) and add `ARRAY` to it if missing. If imports come from `sqlalchemy.dialects.postgresql`, instead add: `from sqlalchemy import ARRAY, String` (only add names not already imported). Verify in Step 3 that the module imports cleanly.

- [ ] **Step 3: Apply migration + verify (from `backend/`)**

```bash
$env:PYTHONUTF8=1; .venv\Scripts\alembic.exe upgrade head
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -c "from app.models.recipe import Recipe; print('meal_types' in Recipe.__table__.columns)"
```

Expected: alembic reports `Running upgrade 0008 -> 0009`; the print outputs `True`.

- [ ] **Step 4: Commit**

```bash
git add backend/alembic/versions/0009_recipe_meal_types.py backend/app/models/recipe.py
git commit -m "feat(canonical): recipes.meal_types column (sang/trua/toi)"
```

---

### Task 2: `crawl_mnmn.py` — crawl all MNMN via sitemap + JSON-LD

**Files:**
- Create: `backend/scripts/crawl_mnmn.py`

- [ ] **Step 1: Create the crawler**

Create `backend/scripts/crawl_mnmn.py`:

```python
"""Crawl ALL monngonmoingay.com recipes via sitemap + JSON-LD (httpx, no Playwright).
Writes cookpad_recipe/mnmn_all.json (resumable). Set MNMN_LIMIT=N to cap (testing).

Run from backend:
    python -m scripts.crawl_mnmn
"""
import json
import os
import re
import sys
import time
from pathlib import Path

import httpx

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "cookpad_recipe"
URLS_CACHE = OUT_DIR / "_mnmn_urls.json"
ALL_FILE = OUT_DIR / "mnmn_all.json"

BASE = "https://monngonmoingay.com"
SITEMAP_INDEX = f"{BASE}/sitemap_index.xml"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
SLEEP = 1.5
LIMIT = int(os.environ.get("MNMN_LIMIT", "0"))  # 0 = all

LOC_RE = re.compile(r"<loc>(.*?)</loc>", re.S)
LDJSON_RE = re.compile(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', re.S)
ARTICLE_RE = re.compile(r"^https://monngonmoingay\.com/[a-z0-9][a-z0-9-]*/?$")


def get(client: httpx.Client, url: str) -> str | None:
    try:
        r = client.get(url, timeout=20.0)
        if r.status_code == 200:
            return r.text
    except Exception as e:
        print(f"  fetch fail {url}: {e}")
    return None


def collect_recipe_urls(client: httpx.Client) -> list[str]:
    if URLS_CACHE.exists():
        return json.loads(URLS_CACHE.read_text(encoding="utf-8"))
    idx = get(client, SITEMAP_INDEX) or ""
    # Recipes live in monan-sitemap*.xml ("món ăn") — ~2481 URLs across ~13 files
    # (verified 2026-06-03). NOT cachnau-sitemap (only 12 video posts). The
    # thong-tin-huu-ich-* sitemaps are tip articles, dropped later by the
    # JSON-LD Recipe filter in scrape().
    subs = [u for u in LOC_RE.findall(idx) if "monan-sitemap" in u]
    if not subs:
        # Fallback: pull every sub-sitemap that isn't an obvious non-recipe one.
        skip = ("page-", "banner-", "gioi-thieu", "khao-sat", "khna-cau", "lich-phat-song",
                "lich_mon_an_thang", "ebooklet-", "hoi-dau-bep", "tu-van-")
        subs = [u for u in LOC_RE.findall(idx) if u.endswith(".xml") and not any(k in u for k in skip)]
    urls: list[str] = []
    for s in subs:
        body = get(client, s) or ""
        urls += LOC_RE.findall(body)
        time.sleep(0.5)
    urls = sorted({u for u in urls if ARTICLE_RE.match(u)})
    URLS_CACHE.write_text(json.dumps(urls, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Collected {len(urls)} candidate recipe URLs from {len(subs)} sub-sitemaps")
    return urls


def find_recipe_node(data):
    if isinstance(data, dict) and "@graph" in data:
        nodes = data["@graph"]
    elif isinstance(data, list):
        nodes = data
    else:
        nodes = [data]
    for n in nodes:
        if not isinstance(n, dict):
            continue
        t = n.get("@type")
        if t == "Recipe" or (isinstance(t, list) and "Recipe" in t):
            return n
    return None


def parse_ingredients(node) -> list[str]:
    return [s.strip() for s in (node.get("recipeIngredient") or []) if isinstance(s, str) and s.strip()]


def parse_steps(node) -> list[str]:
    ri = node.get("recipeInstructions")
    out: list[str] = []
    if isinstance(ri, str):
        out = [x.strip() for x in re.split(r"[\r\n]+", ri) if x.strip()]
    elif isinstance(ri, list):
        for it in ri:
            if isinstance(it, str) and it.strip():
                out.append(it.strip())
            elif isinstance(it, dict):
                if it.get("@type") == "HowToSection":
                    for st in it.get("itemListElement") or []:
                        if isinstance(st, dict) and (st.get("text") or "").strip():
                            out.append(st["text"].strip())
                elif (it.get("text") or "").strip():
                    out.append(it["text"].strip())
    return out


def parse_image(node):
    img = node.get("image")
    if isinstance(img, str):
        return img
    if isinstance(img, list) and img:
        first = img[0]
        return first if isinstance(first, str) else (first.get("url") if isinstance(first, dict) else None)
    if isinstance(img, dict):
        return img.get("url")
    return None


def scrape(client: httpx.Client, url: str) -> dict | None:
    html = get(client, url)
    if not html:
        return None
    for block in LDJSON_RE.findall(html):
        try:
            data = json.loads(block.strip())
        except Exception:
            continue
        node = find_recipe_node(data)
        if not node:
            continue
        ings = parse_ingredients(node)
        if not ings:
            continue
        name = node.get("name") or ""
        if isinstance(name, list):
            name = name[0] if name else ""
        return {
            "name": (name or "").strip(),
            "url": url,
            "ingredients_display": ings,
            "instructions": parse_steps(node),
            "image_url": parse_image(node),
            "description": (node.get("description") or "")[:2000],
            "src": "monngonmoingay",
        }
    return None


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    saved = json.loads(ALL_FILE.read_text(encoding="utf-8")) if ALL_FILE.exists() else []
    done = {r["url"] for r in saved}
    with httpx.Client(headers={"User-Agent": UA}, follow_redirects=True) as client:
        urls = collect_recipe_urls(client)
        todo = [u for u in urls if u not in done]
        if LIMIT:
            todo = todo[:LIMIT]
        print(f"Scraping {len(todo)} URLs ({len(done)} already done)")
        for i, url in enumerate(todo, 1):
            rec = scrape(client, url)
            if rec and rec["name"]:
                saved.append(rec)
                ALL_FILE.write_text(json.dumps(saved, ensure_ascii=False, indent=2), encoding="utf-8")
                print(f"  [{i}/{len(todo)}] + {rec['name']} ({len(rec['ingredients_display'])} ing)")
            else:
                print(f"  [{i}/{len(todo)}] - skip (no Recipe) {url}")
            time.sleep(SLEEP)
    print(f"\nDONE. total saved = {len(saved)}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Verify on a tiny sample (real network, from `backend/`)**

```bash
$env:MNMN_LIMIT="5"; $env:PYTHONUTF8=1; .venv\Scripts\python.exe -m scripts.crawl_mnmn; Remove-Item Env:\MNMN_LIMIT
```

Expected: it collects candidate URLs (~2481 from `monan-sitemap*`), scrapes 5, and prints at least a few `+ <dish name> (<n> ing)` lines. Confirm `cookpad_recipe/mnmn_all.json` exists and the first record has non-empty `ingredients_display` and `instructions`:

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -c "import json; d=json.load(open('../cookpad_recipe/mnmn_all.json',encoding='utf-8')); r=d[0]; print(r['name'], '| ing', len(r['ingredients_display']), '| steps', len(r['instructions']))"
```

Expected: a dish name with `ing > 0` and `steps > 0`.
- If `collect_recipe_urls` returns 0 URLs (sitemap structure changed), report DONE_WITH_CONCERNS with the printed sub-sitemap list so the controller can adjust the `monan-sitemap` filter. If the sandbox has no network, report DONE_WITH_CONCERNS (code correct, couldn't reach MNMN).

- [ ] **Step 3: Commit (script only — NOT the crawled JSON)**

```bash
git add backend/scripts/crawl_mnmn.py
git commit -m "feat(canonical): crawl_mnmn — crawl all monngonmoingay via sitemap+JSON-LD"
```

---

### Task 3: `import_mnmn.py` — import raw MNMN recipes

**Files:**
- Create: `backend/scripts/import_mnmn.py`

- [ ] **Step 1: Create the importer**

Create `backend/scripts/import_mnmn.py`:

```python
"""Import cookpad_recipe/mnmn_all.json into DB as raw recipes
(source='monngonmoingay', status='approved', is_canonical=False), tagged with
canonical_dish_slug = slugify(title). Idempotent by cookpad_url (the MNMN URL).

Run from backend:
    python -m scripts.import_mnmn
"""
import asyncio
import json
import re
import sys
import unicodedata
import uuid
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

from sqlalchemy import select  # noqa: E402
from app.core.database import AsyncSessionLocal  # noqa: E402
from app.models.recipe import Recipe, RecipeIngredient, RecipeStep  # noqa: E402

ALL_FILE = Path(__file__).resolve().parents[2] / "cookpad_recipe" / "mnmn_all.json"


def slugify(t: str) -> str:
    t = unicodedata.normalize("NFKD", t or "")
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = t.lower().replace("đ", "d").replace("Đ", "d")
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    return t


async def main() -> None:
    records = json.loads(ALL_FILE.read_text(encoding="utf-8")) if ALL_FILE.exists() else []
    print(f"Records in mnmn_all.json: {len(records)}")
    inserted = 0
    skipped = 0
    async with AsyncSessionLocal() as db:
        existing_urls = {u for (u,) in (await db.execute(
            select(Recipe.cookpad_url).where(Recipe.cookpad_url.is_not(None))
        )).all()}

        for rec in records:
            url = rec.get("url")
            name = (rec.get("name") or "").strip()
            slug = slugify(name)
            if not url or not name or not slug or url in existing_urls:
                skipped += 1
                continue
            rid = uuid.uuid4()
            db.add(Recipe(
                id=rid,
                title=name[:500],
                description=(rec.get("description") or "")[:2000],
                source="monngonmoingay",
                status="approved",
                cookpad_url=url,
                canonical_dish_slug=slug,
                image_url=rec.get("image_url") or None,
                is_canonical=False,
                is_dessert=False,
            ))
            for i, ing in enumerate(rec.get("ingredients_display") or []):
                if not str(ing).strip():
                    continue
                db.add(RecipeIngredient(id=uuid.uuid4(), recipe_id=rid, display_text=str(ing)[:1000], order_index=i))
            for i, step in enumerate(rec.get("instructions") or [], start=1):
                if not str(step).strip():
                    continue
                db.add(RecipeStep(id=uuid.uuid4(), recipe_id=rid, step_number=i, content=str(step)[:4000]))
            existing_urls.add(url)
            inserted += 1
            if inserted % 200 == 0:
                await db.commit()
                print(f"  cumulative inserted={inserted}")
        await db.commit()
    print(f"\nDONE. inserted={inserted} skipped={skipped}")


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 2: Verify (from `backend/`, uses the small sample crawled in Task 2)**

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -m scripts.import_mnmn
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -c "import asyncio; from sqlalchemy import text; from app.core.database import AsyncSessionLocal
async def m():
 async with AsyncSessionLocal() as db:
  print('mnmn rows', (await db.execute(text(\"select count(*) from recipes where source='monngonmoingay'\"))).scalar_one())
asyncio.run(m())"
```

Expected: `inserted=` matches the sample size (e.g. ~5), and the mnmn row count is > 0. Run it again → second run reports `inserted=0` (idempotent).

- [ ] **Step 3: Commit**

```bash
git add backend/scripts/import_mnmn.py
git commit -m "feat(canonical): import_mnmn — raw import of monngonmoingay recipes"
```

---

### Task 4: `canonicalize_mnmn.py` — auto-discover + canonical (+ replace on overlap)

**Files:**
- Create: `backend/scripts/canonicalize_mnmn.py`

- [ ] **Step 1: Create the canonicalizer**

Create `backend/scripts/canonicalize_mnmn.py`:

```python
"""Auto-discover canonical dishes from imported monngonmoingay recipes.

Per MNMN dish slug:
  - judge+refine the MNMN candidate(s) -> a new canonical (source='llm-canonical')
    with meal_types (LLM-classified sang/trua/toi).
  - If the slug already has a canonical (one of the 405): demote the old one
    (is_canonical=False, NOT deleted) and promote the MNMN one (same slug) so
    AI<=lookup and 1-canonical-per-slug invariants hold.
Idempotent via a done-slug state file. Set MNMN_LIMIT=N to cap (testing).

Run from backend:
    python -m scripts.canonicalize_mnmn
"""
import asyncio
import json
import os
import sys
import uuid
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

from openai import AsyncOpenAI  # noqa: E402
from sqlalchemy import select, update  # noqa: E402
from sqlalchemy.orm import selectinload  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.database import AsyncSessionLocal  # noqa: E402
from app.models.recipe import Recipe, RecipeIngredient, RecipeStep  # noqa: E402
import scripts.select_canonical_recipes as pipe  # noqa: E402

DONE_FILE = Path(__file__).resolve().parents[2] / "cookpad_recipe" / "_mnmn_canon_done.json"
LIMIT = int(os.environ.get("MNMN_LIMIT", "0"))
VALID_MEALS = {"sang", "trua", "toi"}


def load_done() -> set[str]:
    return set(json.loads(DONE_FILE.read_text(encoding="utf-8"))) if DONE_FILE.exists() else set()


def save_done(done: set[str]) -> None:
    DONE_FILE.write_text(json.dumps(sorted(done), ensure_ascii=False, indent=2), encoding="utf-8")


async def classify_meal_types(client: AsyncOpenAI, title: str) -> list[str]:
    """One cheap call: which of sang/trua/toi this Vietnamese dish suits."""
    try:
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{
                "role": "user",
                "content": (
                    "Món ăn Việt Nam: \"" + title + "\". "
                    "Món này hợp bữa nào? Trả về JSON object {\"meals\": [...]} với các giá trị con "
                    "trong [\"sang\",\"trua\",\"toi\"] (sáng/trưa/tối). Có thể nhiều bữa. Chỉ JSON."
                ),
            }],
            response_format={"type": "json_object"},
            temperature=0,
        )
        data = json.loads(resp.choices[0].message.content)
        meals = [m for m in (data.get("meals") or []) if m in VALID_MEALS]
        return meals or ["trua", "toi"]
    except Exception:
        return ["trua", "toi"]  # safe default for a main dish


async def mnmn_slugs(db) -> list[str]:
    rows = (await db.execute(
        select(Recipe.canonical_dish_slug)
        .where(Recipe.source == "monngonmoingay", Recipe.is_canonical.is_(False))
        .distinct()
    )).all()
    return [s for (s,) in rows if s]


async def candidates_for(db, slug: str) -> list[Recipe]:
    res = (await db.execute(
        select(Recipe)
        .options(selectinload(Recipe.ingredients), selectinload(Recipe.steps))
        .where(
            Recipe.source == "monngonmoingay",
            Recipe.is_canonical.is_(False),
            Recipe.canonical_dish_slug == slug,
        )
        .limit(5)
    )).scalars().all()
    return list(res)


async def existing_canonical_id(db, slug: str):
    return (await db.execute(
        select(Recipe.id).where(Recipe.is_canonical.is_(True), Recipe.canonical_dish_slug == slug)
    )).scalar_one_or_none()


async def main() -> None:
    done = load_done()
    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    async with AsyncSessionLocal() as db:
        admin_id = await pipe.get_admin_user(db)
        slugs = [s for s in await mnmn_slugs(db) if s not in done]
        if LIMIT:
            slugs = slugs[:LIMIT]
        print(f"Slugs to canonicalize: {len(slugs)}")
        new_count = replaced = 0
        for slug in slugs:
            if pipe.estimated_cost > pipe.COST_CEILING_USD:
                print(f"COST CEILING ${pipe.estimated_cost:.2f} reached, stopping")
                break
            try:
                cands = await candidates_for(db, slug)
                if not cands:
                    done.add(slug)
                    continue
                display = cands[0].title
                judged = await pipe.judge_candidates(display, cands)
                if not judged:
                    done.add(slug)
                    continue
                sel_idx, score, reason = judged
                winner = cands[sel_idx]
                refined = await pipe.refine_recipe(winner)
                if not refined:
                    done.add(slug)
                    continue
                meals = await classify_meal_types(client, refined.get("title") or display)

                old_id = await existing_canonical_id(db, slug)
                if old_id is not None:
                    await db.execute(update(Recipe).where(Recipe.id == old_id).values(is_canonical=False))

                nid = uuid.uuid4()
                db.add(Recipe(
                    id=nid,
                    title=(refined.get("title") or winner.title)[:500],
                    description=(refined.get("description") or "")[:1000],
                    cooking_time=refined.get("cooking_time") or winner.cooking_time,
                    servings=refined.get("servings") or winner.servings,
                    difficulty=refined.get("difficulty") or "medium",
                    image_url=winner.image_url,
                    keyword=winner.keyword,
                    source="llm-canonical",
                    status="approved",
                    author_id=admin_id,
                    is_canonical=True,
                    canonical_dish_slug=slug,
                    variant_label=None,
                    is_dessert=False,
                    llm_judge_score=score,
                    llm_judge_reason=reason,
                    derived_from_recipe_id=winner.id,
                    refinement_notes=refined.get("refinement_notes"),
                    meal_types=meals,
                ))
                await db.flush()
                for i, item in enumerate(refined.get("ingredients") or []):
                    txt = item if isinstance(item, str) else (
                        item.get("display_text")
                        or " ".join(x for x in [item.get("quantity"), item.get("ingredient_name")] if x)
                    )
                    if txt:
                        db.add(RecipeIngredient(id=uuid.uuid4(), recipe_id=nid, display_text=txt[:1000], order_index=i))
                for i, item in enumerate(refined.get("steps") or [], start=1):
                    content = item if isinstance(item, str) else (item.get("content") or item.get("instruction") or "")
                    if content:
                        num = i if isinstance(item, str) else int(item.get("step_number") or i)
                        db.add(RecipeStep(id=uuid.uuid4(), recipe_id=nid, step_number=num, content=content[:4000]))
                await db.commit()
                done.add(slug)
                save_done(done)
                if old_id is not None:
                    replaced += 1
                    print(f"  ~ replaced canonical {slug} (score={score:.1f}, meals={meals})")
                else:
                    new_count += 1
                    print(f"  + new canonical {slug} (score={score:.1f}, meals={meals})")
            except Exception as e:
                await db.rollback()
                print(f"  [ERR] {slug}: {e}")
        save_done(done)
        print(f"\nDONE. new={new_count} replaced={replaced} est.cost ${pipe.estimated_cost:.2f}")


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 2: Verify on a tiny sample (real OpenAI, from `backend/`)**

```bash
$env:MNMN_LIMIT="3"; $env:PYTHONUTF8=1; .venv\Scripts\python.exe -m scripts.canonicalize_mnmn; Remove-Item Env:\MNMN_LIMIT
```

Expected: prints up to 3 `+ new canonical <slug> (score=..., meals=[...])` (or `~ replaced` if a slug overlaps the 405). Confirm a new canonical exists with meal_types:

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -c "import asyncio; from sqlalchemy import text; from app.core.database import AsyncSessionLocal
async def m():
 async with AsyncSessionLocal() as db:
  print('canonical w/ meal_types', (await db.execute(text('select count(*) from recipes where is_canonical and meal_types is not null'))).scalar_one())
  print('dup slugs', (await db.execute(text('select count(*) from (select canonical_dish_slug from recipes where is_canonical group by canonical_dish_slug having count(*)>1) t'))).scalar_one())
asyncio.run(m())"
```

Expected: `canonical w/ meal_types` ≥ 1; `dup slugs` = 0 (replacement kept exactly one canonical per slug). Re-run the canonicalize command → already-done slugs are skipped (idempotent).

- [ ] **Step 3: Commit**

```bash
git add backend/scripts/canonicalize_mnmn.py
git commit -m "feat(canonical): canonicalize_mnmn — auto-discover + replace-on-overlap + meal_types"
```

---

### Task 5: Expose `meal_types` on `RecipeDetailOut`

**Files:**
- Modify: `backend/app/schemas/recipe.py`
- Modify: `backend/app/services/recipe_service.py`

- [ ] **Step 1: Add the field to the schema**

In `backend/app/schemas/recipe.py`, locate the `RecipeDetailOut` class and add a field alongside the other optional canonical fields (e.g. near `refinement_notes` if present, else anywhere in the class body):

```python
    meal_types: list[str] | None = None
```

- [ ] **Step 2: Pass it through the detail builder**

In `backend/app/services/recipe_service.py`, find where `RecipeDetailOut(...)` is constructed (the detail builder in `get_recipe_detail`). Add `meal_types=recipe.meal_types,` to the constructor kwargs (next to the other recipe fields).

- [ ] **Step 3: Verify it imports + the field is wired (from `backend/`)**

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -c "from app.schemas.recipe import RecipeDetailOut; print('meal_types' in RecipeDetailOut.model_fields)"
```

Expected: `True`. (If the builder uses `RecipeDetailOut.model_validate(...)` from an ORM object instead of explicit kwargs, Step 2 is unnecessary — confirm by reading the builder; in that case the field is populated automatically and you only do Step 1. Note which path you took in your report.)

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas/recipe.py backend/app/services/recipe_service.py
git commit -m "feat(canonical): expose meal_types on RecipeDetailOut"
```

---

### Task 6: Subset-invariant verification

**Files:** none (verification only).

- [ ] **Step 1: Run the regression harness (from `backend/`)**

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -m scripts.verify_canonical_subset
```

Expected: PASS — 103/103 AI classes still have exactly one canonical, no duplicate canonical titles, AI ⊆ lookup. (The small sample from earlier tasks must not have broken the invariant; replacement keeps exactly one canonical per slug.)

- [ ] **Step 2: Record the full-run instructions for the user**

The subagent does NOT run the full multi-hour crawl / full canonicalization. After this branch is merged, the user runs, from `backend/`, in order:

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -m scripts.crawl_mnmn        # ~all MNMN, hours, resumable
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -m scripts.import_mnmn        # import raw
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -m scripts.canonicalize_mnmn  # hundreds of dishes, OpenAI cost; resumable via _mnmn_canon_done.json
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -m scripts.verify_canonical_subset
```

No commit (verification/instructions only).

---

## Self-Review

**1. Spec coverage:**
- Migration 0009 `meal_types` ARRAY + model → Task 1. ✓
- Crawl ALL MNMN via sitemap + JSON-LD (httpx, resumable, filter Recipe+ingredients) → Task 2. ✓
- Import raw (`source=monngonmoingay`, `slugify(title)`, idempotent by `cookpad_url`) → Task 3. ✓
- Canonicalize: group by slug, judge+refine, meal_types (LLM), replace-on-overlap (demote old `is_canonical=False`, not delete; promote MNMN same slug), idempotent (done-file), per-slug try/except, cost ceiling → Task 4. ✓
- Expose `meal_types` on `RecipeDetailOut` → Task 5. ✓
- `verify_canonical_subset.py` PASS + 1-canonical-per-slug (dup-slug query) + AI⊆lookup → Tasks 4 & 6. ✓
- Full runs are manual/background → Task 6 Step 2. ✓
- Crawled JSON untracked, only code committed → noted in Verification note + Task 2 Step 3. ✓

**2. Placeholder scan:** Every code step has full code; verification steps give exact commands + expected output. The MNMN sitemap-filter uncertainty (which sub-sitemap) is handled in-code (`cachnau-sitemap` + fallback) and surfaced as a Task 2 Step 2 DONE_WITH_CONCERNS path rather than a placeholder. Task 5 Step 3 explicitly handles the two builder shapes (kwargs vs model_validate).

**3. Type/name consistency:**
- MNMN record keys (`name`, `url`, `ingredients_display`, `instructions`, `image_url`, `description`, `src`) written by `crawl_mnmn.scrape` and read identically by `import_mnmn`. ✓
- `slugify` (import) ↔ `canonical_dish_slug` (read by canonicalize) consistent. ✓
- `pipe.judge_candidates(display, cands) -> (sel_idx, score, reason)`, `pipe.refine_recipe(winner) -> dict`, `pipe.get_admin_user`, `pipe.estimated_cost`, `pipe.COST_CEILING_USD` — match usage in `fill_missing_canonical.py`. ✓
- Recipe canonical fields (`is_canonical`, `canonical_dish_slug`, `llm_judge_score`, `llm_judge_reason`, `derived_from_recipe_id`, `refinement_notes`, `meal_types`) match the model (Task 1 adds `meal_types`). ✓
- `meal_types: list[str] | None` consistent across model (Task 1), canonicalize insert (Task 4), schema (Task 5). ✓

No gaps found.
