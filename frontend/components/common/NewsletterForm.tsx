"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import api from "@/lib/api";
import { useUser } from "@/lib/hooks/useUser";

export default function NewsletterForm() {
  const { user, isLoading } = useUser();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubscribe() {
    setLoading(true);
    try {
      await api.post("/newsletter/subscribe", { source: "footer" });
      setDone(true);
      toast.success("Cảm ơn bạn! Chúng tôi sẽ gửi công thức mới mỗi tuần.");
    } catch {
      toast.error("Đăng ký thất bại, vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-card text-foreground border-2 border-border px-6 py-6 mb-8 shadow-block">
      <h4 className="text-base font-bold text-foreground mb-1">
        Nhận công thức mới hàng tuần
      </h4>
      <p className="text-sm text-muted-foreground mb-4">
        Không spam. Chỉ những công thức ngon nhất từ cộng đồng mỗi tuần.
      </p>

      {isLoading ? null : !user ? (
        // Chỉ người dùng đã đăng nhập mới được đăng ký nhận bản tin.
        <Link
          href="/auth/login"
          className="inline-flex h-10 items-center px-5 text-sm font-bold text-white bg-primary hover:bg-[#cc1c22] border border-border transition-colors duration-150"
        >
          Đăng nhập để nhận bản tin
        </Link>
      ) : done ? (
        <p className="text-sm font-medium text-primary">
          Đã đăng ký! Bạn có thể tắt nhận trong{" "}
          <Link href="/me/profile" className="underline">
            trang hồ sơ
          </Link>
          .
        </p>
      ) : (
        <button
          type="button"
          onClick={handleSubscribe}
          disabled={loading}
          className="inline-flex h-10 items-center px-5 text-sm font-bold text-white bg-primary hover:bg-[#cc1c22] border border-border transition-colors duration-150 disabled:opacity-60"
        >
          {loading ? "..." : "Đăng ký nhận bản tin"}
        </button>
      )}
    </div>
  );
}
