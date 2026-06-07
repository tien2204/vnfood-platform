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
    <div className="min-h-screen w-full flex items-center justify-center bg-[#5b6b7c] px-4 py-12">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 sm:p-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#1C1209] mb-4">
            <ShieldCheck className="w-7 h-7 text-[#E85D26]" />
          </div>
          <h1 className="text-2xl font-bold text-[#111827]">Đăng nhập nhân viên</h1>
          <p className="text-[#6b7280] mt-1 text-sm">Khu vực cộng tác viên &amp; quản trị</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email */}
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-sm font-semibold text-[#111827]">
              Email
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-[#9ca3af]" />
              <input
                id="email"
                type="email"
                placeholder="Nhập email của bạn"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full rounded-xl border border-[#e5e7eb] bg-white py-3 pl-11 pr-4 text-sm text-[#111827] placeholder:text-[#9ca3af] outline-none transition-colors focus:border-[#111827] focus:ring-2 focus:ring-[#111827]/10"
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-sm font-semibold text-[#111827]">
              Mật khẩu
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-[#9ca3af]" />
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Nhập mật khẩu"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full rounded-xl border border-[#e5e7eb] bg-white py-3 pl-11 pr-11 text-sm text-[#111827] placeholder:text-[#9ca3af] outline-none transition-colors focus:border-[#111827] focus:ring-2 focus:ring-[#111827]/10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#6b7280]"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#0f172a] py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#1e293b] disabled:opacity-60"
          >
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>

        <p className="text-center text-sm text-[#6b7280] mt-6">
          <Link href="/auth/login" className="text-[#E85D26] hover:underline font-medium">
            ← Đăng nhập người dùng
          </Link>
        </p>
      </div>
    </div>
  );
}
