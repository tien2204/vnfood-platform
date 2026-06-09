"use client";

import Link from "next/link";
import { toast } from "sonner";
import useSWR from "swr";
import api from "@/lib/api";
import { useUser } from "@/lib/hooks/useUser";
import type { RecipeCardWithStatus, PaginatedResponse } from "@/lib/types";

const KEY = "/recipes/review/queue/collaborator?page=1&limit=50";

async function fetcher(url: string) {
  const res = await api.get<PaginatedResponse<RecipeCardWithStatus>>(url);
  return res.data;
}

function errMsg(e: unknown, fallback: string) {
  const anyE = e as { response?: { data?: { detail?: string; error?: { message?: string } } } };
  return anyE?.response?.data?.error?.message ?? anyE?.response?.data?.detail ?? fallback;
}

export default function ReviewQueuePage() {
  const { user } = useUser();
  const { data, mutate, isLoading } = useSWR(KEY, fetcher);
  const isAdmin = user?.role === "admin";

  async function claim(id: string) {
    try {
      await api.post(`/recipes/${id}/review/claim`);
      toast.success("Đã nhận xử lý");
      mutate();
    } catch (e) {
      toast.error(errMsg(e, "Không nhận được"));
      mutate();
    }
  }
  async function release(id: string) {
    try {
      await api.post(`/recipes/${id}/review/release`);
      toast.success("Đã nhả");
      mutate();
    } catch (e) {
      toast.error(errMsg(e, "Không nhả được"));
      mutate();
    }
  }

  if (isLoading) return <p className="text-muted-foreground">Đang tải…</p>;
  const items = data?.data ?? [];

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold text-foreground mb-4">Hàng đợi duyệt</h1>
      {items.length === 0 && <p className="text-muted-foreground">Không có công thức chờ duyệt.</p>}
      <div className="space-y-3">
        {items.map((r) => {
          const mine = r.claimed_by && user && r.claimed_by === user.id;
          const claimedOther = r.claimed_by && !mine;
          return (
            <div key={r.id} className="bg-white border border-border rounded-xl p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground truncate">{r.title}</p>
                <p className="text-xs text-muted-foreground">
                  {claimedOther ? `🔒 ${r.claimed_by_name} đang xử lý` : mine ? "Bạn đang xử lý" : "Chưa nhận"}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {(mine || isAdmin) && (
                  <Link href={`/staff/review/${r.id}`} className="px-3 py-1.5 text-sm rounded-lg bg-primary text-white">Mở duyệt</Link>
                )}
                {!r.claimed_by && (
                  <button onClick={() => claim(r.id)} className="px-3 py-1.5 text-sm rounded-lg border border-primary text-primary">Nhận xử lý</button>
                )}
                {(mine || (isAdmin && r.claimed_by)) && (
                  <button onClick={() => release(r.id)} className="px-3 py-1.5 text-sm rounded-lg border border-border text-muted-foreground">Nhả</button>
                )}
                {claimedOther && !isAdmin && (
                  <span className="px-3 py-1.5 text-sm rounded-lg bg-muted text-muted-foreground">Đang khóa</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
