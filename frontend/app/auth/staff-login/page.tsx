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
