"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Mail, X } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { useUser } from "@/lib/hooks/useUser";

const STORAGE_KEY = "vnfood_newsletter_prompt_v1";

export default function NewsletterConsentPrompt() {
  const pathname = usePathname();
  const { user, isLoading } = useUser();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    // Chỉ mời người dùng đã đăng nhập — khách không đăng ký được bản tin.
    if (!user) return;
    // Không hiện lại nếu đã đăng ký / đã tắt trước đó.
    if (typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY)) return;
    // Không làm phiền trên trang đăng nhập/đăng ký.
    if (pathname.startsWith("/auth")) return;
    const t = setTimeout(() => setVisible(true), 6000);
    return () => clearTimeout(t);
  }, [isLoading, user, pathname]);

  function remember(value: string) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* ignore */
    }
  }

  function dismiss() {
    remember("dismissed");
    setVisible(false);
  }

  async function handleSubscribe() {
    setLoading(true);
    try {
      await api.post("/newsletter/subscribe", { source: "prompt" });
      remember("subscribed");
      setVisible(false);
      toast.success("Đã đăng ký! Bạn có thể hủy nhận bất cứ lúc nào trong hồ sơ.");
    } catch {
      toast.error("Đăng ký thất bại, vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-20 left-3 right-3 z-[55] sm:bottom-4 sm:left-4 sm:right-auto sm:w-80 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="relative rounded-2xl border border-border bg-card p-4 shadow-lg">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Đóng"
          className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Mail className="h-4 w-4" />
          </span>
          <h4 className="pr-5 text-sm font-bold text-foreground">
            Nhận công thức mới hàng tuần?
          </h4>
        </div>

        <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
          Mỗi tuần một email gợi ý công thức nấu ăn mới, gửi tới email tài khoản
          của bạn. Hủy nhận bất cứ lúc nào trong trang hồ sơ hoặc ngay trong email.
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSubscribe}
            disabled={loading}
            className="h-9 flex-1 rounded-lg bg-primary text-sm font-bold text-white transition-colors hover:bg-[#cc1c22] disabled:opacity-60"
          >
            {loading ? "..." : "Đăng ký nhận"}
          </button>
          <button
            type="button"
            onClick={dismiss}
            disabled={loading}
            className="h-9 rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground hover:bg-muted"
          >
            Để sau
          </button>
        </div>
      </div>
    </div>
  );
}
