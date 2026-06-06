# RBAC SP4 — Variant-from-Saved (recipe remix/fork) — Design

> **Date:** 2026-06-07
> **Status:** Approved design — ready for implementation plan
> **Builds on:** SP2 (private→submit→review→approved pipeline), the saved-recipes feature, the dormant `recipes.derived_from_recipe_id` column.
> **Scope:** Small. Backend field exposure + create support + detail enrichment; frontend variant page + 2 entry buttons + 2 detail sections. **No migration.**

---

## Goal

Let any logged-in user **fork an existing recipe into a private draft** ("Tạo biến thể"): the recipe form opens pre-filled with the source's content, the user tweaks it and gives it a variant label, and saving creates a new **private** recipe owned by them, linked to the source via `derived_from_recipe_id`. The variant then flows through the normal SP2 pipeline (private → submit → collaborator → admin → community). Lineage is shown **two-way**: the variant links back to its source ("Phỏng theo …"), and a published variant appears in the source's "Biến thể từ cộng đồng" section.

This activates the dormant `derived_from_recipe_id` column. It is the last RBAC-roadmap sub-project.

---

## Locked Decisions

1. **Fork into a private draft** that flows through the SP2 pipeline (not a personal-only copy).
2. **Entry from both** `/me/saved` (saved cards) and the recipe detail page.
3. **Two-way lineage:** variant shows "Phỏng theo [source]"; source shows a "Biến thể từ cộng đồng" list of its **approved** derived variants.
4. **No migration** — `derived_from_recipe_id` + its FK (`ON DELETE SET NULL`) already exist in the DB (migration 0006).

---

## Data & Backend

### Existing column (no migration)
`recipes.derived_from_recipe_id` (UUID FK → recipes.id, `ON DELETE SET NULL`) exists in the live DB (verified). The model annotation (`backend/app/models/recipe.py`) should be aligned to `ForeignKey("recipes.id", ondelete="SET NULL")` for consistency (cosmetic — the live FK already enforces SET NULL).

### `RecipeCreate` (`backend/app/schemas/recipe.py`) — two optional fields
```python
derived_from_recipe_id: Optional[uuid.UUID] = None
variant_label: Optional[str] = Field(None, max_length=80)
```

### `create_recipe` (`backend/app/services/recipe_service.py`)
- Accept the two new fields. If `derived_from_recipe_id` is provided, validate the source exists (404 "Công thức gốc không tồn tại" otherwise).
- Set `recipe.derived_from_recipe_id` and `recipe.variant_label` on the new recipe. Everything else unchanged — it remains `source="user"`, `status="private"`, owned by the creator. No special-casing downstream; the variant is an ordinary recipe with a lineage link + label.

### `RecipeDetailOut` (`backend/app/schemas/recipe.py`) — two read fields
```python
derived_from: Optional[RecipeMiniOut] = None
derived_variants: list[RecipeMiniOut] = []
```

### `get_recipe_detail` (`backend/app/services/recipe_service.py`)
- **`derived_from`**: if `recipe.derived_from_recipe_id` is set, load that source recipe and build a `RecipeMiniOut` (id, title, variant_label, image_url). If the source is missing (was deleted → column already nulled), leave `None`.
- **`derived_variants`**: query recipes where `derived_from_recipe_id == recipe.id` **AND** `status == "approved"`, build `RecipeMiniOut[]` (cap e.g. 20, mirror the existing canonical-`variants` resolution pattern). Private/pending/rejected remixes are excluded.
- The existing canonical-slug `variants` list is unchanged.

No new endpoints — creation reuses `POST /recipes`; display reuses `GET /recipes/{id}`.

---

## Variant Creation Flow (frontend)

### Entry points
- **`/me/saved`**: each saved-recipe card gains a **"Tạo biến thể"** action → `/recipes/{id}/variant`.
- **`/recipes/[id]` detail**: a **"Tạo biến thể"** button (logged-in users) → `/recipes/{id}/variant`.

### New page `app/recipes/[id]/variant/page.tsx`
- `use(params)` to get the source id; `GET /recipes/{id}` to load the source (visible to any logged-in user when approved; non-approved sources won't normally be forked).
- Renders the existing `RecipeForm` with `initial=` the source (title/description/image_url/cooking_time/servings/difficulty/keyword/ingredients/steps) so the form is pre-filled and fully editable.
- Adds a **"Nhãn biến thể"** text input on the page (default placeholder "Phiên bản của tôi"; value held in page state).
- Uses `RecipeForm`'s existing `submitOverride` prop: the override does `POST /recipes` with the form payload **plus** `derived_from_recipe_id: <sourceId>` and `variant_label: <labelState>`. No change to `RecipeForm` itself.
- On success → toast "Đã tạo biến thể (riêng tư) — bấm Gửi duyệt để đăng" → `router.push("/me/recipes")`. The draft appears there and is managed via the normal SP2 actions (edit / Gửi duyệt / Thu hồi).
- Loading/failure states mirror the existing `propose-edit` page (a `failed` state with a back link).

---

## Detail Page Display (`app/recipes/[id]/page.tsx` + components)

- **"Phỏng theo: [source title]"** — shown near the title/meta when `derived_from` is present; links to `/recipes/{derived_from.id}`.
- **"Biến thể từ cộng đồng"** — a section listing `derived_variants` when non-empty, using the `VariantsAccordion` card-list style (or a small sibling list component); each links to its recipe. Distinct from, and rendered alongside, the existing canonical "Xem N biến thể" accordion.
- **"Tạo biến thể"** button in the detail action area (logged-in users).
- Types (`frontend/lib/types.ts`): `RecipeDetail += derived_from?: RecipeMini | null` and `derived_variants?: RecipeMini[]`. (`RecipeCreate += derived_from_recipe_id?: string; variant_label?: string` for the create payload.)

---

## Edge cases

- **Source deleted** → FK `SET NULL` nulls the variants' `derived_from_recipe_id`; `derived_from` resolves to `None`; the "Phỏng theo" link simply disappears. No breakage.
- **Variant of a variant** → stores the immediate parent only (no flattening); the chain is implicit, not displayed as a tree.
- **Forking own recipe / a canonical / a community recipe** → all allowed; `derived_from` is pure attribution/lineage.
- **`derived_variants` visibility** → only `status="approved"`, so unpublished remixes never appear on the source.

---

## Testing

No committed FE test harness (repo convention).
- **Backend** — self-cleaning smoke (`backend/_smoke_sp4.py`, deleted after): create a source recipe → `create_recipe` with `derived_from_recipe_id`+`variant_label` → assert the new recipe has them set and is `private`; `get_recipe_detail(variant)` → assert `derived_from` points to the source; set the variant `status="approved"` → `get_recipe_detail(source)` → assert `derived_variants` includes the variant; set it back to `private` → assert it is excluded; create with a bogus `derived_from_recipe_id` → assert 404. Clean up all temp rows.
- **Frontend** — `npx tsc --noEmit` clean + `npm run build` succeeds. Manual: from `/me/saved` and from a recipe detail, "Tạo biến thể" → pre-filled form + label → save → toast → appears in `/me/recipes` as private → Gửi duyệt → (review) → approved → shows under the source's "Biến thể từ cộng đồng"; the variant's detail shows "Phỏng theo".

---

## Out of scope / YAGNI

No diff/merge or "sync from source", no nested-variant tree view, no notification to the source author, no separate variant moderation queue (uses the normal SP2 pipeline), no migration.

## Notes for the plan

- Modified Next.js (`frontend/AGENTS.md`): only existing patterns. Reuse `RecipeForm` + `submitOverride` (built in SP2b), `RecipeMiniOut`, `VariantsAccordion`, and the `get_recipe_detail` variant-resolution pattern.
- Suggested task split: (1) backend `RecipeCreate` fields + `create_recipe` validation + smoke; (2) backend `RecipeDetailOut` `derived_from`/`derived_variants` + `get_recipe_detail` + smoke; (3) frontend types + `/recipes/[id]/variant` page; (4) entry buttons (saved cards + detail) + detail display sections; (5) tsc/build + manual.
