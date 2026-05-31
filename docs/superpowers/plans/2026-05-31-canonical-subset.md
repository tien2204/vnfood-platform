# Canonical Subset + Dedupe + Unify — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AI model's 103 recognizable dish classes a strict subset of lookup canonical recipes — every recognized dish has exactly one canonical recipe — by deduping 17 duplicate-title clusters, filling 57 missing dishes (real Cookpad crawl + curated fallback), and unifying the recognize page onto the single canonical source.

**Architecture:** Three idempotent phases run as standalone backend scripts against the live Postgres DB, gated by one assertion harness (`verify_canonical_subset.py`) run before/after each phase. Phase 1 deduplicates via a hardcoded 17-cluster decision table. Phase 2 crawls Cookpad for missing dishes, imports them as community recipes, then runs the existing LLM judge+refine pipeline (≥1 real candidate) or promotes the curated `dish_recipes.json` entry (0 candidates). Phase 3 is a small `ai_service.py` change that drops the divergent curated attachment on the VNFood path so the frontend renders the canonical card alone.

**Tech Stack:** Python 3.10 (backend venv), SQLAlchemy async (asyncpg), OpenAI `gpt-4o-mini`, Playwright Chromium (crawler), FastAPI, Next.js 16 frontend.

**Conventions:**
- All backend scripts run from `backend/` as modules: `.venv/Scripts/python.exe -m scripts.<name>`.
- Every script starts with `import sys; sys.stdout.reconfigure(encoding="utf-8")` (Windows console is cp1252 and crashes on Vietnamese output).
- DB models: `Recipe`, `RecipeIngredient(display_text, ingredient_name, quantity, order_index)`, `RecipeStep(step_number, content, image_url, timer_seconds)` from `app/models/recipe.py`.
- AI classes source of truth: `app/ai/class_names.py` → `CLASS_DISPLAY_NAMES` (103 slugs). **Never edit this file.**
- Spec: `docs/superpowers/specs/2026-05-31-canonical-subset-design.md`.

---

## File Structure

**Create:**
- `backend/scripts/verify_canonical_subset.py` — assertion harness (regression test for every phase).
- `backend/scripts/dedupe_canonical.py` — Phase 1: collapse 17 duplicate-title clusters.
- `backend/scripts/crawl_missing_dishes.py` — Phase 2a: targeted Cookpad crawl for missing dishes.
- `backend/scripts/import_missing_crawled.py` — Phase 2b: import crawled JSON into DB as `source='cookpad'`.
- `backend/scripts/fill_missing_canonical.py` — Phase 2c/2d: judge+refine real candidates, or promote curated.

**Modify:**
- `backend/app/services/ai_service.py:97-102` — Phase 3: VNFood path relies on `canonical_recipe`; curated only as fallback.
- `backend/app/services/ai_service.py` — add `_canonical_main_recipe_id` helper if needed (see Task 6).
- `.claude/session-state.md` — final state update.

**Reuse (import, do not duplicate):**
- `backend/scripts/select_canonical_recipes.py` → `judge_candidates`, `refine_recipe`, `get_admin_user`, `estimated_cost`/`COST_CEILING_USD`.
- `crawl_general_recipes.py` (repo root) → `make_browser_context`, `search_all_recipes`, `scrape_recipe`, `normalize`.
- `backend/app/services/dish_recipe_service.py` → `DISH_RECIPES`, `load_dish_recipes`.

---

## Task 0: Assertion harness (regression test)

**Files:**
- Create: `backend/scripts/verify_canonical_subset.py`

- [ ] **Step 1: Write the harness**

```python
"""Regression harness for canonical subset invariants. Exit 0 = all pass."""
import asyncio
import sys
import unicodedata
from collections import Counter, defaultdict

sys.stdout.reconfigure(encoding="utf-8")

from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm import selectinload  # noqa: E402
from app.core.database import AsyncSessionLocal  # noqa: E402
from app.models.recipe import Recipe  # noqa: E402
from app.ai.class_names import CLASS_DISPLAY_NAMES  # noqa: E402


def norm_title(t: str) -> str:
    t = unicodedata.normalize("NFKD", t or "")
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = t.lower().replace("đ", "d").replace("đ", "d")
    return " ".join(t.split())


async def main() -> int:
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            select(Recipe)
            .where(Recipe.is_canonical.is_(True))
            .options(selectinload(Recipe.ingredients), selectinload(Recipe.steps))
        )).scalars().all()

    total = len(rows)
    slug_counter = Counter(r.canonical_dish_slug for r in rows)
    source_counter = Counter(r.source for r in rows)
    ai = list(CLASS_DISPLAY_NAMES.keys())

    missing = [s for s in ai if slug_counter.get(s, 0) == 0]
    dup_slug = {s: c for s, c in slug_counter.items() if s in CLASS_DISPLAY_NAMES and c > 1}

    title_counter = Counter(norm_title(r.title) for r in rows)
    dup_titles = {t: c for t, c in title_counter.items() if c > 1}

    no_children = [r.title for r in rows if not r.ingredients or not r.steps]

    print(f"Total canonical: {total}")
    print(f"Source breakdown: {dict(source_counter)}")
    print(f"AI classes covered: {len(ai) - len(missing)}/{len(ai)}")
    print(f"AI classes MISSING ({len(missing)}): {missing}")
    print(f"AI slugs with >1 canonical ({len(dup_slug)}): {dup_slug}")
    print(f"Duplicate-title clusters ({len(dup_titles)}): {dup_titles}")
    print(f"Canonical missing ingredients/steps ({len(no_children)}): {no_children[:10]}")

    ok = (not missing) and (not dup_slug) and (not dup_titles) and (not no_children)
    print("\nRESULT:", "PASS ✅" if ok else "FAIL ❌")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
```

- [ ] **Step 2: Run for baseline (expected FAIL — establishes starting numbers)**

Run: `cd backend; $env:PYTHONUTF8=1; .venv/Scripts/python.exe -m scripts.verify_canonical_subset`
Expected: `FAIL ❌`, `AI classes covered: 46/103`, `Duplicate-title clusters (17)`.

- [ ] **Step 3: Commit**

```bash
git add backend/scripts/verify_canonical_subset.py
git commit -m "test(canonical): add subset/dedupe regression harness"
```

---

## Task 1: Phase 1 — Dedupe 17 duplicate-title clusters

**Files:**
- Create: `backend/scripts/dedupe_canonical.py`

- [ ] **Step 1: Write the dedupe script**

```python
"""Phase 1: collapse 17 duplicate-title canonical clusters.

Per cluster: keep ONE recipe (keep_slug), set its canonical_dish_slug=target_slug,
demote all other canonical rows in the cluster to is_canonical=false.
Decisions are hardcoded (approved in spec 2026-05-31). Idempotent: if a cluster is
already collapsed (no duplicates), it is skipped.

Usage:
    python -m scripts.dedupe_canonical --dry-run
    python -m scripts.dedupe_canonical
"""
import argparse
import asyncio
import sys
import unicodedata
from collections import defaultdict

sys.stdout.reconfigure(encoding="utf-8")

from sqlalchemy import select  # noqa: E402
from app.core.database import AsyncSessionLocal  # noqa: E402
from app.models.recipe import Recipe  # noqa: E402

# normalized_title -> (keep_slug, target_slug)
# keep_slug = which row's content survives; target_slug = its final canonical_dish_slug.
DEDUP_DECISIONS = {
    "com chien duong chau": ("com-chien-duong-chau", "com-chien-duong-chau"),
    "bun bo hue": ("bun-bo-hue-trung", "bun-bo-hue"),
    "bun rieu cua": ("bun-rieu-cua", "bun-rieu"),
    "canh chua ca loc": ("canh-chua", "canh-chua"),
    "com chien tom": ("com-chien", "com-chien"),
    "pho bo": ("pho", "pho"),
    "xoi khuc": ("xoi-khuc", "xoi-khuc"),
    "banh chuoi hap nuoc cot dua": ("banh-chuoi-hap", "banh-chuoi-hap"),
    "com chien dua bo": ("com-chien-dua-bo", "com-chien-dua-bo"),
    "canh bau nau tom": ("canh-bau-nau-tom", "canh-bau-nau-tom"),
    "canh kho qua nhoi thit": ("canh-kho-qua-nhoi-thit", "canh-kho-qua-nhoi-thit"),
    "banh da lon": ("banh-da-lon", "banh-da-lon"),
    "com rang dua bo": ("com-rang-dua-bo", "com-rang-dua-bo"),
    "canh suon bo": ("canh-suon-bo", "canh-suon-bo"),
    "com chien ca man": ("com-chien-ca-man", "com-chien-ca-man"),
    "canh ngao chua": ("canh-ngao-chua", "canh-ngao-chua"),
    "canh bi do thit bam": ("canh-bi-do-thit-bam", "canh-bi-do-thit-bam"),
    # 18th cluster: only visible under normalized title (case differs: "băm"/"Bằm").
    # Keep correct full slug over the typo/truncated "canh-ron-bien".
    "canh rong bien thit bam": ("canh-rong-bien-thit-bam", "canh-rong-bien-thit-bam"),
}


def norm_title(t: str) -> str:
    t = unicodedata.normalize("NFKD", t or "")
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = t.lower().replace("đ", "d").replace("đ", "d")
    return " ".join(t.split())


async def main(dry_run: bool) -> None:
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            select(Recipe).where(Recipe.is_canonical.is_(True))
        )).scalars().all()

        by_title = defaultdict(list)
        for r in rows:
            by_title[norm_title(r.title)].append(r)

        demoted = 0
        reslugged = 0
        for ntitle, cluster in by_title.items():
            if len(cluster) < 2:
                continue
            if ntitle not in DEDUP_DECISIONS:
                print(f"[WARN] unexpected duplicate cluster not in table: {ntitle!r} "
                      f"slugs={[r.canonical_dish_slug for r in cluster]}")
                continue
            keep_slug, target_slug = DEDUP_DECISIONS[ntitle]
            keeper = next((r for r in cluster if r.canonical_dish_slug == keep_slug), None)
            if keeper is None:
                print(f"[WARN] keep_slug {keep_slug!r} not found in cluster {ntitle!r}; skipping")
                continue
            print(f"[{ntitle}] keep={keep_slug} -> slug {target_slug}; "
                  f"demote {[r.canonical_dish_slug for r in cluster if r is not keeper]}")
            if not dry_run:
                if keeper.canonical_dish_slug != target_slug:
                    keeper.canonical_dish_slug = target_slug
                    reslugged += 1
                for r in cluster:
                    if r is not keeper:
                        r.is_canonical = False
                        demoted += 1
        if not dry_run:
            await db.commit()
        print(f"\n{'DRY-RUN ' if dry_run else ''}done. demoted={demoted} reslugged={reslugged}")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()
    asyncio.run(main(args.dry_run))
```

- [ ] **Step 2: Dry-run and eyeball the plan**

Run: `cd backend; $env:PYTHONUTF8=1; .venv/Scripts/python.exe -m scripts.dedupe_canonical --dry-run`
Expected: 18 cluster lines printed, no `[WARN]`, final `DRY-RUN done. demoted=20 reslugged=2`.

- [ ] **Step 3: Execute for real**

Run: `cd backend; $env:PYTHONUTF8=1; .venv/Scripts/python.exe -m scripts.dedupe_canonical`
Expected: `done. demoted=20 reslugged=2`.

- [ ] **Step 4: Verify dedupe invariant**

Run: `cd backend; $env:PYTHONUTF8=1; .venv/Scripts/python.exe -m scripts.verify_canonical_subset`
Expected: `Duplicate-title clusters (0)`, `Total canonical: 349`. (Still FAIL overall — subset gap remains; that is Phase 2.)

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/dedupe_canonical.py
git commit -m "feat(canonical): phase 1 dedupe 17 duplicate-title clusters"
```

---

## Task 2: Phase 2a — Crawl missing dishes from Cookpad

**Files:**
- Create: `backend/scripts/crawl_missing_dishes.py`

**Note:** This reuses functions from the repo-root `crawl_general_recipes.py`. Run scripts from the repo root for this task so that import works, OR copy the three helper functions inline. The script below imports them via a path insert.

- [ ] **Step 1: Write the targeted crawler**

```python
"""Phase 2a: crawl Cookpad for AI-recognizable dishes that lack canonical recipes
and have < MIN_EXISTING real candidates in the DB. One JSON file per dish.

Run from repo root:
    cd ..   (repo root, where crawl_general_recipes.py lives)
    backend/.venv/Scripts/python.exe backend/scripts/crawl_missing_dishes.py
"""
import asyncio
import json
import os
import sys
import time
import unicodedata
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[2]  # repo root
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "backend"))

from playwright.sync_api import sync_playwright  # noqa: E402
from crawl_general_recipes import (  # noqa: E402
    make_browser_context, search_all_recipes, scrape_recipe,
)
from sqlalchemy import select, func  # noqa: E402
from app.core.database import AsyncSessionLocal  # noqa: E402
from app.models.recipe import Recipe  # noqa: E402
from app.ai.class_names import CLASS_DISPLAY_NAMES  # noqa: E402

OUTPUT_FOLDER = ROOT / "cookpad_recipe"
MIN_EXISTING = 5          # dishes with >= this many existing candidates skip crawl
MAX_PER_DISH = 15         # scrape at most this many recipes per dish
SLEEP_SEC = 4


def norm(t: str) -> str:
    t = unicodedata.normalize("NFKD", t or "")
    t = "".join(c for c in t if not unicodedata.combining(c))
    return t.lower().replace("đ", "d").replace("đ", "d")


async def dishes_to_crawl() -> list[tuple[str, str]]:
    """Return (slug, display_name) for AI classes lacking canonical and < MIN_EXISTING candidates."""
    async with AsyncSessionLocal() as db:
        canon = {s for (s,) in (await db.execute(
            select(Recipe.canonical_dish_slug).where(Recipe.is_canonical.is_(True))
        )).all() if s}
        out = []
        for slug, display in CLASS_DISPLAY_NAMES.items():
            if slug in canon:
                continue
            cnt = (await db.execute(
                select(func.count(Recipe.id)).where(
                    Recipe.is_canonical.is_(False),
                    Recipe.title.ilike(f"%{display}%"),
                )
            )).scalar_one()
            if cnt < MIN_EXISTING:
                out.append((slug, display))
        return out


def title_matches(title: str, display: str) -> bool:
    return norm(display) in norm(title)


def main() -> None:
    os.makedirs(OUTPUT_FOLDER, exist_ok=True)
    targets = asyncio.run(dishes_to_crawl())
    print(f"Dishes to crawl: {len(targets)}")
    for slug, display in targets:
        print(f"  - {slug} ({display})")

    with sync_playwright() as pw:
        browser, context = make_browser_context(pw)
        page = context.new_page()
        try:
            page.goto("https://cookpad.com/vn", wait_until="domcontentloaded", timeout=20000)
            page.wait_for_timeout(2000)
        except Exception as e:
            print(f"warm-up warning: {e}")

        for slug, display in targets:
            out_file = OUTPUT_FOLDER / f"missing_{slug}.json"
            if out_file.exists():
                saved = json.loads(out_file.read_text(encoding="utf-8"))
                done = {r["cookpad_url"] for r in saved}
                print(f"[{slug}] resume: {len(saved)} already")
            else:
                saved, done = [], set()

            print(f"\n[{slug}] search '{display}'")
            found = search_all_recipes(page, display, max_scrolls=40, no_new_limit=4)
            filtered = [r for r in found if title_matches(r["title"], display)]
            print(f"  matched titles: {len(filtered)}")

            for item in filtered[:MAX_PER_DISH]:
                if item["url"] in done:
                    continue
                rec = scrape_recipe(page, item["url"])
                if not rec or not rec["ingredients"]:
                    time.sleep(2)
                    continue
                saved.append({
                    "slug": slug,
                    "keyword": display,
                    "name": item["title"],
                    "cookpad_url": item["url"],
                    "ingredients_display": rec["ingredients"],
                    "description": rec["description"],
                    "instructions": rec["instructions"],
                    "image_url": rec["image_url"],
                })
                done.add(item["url"])
                out_file.write_text(json.dumps(saved, ensure_ascii=False, indent=2), encoding="utf-8")
                print(f"    + {item['title']} ({len(rec['ingredients'])} ing)")
                time.sleep(SLEEP_SEC)
            print(f"  -> {len(saved)} saved to {out_file.name}")

        browser.close()
    print("\nDONE crawling.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Smoke-test on one dish (Ctrl+C after the first dish finishes)**

Run: `cd ..; backend/.venv/Scripts/python.exe backend/scripts/crawl_missing_dishes.py`
Expected: prints "Dishes to crawl: ~44", begins crawling, writes `cookpad_recipe/missing_<slug>.json` with real records. Confirm one file has non-empty `ingredients_display`. Ctrl+C is safe (resumable).

- [ ] **Step 3: Run full crawl in background (~2-3h, resumable)**

Run the same command and let it finish all dishes. If interrupted, re-run — it resumes per-file.

- [ ] **Step 4: Commit the script (crawled JSON is gitignored data, do not commit it)**

```bash
git add backend/scripts/crawl_missing_dishes.py
git commit -m "feat(canonical): phase 2a targeted Cookpad crawl for missing dishes"
```

---

## Task 3: Phase 2b — Import crawled recipes into DB

**Files:**
- Create: `backend/scripts/import_missing_crawled.py`

- [ ] **Step 1: Write the importer**

```python
"""Phase 2b: import cookpad_recipe/missing_*.json into DB as community recipes
(source='cookpad', status='approved') tagged with canonical_dish_slug = AI slug.
Idempotent by cookpad_url (skips already-imported).

Run from backend:
    python -m scripts.import_missing_crawled
"""
import asyncio
import json
import sys
import uuid
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

from sqlalchemy import select  # noqa: E402
from app.core.database import AsyncSessionLocal  # noqa: E402
from app.models.recipe import Recipe, RecipeIngredient, RecipeStep  # noqa: E402

DATA_DIR = Path(__file__).resolve().parents[2] / "cookpad_recipe"


async def main() -> None:
    files = sorted(DATA_DIR.glob("missing_*.json"))
    print(f"Found {len(files)} crawl files")
    inserted = 0
    skipped = 0
    async with AsyncSessionLocal() as db:
        existing_urls = {u for (u,) in (await db.execute(
            select(Recipe.cookpad_url).where(Recipe.cookpad_url.is_not(None))
        )).all()}

        for fp in files:
            records = json.loads(fp.read_text(encoding="utf-8"))
            for rec in records:
                url = rec.get("cookpad_url")
                if not url or url in existing_urls:
                    skipped += 1
                    continue
                rid = uuid.uuid4()
                db.add(Recipe(
                    id=rid,
                    title=rec["name"][:500],
                    description=(rec.get("description") or "")[:2000],
                    source="cookpad",
                    status="approved",
                    cookpad_url=url,
                    keyword=rec.get("keyword"),
                    canonical_dish_slug=rec["slug"],
                    image_url=rec.get("image_url") or None,
                    is_canonical=False,
                    is_dessert=False,
                ))
                for i, ing in enumerate(rec.get("ingredients_display") or []):
                    if not ing.strip():
                        continue
                    db.add(RecipeIngredient(
                        id=uuid.uuid4(), recipe_id=rid,
                        display_text=ing[:1000], order_index=i,
                    ))
                for i, step in enumerate(rec.get("instructions") or [], start=1):
                    if not step.strip():
                        continue
                    db.add(RecipeStep(
                        id=uuid.uuid4(), recipe_id=rid,
                        step_number=i, content=step[:4000],
                    ))
                existing_urls.add(url)
                inserted += 1
            await db.commit()
            print(f"  {fp.name}: cumulative inserted={inserted}")
    print(f"\nDONE. inserted={inserted} skipped={skipped}")


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 2: Run the importer**

Run: `cd backend; $env:PYTHONUTF8=1; .venv/Scripts/python.exe -m scripts.import_missing_crawled`
Expected: `DONE. inserted=<N> skipped=0` (N = total crawled rows). Re-running prints `inserted=0 skipped=<N>` (idempotent).

- [ ] **Step 3: Commit**

```bash
git add backend/scripts/import_missing_crawled.py
git commit -m "feat(canonical): phase 2b import crawled missing-dish recipes"
```

---

## Task 4: Phase 2c/2d — Fill canonical (judge+refine real, else curated)

**Files:**
- Create: `backend/scripts/fill_missing_canonical.py`
- Reuse: `backend/scripts/select_canonical_recipes.py` (`judge_candidates`, `refine_recipe`, `get_admin_user`)
- Reuse: `backend/app/services/dish_recipe_service.py` (`DISH_RECIPES`, `load_dish_recipes`)

- [ ] **Step 1: Write the gap-fill script**

```python
"""Phase 2c/2d: ensure every AI class has exactly one canonical recipe.

Per missing AI slug, in order:
  1. Already canonical under this slug -> skip (idempotent).
  2. A canonical exists with the same normalized title (under a different slug)
     -> re-slug it to the AI slug (avoids creating a duplicate title).
  3. >= 1 non-canonical candidate by title -> LLM judge+refine, INSERT canonical
     (source='llm-canonical').
  4. 0 candidates -> promote curated dish_recipes.json[slug]
     (source='curated-canonical').

Run from backend:
    python -m scripts.fill_missing_canonical
"""
import asyncio
import sys
import unicodedata
import uuid

sys.stdout.reconfigure(encoding="utf-8")

from sqlalchemy import or_, select  # noqa: E402
from sqlalchemy.orm import selectinload  # noqa: E402
from app.core.database import AsyncSessionLocal  # noqa: E402
from app.models.recipe import Recipe, RecipeIngredient, RecipeStep  # noqa: E402
from app.ai.class_names import CLASS_DISPLAY_NAMES  # noqa: E402
from app.services import dish_recipe_service  # noqa: E402
import scripts.select_canonical_recipes as pipe  # noqa: E402


def norm(t: str) -> str:
    t = unicodedata.normalize("NFKD", t or "")
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = t.lower().replace("đ", "d").replace("đ", "d")
    return " ".join(t.split())


async def already_canonical(db, slug) -> bool:
    return bool((await db.execute(
        select(Recipe.id).where(Recipe.is_canonical.is_(True), Recipe.canonical_dish_slug == slug)
    )).scalar_one_or_none())


async def reslug_same_title(db, slug, display) -> bool:
    """If a canonical already has the same normalized title, re-slug it. Returns True if handled."""
    cands = (await db.execute(
        select(Recipe).where(
            Recipe.is_canonical.is_(True),
            Recipe.title.ilike(f"%{display}%"),
        )
    )).scalars().all()
    target = norm(display)
    for r in cands:
        if norm(r.title) == target:
            r.canonical_dish_slug = slug
            await db.commit()
            print(f"  reslug existing canonical -> {slug}: {r.title[:50]}")
            return True
    return False


async def gather_candidates(db, slug, display):
    # Match by the AI slug tag (crawled recipes are tagged) OR title PREFIX.
    # Prefix (not substring) avoids grabbing compound dishes where the dish name
    # is a substring, e.g. "Bò né" must not match "Bánh Mì Chảo - Bò Né".
    res = (await db.execute(
        select(Recipe)
        .options(selectinload(Recipe.ingredients), selectinload(Recipe.steps))
        .where(
            Recipe.is_canonical.is_(False),
            Recipe.is_dessert.is_(False),
            or_(
                Recipe.canonical_dish_slug == slug,
                Recipe.title.ilike(f"{display}%"),
            ),
        )
        .order_by(Recipe.save_count.desc().nullslast())
        .limit(5)
    )).scalars().all()
    return list(res)


async def insert_refined(db, slug, display, admin_id) -> bool:
    candidates = await gather_candidates(db, slug, display)
    if not candidates:
        return False
    judged = await pipe.judge_candidates(display, candidates)
    if not judged:
        return False
    sel_idx, score, reason = judged
    winner = candidates[sel_idx]
    refined = await pipe.refine_recipe(winner)
    if not refined:
        return False
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
    ))
    await db.flush()
    for i, item in enumerate(refined.get("ingredients") or []):
        display_text = item if isinstance(item, str) else (
            item.get("display_text")
            or " ".join(x for x in [item.get("quantity"), item.get("ingredient_name")] if x)
        )
        if not display_text:
            continue
        db.add(RecipeIngredient(id=uuid.uuid4(), recipe_id=nid, display_text=display_text[:1000], order_index=i))
    for i, item in enumerate(refined.get("steps") or [], start=1):
        content = item if isinstance(item, str) else (item.get("content") or item.get("instruction") or "")
        if not content:
            continue
        num = i if isinstance(item, str) else int(item.get("step_number") or i)
        db.add(RecipeStep(id=uuid.uuid4(), recipe_id=nid, step_number=num, content=content[:4000]))
    await db.commit()
    print(f"  + llm-canonical {slug}: score={score:.1f}")
    return True


async def insert_curated(db, slug, admin_id) -> bool:
    data = dish_recipe_service.DISH_RECIPES.get(slug)
    if not data:
        print(f"  [WARN] no curated entry for {slug}")
        return False
    nid = uuid.uuid4()
    db.add(Recipe(
        id=nid,
        title=(data.get("title") or slug)[:500],
        description=(data.get("description") or "")[:1000],
        cooking_time=data.get("cooking_time_minutes"),
        servings=data.get("servings"),
        difficulty=data.get("difficulty") or "medium",
        source="curated-canonical",
        status="approved",
        author_id=admin_id,
        is_canonical=True,
        canonical_dish_slug=slug,
        variant_label=None,
        is_dessert=False,
    ))
    await db.flush()
    for i, ing in enumerate(data.get("ingredients") or []):
        if not str(ing).strip():
            continue
        db.add(RecipeIngredient(id=uuid.uuid4(), recipe_id=nid, display_text=str(ing)[:1000], order_index=i))
    for i, step in enumerate(data.get("steps") or [], start=1):
        if not str(step).strip():
            continue
        db.add(RecipeStep(id=uuid.uuid4(), recipe_id=nid, step_number=i, content=str(step)[:4000]))
    await db.commit()
    print(f"  + curated-canonical {slug}")
    return True


async def main() -> None:
    dish_recipe_service.load_dish_recipes()
    async with AsyncSessionLocal() as db:
        admin_id = await pipe.get_admin_user(db)
        for slug, display in CLASS_DISPLAY_NAMES.items():
            if await already_canonical(db, slug):
                continue
            if pipe.estimated_cost > pipe.COST_CEILING_USD:
                print(f"COST CEILING ${pipe.estimated_cost:.2f} reached, stopping")
                break
            print(f"[{slug}] {display}")
            if await reslug_same_title(db, slug, display):
                continue
            if await insert_refined(db, slug, display, admin_id):
                continue
            await insert_curated(db, slug, admin_id)
        print(f"\nDONE. est. cost ${pipe.estimated_cost:.2f}")


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 2: Run the gap-fill**

Run: `cd backend; $env:PYTHONUTF8=1; .venv/Scripts/python.exe -m scripts.fill_missing_canonical`
Expected: per-slug lines (`reslug` / `+ llm-canonical` / `+ curated-canonical`), final `DONE. est. cost $<X>` (well under $12).

- [ ] **Step 3: Verify subset complete**

Run: `cd backend; $env:PYTHONUTF8=1; .venv/Scripts/python.exe -m scripts.verify_canonical_subset`
Expected: `AI classes covered: 103/103`, `AI slugs with >1 canonical (0)`, `Duplicate-title clusters (0)`, `RESULT: PASS ✅`.

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/fill_missing_canonical.py
git commit -m "feat(canonical): phase 2 gap-fill 57 missing dishes (real + curated)"
```

---

## Task 5: Phase 3 — Unify recognize backend onto canonical

**Files:**
- Modify: `backend/app/services/ai_service.py` (the `dish_recipe` resolution block, currently lines 97-102)

- [ ] **Step 1: Replace the dish_recipe resolution block**

Find this block in `ai_service.py` (after the `AILog` commit, before the `class_metrics` block):

```python
    # Resolve dish_recipe attachment
    dish_recipe = None
    if predicted_class and predicted_class != "unknown" and model_used == "vnfood":
        dish_recipe = dish_recipe_service.get_curated(predicted_class)
    elif model_used == "openai" and display_name and display_name not in ("Không nhận diện được", "unknown"):
        dish_recipe = await dish_recipe_service.get_or_generate_ai(db, display_name, user_id=user_id)
```

Replace with:

```python
    # Resolve dish_recipe attachment.
    # VNFood path: canonical_recipe is the single source of truth and links to the
    # lookup detail page. Only fall back to the curated card if no canonical exists
    # (defensive — should not happen after the canonical gap-fill).
    dish_recipe = None
    if predicted_class and predicted_class != "unknown" and model_used == "vnfood":
        if canonical_recipe is None:
            dish_recipe = dish_recipe_service.get_curated(predicted_class)
    elif model_used == "openai" and display_name and display_name not in ("Không nhận diện được", "unknown"):
        dish_recipe = await dish_recipe_service.get_or_generate_ai(db, display_name, user_id=user_id)
```

- [ ] **Step 2: Confirm the branch logic is sound**

The Task 4 harness PASS already proves every AI class has a canonical recipe, so `_find_canonical_for_class` returns non-null for every VNFood prediction → the new branch sets `dish_recipe=None` on the VNFood path. Re-read the edited block to confirm `canonical_recipe is None` is the only condition that triggers `get_curated`. No separate DB check needed; the runtime behavior is verified in Task 6 (browser).

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/ai_service.py
git commit -m "feat(canonical): phase 3 recognize relies on canonical, curated as fallback"
```

---

## Task 6: Phase 3 — Frontend renders canonical card (verify, minor polish)

**Files:**
- Inspect/Modify: `frontend/components/ai/RecognitionResult.tsx`

**Context:** `RecognitionResult.tsx` already renders `result.canonical_recipe` as a card linking to `/recipes/${id}` (≈ lines 159-202) and renders `DishRecipeCard` only when `result.dish_recipe` is truthy (≈ lines 246-247). After Task 5, the VNFood path sends `dish_recipe=null`, so `DishRecipeCard` no longer shows for recognized VN dishes — the canonical card is the single display. No code change is strictly required; this task confirms the UX and adds a clarifying label.

- [ ] **Step 1: Restart backend so recognize uses the new logic**

Run: `cd backend; .venv/Scripts/activate; uvicorn app.main:app --reload --port 8000` (or restart the running instance).

- [ ] **Step 2: Manual browser verification**

1. `cd frontend; npm run dev`, open `http://localhost:3000/recognize`.
2. Upload a clear photo of a covered dish (e.g. Phở, Bánh mì, Cơm tấm).
3. Confirm: the canonical recipe card shows with title + image, clicking it navigates to `/recipes/[id]` showing the full canonical recipe. The old inline curated `DishRecipeCard` no longer appears for this VN dish.
4. Upload a non-Vietnamese dish (e.g. pizza) to force the OpenAI path. Confirm `DishRecipeCard` (ai-generated, amber warning badge) still renders.

- [ ] **Step 3 (optional polish): Clarify the canonical card heading**

If the canonical card lacks a clear "công thức chuẩn" label, locate the canonical card block in `RecognitionResult.tsx` (the `result.canonical_recipe` block) and ensure it has a heading such as:

```tsx
<p className="text-xs text-[#7C6A56] uppercase tracking-wider mb-1">Công thức chuẩn</p>
```

Only add if not already present; do not restructure the card.

- [ ] **Step 4: Commit (only if a change was made)**

```bash
git add frontend/components/ai/RecognitionResult.tsx
git commit -m "feat(canonical): phase 3 recognize canonical card is single source"
```

---

## Task 7: Final verification + state update

**Files:**
- Modify: `.claude/session-state.md`

- [ ] **Step 1: Run the full regression harness one final time**

Run: `cd backend; $env:PYTHONUTF8=1; .venv/Scripts/python.exe -m scripts.verify_canonical_subset`
Expected: `RESULT: PASS ✅`, `AI classes covered: 103/103`, all dup counts 0.

- [ ] **Step 2: Capture the final source breakdown for the thesis**

The harness from Step 1 already prints `Source breakdown: {...}` (e.g. `{'llm-canonical': N, 'curated-canonical': M}`). Record N (real Cookpad-derived) vs M (curated fallback) for the report — this quantifies how many of the 103 are backed by real community recipes vs curated content.

- [ ] **Step 3: Update session-state**

Add a dated section to `.claude/session-state.md` under the canonical-recipes area summarizing: 103/103 subset achieved, 17 clusters deduped, source breakdown (llm vs curated), new scripts added, Phase 3 unify done.

- [ ] **Step 4: Commit**

```bash
git add .claude/session-state.md
git commit -m "docs: session-state update for canonical subset completion"
```

---

## Self-Review notes

- **Spec coverage:** Phase 1 dedupe → Task 1. Phase 2a crawl → Task 2. 2b import → Task 3. 2c/2d gap-fill (judge+refine + curated + re-slug edge case) → Task 4. Phase 3 unify backend → Task 5, frontend → Task 6. Success criteria (103/103, 0 dup titles, canonical has children, recognize non-null) → Task 0 harness, asserted at every checkpoint. Source tags (`cookpad`, `llm-canonical`, `curated-canonical`) → Tasks 3/4. No new migration → confirmed (only data + code).
- **Edge case (same-title canonical under different slug, e.g. `banh-tom-ho-tay`):** handled by `reslug_same_title` in Task 4 running before insert, preventing duplicate titles.
- **Idempotency:** every script skips already-done work (canonical exists / cookpad_url exists / cluster already collapsed).
- **Cost:** gap-fill reuses the existing `$12` ceiling via `pipe.estimated_cost`.
- **Type consistency:** `norm_title`/`norm` use identical NFKD + đ→d logic across harness, dedupe, crawl, gap-fill. `DEDUP_DECISIONS` keys match `norm_title` output. Curated keys (`cooking_time_minutes`, `ingredients` as `list[str]`, `steps` as `list[str]`) match `dish_recipes.json` shape verified in the spec.
```
