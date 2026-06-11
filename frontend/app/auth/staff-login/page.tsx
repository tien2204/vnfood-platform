"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { saveTokens } from "@/lib/auth";
import { refreshUser } from "@/lib/hooks/useUser";
import type { User } from "@/lib/types";

export default function StaffLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post("/auth/staff-login", { email, password });
      const { access_token, refresh_token, user } = res.data.data as {
        access_token: string;
        refresh_token: string;
        user: User;
      };

      // Role gate BEFORE persisting — a rejected user is never logged in.
      if (user.role !== "admin") {
        toast.error("Tài khoản không có quyền truy cập khu vực nhân viên");
        return;
      }

      await saveTokens(access_token, refresh_token, user);
      await refreshUser();
      toast.success(`Chào mừng, ${user.full_name}!`);
      router.push("/staff/dashboard");
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
    <div className="min-h-screen w-full flex items-center justify-center bg-[#5b6b7c] px-4 py-12">
      <div className="w-full max-w-md bg-card rounded-2xl shadow-2xl p-8 sm:p-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-foreground mb-4">
            <ShieldCheck className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Đăng nhập nhân viên</h1>
          <p className="text-muted-foreground mt-1 text-sm">Khu vực cộng tác viên &amp; quản trị</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email */}
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-sm font-semibold text-foreground">
              Email
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                id="email"
                type="email"
                placeholder="Nhập email của bạn"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full rounded-xl border border-border bg-card py-3 pl-11 pr-4 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-foreground focus:ring-2 focus:ring-foreground/10"
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-sm font-semibold text-foreground">
              Mật khẩu
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Nhập mật khẩu"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full rounded-xl border border-border bg-card py-3 pl-11 pr-11 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-foreground focus:ring-2 focus:ring-foreground/10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-foreground py-3.5 text-sm font-semibold text-white transition-colors hover:bg-foreground/90 disabled:opacity-60"
          >
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-6">
          <Link href="/auth/login" className="text-primary hover:underline font-medium">
            ← Đăng nhập người dùng
          </Link>
        </p>
      </div>
    </div>
  );
}
