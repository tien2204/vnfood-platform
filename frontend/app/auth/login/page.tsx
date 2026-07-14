"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import api from "@/lib/api";
import { saveTokens } from "@/lib/auth";
import { refreshUser } from "@/lib/hooks/useUser";
import type { User } from "@/lib/types";

export default function LoginPage() {
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
      // Staff accounts log in only through the staff door. Reject WITHOUT revealing
      // that the account exists / is staff — show the same generic error as a bad
      // password (no redirect, no session) to avoid account enumeration.
      if (user.role === "admin") {
        toast.error("Email hoặc mật khẩu không đúng");
        return;
      }
      await saveTokens(access_token, refresh_token, user);
      await refreshUser();
      toast.success(`Chào mừng trở lại, ${user.full_name}!`);
      const next = new URLSearchParams(window.location.search).get("next") || "/";
      router.push(next);
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
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <span className="text-2xl font-bold text-primary">
              TastyVietnam
            </span>
          </Link>
          <h1 className="text-2xl font-semibold text-foreground">Đăng nhập</h1>
          <p className="text-muted-foreground mt-1 text-sm">Chào mừng bạn trở lại!</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium text-foreground">
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
              className="bg-card border-border focus-visible:ring-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium text-foreground">
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
              className="bg-card border-border focus-visible:ring-primary"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-[#cc1c22] text-white mt-2"
          >
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Chưa có tài khoản?{" "}
          <Link
            href="/auth/register"
            className="text-primary hover:underline font-medium"
          >
            Đăng ký ngay
          </Link>
        </p>

      </div>
    </div>
  );
}
