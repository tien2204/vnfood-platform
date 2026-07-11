"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Save, User, Mail, KeyRound, Copy, Check, Eye, EyeOff, Bell } from "lucide-react";
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

function PasswordInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="border-border focus-visible:ring-primary pr-10"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
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
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);
  // Card 3 — change email
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  // Card 4 — change password
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  // Card 5 — newsletter subscription
  const [newsletterOn, setNewsletterOn] = useState(false);
  const [newsletterLoading, setNewsletterLoading] = useState(true);

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

  useEffect(() => {
    if (!user) return;
    setNewsletterLoading(true);
    api
      .get<ApiResponse<{ subscribed: boolean }>>("/newsletter/me")
      .then((res) => setNewsletterOn(!!res.data.data.subscribed))
      .catch(() => setNewsletterOn(false))
      .finally(() => setNewsletterLoading(false));
  }, [user]);

  async function handleToggleNewsletter() {
    const next = !newsletterOn;
    setNewsletterLoading(true);
    try {
      await api.put("/newsletter/me", { subscribed: next });
      setNewsletterOn(next);
      toast.success(next ? "Đã bật nhận bản tin công thức" : "Đã tắt nhận bản tin");
    } catch {
      toast.error("Cập nhật thất bại, thử lại");
    } finally {
      setNewsletterLoading(false);
    }
  }

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
    } catch (err) {
      toast.error(errMsg(err, "Cập nhật thất bại, thử lại"));
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
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1500);
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
    if (!oldPassword) {
      toast.error("Nhập mật khẩu hiện tại");
      return;
    }
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
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 pb-24 lg:pb-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Cài đặt tài khoản</h1>
        <p className="text-sm text-muted-foreground mt-1">Quản lý hồ sơ và thông tin đăng nhập</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left column — Public profile */}
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

        {/* Right column — Account & security */}
        <div className="space-y-6">
        {/* Account info (read-only) */}
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
          {joinedLabel && <div className="text-muted-foreground">Tham gia {joinedLabel}</div>}
        </div>
      </div>

      {/* Card — Newsletter subscription */}
      <div className="bg-card rounded-2xl border border-border p-5">
        <h2 className="font-semibold text-foreground flex items-center gap-2 mb-1">
          <Bell className="w-4 h-4" />
          Bản tin công thức
        </h2>
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Nhận email gợi ý công thức nấu ăn mới mỗi tuần.
          </p>
          <button
            type="button"
            role="switch"
            aria-checked={newsletterOn}
            disabled={newsletterLoading}
            onClick={handleToggleNewsletter}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
              newsletterOn ? "bg-primary" : "bg-muted-foreground/30"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                newsletterOn ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
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
          <PasswordInput
            value={emailPassword}
            onChange={setEmailPassword}
            placeholder="Nhập để xác nhận"
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
          <PasswordInput value={oldPassword} onChange={setOldPassword} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Mật khẩu mới</label>
          <PasswordInput
            value={newPassword}
            onChange={setNewPassword}
            placeholder="Ít nhất 8 ký tự"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Nhập lại mật khẩu mới</label>
          <PasswordInput value={confirmPassword} onChange={setConfirmPassword} />
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
      </div>
    </div>
  );
}
