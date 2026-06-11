# VNFood — Batch Fixes & Role Simplification (2026-06-11)

> Scope: 5 changes requested in one session. Sizes vary widely; each section is scaled
> to its complexity. Items #2–#4 are small edits, #1 is a live debug, #5 is a refactor.

## Context

- Frontend: **Next.js 16.2.4** (App Router) + TypeScript + Tailwind. Backend: FastAPI + PostgreSQL.
- Current role model: 3 tiers — `user` / `collaborator` (CTV) / `admin` — with a staff portal,
  recipe submission pipeline, change-requests, and recipe claim/lock.
- Decisions locked with the user:
  - #2: both AI-detect **and** recipe form accept an image URL or a file.
  - #3: hero headline becomes a short intro to the thesis topic (dish recognition + recipe advice),
    NOT a "recipe archive" tagline.
  - #4: **Interpretation A** — hide the ingredient-search entry points; keep `/suggest` + backend dormant.
  - #5: **collapse to admin + user** — drop the `collaborator` tier and all CTV-only flows; admin
    handles all approval. Keep the admin role + staff portal.

---

## #1 — Login 404 (`GET /auth/login 404`)

**Status:** Debug task — fix follows live reproduction, not pre-designed.

**Cause space.** This is Next 16, which **deprecated the `middleware.ts` filename → `proxy.ts`** and
the `middleware` named export → `proxy()` (Next 16 upgrade guide). The repo still ships
`frontend/middleware.ts`. The dev log (`proxy.ts: 4ms` then a `/auth/login` 404) is consistent with
the migration gap, but a 404 on an existing page route could also be a stale `.next/dev` cache or a
route-resolution quirk.

**Approach (systematic-debugging):**
1. Reproduce with the dev server running; capture the exact failing request + server log.
2. Confirm the cause before editing. Leading hypotheses, in order:
   - Migrate middleware to Next 16 convention: rename `middleware.ts` → `proxy.ts`, rename export
     `middleware` → `proxy` (keep matcher/logic identical). Re-test.
   - If unrelated: clear `.next/dev` cache; check for route-group / trailing-slash mismatch on
     `app/auth/login/page.tsx`.
3. Verify `/auth/login` returns 200 and the login form renders before claiming fixed.

**Acceptance:** Navigating to `/auth/login` (direct + via "Đăng nhập" button) renders the login page;
middleware/proxy redirects for protected routes still work.

---

## #2 — Upload accepts image URL OR file (both surfaces)

**Files:** `components/ai/ImageDropzone.tsx` (AI nhận diện), `components/common/ImageUploader.tsx`
(recipe form image, used by `components/recipes/RecipeForm.tsx`).

**Change:** Add a **"Dán URL ảnh"** text input next to the existing drag/drop+file picker in each
component. The user provides *either* a file *or* a URL.

- **AI nhận diện:** when a URL is given, preview via `<img src={url}>` and send the URL to the
  recognize endpoint. **Backend touch:** the recognize endpoint accepts either multipart file
  (existing) or a JSON body `{ image_url }`; for a URL it fetches the image server-side, then runs the
  same inference pipeline. Validate it is an image content-type; handle fetch failure with a clear error.
- **Recipe form image:** when a URL is given, store the URL string as the recipe image. No backend
  change (the field already stores a string path/URL).

**Acceptance:** On both surfaces, submitting a valid image URL works end-to-end; file upload still
works; invalid/unfetchable URL shows a user-facing error and does not crash.

---

## #3 — Replace hero headline

**File:** `app/page.tsx`.

**Change:** Remove *"Thưởng thức công thức Việt theo phong cách nhà hàng."* Replace with a short intro
to the system's purpose, preserving the existing red-italic emphasis on key words:

> **Chụp ảnh món ăn, _AI nhận diện_ và _gợi ý công thức_ nấu ngay.**

(Wording may be tweaked during review.) The sub-paragraph, search bar, and CTA buttons stay unchanged.

**Acceptance:** Hero shows the new headline; no leftover "phong cách nhà hàng" text anywhere.

---

## #4 — Remove "search by ingredient" entry points (Interpretation A)

Ingredient search lives in `app/suggest/page.tsx` ("gợi ý món từ nguyên liệu").

**Change:** Remove the links/entry points that surface ingredient-search from the food-search
experience — navbar item, homepage, and any mobile-nav/menu reference to `/suggest`. Keep dish-name
search as the only search mode. **Leave `app/suggest/page.tsx` and its backend endpoint in place,
dormant** (no dead-code churn, easily re-enabled).

**Acceptance:** No UI path leads users to ingredient search; dish-name search is unaffected; the
`/suggest` route still exists if hit directly.

---

## #5 — Collapse roles to admin + user (drop CTV)

The largest change. Goal: a `user` submits a recipe → status `pending` → **admin** approves/rejects in
the staff portal. No collaborator tier, no claim/lock, no CTV review queue.

### Backend blast radius
- `core/roles.py` — remove `COLLABORATOR`, `ROLE_RANK[collaborator]`, its label; roles become
  `(user, admin)`.
- `core/deps.py` — remove any "collaborator or admin" dependency; admin-only where CTV was allowed.
- `api/v1/recipes.py`, `services/recipe_service.py` — remove claim/lock logic and CTV-scoped queries;
  approval is admin-only.
- `api/v1/admin.py`, `services/change_request_service.py` — admin-only; remove CTV branches.
- `api/v1/recipe_change_requests.py` — review whether change-requests stay (admin-only) or are out of
  scope; **default: keep as admin-only**, only strip CTV access.
- **DB migration (new):** remap existing `collaborator` rows → `user` (default) before/with dropping
  the role from the allowed set. Claim/lock columns (migrations 0013/0014): leave columns in place but
  stop using them (avoid a destructive drop unless requested) — flag for confirmation.

### Frontend blast radius
- `middleware.ts` (→ `proxy.ts` per #1) — `isStaff` becomes `role === "admin"` only.
- `app/staff/review/*`, `app/staff/admin-review/*` — collapse to a single admin approval queue.
- `Navbar.tsx`, `MobileBottomNav.tsx`, `lib/hooks/useUser.ts`, `app/me/recipes/page.tsx`,
  `app/auth/staff-login/page.tsx`, `lib/types.ts` — remove `collaborator` role references, CTV menu
  items, CTV-only tabs/badges.

### Approach (recommended)
Surgical removal of the `collaborator` rank and CTV-only flows, keeping `admin` + staff portal intact;
add the remap migration. Reversible, no full RBAC teardown.

**Open question for review:** drop the claim/lock DB columns (0013/0014) or leave them dormant?
Default = leave dormant.

**Acceptance:** No `collaborator` value reachable in code or new DB rows; user→pending→admin-approve
flow works; staff portal accessible to admin only; non-admin redirected away from `/staff/*`.

---

## Sequencing

1. #1 (login) — unblocks testing everything else; also does the `middleware→proxy` rename #5 depends on.
2. #3, #4 — small, independent, low risk.
3. #2 — both upload surfaces + recognize-endpoint URL support.
4. #5 — refactor last; largest surface, needs the migration + staff-portal collapse.

Each item gets its own verification before moving on.
