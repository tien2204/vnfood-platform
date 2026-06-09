"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import api from "@/lib/api";
import { saveTokens } from "@/lib/auth";
import { refreshUser } from "@/lib/hooks/useUser";
import type { User } from "@/lib/types";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Mật khẩu phải có ít nhất 8 ký tự");
      return;
    }
    if (password !== confirm) {
      toast.error("Mật khẩu xác nhận không khớp");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/register", {
        email,
        password,
        full_name: fullName,
      });
      // Auto login
      const loginRes = await api.post("/auth/login", { email, password });
      const { access_token, refresh_token, user } = loginRes.data.data as {
        access_token: string;
        refresh_token: string;
        user: User;
      };
      await saveTokens(access_token, refresh_token, user);
      await refreshUser();
      toast.success("Đăng ký thành công! Chào mừng bạn đến VNFood 🎉");
      router.push("/");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ?? "Đăng ký thất bại. Vui lòng thử lại.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-[#FFFBF5] px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <UtensilsCrossed className="w-8 h-8 text-[#E85D26]" />
            <span
              className="text-2xl font-bold text-[#E85D26]"
              style={{ fontFamily: "var(--font-playfair)" }}
            >
              VNFood
            </span>
          </Link>
          <h1 className="text-2xl font-semibold text-[#2D2417]">Tạo tài khoản</h1>
          <p className="text-[#666666] mt-1 text-sm">
            Bắt đầu hành trình ẩm thực của bạn!
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="fullName" className="text-sm font-medium text-[#2D2417]">
              Họ và tên
            </label>
            <Input
              id="fullName"
              type="text"
              placeholder="Nguyễn Văn A"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              autoComplete="name"
              className="bg-white border-[#f0f0f0] focus-visible:ring-[#E85D26]"
            />
          </div>

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
              className="bg-white border-[#f0f0f0] focus-visible:ring-[#E85D26]"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium text-[#2D2417]">
              Mật khẩu
            </label>
            <Input
              id="password"
              type="password"
              placeholder="Tối thiểu 8 ký tự"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="bg-white border-[#f0f0f0] focus-visible:ring-[#E85D26]"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="confirm" className="text-sm font-medium text-[#2D2417]">
              Xác nhận mật khẩu
            </label>
            <Input
              id="confirm"
              type="password"
              placeholder="Nhập lại mật khẩu"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
              className="bg-white border-[#f0f0f0] focus-visible:ring-[#E85D26]"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-[#E85D26] hover:bg-[#D44E1E] text-white mt-2"
          >
            {loading ? "Đang đăng ký..." : "Đăng ký"}
          </Button>
        </form>

        <p className="text-center text-sm text-[#666666] mt-6">
          Đã có tài khoản?{" "}
          <Link
            href="/auth/login"
            className="text-[#E85D26] hover:underline font-medium"
          >
            Đăng nhập
          </Link>
        </p>
      </div>
    </div>
  );
}
