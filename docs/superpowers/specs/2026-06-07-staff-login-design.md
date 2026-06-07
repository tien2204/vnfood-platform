# Exclusive Staff Login — Design

> **Date:** 2026-06-07
> **Status:** Approved design — ready for implementation plan
> **Builds on:** SP5 (the `/staff` console + roles). Frontend-only.
> **Scope:** Tiny. One new page + a discreet link on the existing login. No backend, no migration, no middleware change.

---

## Goal

Give admin and collaborator a **dedicated, distinctly-branded staff login page** at `/auth/staff-login`, separate from the consumer `/auth/login`. It rejects non-staff accounts and routes staff straight into the console. The normal login keeps working for everyone (both doors open).

Today all three roles share `/auth/login` (posts `/auth/login`, saves tokens, redirects to `next` or `/`).

---

## Locked Decisions

1. **Staff page rejects non-staff; both doors stay open.** `/auth/staff-login` refuses a plain `user`; `/auth/login` is unchanged and still serves everyone (including staff).
2. **Route under `/auth/`** (`/auth/staff-login`) — `/auth/*` is already public in middleware, so an anonymous staffer can reach it. (`/staff/login` would be blocked by the `/staff`→collaborator+ gate.)
3. **Reuse the same `/auth/login` backend endpoint** — its response already carries `user.role`. No backend change.

---

## Behavior

`app/auth/staff-login/page.tsx` (client component, mirrors the existing login form):

1. Submit → `POST /auth/login` with `{ email, password }`.
2. From the response `data` (`{ access_token, refresh_token, user }`), inspect **`user.role` before persisting anything**.
3. **Staff (`role === "admin"` or `"collaborator"`):** `saveTokens(access_token, refresh_token, user)` → `refreshUser()` → toast `Chào mừng, {full_name}!` → `router.push(role === "admin" ? "/staff/dashboard" : "/staff/review")`.
4. **Non-staff (`role === "user"`):** do **not** call `saveTokens` (so no session is created) → `toast.error("Tài khoản không có quyền truy cập khu vực nhân viên")` → stay on the page.
5. **Bad credentials / other error:** `toast.error(...)` with the server message, falling back to `"Email hoặc mật khẩu không đúng"` (same pattern as the consumer login).

Because the role check happens **before** `saveTokens`, a rejected user never ends up authenticated. No `next`-param handling — the staff page always lands in the console by role.

---

## UI

- Distinct staff branding so it reads as the staff door, not the consumer one: a **shield** icon (lucide `ShieldCheck`), heading **"Đăng nhập nhân viên"**, subtitle e.g. "Khu vực cộng tác viên & quản trị", on the project palette (`#E85D26` accent, `#FFFBF5` bg) but visibly distinct from the consumer page (e.g. a darker header band / shield).
- Email + password fields + submit ("Đăng nhập"), reusing the existing `Input`/`Button` components and styles.
- **No register link** (staff accounts are admin-created via SP5).
- A small **"← Đăng nhập người dùng"** link to `/auth/login`.
- On the consumer `/auth/login`, add a **discreet "Đăng nhập nhân viên" link** to `/auth/staff-login` (small, below the register line) for discoverability.

---

## Files

- **Create:** `frontend/app/auth/staff-login/page.tsx`.
- **Modify:** `frontend/app/auth/login/page.tsx` — add the discreet staff-login link.

No backend, middleware, type, or migration changes.

---

## Edge cases

- **Already-logged-in staff visits `/auth/staff-login`** → page just shows the form; re-submitting re-logs in. Not special-cased (YAGNI).
- **A user already has a session, then is rejected on the staff page** → since we never call `saveTokens` on rejection, their *new* attempt creates nothing; any *pre-existing* session is untouched. Acceptable.
- **Token interceptor:** `lib/api` posts to `/auth/login` (an auth endpoint the 401-refresh interceptor explicitly skips), so a bad-credentials 401 surfaces normally.

---

## Testing

Frontend-only (repo convention: no FE test harness).
- `npx tsc --noEmit` clean + `npm run build` succeeds (new `/auth/staff-login` route compiles).
- Manual: (a) admin logs in via `/auth/staff-login` → lands on `/staff/dashboard`; (b) collaborator → `/staff/review`; (c) a `user` account on the staff page → "Tài khoản không có quyền…" toast, **no session** (navbar still logged-out, no token in localStorage); (d) staff can still log in via `/auth/login` normally; (e) the consumer login shows the "Đăng nhập nhân viên" link → staff page.

---

## Out of scope / YAGNI

No separate staff auth endpoint, no role lock on `/auth/login` (both doors open by decision), no "remember me", no SSO, no rate-limiting changes, no forced-staff-redirect from the consumer login.

## Notes for the plan

- Modified Next.js (`frontend/AGENTS.md`): only existing patterns. Mirror the structure of `app/auth/login/page.tsx` (same imports: `api`, `saveTokens`, `refreshUser`, `User`, `Input`, `Button`, sonner). The ONLY logic difference is the role gate before `saveTokens` and the role-based redirect.
