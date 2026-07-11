"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Trang "Nguyên liệu" đã được ẩn khỏi khu vực quản trị. Link trong sidebar đã gỡ
// (components/staff/StaffLayout.tsx); truy cập thẳng URL sẽ chuyển về Tổng quan.
// Bản triển khai đầy đủ trước đây còn trong git history nếu cần khôi phục.
export default function IngredientsHiddenPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/staff/dashboard");
  }, [router]);
  return null;
}
