# MNMN recipe video (YouTube) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Capture each monngonmoingay recipe's YouTube tutorial video (from JSON-LD `Recipe.video.contentUrl`), store it on the recipe, and embed a YouTube player on the recipe detail page.

**Architecture:** Extend the MNMN pipeline + add a frontend embed. `crawl_mnmn` pulls `video_url` from JSON-LD; a new nullable `recipes.video_url` column carries it through import → canonicalize; `RecipeDetailOut` exposes it; a `RecipeVideo` client component renders a responsive YouTube iframe when present.

**Tech Stack:** Python (httpx/SQLAlchemy/Alembic), Next.js 16 client component.

**Branch:** `feat/canonical-recipes`. Backend cmds from `backend/`: `$env:PYTHONUTF8=1; .venv\Scripts\python.exe ...`. Frontend from `frontend/`. Verified facts: MNMN `Recipe.video.contentUrl` is a `https://www.youtube.com/watch?v=...` URL (both sample pages). Only the script `.py`/migration/model/schema/frontend files are committed — never `cookpad_recipe/*.json`.

---

### Task 1: crawl_mnmn — extract `video_url` (do first, before the full crawl)

**Files:** Modify `backend/scripts/crawl_mnmn.py`

- [ ] **Step 1: Add a `parse_video` helper** after the existing `parse_image` function:

```python
def parse_video(node):
    v = node.get("video")
    if isinstance(v, list):
        v = v[0] if v else None
    if isinstance(v, dict):
        return v.get("contentUrl") or v.get("embedUrl")
    if isinstance(v, str):
        return v
    return None
```

- [ ] **Step 2: Add `video_url` to the record** in `scrape()`. Change the returned dict from:

```python
        return {
            "name": (name or "").strip(),
            "url": url,
            "ingredients_display": ings,
            "instructions": parse_steps(node),
            "image_url": parse_image(node),
            "description": (node.get("description") or "")[:2000],
            "src": "monngonmoingay",
        }
```

to:

```python
        return {
            "name": (name or "").strip(),
            "url": url,
            "ingredients_display": ings,
            "instructions": parse_steps(node),
            "image_url": parse_image(node),
            "video_url": parse_video(node),
            "description": (node.get("description") or "")[:2000],
            "src": "monngonmoingay",
        }
```

- [ ] **Step 3: Verify (real network, from `backend/`)**

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -c "import httpx, scripts.crawl_mnmn as m; c=httpx.Client(headers={'User-Agent':m.UA}, follow_redirects=True); [print(u.split('/')[-2], '->', (m.scrape(c,u) or {}).get('video_url')) for u in ['https://monngonmoingay.com/banh-khot-la-cam-nhan-nam-hat-sen/','https://monngonmoingay.com/ba-chi-chien-gion-mam-thom/']]"
```

Expected: each line prints a `https://www.youtube.com/watch?v=...` URL.

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/crawl_mnmn.py
git commit -m "feat(video): crawl_mnmn captures recipe video_url (YouTube)"
```

---

### Task 2: `video_url` column (migration 0010 + model)

**Files:** Create `backend/alembic/versions/0010_recipe_video_url.py`; Modify `backend/app/models/recipe.py`

- [ ] **Step 1: Create the migration**

```python
"""recipes.video_url (YouTube tutorial URL, mainly monngonmoingay)

Revision ID: 0010
Revises: 0009
Create Date: 2026-06-03
"""
from alembic import op
import sqlalchemy as sa


revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("recipes", sa.Column("video_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("recipes", "video_url")
```

- [ ] **Step 2: Add the model field** in `backend/app/models/recipe.py`, immediately after the `meal_types` line:

```python
    video_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
```

(`String` is already imported.)

- [ ] **Step 3: Apply + verify (from `backend/`)**

```bash
$env:PYTHONUTF8=1; .venv\Scripts\alembic.exe upgrade head
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -c "from app.models.recipe import Recipe; print('video_url' in Recipe.__table__.columns)"
```

Expected: `Running upgrade 0009 -> 0010`; prints `True`.

- [ ] **Step 4: Commit**

```bash
git add backend/alembic/versions/0010_recipe_video_url.py backend/app/models/recipe.py
git commit -m "feat(video): recipes.video_url column"
```

---

### Task 3: Carry `video_url` through import + canonicalize

**Files:** Modify `backend/scripts/import_mnmn.py`, `backend/scripts/canonicalize_mnmn.py`

- [ ] **Step 1: import_mnmn** — in the `db.add(Recipe(...))` call, add `video_url=rec.get("video_url"),` alongside `image_url=...`:

```python
                image_url=rec.get("image_url") or None,
                video_url=rec.get("video_url"),
                is_canonical=False,
```

- [ ] **Step 2: canonicalize_mnmn** — in the `db.add(Recipe(...))` for the new canonical, add `video_url=winner.video_url,` alongside `image_url=winner.image_url,`:

```python
                    image_url=winner.image_url,
                    video_url=winner.video_url,
                    keyword=winner.keyword,
```

- [ ] **Step 3: Verify both import cleanly (from `backend/`)**

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -c "import scripts.import_mnmn, scripts.canonicalize_mnmn; print('ok')"
```

Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/import_mnmn.py backend/scripts/canonicalize_mnmn.py
git commit -m "feat(video): carry video_url through import + canonicalize"
```

---

### Task 4: Expose `video_url` on `RecipeDetailOut`

**Files:** Modify `backend/app/schemas/recipe.py`, `backend/app/services/recipe_service.py`

- [ ] **Step 1: Schema** — in `RecipeDetailOut`, next to the `meal_types` field, add:

```python
    video_url: str | None = None
```

- [ ] **Step 2: Builder** — in `recipe_service.py` where `RecipeDetailOut(...)` is built (same place `meal_types=recipe.meal_types` was added), add `video_url=recipe.video_url,`.

- [ ] **Step 3: Verify (from `backend/`)**

```bash
$env:PYTHONUTF8=1; .venv\Scripts\python.exe -c "from app.schemas.recipe import RecipeDetailOut; import app.services.recipe_service; print('video_url' in RecipeDetailOut.model_fields)"
```

Expected: `True`.

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas/recipe.py backend/app/services/recipe_service.py
git commit -m "feat(video): expose video_url on RecipeDetailOut"
```

---

### Task 5: Frontend — `RecipeVideo` component + embed on detail page

**Files:** Create `frontend/components/recipes/RecipeVideo.tsx`; Modify `frontend/lib/types.ts`; Modify `frontend/components/recipes/RecipeDetailClient.tsx`

- [ ] **Step 1: Add `video_url` to the `RecipeDetail` type**

In `frontend/lib/types.ts`, find the `RecipeDetail` interface/type and add (next to other optional fields):

```typescript
  video_url?: string | null;
```

- [ ] **Step 2: Create `frontend/components/recipes/RecipeVideo.tsx`**

```tsx
"use client";

/** Extract the YouTube video id from a watch / youtu.be / embed URL. */
function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1) || null;
    if (u.pathname.startsWith("/embed/")) return u.pathname.split("/")[2] || null;
    return u.searchParams.get("v");
  } catch {
    return null;
  }
}

export function RecipeVideo({ url }: { url?: string | null }) {
  if (!url) return null;
  const id = youtubeId(url);
  if (!id) return null;
  return (
    <section className="my-6">
      <h2
        className="text-lg font-bold text-[#2D2417] mb-3"
        style={{ fontFamily: "var(--font-playfair)" }}
      >
        Video hướng dẫn
      </h2>
      <div className="relative w-full overflow-hidden rounded-xl border border-[#E8DDD4]" style={{ paddingBottom: "56.25%" }}>
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube.com/embed/${id}`}
          title="Video hướng dẫn nấu ăn"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
        />
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Render it on the detail page**

In `frontend/components/recipes/RecipeDetailClient.tsx`: add the import `import { RecipeVideo } from "./RecipeVideo";` near the other component imports, then render `<RecipeVideo url={recipe.video_url} />` at a sensible visible spot in the main content column — e.g. immediately after the recipe description / before the ingredients-and-steps section. It renders nothing when `video_url` is absent, so placement is safe for all recipes. Use the existing `recipe` prop variable name.

- [ ] **Step 4: Typecheck (from `frontend/`)**

```bash
npx tsc --noEmit
```

Expected: no NEW errors (only the 3 known pre-existing files `app/admin/page.tsx`, `app/me/profile/page.tsx`, `app/recognize/page.tsx`).

- [ ] **Step 5: Commit**

```bash
git add frontend/components/recipes/RecipeVideo.tsx frontend/lib/types.ts frontend/components/recipes/RecipeDetailClient.tsx
git commit -m "feat(video): embed YouTube tutorial on recipe detail page"
```

---

## Self-Review

**Spec coverage:** crawl extracts video_url (T1); column+model (T2); carried through import+canonicalize (T3); exposed on detail schema (T4); frontend embed + type (T5). ✓
**Placeholders:** all code shown; verification commands concrete. T5 Step 3 leaves exact placement to the implementer (renders null when absent → safe anywhere) — acceptable, not a code placeholder.
**Type consistency:** `video_url` String(500) nullable across migration/model/import/canonicalize; `video_url: str | None`/`video_url?: string | null` across schema + TS type; record key `video_url` written by crawl_mnmn and read by import_mnmn. `Recipe.video.contentUrl` shape verified live. ✓
