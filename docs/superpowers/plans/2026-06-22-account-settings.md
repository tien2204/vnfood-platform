# Account Settings Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mở rộng `/me/profile` thành trang cài đặt: hiển thị email/vai trò/ngày tham gia (kèm nút copy email), đổi email, đổi mật khẩu.

**Architecture:** Backend thêm 1 endpoint `POST /auth/change-email` (xác thực bằng mật khẩu hiện tại). Frontend tách `page.tsx` thành 4 card độc lập, mỗi card 1 form submit riêng. Dữ liệu hiển thị (email, role, created_at) đã có sẵn client-side — chỉ đổi email cần backend mới.

**Tech Stack:** FastAPI + SQLAlchemy async (backend), Next.js 14 App Router + axios + sonner (frontend).

## Global Constraints

- Mật khẩu tối thiểu **8 ký tự** (server đã validate cho `new_password`; client cũng validate).
- API base: `http://localhost:8000/api/v1`. Auth: `Authorization: Bearer <token>`.
- HTTPException trả về `{ detail: "..." }` → frontend đọc ở `error.response.data.detail`.
- Token JWT dùng user-id (`sub`) → đổi email KHÔNG làm mất hiệu lực token; frontend gọi `refreshUser()` để cập nhật.
- Python `snake_case`, TypeScript `camelCase`. Toàn bộ chuỗi UI tiếng Việt.
- Style card hiện tại: `bg-card rounded-2xl border border-border p-5` (giữ nguyên cho card mới).

---

### Task 1: Backend — `change_email` service + endpoint

**Files:**
- Test: `backend/tests/test_change_email.py` (create)
- Modify: `backend/app/services/auth_service.py` (thêm `change_email`)
- Modify: `backend/app/schemas/auth.py` (thêm `ChangeEmailRequest`)
- Modify: `backend/app/api/v1/auth.py` (thêm endpoint)

**Interfaces:**
- Produces: `auth_service.change_email(db: AsyncSession, user: User, new_email: str, password: str) -> None` — raise `HTTPException(400)` khi sai mật khẩu / email trùng; ngược lại cập nhật `user.email` và commit.
- Produces: `POST /api/v1/auth/change-email` body `{ new_email: str, password: str }` → `{ success: True, message: str }`.

- [ ] **Step 1: Write the failing test**

Tạo `backend/tests/test_change_email.py`. Dùng `AsyncMock` cho db (không cần DB thật, khớp hạ tầng test hiện có — conftest chỉ set sys.path):

```python
import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.core.security import hash_password
from app.models.user import User
from app.services import auth_service


def _make_user(email="old@example.com", password="correct-pass"):
    u = User()
    u.email = email
    u.hashed_password = hash_password(password)
    return u


def _db_with_existing(existing_user):
    """AsyncMock db whose execute().scalar_one_or_none() returns existing_user."""
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = existing_user
    db.execute.return_value = result
    return db


def test_change_email_wrong_password_raises_400():
    user = _make_user()
    db = _db_with_existing(None)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(auth_service.change_email(db, user, "new@example.com", "WRONG"))
    assert exc.value.status_code == 400
    db.commit.assert_not_awaited()


def test_change_email_duplicate_raises_400():
    user = _make_user()
    db = _db_with_existing(_make_user(email="new@example.com"))  # email taken
    with pytest.raises(HTTPException) as exc:
        asyncio.run(auth_service.change_email(db, user, "new@example.com", "correct-pass"))
    assert exc.value.status_code == 400
    db.commit.assert_not_awaited()


def test_change_email_success_updates_and_commits():
    user = _make_user()
    db = _db_with_existing(None)  # email free
    asyncio.run(auth_service.change_email(db, user, "new@example.com", "correct-pass"))
    assert user.email == "new@example.com"
    db.commit.assert_awaited_once()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_change_email.py -v`
Expected: FAIL — `AttributeError: module 'app.services.auth_service' has no attribute 'change_email'`

- [ ] **Step 3: Implement `change_email` in `auth_service.py`**

Thêm vào cuối `backend/app/services/auth_service.py` (imports `select`, `HTTPException`, `verify_password`, `User` đã có sẵn ở đầu file):

```python
async def change_email(
    db: AsyncSession, user: User, new_email: str, password: str
) -> None:
    if not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mật khẩu không đúng")
    if new_email == user.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email mới trùng email hiện tại"
        )
    result = await db.execute(select(User).where(User.email == new_email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email đã được sử dụng"
        )
    user.email = new_email
    db.add(user)
    await db.commit()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_change_email.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Add `ChangeEmailRequest` schema**

Trong `backend/app/schemas/auth.py`, thêm sau class `ChangePasswordRequest` (file đã `import EmailStr`):

```python
class ChangeEmailRequest(BaseModel):
    new_email: EmailStr
    password: str
```

- [ ] **Step 6: Add endpoint in `auth.py`**

Trong `backend/app/api/v1/auth.py`:

Cập nhật import từ `app.schemas.auth` thêm `ChangeEmailRequest`:

```python
from app.schemas.auth import (
    ChangeEmailRequest,
    ChangePasswordRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserOut,
)
```

Thêm endpoint vào cuối file (`get_current_active_user`, `get_db`, `User`, `AsyncSession` đã import sẵn):

```python
@router.post("/change-email")
async def change_email(
    body: ChangeEmailRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await auth_service.change_email(db, current_user, body.new_email, body.password)
    return {"success": True, "message": "Đổi email thành công"}
```

- [ ] **Step 7: Verify backend imports cleanly**

Run: `cd backend && python -c "import app.main"`
Expected: không lỗi import (exit 0).

- [ ] **Step 8: Commit**

```bash
git add backend/tests/test_change_email.py backend/app/services/auth_service.py backend/app/schemas/auth.py backend/app/api/v1/auth.py
git commit -m "feat(auth): change-email endpoint (password-confirmed)"
```

---

### Task 2: Frontend — restructure `/me/profile` into 4 cards

**Files:**
- Modify: `frontend/app/me/profile/page.tsx` (rewrite — thêm 3 card mới, giữ card hồ sơ)

**Interfaces:**
- Consumes: `POST /auth/change-email { new_email, password }` (Task 1), `POST /auth/change-password { old_password, new_password }` (đã có), `PUT /users/me/profile` (đã có).
- Consumes client state: `user.email`, `user.role` (`"user" | "admin"`), `profile.created_at`.

- [ ] **Step 1: Rewrite `page.tsx` với 4 card**

Thay toàn bộ nội dung `frontend/app/me/profile/page.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Save, User, Mail, KeyRound, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import ImageUploader from "@/components/common/ImageUploader";
import { toast } from "sonner";
import api from "@/lib/api";
import { useUser, refreshUser } from "@/lib/hooks/useUser";
import type { ApiResponse, UserProfile } from "@/lib/types";

function errMsg(err: unknown, fallback: string): string {
  return (
    (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? fallback
  );
}

export default function EditProfilePage() {
  const router = useRouter();
  const { user, isLoading } = useUser();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  // Card 1 — public profile
  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(true);
  // Card 2 — copy email
  const [copied, setCopied] = useState(false);
  // Card 3 — change email
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  // Card 4 — change password
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (!user) return;
    setFetching(true);
    api
      .get<ApiResponse<UserProfile>>(`/users/${user.id}/profile`)
      .then((res) => {
        const p = res.data.data;
        setProfile(p);
        setFullName(p.full_name ?? "");
        setBio(p.bio ?? "");
        setAvatarUrl(p.avatar_url ?? "");
      })
      .catch(() => {
        setFullName(user.full_name ?? "");
        setAvatarUrl(user.avatar_url ?? "");
      })
      .finally(() => setFetching(false));
  }, [user]);

  if (isLoading || fetching) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 flex justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    router.replace("/auth/login");
    return null;
  }

  const previewAvatar = avatarUrl
    ? avatarUrl.startsWith("http")
      ? avatarUrl
      : `${process.env.NEXT_PUBLIC_API_URL}${avatarUrl}`
    : undefined;

  const joinedLabel = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("vi-VN", { year: "numeric", month: "long" })
    : null;
  const roleLabel = user.role === "admin" ? "Quản trị" : "Người dùng";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error("Tên hiển thị không được để trống");
      return;
    }
    setSaving(true);
    try {
      await api.put("/users/me/profile", {
        full_name: fullName.trim(),
        bio: bio.trim() || null,
        avatar_url: avatarUrl || null,
      });
      await refreshUser();
      toast.success("Cập nhật hồ sơ thành công");
      router.push(`/users/${user?.id}`);
    } catch {
      toast.error("Cập nhật thất bại, thử lại");
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyEmail() {
    if (!user) return;
    try {
      await navigator.clipboard.writeText(user.email);
      setCopied(true);
      toast.success("Đã copy email");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Không copy được, thử lại");
    }
  }

  async function handleChangeEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail.trim()) {
      toast.error("Nhập email mới");
      return;
    }
    if (!emailPassword) {
      toast.error("Nhập mật khẩu hiện tại");
      return;
    }
    setSavingEmail(true);
    try {
      await api.post("/auth/change-email", {
        new_email: newEmail.trim(),
        password: emailPassword,
      });
      await refreshUser();
      toast.success("Đổi email thành công");
      setNewEmail("");
      setEmailPassword("");
    } catch (err) {
      toast.error(errMsg(err, "Đổi email thất bại"));
    } finally {
      setSavingEmail(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("Mật khẩu mới phải có ít nhất 8 ký tự");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Mật khẩu nhập lại không khớp");
      return;
    }
    setSavingPassword(true);
    try {
      await api.post("/auth/change-password", {
        old_password: oldPassword,
        new_password: newPassword,
      });
      toast.success("Đổi mật khẩu thành công");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(errMsg(err, "Đổi mật khẩu thất bại"));
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 py-8 pb-24 lg:pb-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Cài đặt tài khoản</h1>
        <p className="text-sm text-muted-foreground mt-1">Quản lý hồ sơ và thông tin đăng nhập</p>
      </div>

      {/* Card 1 — Public profile */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-card rounded-2xl border border-border p-5">
          <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <User className="w-4 h-4" />
            Ảnh đại diện
          </h2>
          <div className="flex items-center gap-4 mb-4">
            <Avatar className="w-16 h-16 shrink-0">
              <AvatarImage src={previewAvatar} alt={fullName} />
              <AvatarFallback className="bg-primary text-white text-xl font-bold">
                {fullName?.charAt(0)?.toUpperCase() ?? "?"}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium text-foreground">{fullName || "Tên hiển thị"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Ảnh hiển thị trên toàn bộ trang</p>
            </div>
          </div>
          <ImageUploader
            value={avatarUrl}
            onChange={setAvatarUrl}
            category="avatar"
            label="Tải ảnh đại diện mới"
            className="max-w-sm"
          />
        </div>

        <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
          <h2 className="font-semibold text-foreground">Thông tin cá nhân</h2>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Tên hiển thị <span className="text-red-500">*</span>
            </label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nguyễn Văn A"
              maxLength={100}
              className="border-border focus-visible:ring-primary"
            />
            <p className="text-xs text-muted-foreground">{fullName.length}/100 ký tự</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Giới thiệu bản thân</label>
            <Textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tôi yêu thích nấu ăn và khám phá ẩm thực Việt Nam..."
              maxLength={500}
              rows={3}
              className="resize-none border-border focus-visible:ring-primary"
            />
            <p className="text-xs text-muted-foreground">{bio.length}/500 ký tự</p>
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            className="flex-1 border-border text-muted-foreground"
          >
            Hủy
          </Button>
          <Button
            type="submit"
            disabled={saving}
            className="flex-1 bg-primary hover:bg-[#cc1c22] text-white gap-2"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Lưu thay đổi
          </Button>
        </div>
      </form>

      {/* Card 2 — Account info (read-only) */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <User className="w-4 h-4" />
          Tài khoản
        </h2>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Email đăng nhập</label>
          <div className="flex items-center gap-2">
            <Input value={user.email} readOnly className="border-border bg-muted/40" />
            <Button
              type="button"
              variant="outline"
              onClick={handleCopyEmail}
              className="shrink-0 border-border gap-1.5"
            >
              {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              {copied ? "Đã copy" : "Copy"}
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-muted-foreground">Vai trò: </span>
            <Badge variant="secondary">{roleLabel}</Badge>
          </div>
          {joinedLabel && (
            <div className="text-muted-foreground">Tham gia {joinedLabel}</div>
          )}
        </div>
      </div>

      {/* Card 3 — Change email */}
      <form
        onSubmit={handleChangeEmail}
        className="bg-card rounded-2xl border border-border p-5 space-y-4"
      >
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <Mail className="w-4 h-4" />
          Đổi email
        </h2>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Email mới</label>
          <Input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="email-moi@example.com"
            className="border-border focus-visible:ring-primary"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Mật khẩu hiện tại</label>
          <Input
            type="password"
            value={emailPassword}
            onChange={(e) => setEmailPassword(e.target.value)}
            placeholder="Nhập để xác nhận"
            className="border-border focus-visible:ring-primary"
          />
        </div>
        <Button
          type="submit"
          disabled={savingEmail}
          className="bg-primary hover:bg-[#cc1c22] text-white gap-2"
        >
          {savingEmail && (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          )}
          Cập nhật email
        </Button>
      </form>

      {/* Card 4 — Change password */}
      <form
        onSubmit={handleChangePassword}
        className="bg-card rounded-2xl border border-border p-5 space-y-4"
      >
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <KeyRound className="w-4 h-4" />
          Đổi mật khẩu
        </h2>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Mật khẩu hiện tại</label>
          <Input
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            className="border-border focus-visible:ring-primary"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Mật khẩu mới</label>
          <Input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Ít nhất 8 ký tự"
            className="border-border focus-visible:ring-primary"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Nhập lại mật khẩu mới</label>
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="border-border focus-visible:ring-primary"
          />
        </div>
        <Button
          type="submit"
          disabled={savingPassword}
          className="bg-primary hover:bg-[#cc1c22] text-white gap-2"
        >
          {savingPassword && (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          )}
          Đổi mật khẩu
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: không lỗi liên quan `app/me/profile/page.tsx`.

- [ ] **Step 3: Manual verify (cần backend + frontend chạy)**

Khởi động backend (`uvicorn app.main:app --reload --port 8000`) và frontend (`npm run dev`), đăng nhập, vào `/me/profile`:
- Card "Tài khoản" hiện đúng email, badge vai trò, "Tham gia <tháng, năm>".
- Bấm **Copy** → toast "Đã copy email", icon đổi sang ✓ rồi quay lại.
- **Đổi mật khẩu**: nhập lại sai → toast "không khớp"; mật khẩu mới < 8 → toast; mật khẩu cũ sai → toast "Mật khẩu cũ không đúng" (từ backend); đúng → toast thành công, đăng xuất rồi đăng nhập lại bằng mật khẩu mới OK.
- **Đổi email**: sai mật khẩu → toast "Mật khẩu không đúng"; email đã tồn tại → toast "Email đã được sử dụng"; hợp lệ → toast thành công, header/menu hiện email mới (sau refreshUser).
- Card 1 (avatar/tên/bio) vẫn lưu bình thường.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/me/profile/page.tsx
git commit -m "feat(profile): account settings — email/role/join date, copy email, change email + password"
```

---

## Self-Review

**Spec coverage:**
- Card "Tài khoản" (email + copy + vai trò + ngày tham gia) → Task 2 Card 2. ✓
- Đổi email password-confirmed → Task 1 (backend) + Task 2 Card 3. ✓
- Đổi mật khẩu (dùng endpoint có sẵn) + validate client → Task 2 Card 4. ✓
- Nút copy email → Task 2 `handleCopyEmail`. ✓
- Error handling map `detail` → `errMsg()`. ✓
- Backend test 3 ca → Task 1 Step 1. ✓

**Type consistency:** `change_email(db, user, new_email, password)` đồng nhất giữa service (Task 1 Step 3), endpoint (Step 6), test (Step 1). Body keys `new_email`/`password` (change-email) và `old_password`/`new_password` (change-password) khớp schema backend.

**Placeholders:** không còn TBD/TODO; mọi step có code/lệnh cụ thể.
