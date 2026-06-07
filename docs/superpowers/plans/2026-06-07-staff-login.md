# Exclusive Staff Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated `/auth/staff-login` page that rejects non-staff and routes staff into the console, leaving the normal login open to everyone.

**Architecture:** Frontend-only. A new client page mirrors the existing login form but inspects `user.role` from the `/auth/login` response **before** persisting tokens — staff get a session + console redirect, a plain `user` is rejected with no session. A discreet cross-link is added to the consumer login.

**Tech Stack:** Next.js (modified — `frontend/AGENTS.md`: only existing patterns), axios (`lib/api`), sonner, lucide-react. No backend/middleware/type/migration changes.

**Prerequisites:** Branch `feat/canonical-recipes`.

**Reference facts (verified):**
- `app/auth/login/page.tsx` posts `api.post("/auth/login", { email, password })`; response `res.data.data` = `{ access_token, refresh_token, user }` where `user: User` has `role`. It calls `saveTokens(access_token, refresh_token, user)`, `refreshUser()`, toast, then `router.push(next || "/")`. Imports: `useState`, `useRouter`, `Link`, `UtensilsCrossed` (lucide), `toast` (sonner), `Button`, `Input`, `api`, `saveTokens` (`@/lib/auth`), `refreshUser` (`@/lib/hooks/useUser`), `User` (`@/lib/types`).
- `saveTokens` only persists when called — so skipping it on rejection means no session is created.
- `/auth/*` is public in `middleware.ts` (no gating needed for the new page).
- `User.role` ∈ `"user" | "collaborator" | "admin"`.

---

## File Structure

- **Create:** `frontend/app/auth/staff-login/page.tsx` — the staff login page (form + role gate + console redirect).
- **Modify:** `frontend/app/auth/login/page.tsx` — add a discreet "Đăng nhập nhân viên" link.

---

## Task 1: Staff login page + cross-link

**Files:**
- Create: `frontend/app/auth/staff-login/page.tsx`
- Modify: `frontend/app/auth/login/page.tsx`

- [ ] **Step 1: Create the staff login page**

Create `frontend/app/auth/staff-login/page.tsx` with exactly this content:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import api from "@/lib/api";
import { saveTokens } from "@/lib/auth";
import { refreshUser } from "@/lib/hooks/useUser";
import type { User } from "@/lib/types";

export default function StaffLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post("/auth/login", { email, password });
      const { access_token, refresh_token, user } = res.data.data as {
        access_token: string;
        refresh_token: string;
        user: User;
      };

      // Role gate BEFORE persisting — a rejected user is never logged in.
      if (user.role !== "admin" && user.role !== "collaborator") {
        toast.error("Tài khoản không có quyền truy cập khu vực nhân viên");
        return;
      }

      await saveTokens(access_token, refresh_token, user);
      await refreshUser();
      toast.success(`Chào mừng, ${user.full_name}!`);
      router.push(user.role === "admin" ? "/staff/dashboard" : "/staff/review");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ?? "Email hoặc mật khẩu không đúng";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-[#FFFBF5] px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#1C1209] mb-4">
            <ShieldCheck className="w-7 h-7 text-[#E85D26]" />
          </div>
          <h1 className="text-2xl font-semibold text-[#2D2417]">Đăng nhập nhân viên</h1>
          <p className="text-[#7C6A56] mt-1 text-sm">Khu vực cộng tác viên &amp; quản trị</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium text-[#2D2417]">
              Email
            </label>
            <Input
              id="email"
              type="email"
              placeholder="email@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="bg-white border-[#E8DDD4] focus-visible:ring-[#E85D26]"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium text-[#2D2417]">
              Mật khẩu
            </label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="bg-white border-[#E8DDD4] focus-visible:ring-[#E85D26]"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-[#1C1209] hover:bg-[#2D2417] text-white mt-2"
          >
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </Button>
        </form>

        <p className="text-center text-sm text-[#7C6A56] mt-6">
          <Link href="/auth/login" className="text-[#E85D26] hover:underline font-medium">
            ← Đăng nhập người dùng
          </Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the staff-login link to the consumer login**

In `frontend/app/auth/login/page.tsx`, the page ends with the "Chưa có tài khoản? … Đăng ký ngay" paragraph (lines ~105-113). Immediately AFTER that closing `</p>`, add a discreet staff link:

```tsx
        <p className="text-center text-xs text-[#7C6A56] mt-3">
          <Link
            href="/auth/staff-login"
            className="hover:text-[#E85D26] hover:underline"
          >
            Đăng nhập nhân viên
          </Link>
        </p>
```
(`Link` is already imported in that file.)

- [ ] **Step 3: Typecheck**

Run (PowerShell from `frontend`):
```powershell
cd frontend; npx tsc --noEmit
```
Expected: `No errors found` (0 errors).

- [ ] **Step 4: Production build**

```powershell
cd frontend; npm run build
```
Expected: build succeeds and the route list includes `/auth/staff-login`.

- [ ] **Step 5: Commit**

```powershell
cd frontend; git add "app/auth/staff-login/page.tsx" app/auth/login/page.tsx; git commit -m "feat(staff-login): exclusive staff login page rejecting non-staff + cross-link"
```

- [ ] **Step 6: Manual verification (record results)**

Start backend + frontend. Verify:
- Admin account on `/auth/staff-login` → lands on `/staff/dashboard`, navbar shows logged-in.
- Collaborator account → lands on `/staff/review`.
- A plain `user` account on `/auth/staff-login` → toast "Tài khoản không có quyền truy cập khu vực nhân viên"; **no session** (still logged-out: no `access_token` in localStorage, navbar shows login buttons).
- Wrong password → "Email hoặc mật khẩu không đúng".
- Staff can still log in normally via `/auth/login`.
- `/auth/login` shows the "Đăng nhập nhân viên" link → navigates to the staff page.

---

## Self-Review (completed by plan author)

**1. Spec coverage:**
- New `/auth/staff-login` page → Task 1 Step 1. ✓
- Same `/auth/login` endpoint, role check before `saveTokens` → Step 1 (gate precedes `saveTokens`). ✓
- Staff redirect by role (admin→dashboard, collaborator→review) → Step 1. ✓
- Non-staff rejected with no session → Step 1 (early `return` before `saveTokens`). ✓
- Bad-credentials toast parity → Step 1 catch block. ✓
- Distinct staff branding (shield, dark header, "Đăng nhập nhân viên") → Step 1. ✓
- No register link; "← Đăng nhập người dùng" link → Step 1. ✓
- Discreet "Đăng nhập nhân viên" link on consumer login → Step 2. ✓
- No backend/middleware/type/migration change → none added. ✓
- Testing (tsc + build + manual) → Steps 3-4, 6. ✓

**2. Placeholder scan:** full page code + full snippet provided; commands have expected output. No TBD/TODO.

**3. Type consistency:** `User.role` compared against `"admin"`/`"collaborator"` (matches the union); response destructure matches the consumer login's shape (`access_token, refresh_token, user`); `saveTokens(access, refresh, user)` signature matches its existing call site. Routes `/staff/dashboard` + `/staff/review` exist (SP5). Consistent.
