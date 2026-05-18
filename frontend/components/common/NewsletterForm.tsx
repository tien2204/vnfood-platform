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
    <div className="bg-white text-[#2c1810] border-2 border-white px-6 py-6 mb-8 shadow-block">
      <h4 className="text-base font-bold text-[#2c1810] mb-1">
        Nhận công thức mới hàng tuần
      </h4>
      <p className="text-sm text-[#6b5344] mb-4">
        Không spam. Chỉ những công thức ngon nhất từ cộng đồng mỗi tuần.
      </p>
      <form onSubmit={handleSubmit} className="flex max-w-sm">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@example.com"
          disabled={loading}
          className="flex-1 h-10 px-4 text-sm border-2 border-[#2c1810] border-r-0 bg-white focus:outline-none focus:ring-1 focus:ring-[#ff6b35] focus:border-[#ff6b35] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading}
          className="h-10 px-5 text-sm font-bold text-white bg-[#ff6b35] hover:bg-[#e55a2b] border-2 border-[#2c1810] transition-colors duration-150 disabled:opacity-60 whitespace-nowrap"
        >
          {loading ? "..." : "Đăng ký"}
        </button>
      </form>
    </div>
  );
}
