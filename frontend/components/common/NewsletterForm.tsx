"use client";

import { useState } from "react";
import { toast } from "sonner";

export default function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error("Email không hợp lệ. Vui lòng kiểm tra lại.");
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setEmail("");
      toast.success("Cảm ơn bạn! Chúng tôi sẽ gửi công thức mới mỗi tuần.");
    }, 600);
  }

  return (
    <div className="bg-[#E85D26]/8 border border-[#E85D26]/15 rounded-2xl px-6 py-6 mb-8">
      <h4 className="text-base font-bold text-[#1C1209] mb-1">
        Nhận công thức mới hàng tuần
      </h4>
      <p className="text-sm text-[#7C6A56] mb-4">
        Không spam. Chỉ những công thức ngon nhất từ cộng đồng mỗi tuần.
      </p>
      <form onSubmit={handleSubmit} className="flex max-w-sm">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@example.com"
          disabled={loading}
          className="flex-1 h-10 px-4 text-sm border border-[#E8DDD4] border-r-0 rounded-l-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#E85D26] focus:border-[#E85D26] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading}
          className="h-10 px-5 text-sm font-medium text-white bg-[#E85D26] hover:bg-[#D44E1E] rounded-r-lg transition-colors duration-150 disabled:opacity-60 whitespace-nowrap"
        >
          {loading ? "..." : "Đăng ký"}
        </button>
      </form>
    </div>
  );
}
