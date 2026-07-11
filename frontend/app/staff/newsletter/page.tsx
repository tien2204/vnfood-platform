"use client";

import { useState } from "react";
import { Send, Mail, CheckCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

interface SendResult {
  sent: number;
  failed: number;
  total: number;
  recipes: number;
  error?: string;
}

export default function StaffNewsletterPage() {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);

  async function handleSend() {
    if (
      !window.confirm(
        "Gửi bản tin công thức mới tới tất cả người đăng ký ngay bây giờ?"
      )
    ) {
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const res = await api.post("/newsletter/send-weekly");
      const data: SendResult = res.data.data;
      setResult(data);
      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success(`Đã gửi ${data.sent} email (${data.failed} lỗi).`);
      }
    } catch {
      toast.error("Gửi bản tin thất bại. Kiểm tra cấu hình SMTP trong .env.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground font-heading">
          Bản tin công thức
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Soạn và gửi email công thức mới tới người đăng ký
        </p>
      </div>

      <div className="bg-card rounded-2xl border border-border p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Mail className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <h2 className="font-semibold text-foreground">Gửi bản tin ngay</h2>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              Hệ thống lấy các công thức mới nhất, dựng email và gửi tới mọi
              người đang đăng ký. Mỗi email có link hủy nhận riêng.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSend}
          disabled={sending}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#cc1c22] disabled:opacity-60"
        >
          {sending ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {sending ? "Đang gửi..." : "Gửi bản tin ngay"}
        </button>
      </div>

      {result && (
        <div
          className={`rounded-2xl border p-5 ${
            result.error
              ? "border-red-200 bg-red-50"
              : "border-green-200 bg-green-50"
          }`}
        >
          {result.error ? (
            <div className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" />
              <span className="text-sm font-medium">{result.error}</span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-green-700 mb-3">
                <CheckCircle className="h-5 w-5" />
                <span className="text-sm font-semibold">Đã gửi xong</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <Stat label="Thành công" value={result.sent} />
                <Stat label="Lỗi" value={result.failed} />
                <Stat label="Công thức" value={result.recipes} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white border border-border p-3">
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}
