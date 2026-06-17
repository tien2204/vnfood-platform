# Multi-Variant Dish Overview (P1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `/recognize`, for dishes with many variants (config list of 57 slugs), show a generic "overview" card (taste + key ingredients + main steps) above the recipe card, and relabel the pinned recipe as "Một công thức tiêu biểu / 1 trong nhiều biến thể" instead of "Công thức chuẩn".

**Architecture:** Backend adds a `MULTI_VARIANT_SLUGS` config set + an `is_multi_variant()` helper, a static `dish_overviews.json` (LLM-seeded, hand-editable) loaded at startup by a new `dish_overview_service`, and two new fields (`is_multi_variant`, `dish_overview`) on the recognize response. Frontend adds a `DishOverviewCard` and branches `RecognitionResult` on `is_multi_variant`. No DB schema change, no runtime LLM calls.

**Tech Stack:** Backend FastAPI (Python 3.11, pytest), frontend Next.js 16 + React 19 + TypeScript + Tailwind. Backend venv at `backend/.venv`; run python as `.venv/Scripts/python`.

**Spec:** `docs/superpowers/specs/2026-06-17-multi-variant-dish-overview-design.md`

---

## File Structure

**Backend (working dir `backend/`):**
- Modify `app/core/variant_config.py` — add `MULTI_VARIANT_SLUGS: set[str]` (57) + `is_multi_variant(slug)`.
- Create `app/ai/dish_overviews.json` — starter with hand-written `banh-mi` + `pho`; seed script fills the rest.
- Create `app/services/dish_overview_service.py` — load + `get_overview(slug)`.
- Modify `app/main.py` — call `load_dish_overviews()` at startup.
- Modify `app/services/ai_service.py` — add `is_multi_variant` + `dish_overview` to recognize response.
- Create `scripts/seed_dish_overviews.py` — one-off LLM seeding, resume-safe, `--force`.
- Create `tests/test_variant_config.py`, `tests/test_dish_overview_service.py`.

**Frontend (working dir `frontend/`):**
- Modify `lib/types.ts` — add `DishOverview` + 2 fields on `AIRecognitionResult`.
- Create `components/ai/DishOverviewCard.tsx`.
- Modify `components/recipes/CanonicalBadge.tsx` — add `VariantBadge`.
- Modify `components/ai/RecognitionResult.tsx` — render overview + relabel when multi-variant.

All work on current branch `feat/monngonmoingay-restyle`.

## Verification commands

- Backend tests: from `backend/`, `.venv/Scripts/python -m pytest tests/<file> -v`
- Frontend typecheck: from `frontend/`, `npx tsc --noEmit`
- Frontend lint (changed files): from `frontend/`, `node ./node_modules/eslint/bin/eslint.js <files>`

---

### Task 1: MULTI_VARIANT_SLUGS config + is_multi_variant helper

**Files:**
- Modify: `backend/app/core/variant_config.py`
- Test: `backend/tests/test_variant_config.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_variant_config.py`:

```python
from app.core import variant_config as vc


def test_multi_variant_slugs_size_and_membership():
    assert len(vc.MULTI_VARIANT_SLUGS) == 57
    assert "pho" in vc.MULTI_VARIANT_SLUGS
    assert "banh-mi" in vc.MULTI_VARIANT_SLUGS
    assert "tau-hu-non" in vc.MULTI_VARIANT_SLUGS
    # single-variant dishes must NOT be present
    assert "cao-lau" not in vc.MULTI_VARIANT_SLUGS
    assert "banh-khot" not in vc.MULTI_VARIANT_SLUGS


def test_all_slugs_are_real_classes():
    from app.ai.class_names import CLASS_DISPLAY_NAMES
    for slug in vc.MULTI_VARIANT_SLUGS:
        assert slug in CLASS_DISPLAY_NAMES, f"{slug} not a known class"


def test_is_multi_variant():
    assert vc.is_multi_variant("pho") is True
    assert vc.is_multi_variant("cao-lau") is False
    assert vc.is_multi_variant(None) is False
    assert vc.is_multi_variant("") is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_variant_config.py -v`
Expected: FAIL — `AttributeError: module 'app.core.variant_config' has no attribute 'MULTI_VARIANT_SLUGS'`.

- [ ] **Step 3: Implement**

Append to the end of `backend/app/core/variant_config.py`:

```python


# ── Multi-variant dishes ──────────────────────────────────────────────────────
# Dishes whose recognized class spans many named sub-dishes. For these, the
# recognize UI shows a generic overview instead of pinning a single recipe as
# "the standard". Derived from the variant classification (rich + moderate).
# Group 1 — rich variants (23):
_MULTI_VARIANT_RICH = {
    "pho", "banh-mi", "banh-canh", "hu-tieu", "mi-quang", "banh-xeo",
    "banh-cuon", "banh-bao", "banh-tet", "banh-chung", "banh-trung-thu",
    "com-chien", "com-tam", "canh-chua", "ca-kho-to", "bun-rieu", "goi-cuon",
    "nem-chua", "lap-xuong", "rau-muong-xao", "banh-bo", "banh-da-lon",
    "banh-pia",
}
# Group 2 — moderate variants / by topping–region (34):
_MULTI_VARIANT_MODERATE = {
    "banh-beo", "banh-can", "banh-duc", "banh-hoi", "banh-trang-nuong",
    "banh-da-cua", "banh-u", "bo-ne", "bo-kho", "thit-kho-tau", "kho-quet",
    "ca-loc-nuong", "ca-sot-ca-chua", "ga-chien-nuoc-mam", "muc-nhoi-thit",
    "canh-bi-do", "canh-cua", "canh-kho-hoa", "ca-ri-ga", "sup-cua",
    "bun-cha-ca", "bun-thit-nuong", "bun-mam", "bun-dau-mam-tom", "mi-xao-gion",
    "nui-xao", "ga-hap-la-chanh", "oc-huong-xao", "oc-buou-hap",
    "tau-hu-nhoi-thit", "tau-hu-non", "tiet-canh", "trung-vit-lon", "mam-chung",
}
MULTI_VARIANT_SLUGS: set[str] = _MULTI_VARIANT_RICH | _MULTI_VARIANT_MODERATE


def is_multi_variant(slug: str | None) -> bool:
    """True if `slug` is a dish with many variants (overview-mode)."""
    return bool(slug) and slug in MULTI_VARIANT_SLUGS
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_variant_config.py -v`
Expected: PASS (3 tests). If `test_multi_variant_slugs_size_and_membership` fails on count, re-count the two sets — they must total 57 (23 + 34).

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/variant_config.py backend/tests/test_variant_config.py
git commit -m "feat(recognize): add MULTI_VARIANT_SLUGS config + is_multi_variant helper"
```

---

### Task 2: dish_overviews.json starter + dish_overview_service

**Files:**
- Create: `backend/app/ai/dish_overviews.json`
- Create: `backend/app/services/dish_overview_service.py`
- Test: `backend/tests/test_dish_overview_service.py`

- [ ] **Step 1: Create the starter JSON**

Create `backend/app/ai/dish_overviews.json` with two hand-written entries (seed script adds the other 55 later):

```json
{
  "banh-mi": {
    "display_name": "Bánh mì",
    "tasting": "Bánh mì Việt là ổ bánh vỏ giòn rụm, ruột mềm xốp, kẹp nhân mặn-béo cùng đồ chua, rau thơm và chút cay. Ăn nóng ngay khi vừa kẹp là ngon nhất — cắn một miếng cảm nhận được vỏ giòn, nhân đậm đà và vị chua thanh giải ngấy.",
    "key_ingredients": [
      "Bánh mì vỏ giòn",
      "Pate hoặc bơ",
      "Đồ chua (cà rốt, củ cải)",
      "Rau mùi, dưa leo, ớt",
      "Nhân tùy biến thể (thịt nướng/chả/trứng/xíu mại)"
    ],
    "main_steps": [
      "Chuẩn bị nhân theo biến thể (nướng thịt, làm chả, chiên trứng...)",
      "Phết pate/bơ và sốt vào ruột bánh",
      "Kẹp nhân cùng đồ chua, rau thơm, ớt; ăn ngay khi còn nóng giòn"
    ],
    "variant_examples": [
      "Bánh mì thịt nướng",
      "Bánh mì pate",
      "Bánh mì xíu mại",
      "Bánh mì chả cá",
      "Bánh mì trứng"
    ]
  },
  "pho": {
    "display_name": "Phở",
    "tasting": "Phở quyến rũ ở nước dùng trong, ngọt xương ninh lâu, dậy mùi quế hồi thảo quả. Sợi phở mềm mượt, ăn kèm thịt thái mỏng, hành mùi và chút tương ớt, vắt chanh. Húp thìa nước dùng nóng hổi đầu tiên là cảm nhận trọn vị thanh mà đậm.",
    "key_ingredients": [
      "Bánh phở",
      "Xương bò/gà ninh nước dùng",
      "Thịt (bò tái/chín hoặc gà)",
      "Gia vị: quế, hồi, thảo quả, gừng, hành",
      "Rau ăn kèm: hành, mùi, giá, chanh, ớt"
    ],
    "main_steps": [
      "Ninh xương với gừng, hành và gia vị nướng thơm để lấy nước dùng trong",
      "Chần bánh phở, xếp thịt thái mỏng lên trên",
      "Chan nước dùng sôi, thêm hành mùi; ăn kèm rau sống, chanh, ớt"
    ],
    "variant_examples": [
      "Phở bò",
      "Phở gà",
      "Phở tái lăn",
      "Phở xào",
      "Phở cuốn"
    ]
  }
}
```

- [ ] **Step 2: Write the failing test**

Create `backend/tests/test_dish_overview_service.py`:

```python
from app.services import dish_overview_service as dos


def test_load_returns_count():
    n = dos.load_dish_overviews()
    assert n >= 2


def test_get_overview_known_slug():
    dos.load_dish_overviews()
    ov = dos.get_overview("banh-mi")
    assert ov is not None
    assert ov["display_name"] == "Bánh mì"
    assert isinstance(ov["key_ingredients"], list) and ov["key_ingredients"]
    assert isinstance(ov["main_steps"], list) and ov["main_steps"]
    assert isinstance(ov["variant_examples"], list)
    assert ov["tasting"]


def test_get_overview_unknown_and_none():
    dos.load_dish_overviews()
    assert dos.get_overview("not-a-slug") is None
    assert dos.get_overview(None) is None
    assert dos.get_overview("") is None
```

- [ ] **Step 3: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_dish_overview_service.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.dish_overview_service'`.

- [ ] **Step 4: Implement the service**

Create `backend/app/services/dish_overview_service.py`:

```python
"""Static dish overviews for multi-variant dishes (LLM-seeded, hand-editable)."""
import json
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

DISH_OVERVIEWS_PATH = Path(__file__).parent.parent / "ai" / "dish_overviews.json"
DISH_OVERVIEWS: dict[str, dict] = {}


def load_dish_overviews() -> int:
    """Load overviews into memory. Called once at app startup."""
    global DISH_OVERVIEWS
    if not DISH_OVERVIEWS_PATH.exists():
        logger.warning(f"dish_overviews.json not found at {DISH_OVERVIEWS_PATH}")
        DISH_OVERVIEWS = {}
        return 0
    DISH_OVERVIEWS = json.loads(DISH_OVERVIEWS_PATH.read_text(encoding="utf-8"))
    logger.info(f"Loaded {len(DISH_OVERVIEWS)} dish overviews")
    return len(DISH_OVERVIEWS)


def get_overview(slug: Optional[str]) -> Optional[dict]:
    """Return overview dict for slug, or None."""
    if not slug:
        return None
    return DISH_OVERVIEWS.get(slug)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_dish_overview_service.py -v`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/app/ai/dish_overviews.json backend/app/services/dish_overview_service.py backend/tests/test_dish_overview_service.py
git commit -m "feat(recognize): add dish_overview_service + starter overviews (banh-mi, pho)"
```

---

### Task 3: Load overviews at startup

**Files:**
- Modify: `backend/app/main.py`

- [ ] **Step 1: Add the import**

In `backend/app/main.py`, find:

```python
from app.services.dish_recipe_service import load_dish_recipes
```

Add directly below it:

```python
from app.services.dish_overview_service import load_dish_overviews
```

- [ ] **Step 2: Call the loader at startup**

In `backend/app/main.py`, find:

```python
    count = load_dish_recipes()
    logging.info(f"[startup] Loaded {count} curated dish recipes")
```

Add directly below it:

```python
    ov_count = load_dish_overviews()
    logging.info(f"[startup] Loaded {ov_count} dish overviews")
```

- [ ] **Step 3: Verify the app imports cleanly**

Run (from `backend/`): `.venv/Scripts/python -c "import app.main; print('ok')"`
Expected: prints `ok` (no import error). It will also emit the startup log lines may not appear here — only the import must succeed.

- [ ] **Step 4: Commit**

```bash
git add backend/app/main.py
git commit -m "feat(recognize): load dish overviews at startup"
```

---

### Task 4: Recognize response — add is_multi_variant + dish_overview

**Files:**
- Modify: `backend/app/services/ai_service.py`

- [ ] **Step 1: Add imports**

In `backend/app/services/ai_service.py`, find:

```python
from app.services import dish_recipe_service, dish_resolver, metrics_service
```

Replace with:

```python
from app.core.variant_config import is_multi_variant
from app.services import (
    dish_overview_service,
    dish_recipe_service,
    dish_resolver,
    metrics_service,
)
```

- [ ] **Step 2: Compute the two new values before the return**

In `recognize_image`, find this block (just before the `return {`):

```python
    class_metrics = None
    if model_used == "vnfood" and resolved_slug:
        class_metrics = metrics_service.get_class_metrics(resolved_slug)
```

Add directly below it:

```python
    multi_variant = is_multi_variant(resolved_slug)
    dish_overview = dish_overview_service.get_overview(resolved_slug) if multi_variant else None
```

- [ ] **Step 3: Add the fields to the returned dict**

In the same function, find:

```python
        "dish_recipe": dish_recipe,
        "class_metrics": class_metrics,
    }
```

Replace with:

```python
        "dish_recipe": dish_recipe,
        "class_metrics": class_metrics,
        "is_multi_variant": multi_variant,
        "dish_overview": dish_overview,
    }
```

- [ ] **Step 4: Verify it imports + a known multi-variant slug resolves to True**

Run (from `backend/`):

```bash
.venv/Scripts/python -c "from app.core.variant_config import is_multi_variant; from app.services import dish_overview_service as d; d.load_dish_overviews(); print(is_multi_variant('banh-mi'), bool(d.get_overview('banh-mi')), is_multi_variant('cao-lau'))"
```

Expected output: `True True False`

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ai_service.py
git commit -m "feat(recognize): surface is_multi_variant + dish_overview in response"
```

---

### Task 5: Seed script for the remaining overviews

**Files:**
- Create: `backend/scripts/seed_dish_overviews.py`

- [ ] **Step 1: Create the script**

Create `backend/scripts/seed_dish_overviews.py`:

```python
"""One-off: LLM-seed dish_overviews.json for every MULTI_VARIANT_SLUGS entry.

Resume-safe: writes after each slug, skips slugs already present unless --force.
Run from backend/:  .venv/Scripts/python scripts/seed_dish_overviews.py [--force]
Requires OPENAI_API_KEY in the environment / settings.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from openai import OpenAI  # noqa: E402

from app.ai.class_names import CLASS_DISPLAY_NAMES  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.variant_config import MULTI_VARIANT_SLUGS  # noqa: E402

OUT_PATH = Path(__file__).parent.parent / "app" / "ai" / "dish_overviews.json"


def build_prompt(display_name: str) -> str:
    return (
        f'Viết phần giới thiệu CHUNG cho món Việt "{display_name}" (món này có NHIỀU biến thể).\n'
        "Trả về DUY NHẤT một JSON object, không markdown:\n"
        "{\n"
        f'  "display_name": "{display_name}",\n'
        '  "tasting": "2-3 câu mô tả VỊ và CÁCH THƯỞNG THỨC (ăn ra sao, vị thế nào, ăn kèm gì) — tránh sáo rỗng",\n'
        '  "key_ingredients": ["nguyên liệu chủ chốt CHUNG cho mọi biến thể", "..."],\n'
        '  "main_steps": ["bước chính ở mức tổng quát", "..."],\n'
        '  "variant_examples": ["tên biến thể phổ biến", "..."]\n'
        "}\n"
        "key_ingredients: 4-6 mục, KHÔNG định lượng. main_steps: 3-4 bước tổng quát. "
        "variant_examples: 4-6 tên. Toàn bộ bằng tiếng Việt."
    )


def generate(client: OpenAI, display_name: str) -> dict:
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": build_prompt(display_name)}],
        max_tokens=800,
        response_format={"type": "json_object"},
    )
    data = json.loads(resp.choices[0].message.content.strip())
    # enforce shape
    return {
        "display_name": data.get("display_name") or display_name,
        "tasting": data["tasting"],
        "key_ingredients": list(data["key_ingredients"]),
        "main_steps": list(data["main_steps"]),
        "variant_examples": list(data.get("variant_examples", [])),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="regenerate slugs already present")
    args = ap.parse_args()

    existing: dict = {}
    if OUT_PATH.exists():
        existing = json.loads(OUT_PATH.read_text(encoding="utf-8"))

    if not settings.OPENAI_API_KEY:
        raise SystemExit("OPENAI_API_KEY not set — cannot seed.")
    client = OpenAI(api_key=settings.OPENAI_API_KEY)

    todo = sorted(
        s for s in MULTI_VARIANT_SLUGS if args.force or s not in existing
    )
    print(f"{len(todo)} slugs to generate ({len(existing)} already present).")

    for i, slug in enumerate(todo, 1):
        display = CLASS_DISPLAY_NAMES.get(slug, slug)
        try:
            existing[slug] = generate(client, display)
            # write incrementally so a crash mid-run keeps progress
            OUT_PATH.write_text(
                json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            print(f"[{i}/{len(todo)}] {slug} ✓")
        except Exception as e:  # noqa: BLE001
            print(f"[{i}/{len(todo)}] {slug} FAILED: {e}")

    print(f"Done. {len(existing)} total overviews in {OUT_PATH}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Verify the script parses and `build_prompt` works (no LLM call)**

Run (from `backend/`):

```bash
.venv/Scripts/python -c "import sys; sys.path.insert(0,'scripts'); import seed_dish_overviews as s; print('banh-mi' in s.build_prompt('Bánh mì') or 'Bánh mì' in s.build_prompt('Bánh mì'))"
```

Expected: prints `True` (module imports, `build_prompt` returns a string mentioning the dish). Do NOT run the full seeder here (it costs OpenAI calls); the user runs it separately when ready.

- [ ] **Step 3: Commit**

```bash
git add backend/scripts/seed_dish_overviews.py
git commit -m "feat(recognize): add seed_dish_overviews.py (resume-safe LLM seeder)"
```

---

### Task 6: Frontend types

**Files:**
- Modify: `frontend/lib/types.ts`

- [ ] **Step 1: Add the DishOverview interface**

In `frontend/lib/types.ts`, find:

```ts
export interface AIRecognitionResult {
```

Insert directly ABOVE it:

```ts
export interface DishOverview {
  display_name: string;
  tasting: string;
  key_ingredients: string[];
  main_steps: string[];
  variant_examples: string[];
}

```

- [ ] **Step 2: Add the two fields to AIRecognitionResult**

In `frontend/lib/types.ts`, find:

```ts
  dish_recipe: DishRecipe | null;
  class_metrics: ClassMetrics | null;
}
```

Replace with:

```ts
  dish_recipe: DishRecipe | null;
  class_metrics: ClassMetrics | null;
  is_multi_variant?: boolean;
  dish_overview?: DishOverview | null;
}
```

- [ ] **Step 3: Verify typecheck**

Run (from `frontend/`): `npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/types.ts
git commit -m "feat(recognize): add DishOverview type + recognize fields"
```

---

### Task 7: DishOverviewCard component + VariantBadge

**Files:**
- Create: `frontend/components/ai/DishOverviewCard.tsx`
- Modify: `frontend/components/recipes/CanonicalBadge.tsx`

- [ ] **Step 1: Create DishOverviewCard**

Create `frontend/components/ai/DishOverviewCard.tsx`:

```tsx
"use client";

import { Sparkles, Utensils } from "lucide-react";

import { DishOverview } from "@/lib/types";

interface Props {
  overview: DishOverview;
}

export default function DishOverviewCard({ overview }: Props) {
  return (
    <section className="w-full max-w-4xl mx-auto mt-8 bg-card rounded-2xl shadow-sm border border-border p-6">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-primary" />
        <p className="text-xs text-muted-foreground uppercase tracking-wider">
          Giới thiệu món
        </p>
      </div>
      <h3 className="text-2xl font-bold text-foreground leading-tight mb-1">
        {overview.display_name}
      </h3>
      <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800 mb-4">
        Món này có nhiều biến thể — đây là giới thiệu chung. Chọn một biến thể bên dưới để xem công thức chi tiết.
      </div>

      {overview.tasting && (
        <p className="text-sm text-foreground leading-relaxed mb-5">{overview.tasting}</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
            Nguyên liệu chủ chốt
          </p>
          <ul className="space-y-1 text-sm text-foreground">
            {overview.key_ingredients.map((item, idx) => (
              <li key={idx} className="flex gap-2">
                <span className="text-primary">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
            Các bước chính
          </p>
          <ol className="space-y-2 text-sm text-foreground">
            {overview.main_steps.map((step, idx) => (
              <li key={idx} className="flex gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                  {idx + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {overview.variant_examples.length > 0 && (
        <div className="mt-5 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
            <Utensils className="w-3 h-3" /> Một số biến thể phổ biến
          </p>
          <div className="flex flex-wrap gap-2">
            {overview.variant_examples.map((v, idx) => (
              <span
                key={idx}
                className="text-xs text-foreground bg-muted px-2.5 py-1 rounded-full"
              >
                {v}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Add VariantBadge to CanonicalBadge.tsx**

In `frontend/components/recipes/CanonicalBadge.tsx`, find:

```tsx
import { Award } from "lucide-react";
```

Replace with:

```tsx
import { Award, Layers } from "lucide-react";
```

Then, at the end of the file (after the `CanonicalBadge` function), add:

```tsx

export function VariantBadge({ size = "sm" }: { size?: "sm" | "md" }) {
  const px = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";
  return (
    <span
      className={`inline-flex items-center gap-1 ${px} rounded-full bg-[#C97B16] text-white font-medium`}
    >
      <Layers className="h-3 w-3" />
      1 trong nhiều biến thể
    </span>
  );
}
```

- [ ] **Step 3: Verify typecheck + lint**

Run (from `frontend/`):
```bash
npx tsc --noEmit && node ./node_modules/eslint/bin/eslint.js components/ai/DishOverviewCard.tsx components/recipes/CanonicalBadge.tsx
```
Expected: tsc PASS; eslint prints nothing for these two files (clean).

- [ ] **Step 4: Commit**

```bash
git add frontend/components/ai/DishOverviewCard.tsx frontend/components/recipes/CanonicalBadge.tsx
git commit -m "feat(recognize): add DishOverviewCard + VariantBadge"
```

---

### Task 8: Wire overview + relabel into RecognitionResult

**Files:**
- Modify: `frontend/components/ai/RecognitionResult.tsx`

- [ ] **Step 1: Add imports**

In `frontend/components/ai/RecognitionResult.tsx`, find:

```tsx
import { CanonicalBadge } from "@/components/recipes/CanonicalBadge";
import DishRecipeCard from "./DishRecipeCard";
```

Replace with:

```tsx
import { CanonicalBadge, VariantBadge } from "@/components/recipes/CanonicalBadge";
import DishRecipeCard from "./DishRecipeCard";
import DishOverviewCard from "./DishOverviewCard";
```

- [ ] **Step 2: Render the overview card before the recipe section**

In `frontend/components/ai/RecognitionResult.tsx`, find:

```tsx
      {!isUnknown && result.canonical_recipe && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold text-foreground mb-4">
            Công thức chuẩn cho món này
          </h2>
```

Replace with:

```tsx
      {!isUnknown && result.is_multi_variant && result.dish_overview && (
        <DishOverviewCard overview={result.dish_overview} />
      )}

      {!isUnknown && result.canonical_recipe && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold text-foreground mb-4">
            {result.is_multi_variant ? "Một công thức tiêu biểu" : "Công thức chuẩn cho món này"}
          </h2>
```

- [ ] **Step 3: Relabel the badge inside the recipe card**

In the same file, find:

```tsx
              <div className="md:col-span-2 p-4">
                <CanonicalBadge />
```

Replace with:

```tsx
              <div className="md:col-span-2 p-4">
                {result.is_multi_variant ? <VariantBadge /> : <CanonicalBadge />}
```

- [ ] **Step 4: Verify typecheck + lint**

Run (from `frontend/`):
```bash
npx tsc --noEmit && node ./node_modules/eslint/bin/eslint.js components/ai/RecognitionResult.tsx
```
Expected: tsc PASS; eslint prints nothing (clean).

- [ ] **Step 5: Commit**

```bash
git add frontend/components/ai/RecognitionResult.tsx
git commit -m "feat(recognize): show overview card + relabel recipe for multi-variant dishes"
```

---

### Task 9: Manual verification

**Files:** none (manual QA).

- [ ] **Step 1: Run backend + frontend**

Backend (from `backend/`): `.venv/Scripts/uvicorn app.main:app --reload --port 8000`
Frontend (from `frontend/`): `npm run dev` → open `http://localhost:3000/recognize`.

- [ ] **Step 2: Multi-variant dish (banh-mi)**

Upload/capture a bánh mì image (or use a URL). Confirm:
- A "Giới thiệu món Bánh mì" overview card appears with the amber "Món này có nhiều biến thể..." note, tasting text, key ingredients, main steps, variant chips.
- The recipe section heading reads "Một công thức tiêu biểu" (not "Công thức chuẩn cho món này").
- The recipe card badge reads "1 trong nhiều biến thể" (orange) instead of "Công thức chuẩn".

- [ ] **Step 3: Single-variant dish (cao-lau or banh-khot)**

Upload a cao lầu / bánh khọt image. Confirm:
- NO overview card.
- Heading is "Công thức chuẩn cho món này" and the green "Công thức chuẩn" badge as before (unchanged behavior).

- [ ] **Step 4: (Optional) seed remaining overviews**

If you want overviews for the other 55 dishes, run (from `backend/`, with OPENAI_API_KEY set): `.venv/Scripts/python scripts/seed_dish_overviews.py`. Without seeding, non-seeded multi-variant dishes simply show no overview card (the recipe still relabels correctly).

- [ ] **Step 5: Final sweep**

Backend: `.venv/Scripts/python -m pytest tests/test_variant_config.py tests/test_dish_overview_service.py -v` → all PASS.
Frontend: `npx tsc --noEmit` → PASS.

---

## Self-Review

**Spec coverage:**
- Config list trigger (57 slugs) → Task 1. ✅
- `dish_overviews.json` LLM-seeded, hand-editable → Task 2 (starter) + Task 5 (seeder). ✅
- `dish_overview_service` load + get_overview, startup load → Task 2 + Task 3. ✅
- Recognize adds `is_multi_variant` + `dish_overview`, keeps canonical/dish_recipe/variants/suggested (option b) → Task 4. ✅
- Frontend type fields → Task 6. ✅
- `DishOverviewCard` (tasting + key ingredients + main steps + variant chips) → Task 7. ✅
- RecognitionResult: render overview above, relabel title to "Một công thức tiêu biểu", swap badge to "1 trong nhiều biến thể"; single-variant unchanged → Task 8. ✅
- Edge case multi-variant but no overview (not seeded) → handled: overview gated on `result.dish_overview` truthiness (Task 8 Step 2), badge/title still relabel. ✅
- No DB schema change, no runtime LLM → confirmed across tasks. ✅
- Testing: pytest for pure pieces + manual → Tasks 1,2,9. ✅

**Placeholder scan:** No TBD/TODO; all code blocks complete.

**Type consistency:** `DishOverview` fields (display_name, tasting, key_ingredients, main_steps, variant_examples) identical across Task 2 JSON, Task 5 seeder shape, Task 6 type, Task 7 component. Backend dict keys match the TS interface. `is_multi_variant`/`dish_overview` names consistent backend (Task 4) ↔ frontend (Tasks 6, 8). `VariantBadge` defined in Task 7, used in Task 8. ✅
