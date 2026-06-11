# Recognition ↔ Lookup Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AI recognition output and the recipe lookup agree by routing every recognition through a single `resolved_slug` + `match_tier`, so canonical recipe, suggestion carousel, and UI state are always consistent.

**Architecture:** A new pure-logic resolver maps VNFood top-1 (with a two-tier confidence gate) and OpenAI free-text names back to one of the known class slugs. `recognize_image` is rewired around `(resolved_slug, match_tier)`; canonical lookup gains a `status='approved'` filter; suggested recipes are seeded from the canonical/variant set (same slug) before keyword top-up; a startup coverage check caches which slugs actually have a canonical recipe and powers `/ai/health`. Frontend renders by `match_tier`.

**Tech Stack:** FastAPI (Python 3.11), SQLAlchemy async, Alembic, PostgreSQL 16 (`unaccent` extension), Next.js 14 + TypeScript, pytest (bootstrapped for pure-logic tests).

**Spec:** `docs/superpowers/specs/2026-06-10-recognition-lookup-sync-design.md`

---

## File Structure

**New files:**
- `backend/app/services/dish_resolver.py` — pure name→slug normalization/alias map + VNFood tier decision + canonical-slug cache. No DB, no I/O. Fully unit-testable.
- `backend/app/services/canonical_coverage.py` — startup DB query: which slugs have a canonical approved recipe; populates the resolver cache and stores last coverage for `/ai/health`.
- `backend/tests/conftest.py` — minimal pytest setup (path bootstrap).
- `backend/tests/test_dish_resolver.py` — unit tests for the resolver.
- `backend/pytest.ini` — pytest config.
- `backend/alembic/versions/0015_enable_unaccent.py` — enable `unaccent` extension.

**Modified files:**
- `backend/app/services/ai_service.py` — rewire `recognize_image`; `_find_canonical_for_class` add status filter; `_find_suggested_recipes` seed-from-canonical + unaccent.
- `backend/app/api/v1/ai.py` — `/ai/health` returns `canonical_coverage`.
- `backend/app/main.py` — lifespan calls `compute_canonical_coverage`.
- `backend/requirements.txt` — add `pytest`, `pytest-asyncio`.
- `frontend/lib/types.ts` — add `match_tier` to `AIRecognitionResult`.
- `frontend/components/ai/RecognitionResult.tsx` — render by `match_tier`.

**Phases:**
- **Phase A** (low-risk, independent): Tasks 1–2 (canonical status filter + coverage/health).
- **Phase B** (spine): Tasks 3–6 (pytest bootstrap, resolver, rewire recognize_image, UI tier).
- **Phase C** (suggestion quality): Tasks 7–8 (seed-from-canonical, unaccent migration).

---

## Phase A — Defensive fixes

### Task 1: Canonical lookup filters approved only

**Files:**
- Modify: `backend/app/services/ai_service.py` (`_find_canonical_for_class`, ~line 243)

- [ ] **Step 1: Add the status filter**

In `_find_canonical_for_class`, change the query to require approved status. Replace:

```python
    result = await db.execute(
        select(Recipe).where(
            Recipe.is_canonical.is_(True),
            Recipe.canonical_dish_slug == predicted_class,
        ).order_by(Recipe.llm_judge_score.desc().nullslast())
    )
```

with:

```python
    result = await db.execute(
        select(Recipe).where(
            Recipe.is_canonical.is_(True),
            Recipe.status == "approved",
            Recipe.canonical_dish_slug == predicted_class,
        ).order_by(Recipe.llm_judge_score.desc().nullslast())
    )
```

- [ ] **Step 2: Manual verification (no DB test harness exists)**

Start backend (`uvicorn app.main:app --reload --port 8000`), then in `psql`:

```sql
-- pick a canonical slug and temporarily unpublish its canonical row
UPDATE recipes SET status='pending'
WHERE is_canonical=true AND canonical_dish_slug='pho';
```

Recognize a Phở image at `/recognize`. Expected: "Công thức chuẩn" section no longer links to the pending recipe (it shows another approved canonical or none), instead of linking to a 404/403 page. Restore:

```sql
UPDATE recipes SET status='approved'
WHERE is_canonical=true AND canonical_dish_slug='pho';
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/ai_service.py
git commit -m "fix(ai): canonical lookup only returns approved recipes"
```

---

### Task 2: Startup canonical-coverage check + /ai/health field

**Files:**
- Create: `backend/app/services/canonical_coverage.py`
- Modify: `backend/app/main.py` (lifespan), `backend/app/api/v1/ai.py` (`/health`)

- [ ] **Step 1: Create the coverage module**

Create `backend/app/services/canonical_coverage.py`:

```python
"""Startup invariant: verify every known class slug has a canonical approved recipe.

Stores the last computed coverage for /ai/health and caches the set of slugs that
DO have a canonical recipe (used by dish_resolver to gate tentative/openai tiers)."""
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.class_names import GROUP_CLASSES
from app.models.recipe import Recipe
from app.services import dish_resolver

logger = logging.getLogger(__name__)

# Last computed coverage, surfaced by /ai/health.
LAST_COVERAGE: dict = {"total": 0, "covered": 0, "missing": []}


def unique_class_slugs() -> set[str]:
    """Distinct slugs across all groups (slugs like banh-canh appear in 2 groups)."""
    return {slug for slugs in GROUP_CLASSES.values() for slug in slugs}


async def compute_canonical_coverage(db: AsyncSession) -> dict:
    global LAST_COVERAGE
    slugs = unique_class_slugs()
    rows = (await db.execute(
        select(Recipe.canonical_dish_slug).where(
            Recipe.is_canonical.is_(True),
            Recipe.status == "approved",
            Recipe.canonical_dish_slug.in_(slugs),
        )
    )).scalars().all()
    covered = {s for s in rows if s}
    missing = sorted(slugs - covered)

    dish_resolver.set_canonical_slugs(covered)
    LAST_COVERAGE = {"total": len(slugs), "covered": len(covered), "missing": missing}

    if missing:
        logger.warning(
            "Canonical coverage gap: %d/%d slugs missing a canonical approved recipe: %s",
            len(missing), len(slugs), missing,
        )
    else:
        logger.info("Canonical coverage OK: %d/%d slugs", len(covered), len(slugs))
    return LAST_COVERAGE
```

> NOTE: this imports `dish_resolver.set_canonical_slugs`, created in Task 4. Implement Task 4 before running the app, or temporarily stub the call. Subagent order: do Task 4 first if executing out of phase order.

- [ ] **Step 2: Call it from lifespan startup**

In `backend/app/main.py`, inside `lifespan` after the metrics load (after line 56, before `yield`), add:

```python
    from app.core.database import AsyncSessionLocal
    from app.services.canonical_coverage import compute_canonical_coverage
    async with AsyncSessionLocal() as _cov_db:
        cov = await compute_canonical_coverage(_cov_db)
    logging.info(f"[startup] Canonical coverage: {cov['covered']}/{cov['total']} slugs")
```

- [ ] **Step 3: Surface it in /ai/health**

In `backend/app/api/v1/ai.py`, replace the `ai_health` function body's return with one that includes coverage:

```python
@router.get("/health")
async def ai_health():
    from app.services.canonical_coverage import LAST_COVERAGE

    predictor = get_predictor_optional()
    return {
        "success": True,
        "data": {
            "loaded": predictor is not None,
            "device": str(predictor.device) if predictor else None,
            "groups": list(predictor.sub_models.keys()) if predictor else [],
            "canonical_coverage": LAST_COVERAGE,
        },
    }
```

- [ ] **Step 4: Manual verification**

Start backend. Check logs for `[startup] Canonical coverage: N/M slugs`. Then:

```bash
curl -s http://localhost:8000/api/v1/ai/health | jq '.data.canonical_coverage'
```

Expected: `{ "total": <unique slug count>, "covered": <n>, "missing": [...] }`. With the memory note (103/103 filled) `missing` should be `[]`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/canonical_coverage.py backend/app/main.py backend/app/api/v1/ai.py
git commit -m "feat(ai): startup canonical-coverage check + /ai/health field"
```

---

## Phase B — Resolver spine

### Task 3: Bootstrap pytest for pure-logic tests

**Files:**
- Create: `backend/pytest.ini`, `backend/tests/conftest.py`
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Add test deps**

Append to `backend/requirements.txt`:

```
pytest==8.3.4
pytest-asyncio==0.24.0
```

- [ ] **Step 2: Install**

Run (with venv active): `pip install pytest==8.3.4 pytest-asyncio==0.24.0`
Expected: both install successfully.

- [ ] **Step 3: Create pytest.ini**

Create `backend/pytest.ini`:

```ini
[pytest]
testpaths = tests
python_files = test_*.py
asyncio_mode = auto
```

- [ ] **Step 4: Create conftest with path bootstrap**

Create `backend/tests/conftest.py`:

```python
"""Make `app` importable when running pytest from the backend/ dir."""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
```

- [ ] **Step 5: Verify pytest collects nothing yet (clean baseline)**

Run: `cd backend && pytest -q`
Expected: `no tests ran` (exit code 5) — confirms config loads without error.

- [ ] **Step 6: Commit**

```bash
git add backend/requirements.txt backend/pytest.ini backend/tests/conftest.py
git commit -m "test: bootstrap pytest for backend pure-logic tests"
```

---

### Task 4: Dish resolver — normalize, alias map, tier decision

**Files:**
- Create: `backend/app/services/dish_resolver.py`
- Test: `backend/tests/test_dish_resolver.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_dish_resolver.py`:

```python
from app.services import dish_resolver as dr


def test_normalize_strips_accents_and_case():
    assert dr._normalize("Phở") == "pho"
    assert dr._normalize("  Bánh   Xèo ") == "banh xeo"
    assert dr._normalize("") == ""
    assert dr._normalize(None) == ""


def test_resolve_to_slug_from_display_name():
    assert dr.resolve_to_slug("Bánh xèo") == "banh-xeo"
    assert dr.resolve_to_slug("phở") == "pho"
    # accent-insensitive: English/no-diacritic input still maps
    assert dr.resolve_to_slug("pho") == "pho"


def test_resolve_to_slug_unknown_returns_none():
    assert dr.resolve_to_slug("pizza margherita") is None
    assert dr.resolve_to_slug("") is None
    assert dr.resolve_to_slug(None) is None


def test_resolve_vnfood_confident():
    vn = {"group_confidence": 0.9, "top5": [{"class": "pho", "confidence": 0.8}]}
    slug, tier = dr.resolve_vnfood(vn, has_canonical=lambda s: True)
    assert (slug, tier) == ("pho", "confident")


def test_resolve_vnfood_tentative_when_canonical_exists():
    vn = {"group_confidence": 0.9, "top5": [{"class": "pho", "confidence": 0.5}]}
    slug, tier = dr.resolve_vnfood(vn, has_canonical=lambda s: True)
    assert (slug, tier) == ("pho", "tentative")


def test_resolve_vnfood_tentative_blocked_without_canonical():
    vn = {"group_confidence": 0.9, "top5": [{"class": "pho", "confidence": 0.5}]}
    slug, tier = dr.resolve_vnfood(vn, has_canonical=lambda s: False)
    assert (slug, tier) == (None, None)


def test_resolve_vnfood_low_group_falls_back():
    vn = {"group_confidence": 0.3, "top5": [{"class": "pho", "confidence": 0.9}]}
    slug, tier = dr.resolve_vnfood(vn, has_canonical=lambda s: True)
    assert (slug, tier) == (None, None)


def test_resolve_vnfood_below_tentative_floor_falls_back():
    vn = {"group_confidence": 0.9, "top5": [{"class": "pho", "confidence": 0.35}]}
    slug, tier = dr.resolve_vnfood(vn, has_canonical=lambda s: True)
    assert (slug, tier) == (None, None)


def test_canonical_slug_cache_roundtrip():
    dr.set_canonical_slugs({"pho", "banh-xeo"})
    assert dr.has_canonical("pho") is True
    assert dr.has_canonical("com-tam") is False
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_dish_resolver.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.dish_resolver'`.

- [ ] **Step 3: Implement the resolver**

Create `backend/app/services/dish_resolver.py`:

```python
"""Map a free-text dish name to a known class slug and decide the VNFood match tier.

Pure logic — no DB, no I/O. The canonical-slug cache is populated at startup by
app.services.canonical_coverage."""
import unicodedata
from typing import Callable, Optional

from app.ai.class_names import CLASS_DISPLAY_NAMES

# Confidence gates (mirror inference.py thresholds + a tentative floor).
GROUP_CONF_MIN = 0.5
CLASS_CONFIDENT = 0.6
CLASS_TENTATIVE = 0.4

# Hand aliases for names OpenAI may return that don't match a Vietnamese display name.
_MANUAL_ALIASES = {
    "pho": "pho",
    "banh mi": "banh-mi",
    "vietnamese baguette": "banh-mi",
    "spring roll": "goi-cuon",
    "spring rolls": "goi-cuon",
    "fresh spring roll": "goi-cuon",
}


def _normalize(text: Optional[str]) -> str:
    """lowercase + strip diacritics (NFD, drop combining marks) + collapse whitespace."""
    if not text:
        return ""
    nfd = unicodedata.normalize("NFD", text)
    stripped = "".join(c for c in nfd if not unicodedata.combining(c))
    return " ".join(stripped.lower().split())


def _build_alias_map() -> dict[str, str]:
    amap: dict[str, str] = {}
    for slug, display in CLASS_DISPLAY_NAMES.items():
        amap[_normalize(display)] = slug
        amap[_normalize(slug.replace("-", " "))] = slug
    for alias, slug in _MANUAL_ALIASES.items():
        amap[_normalize(alias)] = slug
    return amap


ALIAS_MAP: dict[str, str] = _build_alias_map()


def resolve_to_slug(name: Optional[str]) -> Optional[str]:
    """Map a free-text dish name to a known class slug, or None."""
    key = _normalize(name)
    if not key:
        return None
    return ALIAS_MAP.get(key)


def resolve_vnfood(
    vnfood_result: dict,
    has_canonical: Callable[[str], bool],
) -> tuple[Optional[str], Optional[str]]:
    """Decide the VNFood stage outcome.

    Returns (slug, tier) where tier ∈ {"confident", "tentative"}, or (None, None)
    when the caller must fall back to OpenAI.
    """
    if vnfood_result.get("group_confidence", 0.0) < GROUP_CONF_MIN:
        return None, None
    top5 = vnfood_result.get("top5") or []
    if not top5:
        return None, None
    top1 = top5[0]
    slug = top1["class"]
    conf = top1["confidence"]
    if conf >= CLASS_CONFIDENT:
        return slug, "confident"
    if conf >= CLASS_TENTATIVE and has_canonical(slug):
        return slug, "tentative"
    return None, None


# ── canonical-slug cache (populated at startup) ───────────────────────────────
CANONICAL_SLUGS: set[str] = set()


def set_canonical_slugs(slugs: set[str]) -> None:
    global CANONICAL_SLUGS
    CANONICAL_SLUGS = set(slugs)


def has_canonical(slug: str) -> bool:
    return slug in CANONICAL_SLUGS
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_dish_resolver.py -q`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/dish_resolver.py backend/tests/test_dish_resolver.py
git commit -m "feat(ai): dish resolver — name→slug + VNFood tier decision"
```

---

### Task 5: Rewire `recognize_image` around resolved_slug + match_tier

**Files:**
- Modify: `backend/app/services/ai_service.py` (`recognize_image`, lines ~26-132; OpenAI prompt ~135-167)

- [ ] **Step 1: Constrain the OpenAI vision prompt**

In `_openai_recognize`, prepend the known-dish list to the text prompt so OpenAI prefers a known name. Replace the `"text"` content string with:

```python
                    "text": (
                        "Identify the food dish in this image. "
                        "If it matches one of these Vietnamese dishes, reply with that exact name: "
                        + ", ".join(sorted(set(CLASS_DISPLAY_NAMES.values())))
                        + ". Otherwise reply with the dish's real name. "
                        "Reply ONLY with a JSON object, no markdown, no explanation: "
                        '{"dish_name": "name (Vietnamese if VN dish, English if not)", "confidence": 0.0-1.0}. '
                        "Never reply 'Unknown'. "
                        "Set confidence below 0.3 if it is NOT a Vietnamese dish or truly unrecognizable."
                    ),
```

(`CLASS_DISPLAY_NAMES` is already imported at the top of `ai_service.py`.)

- [ ] **Step 2: Add the resolver import**

At the top of `ai_service.py`, alongside the existing `from app.ai.class_names import ...`, add:

```python
from app.services import dish_resolver
```

- [ ] **Step 3: Replace the recognition body**

Replace the block from `vnfood_result = predictor.predict(pil_image)` (line ~49) down to and including the construction of the `keyword`/`suggested_recipes`/`canonical_recipe` calls and the return dict (through line ~132) with:

```python
    vnfood_result = predictor.predict(pil_image)
    top5: list = vnfood_result.get("top5", [])
    group: Optional[str] = vnfood_result.get("group")

    resolved_slug: Optional[str] = None
    match_tier: str = "unknown"
    predicted_class: Optional[str] = None
    display_name: Optional[str] = None
    confidence: float = 0.0
    model_used: str = "vnfood"

    vn_slug, vn_tier = dish_resolver.resolve_vnfood(vnfood_result, dish_resolver.has_canonical)
    if vn_slug is not None:
        # VNFood confident or tentative
        resolved_slug = vn_slug
        match_tier = vn_tier  # "confident" | "tentative"
        predicted_class = vn_slug
        display_name = CLASS_DISPLAY_NAMES.get(vn_slug, vn_slug)
        confidence = top5[0]["confidence"]
        model_used = "vnfood"
    else:
        # Fall back to OpenAI Vision
        model_used = "openai"
        openai_name: Optional[str] = None
        if settings.OPENAI_API_KEY:
            try:
                openai_name, confidence = await _openai_recognize(image_bytes)
            except Exception:
                logger.exception("OpenAI fallback failed")
        else:
            logger.warning("OPENAI_API_KEY not configured — cannot fallback")

        mapped = dish_resolver.resolve_to_slug(openai_name)
        if mapped and dish_resolver.has_canonical(mapped):
            # OpenAI named a dish we already have a canonical recipe for → re-enter lookup.
            resolved_slug = mapped
            match_tier = "openai_known"
            predicted_class = mapped
            display_name = CLASS_DISPLAY_NAMES.get(mapped, openai_name)
            top5 = [{"class": mapped, "display_name": display_name, "confidence": confidence}]
        elif openai_name:
            # Genuinely outside the 103 → AI-generate path.
            match_tier = "unknown"
            predicted_class = openai_name
            display_name = openai_name
            top5 = [{"class": openai_name, "display_name": openai_name, "confidence": confidence}]
        else:
            match_tier = "unknown"
            predicted_class = "unknown"
            display_name = "Không nhận diện được"
            confidence = 0.0

    # ── lookup, all keyed off resolved_slug ──────────────────────────────────
    keyword = get_keyword_from_class(resolved_slug) if resolved_slug else None
    canonical_recipe, variants = await _find_canonical_for_class(db, resolved_slug)
    suggested_recipes = await _find_suggested_recipes(
        db, resolved_slug, display_name, keyword, canonical_recipe, variants, limit=6
    )

    log = AILog(
        id=uuid.uuid4(),
        user_id=user_id,
        image_url=image_url,
        predicted_class=predicted_class,
        confidence=confidence,
        model_used=model_used,
    )
    db.add(log)
    await db.commit()

    # dish_recipe: canonical inline card when we have a slug; else OpenAI-generated.
    dish_recipe = None
    if resolved_slug and canonical_recipe is not None:
        dish_recipe = await _build_dish_recipe_from_canonical(db, canonical_recipe["id"])
    elif resolved_slug:
        dish_recipe = dish_recipe_service.get_curated(resolved_slug)
    elif match_tier == "unknown" and display_name and display_name not in ("Không nhận diện được", "unknown"):
        dish_recipe = await dish_recipe_service.get_or_generate_ai(db, display_name, user_id=user_id)

    class_metrics = None
    if model_used == "vnfood" and resolved_slug:
        class_metrics = metrics_service.get_class_metrics(resolved_slug)

    return {
        "predicted_class": predicted_class,
        "display_name": display_name,
        "confidence": confidence,
        "model_used": model_used,
        "match_tier": match_tier,
        "resolved_slug": resolved_slug,
        "subgroup": group,
        "top_predictions": top5,
        "suggested_recipes": suggested_recipes,
        "canonical_recipe": canonical_recipe,
        "variants": variants,
        "dish_recipe": dish_recipe,
        "class_metrics": class_metrics,
    }
```

> NOTE: `_find_suggested_recipes` now takes `canonical_recipe` + `variants`; its new signature is implemented in Task 7. Until Task 7 lands, this call will error on the extra args — implement Tasks 5 and 7 together before running the app, or temporarily call the old signature.

- [ ] **Step 4: Manual verification — confident path unchanged**

Start backend + frontend. Upload a clear Phở photo at `/recognize`. Expected: `model_used="vnfood"`, "Công thức chuẩn" links to the canonical Phở recipe (same as before). Inspect response:

```bash
# (use browser devtools Network tab on /ai/recognize, or recognize-url)
curl -s -X POST http://localhost:8000/api/v1/ai/recognize-url \
  -H "Content-Type: application/json" \
  -d '{"image_url":"<public pho image url>"}' | jq '{match_tier, resolved_slug, model_used, canonical: .data.canonical_recipe.title}'
```

Expected: `match_tier="confident"`, `resolved_slug="pho"`, a canonical title.

- [ ] **Step 5: Manual verification — OpenAI-known path links canonical (the headline fix)**

Temporarily force fallback by raising the threshold is invasive; instead test with a dish the model is weak on but OpenAI knows, OR temporarily set `CLASS_CONFIDENT = 1.1` in `dish_resolver.py` to force every VNFood result into fallback, recognize a Bánh xèo image, then revert. Expected: `model_used="openai"`, `match_tier="openai_known"`, `resolved_slug="banh-xeo"`, and `canonical_recipe` is NOT null (previously it was null and a duplicate recipe was generated).

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/ai_service.py
git commit -m "feat(ai): route recognition through resolved_slug + match_tier"
```

---

### Task 6: Frontend renders by match_tier

**Files:**
- Modify: `frontend/lib/types.ts` (`AIRecognitionResult`, ~line 304)
- Modify: `frontend/components/ai/RecognitionResult.tsx`

- [ ] **Step 1: Add match_tier to the type**

In `frontend/lib/types.ts`, add the field to `AIRecognitionResult` (after `model_used`):

```typescript
  model_used: "vnfood" | "openai";
  match_tier: "confident" | "tentative" | "openai_known" | "unknown";
  resolved_slug: string | null;
```

- [ ] **Step 2: Drive isUnknown off match_tier and add the tentative banner**

In `frontend/components/ai/RecognitionResult.tsx`, replace the `isUnknown` definition (lines ~64-68):

```typescript
  const isUnknown = result.match_tier === "unknown";
  const isTentative = result.match_tier === "tentative";
```

Then, inside the `else` branch (the recognized block, after the `<div>` opening at ~line 97), insert a tentative banner just before the "Món được nhận diện" label:

```tsx
              {isTentative && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                  Có thể là <strong>{result.display_name}</strong> — độ tin cậy chưa cao, kiểm tra lại ảnh nếu chưa đúng.
                </div>
              )}
```

- [ ] **Step 3: Keep top3 for tentative too**

The top-predictions block is currently gated `result.model_used === "vnfood"` (line ~128) — that already covers `confident` and `tentative` (both are vnfood). No change needed. Confirm by reading the condition; leave as-is.

- [ ] **Step 4: Manual verification**

- Confident Phở image → no amber banner, canonical shown (unchanged).
- Forced tentative (set `CLASS_CONFIDENT=1.1`, `CLASS_TENTATIVE=0.0` in `dish_resolver.py` temporarily, recognize an in-class image, revert) → amber "Có thể là…" banner appears, canonical section + top3 still render (previously the result was discarded).
- Non-food / pizza image with OpenAI on → `match_tier="unknown"` → "Không nhận diện được" card.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/types.ts frontend/components/ai/RecognitionResult.tsx
git commit -m "feat(recognize): render recognition result by match_tier"
```

---

## Phase C — Suggestion quality

### Task 7: Seed suggested_recipes from canonical/variants

**Files:**
- Modify: `backend/app/services/ai_service.py` (`_find_suggested_recipes`, ~line 263)

- [ ] **Step 1: Change the signature and seed logic**

Replace the whole `_find_suggested_recipes` function with a version that seeds from the already-resolved canonical + variants, then tops up. New signature matches the Task 5 call:

```python
async def _find_suggested_recipes(
    db: AsyncSession,
    resolved_slug: Optional[str],
    display_name: Optional[str],
    keyword: Optional[str],
    canonical_recipe: Optional[dict] = None,
    variants: Optional[list[dict]] = None,
    limit: int = 6,
) -> list[dict]:
    seen: set = set()
    output: list[dict] = []

    def _add(item: dict) -> None:
        key = _norm_title(item.get("title"))
        if key in seen or not item.get("id"):
            return
        seen.add(key)
        output.append({
            "id": str(item["id"]),
            "title": item["title"],
            "image_url": item.get("image_url"),
            "avg_rating": item.get("avg_rating") or 0,
            "rating_count": item.get("rating_count") or 0,
            "cooking_time": item.get("cooking_time"),
            "source": item.get("source"),
        })

    # 1. Seed from the authoritative slug match (canonical first, then variants).
    if canonical_recipe:
        _add(canonical_recipe)
    for v in (variants or []):
        if len(output) >= limit:
            break
        _add(v)

    # 2. Top up by title match (only when we still need more).
    _unknown = {"unknown", "Không xác định", "Không nhận diện được", None}
    if len(output) < limit and display_name not in _unknown:
        q = (
            select(Recipe)
            .where(Recipe.status == "approved")
            .where(_title_unaccent_ilike(display_name))
            .order_by(Recipe.avg_rating.desc(), Recipe.view_count.desc())
            .limit(limit)
        )
        for r in (await db.execute(q)).scalars().all():
            if len(output) >= limit:
                break
            _add(_serialize_recipe_for_ai(r))

    # 3. Top up by coarse keyword as a last resort.
    if len(output) < limit and keyword:
        fallback_q = (
            select(Recipe)
            .where(Recipe.status == "approved", Recipe.keyword == keyword)
            .order_by(Recipe.avg_rating.desc(), Recipe.view_count.desc())
            .limit(limit)
        )
        for r in (await db.execute(fallback_q)).scalars().all():
            if len(output) >= limit:
                break
            _add(_serialize_recipe_for_ai(r))

    return output[:limit]
```

> NOTE: `_title_unaccent_ilike` is added in Task 8. Until then, temporarily replace `.where(_title_unaccent_ilike(display_name))` with `.where(Recipe.title.ilike(f"%{display_name}%"))`. `_serialize_recipe_for_ai` already exists (line ~189) and includes id/title/image_url/avg_rating/rating_count/cooking_time/source.

- [ ] **Step 2: Manual verification — carousel contains the canonical dish**

Recognize a Bánh gai image (confident). Expected: the first card(s) in "Công thức gợi ý" are the canonical/variant Bánh gai recipes (same as the "Công thức chuẩn" link), NOT random `banh-mi`/`banh-xeo` from the coarse keyword fallback.

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/ai_service.py
git commit -m "feat(ai): seed suggestions from canonical/variants before keyword"
```

---

### Task 8: Enable unaccent + accent-insensitive title match

**Files:**
- Create: `backend/alembic/versions/0015_enable_unaccent.py`
- Modify: `backend/app/services/ai_service.py` (add `_title_unaccent_ilike` helper)

- [ ] **Step 1: Create the migration**

Create `backend/alembic/versions/0015_enable_unaccent.py`:

```python
"""Enable unaccent extension for accent-insensitive recipe title search

Revision ID: 0015
Revises: 0014
Create Date: 2026-06-10
"""
from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")


def downgrade() -> None:
    op.execute("DROP EXTENSION IF EXISTS unaccent")
```

- [ ] **Step 2: Run the migration**

Run: `cd backend && alembic upgrade head`
Expected: applies `0015`, no error. Verify: `psql ... -c "SELECT unaccent('Phở');"` returns `Pho`.

- [ ] **Step 3: Add the unaccent helper and use it**

In `backend/app/services/ai_service.py`, add near the top imports:

```python
from sqlalchemy import func, select
```

(merge with the existing `from sqlalchemy import select` line). Then add this helper just above `_find_suggested_recipes`:

```python
def _title_unaccent_ilike(display_name: str):
    """Accent-insensitive title match: unaccent(title) ILIKE unaccent(%name%)."""
    pattern = f"%{display_name}%"
    return func.unaccent(Recipe.title).ilike(func.unaccent(pattern))
```

Then revert the temporary `.ilike(...)` from Task 7 Step 1 back to `.where(_title_unaccent_ilike(display_name))` if you stubbed it.

- [ ] **Step 4: Manual verification**

With OpenAI returning an English name (or test via `/search`-style input), recognize an image OpenAI labels "Pho". Expected: suggested carousel now includes "Phở …" recipes (accent-insensitive match) where before it returned none. Also confirm a normal diacritic recognition still returns suggestions.

- [ ] **Step 5: Commit**

```bash
git add backend/alembic/versions/0015_enable_unaccent.py backend/app/services/ai_service.py
git commit -m "feat(ai): accent-insensitive title search via unaccent"
```

---

## Self-Review Notes (coverage vs spec)

- C1 resolver → Task 4 (+ OpenAI constrained prompt in Task 5 Step 1). ✓
- C2 canonical status filter → Task 1. ✓
- C3 unified suggested_recipes → Task 7. ✓
- C4 unaccent → Task 8. ✓
- C5 startup coverage + health + unique-slug dedup (#7) → Task 2. ✓
- UI match_tier + tentative banner + #8 (keep top-1) → Task 6. ✓
- #1 OpenAI→slug + #2 two-tier confidence → Tasks 4–5. ✓
- Contract: `match_tier`/`resolved_slug` added to response (Task 5) + TS type (Task 6). ✓

**Cross-task type consistency:** `resolve_vnfood`, `resolve_to_slug`, `has_canonical`, `set_canonical_slugs` defined in Task 4 and consumed in Tasks 2 & 5 with matching signatures. `_find_suggested_recipes` new signature defined in Task 7 matches the Task 5 call site. `_title_unaccent_ilike` defined in Task 8, referenced in Task 7 with a documented stub-until-landed note.

**Known ordering coupling (flagged inline):** Task 2 imports `dish_resolver` (Task 4); Task 5 calls the Task 7 signature and Task 8 helper. Execute Phase B Task 4 before Task 2's run step, and land Tasks 5+7(+8) together before running the full app. Each task still commits independently.
