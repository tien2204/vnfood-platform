"use client";

import Link from "next/link";
import useSWR from "swr";
import api from "@/lib/api";
import type { ChangeRequest, PaginatedResponse } from "@/lib/types";

const STATUS = {
  pending: { label: "Chờ duyệt", cls: "bg-yellow-100 text-yellow-700" },
  approved: { label: "Đã áp dụng", cls: "bg-green-100 text-green-700" },
  rejected: { label: "Bị từ chối", cls: "bg-red-100 text-red-700" },
} as const;

const TYPE_LABEL = { create: "Tạo mới", edit: "Sửa", delete: "Xóa" } as const;

async function fetcher(url: string) {
  return (await api.get<PaginatedResponse<ChangeRequest>>(url)).data;
}

export default function MyChangeRequestsPage() {
  const { data, isLoading } = useSWR("/recipe-change-requests/mine?limit=50", fetcher);
  const items = data?.data ?? [];

  return (
    <main className="min-h-screen bg-[#FFFBF5] py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-[#1C1209] font-heading">Đề xuất của tôi</h1>
          <Link href="/recipes/propose-new" className="px-4 py-2 rounded-xl bg-[#E85D26] text-white text-sm font-medium">
            + Đề xuất công thức mới
          </Link>
        </div>
        {isLoading ? (
          <p className="text-[#7C6A56]">Đang tải…</p>
        ) : items.length === 0 ? (
          <p className="text-[#7C6A56]">Chưa có đề xuất nào.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((cr) => {
              const st = STATUS[cr.status] ?? { label: cr.status, cls: "bg-gray-100 text-gray-700" };
              return (
                <li key={cr.id} className="border border-[#E8DDD4] bg-white rounded-xl p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-[#1C1209]">
                      {TYPE_LABEL[cr.type]} · {cr.target_title ?? "(công thức mới)"}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.cls}`}>{st.label}</span>
                  </div>
                  {cr.status === "rejected" && cr.reject_reason && (
                    <p className="mt-1.5 text-sm text-red-600">Lý do: {cr.reject_reason}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
