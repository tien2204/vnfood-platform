# VNFood Role Collapse (#5: drop CTV → admin + user) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `collaborator` (CTV) role and its entire review pipeline (claim/lock, collaborator approval stage), so a `user` submits a recipe → single `pending_admin` queue → **admin** approves (publish) or rejects.

**Architecture:** Collapse the two-stage state machine (`pending_collaborator` → `pending_admin`) into one (`pending_admin`). Keep the `admin` role, the staff portal, and the existing admin routes (`/review/queue/admin`, `/{id}/publish`, `/{id}/admin-reject`). Delete collaborator-only routes/services and the claim/lock logic (DB columns left dormant per spec). A data migration remaps existing `collaborator` users → `user` and `pending_collaborator` recipes → `pending_admin`.

**Tech Stack:** FastAPI + SQLAlchemy + Alembic + PostgreSQL (backend); Next.js 16 + TypeScript (frontend).

**Prerequisite:** Plan A Task 1 (rename `middleware.ts` → `proxy.ts`) should be done first; this plan edits `proxy.ts`.

**Verification model:** Backend — run the existing test suite (`cd backend && pytest`) plus manual API checks. Frontend — `npx tsc --noEmit` + manual browser checks. Commit after each task.

---

## Task 1: Roles foundation — remove `collaborator`

**Files:**
- Modify: `backend/app/core/roles.py`
- Modify: `backend/app/core/deps.py:49-52`

- [ ] **Step 1: Reduce the role set in `roles.py`**

Replace the whole body of `backend/app/core/roles.py`:
```python
"""Single source of truth for user roles + hierarchy (admin ⊇ user)."""

USER = "user"
ADMIN = "admin"

ROLES = (USER, ADMIN)  # valid role values for DB / API
ROLE_RANK = {USER: 0, ADMIN: 1}
ROLE_LABELS_VI = {USER: "Người dùng", ADMIN: "Quản trị"}


def role_at_least(role: str, minimum: str) -> bool:
    """True if `role`'s rank >= `minimum`'s rank (unknown role -> below everything)."""
    return ROLE_RANK.get(role, -1) >= ROLE_RANK[minimum]
```

- [ ] **Step 2: Delete `require_collaborator` from `deps.py`**

In `backend/app/core/deps.py`, delete the function (lines 49–52):
```python
async def require_collaborator(user: User = Depends(get_current_active_user)) -> User:
    if not roles.role_at_least(user.role, roles.COLLABORATOR):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cần quyền cộng tác viên")
    return user
```

- [ ] **Step 3: Verify no remaining `COLLABORATOR` symbol references**

Run: `cd backend && rg -n "roles\.COLLABORATOR|require_collaborator"`
Expected: only import lines / call sites in `recipes.py`, `recipe_change_requests.py`, `auth_service.py`, `recipe_service.py` — these are fixed in Tasks 2–4. Note them; do not commit yet if imports are now broken.

- [ ] **Step 4: Commit**

```bash
git add backend/app/core/roles.py backend/app/core/deps.py
git commit -m "refactor(roles): drop collaborator role from roles + deps"
```

---

## Task 2: Backend — collapse the recipe review state machine

**File:** `backend/app/services/recipe_service.py`

- [ ] **Step 1: Submit goes straight to the admin queue**

Change `submit_recipe` (line ~847):
```python
    r.status = "pending_collaborator"
```
to:
```python
    r.status = "pending_admin"
```

- [ ] **Step 2: Withdraw expects the admin-pending status**

In `withdraw_recipe` (line ~858), change:
```python
    _assert_status(r, ("pending_collaborator",), "thu hồi")
```
to:
```python
    _assert_status(r, ("pending_admin",), "thu hồi")
```

- [ ] **Step 3: Edit re-review re-enters the admin queue**

In `update_recipe`, replace the re-review block (lines ~696–709):
```python
    # Editing content that was already reviewed (published, or collaborator-approved
    # and waiting on admin) must re-enter the collaborator queue so the change is
    # re-reviewed. Editing while private/pending_collaborator/rejected keeps its status.
    needs_rereview = recipe.status in ("approved", "pending_admin")
```
keep `needs_rereview` line but update the comment, and replace the mutation block:
```python
    if needs_rereview and current_user.role != "admin":
        recipe.status = "pending_collaborator"
        recipe.reject_reason = None
        recipe.claimed_by = None  # re-enters queue fresh — no stale claim
        recipe.claimed_at = None
```
with:
```python
    if needs_rereview and current_user.role != "admin":
        recipe.status = "pending_admin"
        recipe.reject_reason = None
```

- [ ] **Step 4: Fix non-owner visibility of non-approved recipes**

Change line ~285:
```python
        if not is_owner and not roles.role_at_least(current_user.role, roles.COLLABORATOR):
```
to:
```python
        if not is_owner and not roles.role_at_least(current_user.role, roles.ADMIN):
```

- [ ] **Step 5: Delete the claim/collaborator service functions**

Delete these functions entirely from `recipe_service.py`:
- `_assert_claimer` (lines ~791–804)
- `claim_recipe` (lines ~807–822)
- `release_claim` (lines ~825–839)
- `collaborator_approve` (lines ~867–876)
- `collaborator_reject` (lines ~879–889)

Keep `admin_publish`, `admin_reject`, `submit_recipe`, `withdraw_recipe`, `approve_recipe`.

- [ ] **Step 6: Single-stage review queue**

Replace the stage map (line ~978) and simplify `list_review_queue`:
```python
_REVIEW_STAGE_STATUS = {"collaborator": "pending_collaborator", "admin": "pending_admin"}
```
to:
```python
_REVIEW_STAGE_STATUS = {"admin": "pending_admin"}
```
The function body already raises 400 for unknown stages, so callers passing `"collaborator"` will now 400 — that caller is removed in Task 3. Leave the rest of `list_review_queue` (the claimer-name lookup is harmless; `claimed_by` is always None now).

- [ ] **Step 7: Verify no collaborator references remain in this file**

Run: `cd backend && rg -n "pending_collaborator|collaborator_|_assert_claimer|claim_recipe|release_claim" app/services/recipe_service.py`
Expected: no matches.

- [ ] **Step 8: Commit**

```bash
git add backend/app/services/recipe_service.py
git commit -m "refactor(recipes): collapse two-stage review to single admin queue"
```

---

## Task 3: Backend — prune collaborator routes in `recipes.py`

**File:** `backend/app/api/v1/recipes.py`

- [ ] **Step 1: Fix the import**

Line 8:
```python
from app.core.deps import get_current_active_user, get_optional_current_user, require_collaborator, require_admin
```
→
```python
from app.core.deps import get_current_active_user, get_optional_current_user, require_admin
```

- [ ] **Step 2: Delete the collaborator queue route**

Delete `review_queue_collaborator` (lines ~144–152). Keep `review_queue_admin` (the single queue).

- [ ] **Step 3: Delete the collaborator action + claim routes**

Delete these route handlers entirely:
- `collaborator_approve_route` `@router.post("/{recipe_id}/review/approve")` (lines ~186–193)
- `collaborator_reject_route` `@router.post("/{recipe_id}/review/reject")` (lines ~196–204)
- `claim_recipe_route` `@router.post("/{recipe_id}/review/claim")` (lines ~207–219)
- `release_claim_route` `@router.post("/{recipe_id}/review/release")` (lines ~222–234)

Keep `admin_publish_route` (`/{recipe_id}/publish`) and `admin_reject_route` (`/{recipe_id}/admin-reject`).

- [ ] **Step 4: Verify and import-check**

Run: `cd backend && rg -n "require_collaborator|review/approve|review/reject|review/claim|review/release" app/api/v1/recipes.py`
Expected: no matches.
Run: `cd backend && python -c "import app.api.v1.recipes"`
Expected: imports cleanly (no ImportError for `require_collaborator`).

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/recipes.py
git commit -m "refactor(recipes): remove collaborator review + claim routes"
```

---

## Task 4: Backend — change-requests, auth portal, admin schema/validation

**Files:**
- Modify: `backend/app/api/v1/recipe_change_requests.py:7,20,31`
- Modify: `backend/app/services/auth_service.py:47`
- Modify: `backend/app/services/change_request_service.py:114`
- Modify: `backend/app/api/v1/admin.py:174,190`
- Modify: `backend/app/schemas/admin.py:11`

- [ ] **Step 1: Change-requests become admin-only**

In `backend/app/api/v1/recipe_change_requests.py`:
- Line 7: `from app.core.deps import require_collaborator, require_admin` → `from app.core.deps import require_admin`
- Lines 20 and 31: `current_user: User = Depends(require_collaborator),` → `current_user: User = Depends(require_admin),`

Read the file first to confirm there are exactly these two `require_collaborator` dependencies and no others.

- [ ] **Step 2: Staff-login portal gate uses admin**

In `backend/app/services/auth_service.py` line 47:
```python
    if portal == "consumer" and roles.role_at_least(user.role, roles.COLLABORATOR):
```
→
```python
    if portal == "consumer" and roles.role_at_least(user.role, roles.ADMIN):
```

- [ ] **Step 3: Change-request source label**

In `backend/app/services/change_request_service.py` line 114:
```python
            keyword=data.keyword, source="collaborator", status="approved",
```
→
```python
            keyword=data.keyword, source="admin", status="approved",
```

- [ ] **Step 4: Admin role validation messages**

In `backend/app/api/v1/admin.py` lines 174 and 190, update the message (validation already uses `roles.ROLES`, which now excludes collaborator):
```python
        raise HTTPException(400, detail="Role không hợp lệ (user | collaborator | admin)")
```
→ (both occurrences)
```python
        raise HTTPException(400, detail="Role không hợp lệ (user | admin)")
```

- [ ] **Step 5: Admin user-create default role**

In `backend/app/schemas/admin.py` line 11:
```python
    role: str = "collaborator"
```
→
```python
    role: str = "user"
```

- [ ] **Step 6: Verify no backend collaborator references remain (except dormant claim columns/migrations)**

Run: `cd backend && rg -n "collaborator|COLLABORATOR" app/`
Expected: only `pending_collaborator` may remain in historical alembic migration files (do NOT edit those) and the dormant `claimed_by` model column comments. No live code references.

- [ ] **Step 7: Run backend import + tests**

```bash
cd backend && python -c "import app.main" && pytest -q
```
Expected: app imports; tests pass (fix any test asserting the old collaborator flow — update them to the single admin queue).

- [ ] **Step 8: Commit**

```bash
git add backend/app/api/v1/recipe_change_requests.py backend/app/services/auth_service.py backend/app/services/change_request_service.py backend/app/api/v1/admin.py backend/app/schemas/admin.py
git commit -m "refactor(roles): make change-requests + portal gate admin-only; drop collaborator default"
```

---

## Task 5: Data migration — remap existing collaborator rows

**File:** Create a new Alembic revision under `backend/alembic/versions/`.

- [ ] **Step 1: Generate an empty revision**

```bash
cd backend && alembic revision -m "collapse_collaborator_role"
```
Note the generated filename (e.g. `00XX_collapse_collaborator_role.py`) and confirm its `down_revision` points at the current head (`alembic heads` to verify).

- [ ] **Step 2: Write the upgrade/downgrade body**

Replace the generated `upgrade()`/`downgrade()` with:
```python
from alembic import op


def upgrade() -> None:
    # Remap users: collaborator -> user (admins untouched)
    op.execute("UPDATE users SET role = 'user' WHERE role = 'collaborator'")
    # Remap recipes still in the collaborator review stage -> single admin queue
    op.execute("UPDATE recipes SET status = 'pending_admin' WHERE status = 'pending_collaborator'")
    # Clear any lingering claim locks (claim columns kept dormant, not dropped)
    op.execute("UPDATE recipes SET claimed_by = NULL, claimed_at = NULL WHERE claimed_by IS NOT NULL")


def downgrade() -> None:
    # Irreversible data remap: which users were collaborators is not recoverable.
    # No-op downgrade by design.
    pass
```

- [ ] **Step 3: Apply the migration**

```bash
cd backend && alembic upgrade head
```
Expected: runs without error.

- [ ] **Step 4: Verify no stale rows**

```bash
cd backend && python -c "import asyncio; from sqlalchemy import text; from app.core.database import engine; \
import anyio" 2>/dev/null; psql "$DATABASE_URL" -c "SELECT role, count(*) FROM users GROUP BY role; SELECT status, count(*) FROM recipes WHERE status LIKE 'pending%' GROUP BY status;"
```
(Or use any DB client.) Expected: no `collaborator` users; no `pending_collaborator` recipes.

- [ ] **Step 5: Commit**

```bash
git add backend/alembic/versions/*collapse_collaborator_role.py
git commit -m "migrate: remap collaborator users->user and pending_collaborator->pending_admin"
```

---

## Task 6: Frontend — role plumbing (types, proxy, hooks)

**Files:**
- Modify: `frontend/lib/types.ts:5,74,435,443`
- Modify: `frontend/proxy.ts:53,57-59` (renamed in Plan A)
- Modify: `frontend/lib/hooks/useUser.ts:24`
- Modify: `frontend/components/layout/ContextSwitcher.tsx:22`
- Modify: `frontend/app/staff/page.tsx:12`

- [ ] **Step 1: Narrow the role + status unions in `types.ts`**

- Lines 5, 435, 443: `role: "user" | "collaborator" | "admin";` → `role: "user" | "admin";` (all three).
- Line 74: remove the `| "pending_collaborator"` member from the recipe status union.

- [ ] **Step 2: Staff gate is admin-only in `proxy.ts`**

In `frontend/proxy.ts`, replace the staff block (lines ~52–60):
```ts
  if (STAFF_RE.test(pathname)) {
    const isStaff = payload.role === "collaborator" || payload.role === "admin";
    if (!isStaff) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    if (STAFF_ADMIN_RE.test(pathname) && payload.role !== "admin") {
      return NextResponse.redirect(new URL("/staff/review", request.url));
    }
  }
```
with:
```ts
  if (STAFF_RE.test(pathname)) {
    if (payload.role !== "admin") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }
```
Then delete the now-unused `STAFF_ADMIN_RE` constant (line 17).

- [ ] **Step 3: `useUser` staff check**

In `frontend/lib/hooks/useUser.ts` line 24:
```ts
    const wasStaff = user?.role === "admin" || user?.role === "collaborator";
```
→
```ts
    const wasStaff = user?.role === "admin";
```

- [ ] **Step 4: ContextSwitcher + staff index always go to dashboard**

`frontend/components/layout/ContextSwitcher.tsx` line 22:
```ts
  const staffHref = user.role === "admin" ? "/staff/dashboard" : "/staff/review";
```
→
```ts
  const staffHref = "/staff/dashboard";
```
`frontend/app/staff/page.tsx` line 12:
```ts
    router.replace(user?.role === "admin" ? "/staff/dashboard" : "/staff/review");
```
→
```ts
    router.replace("/staff/dashboard");
```

- [ ] **Step 5: Typecheck (expect downstream errors to fix in Tasks 7–8)**

Run: `cd frontend && npx tsc --noEmit`
Note any errors referencing `"collaborator"` / `pending_collaborator`; they are addressed in Tasks 7–8.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/types.ts frontend/proxy.ts frontend/lib/hooks/useUser.ts frontend/components/layout/ContextSwitcher.tsx frontend/app/staff/page.tsx
git commit -m "refactor(roles): admin-only staff gate + narrow role/status types"
```

---

## Task 7: Frontend — collapse the staff review portal

**Context:** Two queue pages exist: `/staff/review` (collaborator queue, KEY `/recipes/review/queue/collaborator`) and `/staff/admin-review` (pending_admin "chờ đăng"). Collapse to a single admin queue at `/staff/review` backed by `/recipes/review/queue/admin`. The detail page `/staff/review/[id]` must offer publish/reject for `pending_admin` only.

**Files:**
- Modify: `frontend/app/staff/review/page.tsx`
- Modify: `frontend/app/staff/review/[id]/page.tsx`
- Modify: `frontend/components/staff/StaffLayout.tsx`
- Modify: `frontend/app/staff/admin-review/page.tsx`

- [ ] **Step 1: Point the review queue at the admin endpoint**

In `frontend/app/staff/review/page.tsx`, change the SWR key (line ~10):
```ts
const KEY = "/recipes/review/queue/collaborator?page=1&limit=50";
```
→
```ts
const KEY = "/recipes/review/queue/admin?page=1&limit=50";
```
Read the rest of the page; if any heading text says "chờ CTV"/"cộng tác viên", reword to "Hàng đợi duyệt".

- [ ] **Step 2: Single-stage actions on the detail page**

Read `frontend/app/staff/review/[id]/page.tsx`. It currently branches on `pending_collaborator` (approve → "chuyển chờ admin") and `pending_admin` (publish/reject). Collapse so that for `status === "pending_admin"` the admin sees **Đăng** (calls `act("publish", {}, "Đã đăng", "/staff/review")`) and **Từ chối** (calls the admin-reject endpoint `act("admin-reject", { reason }, "Đã từ chối", "/staff/review")`). Remove the `pending_collaborator` branch and the "Duyệt → chờ admin" button entirely. Confirm the reject action posts to `/recipes/{id}/admin-reject` (matching the backend route).

- [ ] **Step 3: Merge the queue nav in StaffLayout**

In `frontend/components/staff/StaffLayout.tsx`, the nav has both:
```ts
  { href: "/staff/review", label: "Hàng đợi duyệt", icon: Inbox },
  ...
  { href: "/staff/admin-review", label: "Chờ đăng", icon: ClipboardCheck },
```
Remove the `/staff/admin-review` entry (one queue now). Keep `/staff/review` labelled "Hàng đợi duyệt". Keep "Duyệt đề xuất" (`/staff/change-requests`).

- [ ] **Step 4: Redirect the old admin-review route**

Replace the body of `frontend/app/staff/admin-review/page.tsx` so it redirects to the unified queue (avoids a dead link if bookmarked):
```tsx
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminReviewRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/staff/review"); }, [router]);
  return null;
}
```

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors in these files.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/staff/review/page.tsx "frontend/app/staff/review/[id]/page.tsx" frontend/components/staff/StaffLayout.tsx frontend/app/staff/admin-review/page.tsx
git commit -m "refactor(staff): single admin review queue (drop collaborator stage)"
```

---

## Task 8: Frontend — remaining collaborator references

**Files:**
- `frontend/components/layout/Navbar.tsx:218`
- `frontend/components/recipes/RecipeDetailClient.tsx:193`
- `frontend/app/auth/login/page.tsx:34`
- `frontend/app/auth/staff-login/page.tsx:32,40`
- `frontend/app/staff/users/new/page.tsx:19,52,76`
- `frontend/app/staff/users/page.tsx:16`, `frontend/app/staff/users/[id]/page.tsx:26`
- `frontend/app/me/recipes/page.tsx:20,210`
- `frontend/components/recipes/StatusBadge.tsx:10`

- [ ] **Step 1: Gate admin-only menu/actions**

`Navbar.tsx` line 218: `{(user.role === "collaborator" || user.role === "admin") && (` → `{user.role === "admin" && (`
`RecipeDetailClient.tsx` line 193: `{(userRole === "collaborator" || userRole === "admin") && (` → `{userRole === "admin" && (`

- [ ] **Step 2: Login redirects**

`app/auth/login/page.tsx` line 34: `if (user.role === "admin" || user.role === "collaborator") {` → `if (user.role === "admin") {`
`app/auth/staff-login/page.tsx`:
- line 32: `if (user.role !== "admin" && user.role !== "collaborator") {` → `if (user.role !== "admin") {`
- line 40: `router.push(user.role === "admin" ? "/staff/dashboard" : "/staff/review");` → `router.push("/staff/dashboard");`

- [ ] **Step 3: Remove the collaborator option in the user-create form**

`app/staff/users/new/page.tsx`:
- line 19: `useState<"user" | "collaborator" | "admin">("collaborator")` → `useState<"user" | "admin">("user")`
- line 52: reset `setRole("collaborator")` → `setRole("user")`
- line 76: delete the `<option value="collaborator">Cộng tác viên</option>` line.

- [ ] **Step 4: Narrow remaining role type literals**

`app/staff/users/page.tsx` line 16 and `app/staff/users/[id]/page.tsx` line 26: `role: "user" | "collaborator" | "admin";` → `role: "user" | "admin";`
If either page renders a role label/badge for `collaborator`, remove that branch.

- [ ] **Step 5: Clean up status references in "my recipes" + badge**

`app/me/recipes/page.tsx`:
- line 20: remove `"pending_collaborator"` from the `TabValue` union.
- line ~210: the `recipe.status === "pending_collaborator"` branch — replace with `pending_admin` (or remove if a `pending_admin` branch already renders the "đang chờ duyệt" state). Read the surrounding tab logic first.
`components/recipes/StatusBadge.tsx` line 10: remove the `pending_collaborator` entry from the status→label map (no rows use it after the migration).

- [ ] **Step 6: Final grep — no live collaborator references**

Run: `cd frontend && rg -n "collaborator|pending_collaborator"`
Expected: no matches in `app/`, `components/`, `lib/`. (Build artifacts under `.next/` don't count.)

- [ ] **Step 7: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add frontend/components/layout/Navbar.tsx frontend/components/recipes/RecipeDetailClient.tsx frontend/app/auth/login/page.tsx frontend/app/auth/staff-login/page.tsx frontend/app/staff/users/new/page.tsx frontend/app/staff/users/page.tsx "frontend/app/staff/users/[id]/page.tsx" frontend/app/me/recipes/page.tsx frontend/components/recipes/StatusBadge.tsx
git commit -m "refactor(roles): remove remaining collaborator references in frontend"
```

---

## Task 9: End-to-end verification

- [ ] **Step 1: Backend up, run the flow**

Start backend + frontend. As a normal `user`:
- Create a recipe, submit it → status becomes `pending_admin`.
As an `admin`:
- `/staff/review` shows the submitted recipe in the single queue.
- Open it → **Đăng** publishes (status `approved`, visible publicly); **Từ chối** rejects with a reason.
- `/staff/admin-review` redirects to `/staff/review`.
- Non-admin visiting `/staff/...` is redirected to `/`.

- [ ] **Step 2: Confirm no dead endpoints are called**

In the browser devtools network tab during the staff flow, confirm no request hits `/recipes/review/queue/collaborator`, `/review/approve`, `/review/claim`, or `/review/release` (all removed).

- [ ] **Step 3: Final full grep (both sides)**

Run: `rg -n "collaborator|COLLABORATOR|pending_collaborator" backend/app frontend/app frontend/components frontend/lib`
Expected: no matches except dormant model-column comments / historical alembic migrations.

---

## Self-Review Notes

- **Spec coverage:** roles.py/deps (Task 1), state machine (Task 2), routes (Task 3), change-requests/portal/admin schema (Task 4), data migration (Task 5), frontend plumbing (Task 6), staff portal collapse (Task 7), remaining refs (Task 8), E2E (Task 9). Claim/lock DB columns are **left dormant** (not dropped) per the approved spec default.
- **State consistency:** new single pending status is `pending_admin` everywhere (submit, withdraw, edit re-review, queue, publish/reject). `pending_collaborator` removed from backend live code, frontend types, badges, and existing rows (migration).
- **Routes consistency:** frontend review queue → `/recipes/review/queue/admin`; detail actions → `/recipes/{id}/publish` and `/recipes/{id}/admin-reject` — all confirmed present in `backend/app/api/v1/recipes.py`.
- **Open default honored:** change-requests kept, admin-only (Task 4 Step 1).
