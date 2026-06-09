"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import useSWR from "swr";
import api from "@/lib/api";
import RecipeContent from "@/components/recipes/RecipeContent";
import { useUser } from "@/lib/hooks/useUser";
import type { ApiResponse, RecipeDetail } from "@/lib/types";

function errMsg(e: unknown, fallback: string) {
  const anyE = e as { response?: { data?: { detail?: string; error?: { message?: string } } } };
  return anyE?.response?.data?.error?.message ?? anyE?.response?.data?.detail ?? fallback;
}

export default function ReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useUser();
  const isAdmin = user?.role === "admin";
  const { data, mutate, isLoading } = useSWR(`/recipes/${id}`, async (u) => (await api.get<ApiResponse<RecipeDetail>>(u)).data.data);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (isLoading) return <p className="text-muted-foreground">Đang tải…</p>;
  if (!data) return <p className="text-muted-foreground">Không tải được công thức.</p>;

  const r = data;

  async function act(path: string, body: object, okMsg: string, back: string) {
    setBusy(true);
    try {
      await api.post(`/recipes/${id}/${path}`, body);
      toast.success(okMsg);
      router.push(back);
    } catch (e) {
      toast.error(errMsg(e, "Thao tác thất bại"));
      mutate();
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <button onClick={() => router.back()} className="text-sm text-muted-foreground mb-3">← Quay lại</button>
      <h1 className="text-2xl font-bold text-foreground mb-1">{r.title}</h1>
      <p className="text-xs text-muted-foreground mb-4">Trạng thái: {r.status}</p>
      <RecipeContent recipe={r} />

      <div className="sticky bottom-0 mt-6 bg-card border-t border-border py-3 flex gap-2">
        {r.status === "pending_collaborator" && (
          <>
            <button disabled={busy} onClick={() => act("review/approve", {}, "Đã chuyển chờ admin", "/staff/review")} className="px-4 py-2 rounded-lg bg-[#2e7d32] text-white disabled:opacity-50">Duyệt</button>
            <button disabled={busy} onClick={() => setRejecting(true)} className="px-4 py-2 rounded-lg bg-red-600 text-white disabled:opacity-50">Từ chối</button>
          </>
        )}
        {r.status === "pending_admin" && isAdmin && (
          <>
            <button disabled={busy} onClick={() => act("publish", {}, "Đã đăng", "/staff/admin-review")} className="px-4 py-2 rounded-lg bg-[#2e7d32] text-white disabled:opacity-50">Đăng</button>
            <button disabled={busy} onClick={() => setRejecting(true)} className="px-4 py-2 rounded-lg bg-red-600 text-white disabled:opacity-50">Từ chối</button>
          </>
        )}
        {!(r.status === "pending_collaborator" || (r.status === "pending_admin" && isAdmin)) && (
          <p className="text-sm text-muted-foreground">Không còn trong hàng đợi của bạn.</p>
        )}
      </div>

      {rejecting && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setRejecting(false)}>
          <div className="bg-card rounded-xl p-4 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-foreground mb-2">Lý do từ chối</h3>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} className="w-full border border-border rounded-lg p-2 text-sm" rows={3} />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setRejecting(false)} className="px-3 py-1.5 text-sm text-muted-foreground">Hủy</button>
              <button
                disabled={busy || !reason.trim()}
                onClick={() => {
                  const path = r.status === "pending_admin" ? "admin-reject" : "review/reject";
                  const back = r.status === "pending_admin" ? "/staff/admin-review" : "/staff/review";
                  act(path, { reason }, "Đã từ chối", back);
                }}
                className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white disabled:opacity-50"
              >Xác nhận</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
