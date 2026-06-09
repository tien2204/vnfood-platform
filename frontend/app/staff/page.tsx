"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/hooks/useUser";

export default function StaffIndex() {
  const router = useRouter();
  const { user, isLoading } = useUser();
  useEffect(() => {
    if (isLoading) return;
    router.replace(user?.role === "admin" ? "/staff/dashboard" : "/staff/review");
  }, [user, isLoading, router]);
  return <p className="p-8 text-[#666666]">Đang chuyển hướng…</p>;
}
