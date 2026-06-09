"use client";

import Link from "next/link";
import useSWR from "swr";
import api from "@/lib/api";
import type { RecipeCardWithStatus, PaginatedResponse } from "@/lib/types";

const KEY = "/recipes/review/queue/admin?page=1&limit=50";

export default function AdminReviewPage() {
  const { data, isLoading } = useSWR(KEY, async (u) => (await api.get<PaginatedResponse<RecipeCardWithStatus>>(u)).data);
  if (isLoading) return <p className="text-[#666666]">Đang tải…</p>;
  const items = data?.data ?? [];
  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold text-[#1C1209] mb-4">Chờ đăng (admin duyệt)</h1>
      {items.length === 0 && <p className="text-[#666666]">Không có công thức chờ đăng.</p>}
      <div className="space-y-3">
        {items.map((r) => (
          <div key={r.id} className="bg-white border border-[#f0f0f0] rounded-xl p-4 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[#1C1209] truncate">{r.title}</p>
              <p className="text-xs text-[#666666]">CTV đã duyệt · chờ đăng</p>
            </div>
            <Link href={`/staff/review/${r.id}`} className="px-3 py-1.5 text-sm rounded-lg bg-[#E85D26] text-white shrink-0">Mở</Link>
          </div>
        ))}
      </div>
    </div>
  );
}
