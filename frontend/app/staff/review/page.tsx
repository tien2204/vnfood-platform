"use client";

import Link from "next/link";
import useSWR from "swr";
import api from "@/lib/api";
import type { RecipeCardWithStatus, PaginatedResponse } from "@/lib/types";

const KEY = "/recipes/review/queue/admin?page=1&limit=50";

async function fetcher(url: string) {
  const res = await api.get<PaginatedResponse<RecipeCardWithStatus>>(url);
  return res.data;
}

export default function ReviewQueuePage() {
  const { data, isLoading } = useSWR(KEY, fetcher);

  if (isLoading) return <p className="text-muted-foreground">Đang tải…</p>;
  const items = data?.data ?? [];

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold text-foreground mb-4">Hàng đợi duyệt</h1>
      {items.length === 0 && <p className="text-muted-foreground">Không có công thức chờ duyệt.</p>}
      <div className="space-y-3">
        {items.map((r) => (
          <div key={r.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground truncate">{r.title}</p>
              <p className="text-xs text-muted-foreground">Chờ duyệt</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link href={`/staff/review/${r.id}`} className="px-3 py-1.5 text-sm rounded-lg bg-primary text-white">Mở duyệt</Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
