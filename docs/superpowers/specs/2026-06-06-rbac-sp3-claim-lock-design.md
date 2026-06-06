# RBAC SP3 — Claim-Lock on the Collaborator Review Queue (Design)

> **Date:** 2026-06-06
> **Status:** Approved design — ready for implementation plan
> **Builds on:** SP1 (roles), SP2 (`pending_collaborator` state + `collaborator_approve/reject` + review queue)
> **Scope:** Backend only. Reviewer UI that consumes these endpoints is **SP5** (collaborator/admin portal).

---

## Goal

Prevent two collaborators from reviewing the same `pending_collaborator` recipe at once. A collaborator explicitly **claims** a pending recipe (locks it to themselves); only the claimer may approve/reject it; other collaborators see it as claimed and are blocked. A claim can be released — by the claimer, or force-released by an admin.

This is the "simple claim-lock" model (co-review / multi-reviewer dropped during decomposition).

## Locked Decisions

- **Claim model = explicit claim first.** A collaborator clicks "Nhận xử lý" to lock the recipe. Only the claimer can approve/reject. A non-claimer who tries to approve/reject is blocked.
- **Admin bypass.** Admin (role ⊇ collaborator) can approve/reject regardless of claim, and can force-release any claim.
- **Stale claims = admin releases any.** The claimer can release their own claim; an admin can force-release anyone's. **No TTL / auto-expiry.**

---

## Data Model

Add two nullable columns to `recipes` (**migration 0014**, head is currently 0013):

| Column | Type | Notes |
|---|---|---|
| `claimed_by` | `UUID` FK → `users.id`, `ON DELETE SET NULL`, nullable | who holds the claim |
| `claimed_at` | `TIMESTAMP(timezone=True)`, nullable | when claimed (display/audit) |

A claim is only meaningful while `status = 'pending_collaborator'`. The columns are cleared (`NULL`) whenever the recipe leaves that state, so a non-null `claimed_by` always implies an active, in-queue claim.

`Recipe` model (`backend/app/models/recipe.py`) gains the two mapped columns.

---

## Service Layer (`backend/app/services/recipe_service.py`)

### New: `claim_recipe(db, recipe_id, user)`
1. Load recipe (`_get_recipe_or_404`).
2. Assert `status == 'pending_collaborator'` (`_assert_status`, else **409**).
3. If `claimed_by` is set **and** `claimed_by != user.id` **and** user is not admin → **409** "Công thức đang được cộng tác viên khác xử lý".
4. Otherwise set `claimed_by = user.id`, `claimed_at = now()`. (Re-claim by the same user is idempotent.)
5. Commit, return updated card/recipe.

### New: `release_claim(db, recipe_id, user)`
1. Load recipe.
2. If `claimed_by is None` → no-op success (idempotent) — already free.
3. Authorization: caller must be the claimer **or** an admin (`role_at_least(user.role, ADMIN)`), else **403** "Chỉ người đang xử lý hoặc admin mới được nhả".
4. Clear `claimed_by = None`, `claimed_at = None`. Commit.

### Modified: `collaborator_approve(db, recipe_id, user)` / `collaborator_reject(db, recipe_id, user, reason)`
- **Signature gains `user`** (the acting reviewer; routes already resolve it via `require_collaborator`).
- After the existing `_assert_status(recipe, ('pending_collaborator',), action)` check, add the **claim gate**:
  - If user is **admin** → bypass (may act regardless of claim).
  - Else require `claimed_by == user.id`:
    - `claimed_by is None` → **409** "Hãy nhận xử lý công thức trước khi duyệt/từ chối".
    - `claimed_by` is another user → **403** "Công thức đang được cộng tác viên khác xử lý".
- On success (state transition to `pending_admin` / `rejected`), **clear the claim** (`claimed_by = None`, `claimed_at = None`) in the same transaction.

### Modified: `withdraw_recipe(db, recipe_id, user)`
- When a recipe leaves `pending_collaborator` back to `private`, **clear the claim** too (a withdrawn recipe must not carry a stale lock). Other transitions in `withdraw_recipe` (e.g. from `rejected`) have no claim to clear — clearing a `None` claim is harmless.

### Modified: `list_review_queue(db, stage='collaborator', ...)`
- Each card surfaces who holds the claim so the SP5 UI can render "đang được X xử lý".
- Add **`claimed_by_name: str | None = None`** to the existing `RecipeCardWithStatus` schema (defaults `None`, so `/me/recipes` and other consumers are unaffected). Populate it in the collaborator-stage queue builder by resolving `claimed_by` → `users.full_name`. The admin-stage queue leaves it `None`.

---

## API Layer (`backend/app/api/v1/recipes.py`)

Add two routes (both `require_collaborator`; admin satisfies it via role hierarchy). Keep them above the `/{recipe_id}` catch-all, alongside the existing SP2 review routes:

| Method | Path | Guard | Service |
|---|---|---|---|
| `POST` | `/recipes/{recipe_id}/review/claim` | `require_collaborator` | `claim_recipe` |
| `POST` | `/recipes/{recipe_id}/review/release` | `require_collaborator` | `release_claim` (claimer-or-admin enforced in service) |

Modify the existing routes so they pass the acting user into the service (they currently inject the guard as `_`):
- `POST /recipes/{recipe_id}/review/approve` → `collaborator_approve(db, recipe_id, current_user)`
- `POST /recipes/{recipe_id}/review/reject` → `collaborator_reject(db, recipe_id, current_user, reason)`

Response shape follows the existing `{ success, data, message }` convention; `data` is the updated recipe card (with `claimed_by_name` where relevant).

---

## Error Semantics Summary

| Situation | Status | Message (vi) |
|---|---|---|
| Claim a recipe not in `pending_collaborator` | 409 | "Công thức không ở trạng thái chờ cộng tác viên" |
| Claim one already claimed by another (non-admin) | 409 | "Công thức đang được cộng tác viên khác xử lý" |
| Release when not claimer and not admin | 403 | "Chỉ người đang xử lý hoặc admin mới được nhả" |
| Approve/reject without claiming first (non-admin) | 409 | "Hãy nhận xử lý công thức trước khi duyệt/từ chối" |
| Approve/reject a recipe claimed by another (non-admin) | 403 | "Công thức đang được cộng tác viên khác xử lý" |

Admin bypasses the claim checks on claim/approve/reject and may force-release any claim.

---

## Testing (API smoke, self-cleaning)

A temporary `_smoke_sp3.py` (deleted after) exercising, against a seeded `pending_collaborator` recipe and two collaborator users + one admin:

1. Collaborator A claims → 200; recipe `claimed_by == A`.
2. Collaborator B claims same → **409**.
3. Collaborator B approves → **403** (claimed by A).
4. Collaborator A approves → 200; recipe → `pending_admin`; claim cleared (`claimed_by is None`).
5. Re-seed; A claims; A releases → claim cleared; B claims → 200 (lock transferable after release).
6. Re-seed + claim by A; **admin** force-release → 200; claim cleared.
7. Re-seed (no claim); collaborator approve-without-claim → **409**; admin approve-without-claim → 200 (bypass).
8. Re-seed + claim by A; user withdraw (owner) → recipe `private`, claim cleared.
9. `list_review_queue('collaborator')` shows `claimed_by_name` populated for a claimed card, `None` for an unclaimed one.

---

## Out of Scope (SP5)

- Reviewer UI: the "Nhận xử lý" / "Nhả" / approve / reject buttons and the review-queue screen.
- The **collaborator/admin portal** and the **role context-switcher** (Người dùng ↔ Cộng tác viên ↔ Admin workspaces, Jira/Trello-style sub-nav). SP5 will consume the SP3 claim/approve/reject/queue endpoints.
- Admin user-management and dashboards.

## Migration Note

Head before this work: **0013** (`recipe_change_request`). This adds **0014** (`recipe_claim_fields`). `down_revision = '0013'`.
