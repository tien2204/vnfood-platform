"use client";

import { useEffect } from "react";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.error("[GlobalError]", error);
    }
  }, [error]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 text-center py-16">
      <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center mb-6">
        <AlertTriangle className="w-10 h-10 text-red-400" aria-hidden="true" />
      </div>

      <h1
        className="text-2xl sm:text-3xl font-bold text-[#1C1209] mb-3"
        style={{ fontFamily: "var(--font-playfair)" }}
      >
        Có lỗi xảy ra
      </h1>
      <p className="text-[#7C6A56] max-w-sm leading-relaxed mb-8">
        Trang này gặp sự cố không mong đợi. Thử tải lại hoặc quay về trang chủ.
      </p>

      <div className="flex flex-wrap gap-3 justify-center">
        <Button
          onClick={reset}
          className="gap-2 bg-[#E85D26] hover:bg-[#D44E1E] text-white"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          Thử lại
        </Button>
        <Button
          variant="outline"
          className="gap-2 border-[#E8DDD4] text-[#7C6A56] hover:border-[#E85D26] hover:text-[#E85D26]"
          onClick={() => (window.location.href = "/")}
        >
          <Home className="w-4 h-4" aria-hidden="true" />
          Về trang chủ
        </Button>
      </div>
    </div>
  );
}
