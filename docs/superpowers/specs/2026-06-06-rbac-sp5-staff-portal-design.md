# RBAC SP5 — Staff Portal (collaborator/admin console + role switcher) — Design

> **Date:** 2026-06-06
> **Status:** Approved design — ready for implementation plan
> **Builds on:** SP1 (roles), SP2 (2-stage pipeline + review queues), SP2b (change-requests), SP3 (claim-lock)
> **Scope:** Mostly frontend (the portal UI wiring onto existing endpoints) + a small backend surface (queue/CR field exposure + admin account CRUD).

---

## Goal

A unified **staff console** at `/staff/*` (gated `collaborator+`) that turns the SP2/SP2b/SP3 backend into a usable, "big-tech"-style workspace: collaborators triage and review the submission queue with claim-lock; admins additionally publish (stage 2), review change-requests, manage all accounts, and see dashboards. A **context-switcher widget** lets a staff user flip between the consumer site ("Người dùng") and their staff console. Admins get **full account lifecycle** over users and collaborators (create with generated temp password, edit, reset password, ban, role, delete).

This is the consumer of SP2/SP2b/SP3 endpoints — the reviewer/admin UI those sub-projects deferred.

---

## Locked Decisions

1. **Unified staff console** at `/staff/*`, gated `collaborator+`, with **role-filtered** sidebar (one console, role-scoped — not two shells).
2. **Move** the 5 existing admin pages from `/admin/*` to `/staff/*`; `/admin*` redirects to `/staff*`.
3. **Review flow:** queue list does triage + inline claim/release/lock-badge; **approve/reject happen on a dedicated review-detail page**.
4. **Context-switcher = a dedicated widget** (icon + current-context + dropdown) in the consumer Navbar and the console header. **Admin gets a 2-entry switcher** (Người dùng ↔ Quản trị); collaborator 2-entry (Người dùng ↔ Cộng tác viên); plain user → not rendered.
5. **Admin account CRUD** with a **generated temp password** (shown once, copyable; shared out-of-band — no email infra), a reset-password action (regenerates temp pw, shown once), edit (full_name/email), ban/unban, role change, and hard-delete — all with **self-guards**.

---

## Architecture & Routing

### Console shell
- `components/admin/AdminLayout.tsx` → **`components/staff/StaffLayout.tsx`**, made **role-aware**: the sidebar `NAV_ITEMS` is filtered by the current user's role. Sidebar title shows **"Cộng tác viên"** for collaborator, **"Quản trị"** for admin. Keep the existing look (sidebar + mobile drawer + logout + "Về trang người dùng" footer link).
- `app/staff/layout.tsx` renders `StaffLayout`.
- `ConditionalLayout` hides the consumer Navbar/Footer/MobileBottomNav on `/staff` (same rule it uses today for `/admin`).

### Pages under `/staff`
| Path | Gate | Source |
|---|---|---|
| `/staff` (index) | collaborator+ | redirect by role: collaborator→`/staff/review`, admin→`/staff/dashboard` |
| `/staff/review` | collaborator+ | **new** — collaborator review queue (pending_collaborator) |
| `/staff/review/[id]` | collaborator+ | **new** — unified review-detail (both stages, action bar by status×role) |
| `/staff/proposals` | collaborator+ | **new** — "Đề xuất của tôi" (reuses the existing change-request list) |
| `/staff/admin-review` | admin | **new** — stage-2 publish queue (pending_admin) |
| `/staff/change-requests` | admin | **new** — CR review queue |
| `/staff/dashboard` | admin | moved from `/admin` (stats + charts) |
| `/staff/users` + `/staff/users/[id]` | admin | moved from `/admin/users` + extended (CRUD) |
| `/staff/users/new` | admin | **new** — create account form |
| `/staff/recipes` | admin | moved from `/admin/recipes` (moderation) |
| `/staff/comments` | admin | moved from `/admin/comments` |
| `/staff/ingredients` | admin | moved from `/admin/ingredients` |

`/me/change-requests` and the propose-new/propose-edit success redirects now point to `/staff/proposals`.

### Sidebar nav (role-filtered)
- **collaborator section** (always): Hàng đợi duyệt (`/staff/review`), Đề xuất của tôi (`/staff/proposals`).
- **admin section** (role=admin only): Tổng quan (`/staff/dashboard`), Chờ đăng (`/staff/admin-review`), Duyệt đề xuất (`/staff/change-requests`), Người dùng (`/staff/users`), Công thức (`/staff/recipes`), Bình luận (`/staff/comments`), Nguyên liệu (`/staff/ingredients`).

### Middleware (`middleware.ts`)
- `STAFF_RE = /^\/staff(\/.*)?$/` → require a valid token whose `role ∈ {collaborator, admin}`; else redirect (anonymous → `/auth/login?next=…`, logged-in non-staff → `/`).
- **Admin-only subtree** — `/staff/dashboard`, `/staff/users`, `/staff/recipes`, `/staff/comments`, `/staff/ingredients`, `/staff/admin-review`, `/staff/change-requests` → require `role === "admin"`; a collaborator hitting these → redirect to `/staff/review`.
- **Collaborator+ subtree** — `/staff/review`, `/staff/review/[id]`, `/staff/proposals` → both roles.
- `/admin*` → redirect to the corresponding `/staff*` path.
- The existing `ADMIN_RE` block is replaced by the above.

---

## Context-switcher widget

`components/layout/ContextSwitcher.tsx` (client; `useUser` + `usePathname`). Current context is derived from the path (`/staff/*` → staff; else → "Người dùng"). Rendered in the consumer **Navbar** (near the avatar) and in the **StaffLayout** header.

Entries by role:
- **user** → component renders nothing.
- **collaborator** → **Người dùng** (`/`) · **Cộng tác viên** (`/staff/review`).
- **admin** → **Người dùng** (`/`) · **Quản trị** (`/staff/dashboard`).

Current context is checked. Switching just routes; no persisted state.

---

## Collaborator review screens

### `/staff/review` — review queue
- SWR `GET /api/v1/recipes/review/queue/collaborator?page&limit` → `RecipeCardWithStatus[]` (now incl. `claimed_by` + `claimed_by_name`).
- Per card, claim state (compare `claimed_by` to current user id from JWT `sub`):
  - **unclaimed** (`claimed_by == null`) → `[Nhận xử lý]` → `POST /recipes/{id}/review/claim` → refetch.
  - **claimed by me** → `[Mở duyệt]` (→ `/staff/review/{id}`) + `[Nhả]` → `POST /recipes/{id}/review/release` → refetch.
  - **claimed by other** (collaborator) → 🔒 disabled badge "{claimed_by_name} đang xử lý".
  - **admin** viewing → never blocked: may `[Mở duyệt]` any and `[Nhả]` (force-release) any.
- FIFO pagination; empty state "Không có công thức chờ duyệt".
- Errors: claim 409 (already claimed) / 403 → toast server message + refetch (state changed under them).

### `/staff/review/[id]` — review detail (unified, both stages)
- SWR `GET /api/v1/recipes/{id}` (visible to collaborator+ per SP2). Render **read-only** content: title, image, meta (time/servings/difficulty), description, ingredients, steps. Reuse/extract the existing recipe-detail content rendering into a shared read-only `RecipeContent` component (used by this page and the consumer detail page).
- Action bar (sticky), chosen by `status × role`:
  - `pending_collaborator`:
    - not claimed → `[Nhận xử lý]`.
    - claimed by me OR admin → `[Duyệt]` (`POST /review/approve`) · `[Từ chối]` (reason modal → `POST /review/reject`) · `[Nhả]`.
    - claimed by other (collaborator) → disabled "đang được {name} xử lý".
  - `pending_admin` + role admin → `[Đăng]` (`POST /recipes/{id}/publish`) · `[Từ chối]` (reason → `POST /recipes/{id}/admin-reject`).
  - any other status, or non-permitted role → read-only notice "Không còn trong hàng đợi" + back link.
- On success: toast + navigate back to the originating queue.
- All 409 (wrong status / claim) and 403 surfaced via toast; the page refetches so the bar reflects reality.

---

## Admin screens

### `/staff/admin-review` — stage-2 publish queue
- SWR `GET /api/v1/recipes/review/queue/admin` (pending_admin) → cards → `[Mở]` into `/staff/review/{id}` (which shows the admin publish/reject bar for `pending_admin`).

### `/staff/change-requests` — CR review queue
- SWR `GET /api/v1/recipe-change-requests?page&limit` (admin pending queue) → `ChangeRequest[]` (now incl. `payload`).
- Each CR card: type (create/edit/delete), `requested_by_name`, `target_title` (edit/delete), `created_at`.
- Detail/expand renders the **proposed content** from `payload` for create/edit (title, ingredients, steps); edit/delete additionally link to the current target recipe (`/recipes/{target_recipe_id}`).
- Actions: `[Duyệt]` → `POST /recipe-change-requests/{id}/approve` (applies the change) → toast; `[Từ chối]` → reason → `POST /recipe-change-requests/{id}/reject`.
- The AI-class delete-guard (409 from approve on a sole canonical) surfaces as a toast.

### `/staff/users` — full account CRUD (moved + extended)
- **List** (moved from `/admin/users`) + filters (search/role/is_active/sort) + **`[Tạo tài khoản]`** → `/staff/users/new`.
- **`/staff/users/new`** — form: `email`, `full_name`, `role` select (default **collaborator**; options user/collaborator/admin). **No password field.** Submit → `POST /api/v1/admin/users` → response `{ user, temp_password }` → success panel shows the **temp password once** (copyable) + link to the new account.
- **`/staff/users/[id]`** (moved + extended): existing detail + role-select + ban/unban, **plus**:
  - **Sửa** (full_name / email) → `PATCH /api/v1/admin/users/{id}`.
  - **Đặt lại mật khẩu** → `POST /api/v1/admin/users/{id}/reset-password` → `{ temp_password }` shown once.
  - **Xóa tài khoản** → `DELETE /api/v1/admin/users/{id}` (confirm dialog) → toast + back to list.
- **Self-guards:** the UI hides delete/ban/role/edit-role-of-self; the backend rejects them (400). (Editing one's own full_name/email is allowed.)

### Relocated unchanged
`/staff/dashboard` (stats + charts), `/staff/recipes` (moderation: list by status, status-update, delete, manual-review), `/staff/comments`, `/staff/ingredients` — same behavior, new paths, same endpoints.

---

## Backend additions (the entire backend surface of SP5)

1. **`RecipeCardWithStatus += claimed_by: str | None`** (`backend/app/schemas/recipe.py`) — and `_build_recipe_card_with_status` / `list_review_queue` populate it (id as string). Existing `claimed_by_name` stays.
2. **`ChangeRequestOut += payload: dict | None`** (`backend/app/schemas/change_request.py`) — `change_request_service._to_out` includes `cr.payload`.
3. **Admin account CRUD** (`backend/app/api/v1/admin.py` + `backend/app/services/admin_service.py`):
   - `POST /admin/users` — body `{email, full_name, role}`; validate `role ∈ roles.ROLES`, email-unique (409); generate temp password via `generate_temp_password()`, hash with auth's `get_password_hash`, create user; return `{ user, temp_password }`.
   - `POST /admin/users/{id}/reset-password` — regenerate temp pw, set hash; return `{ temp_password }`. 404 if missing.
   - `PATCH /admin/users/{id}` — body `{full_name?, email?}`; email-unique (409) if changed; 404 if missing.
   - `DELETE /admin/users/{id}` — hard-delete; **400 if `id == current_admin.id`** (self). 404 if missing. (Recipes survive via `author_id ON DELETE SET NULL`; saved/follows/meal-plans cascade.)
   - `generate_temp_password()` — 12+ char URL-safe via `secrets.token_urlsafe`.
   - Self-guards already exist on `update_user_status` / `update_user_role`; mirror the self-check on delete.

No new migrations. No changes to SP2/SP2b/SP3 service logic beyond field exposure.

---

## Types (`frontend/lib/types.ts`)

- `RecipeCardWithStatus += claimed_by: string | null`.
- `ChangeRequest += payload: RecipeCreate | null`.
- `AdminUserCreate { email: string; full_name: string; role: "user"|"collaborator"|"admin" }`.
- `CreatedUserResponse { user: AdminUser; temp_password: string }` (or reuse the existing admin user shape).
- `ResetPasswordResponse { temp_password: string }`.
- `AdminUserUpdate { full_name?: string; email?: string }`.

---

## Data flow, errors, reuse

- All screens use the existing `lib/api` client + SWR; mutations call `api.post/patch/delete` then refetch (`mutate`). Follow the patterns already in the moved admin pages.
- Errors: surface the server's `error.message` / `detail` via `sonner` toast; refetch lists after a mutation so claim/queue state is fresh.
- Reuse: the consumer recipe-detail content rendering is extracted into a shared read-only `RecipeContent` so the review-detail page and the consumer page share it. The change-request list component is reused by `/staff/proposals`. `useUser` supplies role + id.

---

## Verification

No committed FE test harness (repo convention).
- **Backend:** a self-cleaning smoke (`backend/_smoke_sp5.py`, deleted after) — create account (assert `temp_password` returned + login works with it) → edit full_name/email → reset-password (login with new) → role change → ban → delete (assert gone) → self-delete blocked (400); assert CR queue output includes `payload`; assert collaborator queue card includes `claimed_by`. Cleans up all temp rows.
- **Frontend:** `npx tsc --noEmit` and `npm run build` must pass. Manual per-role click-through:
  - **collaborator:** switch → `/staff/review` → claim → open → approve; release path; locked-by-other badge.
  - **admin:** `/staff/admin-review` → publish; `/staff/change-requests` → approve/reject (+ AI-class delete guard); `/staff/users` → create (temp pw shown) → edit → reset → ban → delete; switcher both ways; `/admin` redirects to `/staff`.

---

## Out of scope / YAGNI

No realtime queue updates (manual refetch), no email/invite flow, no forced password reset on first login, no audit log, no co-review (SP3 dropped it), no persisted switcher state, no diff view for CR edits (show proposed payload + link to current). **SP4 (variant-from-saved)** remains a separate sub-project.

## Notes for the plan

- This is the modified Next.js (`frontend/AGENTS.md`): use only existing patterns already in the codebase — no new Next.js APIs. Moving `app/admin/*` → `app/staff/*` must update all internal `Link`/`router.push` references and the `ConditionalLayout` prefix check.
- The console is large; the implementation plan should decompose into tasks roughly: (1) backend field exposure + smoke, (2) admin account CRUD backend + smoke, (3) StaffLayout + routing move + middleware + redirects, (4) ContextSwitcher, (5) collaborator review queue + detail + shared RecipeContent, (6) admin-review + CR-review pages, (7) account-CRUD UI, (8) typecheck/build + manual checklist.
