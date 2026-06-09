"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import useSWR from "swr";
import api from "@/lib/api";
import type { ChangeRequest, PaginatedResponse } from "@/lib/types";

const KEY = "/recipe-change-requests?page=1&limit=50";

function errMsg(e: unknown, fallback: string) {
  const anyE = e as { response?: { data?: { detail?: string; error?: { message?: string } } } };
  return anyE?.response?.data?.error?.message ?? anyE?.response?.data?.detail ?? fallback;
}

const TYPE_LABEL: Record<string, string> = { create: "Tạo mới", edit: "Chỉnh sửa", delete: "Xóa" };

export default function ChangeRequestReviewPage() {
  const { data, mutate, isLoading } = useSWR(KEY, async (u) => (await api.get<PaginatedResponse<ChangeRequest>>(u)).data);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  async function approve(id: string) {
    try { await api.post(`/recipe-change-requests/${id}/approve`); toast.success("Đã duyệt & áp dụng"); mutate(); }
    catch (e) { toast.error(errMsg(e, "Duyệt thất bại")); }
  }
  async function reject(id: string) {
    try { await api.post(`/recipe-change-requests/${id}/reject`, { reason }); toast.success("Đã từ chối"); setRejectId(null); setReason(""); mutate(); }
    catch (e) { toast.error(errMsg(e, "Từ chối thất bại")); }
  }

  if (isLoading) return <p className="text-muted-foreground">Đang tải…</p>;
  const items = data?.data ?? [];

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold text-foreground mb-4">Duyệt đề xuất (công thức hệ thống)</h1>
      {items.length === 0 && <p className="text-muted-foreground">Không có đề xuất chờ duyệt.</p>}
      <div className="space-y-3">
        {items.map((cr) => (
          <div key={cr.id} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 text-xs rounded bg-muted text-muted-foreground">{TYPE_LABEL[cr.type] ?? cr.type}</span>
              <span className="text-sm font-semibold text-foreground">{cr.payload?.title ?? cr.target_title ?? "—"}</span>
              <span className="ml-auto text-xs text-muted-foreground">{cr.requested_by_name}</span>
            </div>
            {cr.target_recipe_id && (
              <Link href={`/recipes/${cr.target_recipe_id}`} className="text-xs text-primary underline">Xem công thức hiện tại</Link>
            )}
            {(cr.type === "create" || cr.type === "edit") && cr.payload && (
              <div className="mt-2 text-xs text-muted-foreground">
                <p>{cr.payload.ingredients?.length ?? 0} nguyên liệu · {cr.payload.steps?.length ?? 0} bước</p>
              </div>
            )}
            <div className="flex gap-2 mt-3">
              <button onClick={() => approve(cr.id)} className="px-3 py-1.5 text-sm rounded-lg bg-[#2e7d32] text-white">Duyệt</button>
              <button onClick={() => setRejectId(cr.id)} className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white">Từ chối</button>
            </div>
            {rejectId === cr.id && (
              <div className="mt-2 flex gap-2">
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do" className="flex-1 border border-border rounded-lg px-2 py-1 text-sm" />
                <button disabled={!reason.trim()} onClick={() => reject(cr.id)} className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white disabled:opacity-50">Xác nhận</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
