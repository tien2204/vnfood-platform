"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Check, X, Eye, Trash2, Clock, Calendar } from "lucide-react";
import { toast } from "sonner";
import useSWR, { mutate } from "swr";
import StatusBadge from "@/components/recipes/StatusBadge";
import api from "@/lib/api";
import type { PaginatedResponse, RecipeCardWithStatus } from "@/lib/types";

const TABS = [
  { value: "pending", label: "Chờ duyệt" },
  { value: "approved", label: "Đã duyệt" },
  { value: "rejected", label: "Bị từ chối" },
  { value: "", label: "Tất cả" },
] as const;

type TabValue = "pending" | "approved" | "rejected" | "";

function cacheKey(status: TabValue, page: number) {
  return `/admin/recipes?status=${status}&page=${page}`;
}

async function fetcher(url: string) {
  const res = await api.get<PaginatedResponse<RecipeCardWithStatus>>(url);
  return res.data;
}

function stripEmoji(text: string): string {
  return text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, "").trim();
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ── Reject modal ──────────────────────────────────────────────────────────────

interface RejectModalProps {
  recipeId: string;
  title: string;
  onClose: () => void;
  onDone: () => void;
}

function RejectModal({ recipeId, title, onClose, onDone }: RejectModalProps) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleReject() {
    setLoading(true);
    try {
      await api.patch(`/admin/recipes/${recipeId}/status`, {
        status: "rejected",
        reject_reason: reason.trim() || null,
      });
      toast.success("Đã từ chối công thức");
      onDone();
    } catch {
      toast.error("Đã có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h3 className="text-base font-semibold text-foreground">Từ chối công thức</h3>
        <p className="text-sm text-muted-foreground line-clamp-2">{stripEmoji(title)}</p>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Lý do từ chối <span className="text-muted-foreground font-normal">(tùy chọn)</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Thiếu ảnh minh họa, nội dung không phù hợp..."
            rows={3}
            className="w-full px-3 py-2 rounded-xl border border-border bg-muted focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 text-sm text-foreground placeholder:text-muted-foreground resize-none"
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Hủy
          </button>
          <button
            onClick={handleReject}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-60"
          >
            {loading ? "Đang gửi..." : "Từ chối"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AdminRecipesPage() {
  const [tab, setTab] = useState<TabValue>("pending");
  const [page, setPage] = useState(1);
  const [approving, setApproving] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<{ id: string; title: string } | null>(null);

  const key = cacheKey(tab, page);
  const { data, isLoading } = useSWR(key, fetcher);

  const recipes = data?.data ?? [];
  const pagination = data?.pagination;

  async function handleApprove(id: string) {
    setApproving(id);
    try {
      await api.patch(`/admin/recipes/${id}/status`, { status: "approved" });
      toast.success("Đã duyệt công thức");
      mutate(key);
    } catch {
      toast.error("Đã có lỗi xảy ra");
    } finally {
      setApproving(null);
    }
  }

  async function handleToggleReview(id: string, current: boolean) {
    setReviewingId(id);
    try {
      await api.patch(`/admin/recipes/${id}/manual-review`, { is_reviewed: !current });
      toast.success(current ? "Đã bỏ đánh dấu review" : "Đã đánh dấu đã review");
      mutate(key);
    } catch {
      toast.error("Đã có lỗi xảy ra");
    } finally {
      setReviewingId(null);
    }
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Xóa vĩnh viễn công thức "${stripEmoji(title)}"?`)) return;
    setDeletingId(id);
    try {
      await api.delete(`/admin/recipes/${id}`);
      toast.success("Đã xóa công thức");
      mutate(key);
    } catch {
      toast.error("Đã có lỗi xảy ra");
    } finally {
      setDeletingId(null);
    }
  }

  function handleTabChange(val: TabValue) {
    setTab(val);
    setPage(1);
  }

  return (
    <main className="min-h-screen bg-white py-10 px-4">
      {rejectTarget && (
        <RejectModal
          recipeId={rejectTarget.id}
          title={rejectTarget.title}
          onClose={() => setRejectTarget(null)}
          onDone={() => { setRejectTarget(null); mutate(key); }}
        />
      )}

      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground font-heading">Duyệt công thức</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {pagination ? `${pagination.total} công thức` : ""}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-muted rounded-xl mb-6 overflow-x-auto">
          {TABS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => handleTabChange(value as TabValue)}
              className={`
                flex-1 min-w-fit px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all
                ${tab === value
                  ? "bg-white text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
                }
              `}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : recipes.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-4xl mb-3">✅</p>
            <p className="font-medium text-foreground">Không có công thức nào</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recipes.map((recipe) => {
              const cleanTitle = stripEmoji(recipe.title);
              const imgSrc = recipe.image_url
                ? recipe.image_url.startsWith("http")
                  ? recipe.image_url
                  : `${process.env.NEXT_PUBLIC_API_URL}${recipe.image_url}`
                : null;

              return (
                <div
                  key={recipe.id}
                  className="bg-white border border-border rounded-2xl overflow-hidden flex items-stretch"
                >
                  {/* Thumbnail */}
                  <div className="relative w-24 shrink-0 bg-muted">
                    {imgSrc ? (
                      <Image src={imgSrc} alt={cleanTitle} fill className="object-cover" unoptimized />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-border">
                        <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M18.06 22.99h1.66c.84 0 1.53-.64 1.63-1.46L23 5.05h-5V1h-1.97v4.05h-4.97l.3 2.34c1.71.47 3.31 1.32 4.27 2.26 1.44 1.42 2.43 2.89 2.43 5.29v8.05zM1 21.99V21h15.03v.99c0 .55-.45 1-1.01 1H2.01c-.56 0-1.01-.45-1.01-1zm15.03-7c0-8.17-15.03-8.17-15.03 0h15.03zM1.02 17h15v2h-15z" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 p-4 flex flex-col sm:flex-row sm:items-center gap-3 min-w-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 flex-wrap">
                        <Link
                          href={`/recipes/${recipe.id}`}
                          target="_blank"
                          className="font-semibold text-foreground text-sm hover:text-primary transition-colors line-clamp-1"
                        >
                          {cleanTitle}
                        </Link>
                        <StatusBadge status={recipe.status} rejectReason={recipe.reject_reason} />
                      </div>

                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1.5 flex-wrap">
                        {recipe.author && (
                          <span>👤 {recipe.author.full_name}</span>
                        )}
                        {recipe.cooking_time && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {recipe.cooking_time}p
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {formatDate(recipe.created_at)}
                        </span>
                      </div>

                      {recipe.status === "rejected" && recipe.reject_reason && (
                        <p className="text-xs text-red-600 mt-1 line-clamp-1">
                          Lý do: {recipe.reject_reason}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Link
                        href={`/recipes/${recipe.id}`}
                        target="_blank"
                        className="p-2 rounded-lg border border-border text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
                        title="Xem trước"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>

                      {recipe.status !== "approved" && (
                        <button
                          onClick={() => handleApprove(recipe.id)}
                          disabled={approving === recipe.id}
                          className="p-2 rounded-lg bg-green-50 border border-green-200 text-green-600 hover:bg-green-100 transition-colors disabled:opacity-50"
                          title="Duyệt"
                        >
                          {approving === recipe.id
                            ? <div className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
                            : <Check className="w-4 h-4" />
                          }
                        </button>
                      )}

                      {recipe.status !== "rejected" && (
                        <button
                          onClick={() => setRejectTarget({ id: recipe.id, title: recipe.title })}
                          className="p-2 rounded-lg bg-red-50 border border-red-200 text-red-500 hover:bg-red-100 transition-colors"
                          title="Từ chối"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}

                      {recipe.is_canonical && (
                        <button
                          onClick={() => handleToggleReview(recipe.id, !!recipe.is_manually_reviewed)}
                          disabled={reviewingId === recipe.id}
                          className={`text-xs px-2 py-1 rounded-lg border transition-colors disabled:opacity-50 whitespace-nowrap ${
                            recipe.is_manually_reviewed
                              ? "bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-50"
                              : "bg-white text-muted-foreground border-border hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200"
                          }`}
                          title={recipe.is_manually_reviewed ? "Đã review (bấm để hủy)" : "Đánh dấu đã review"}
                        >
                          {reviewingId === recipe.id
                            ? "..."
                            : recipe.is_manually_reviewed
                              ? "✓ Reviewed"
                              : "Mark reviewed"}
                        </button>
                      )}

                      <button
                        onClick={() => handleDelete(recipe.id, recipe.title)}
                        disabled={deletingId === recipe.id}
                        className="p-2 rounded-lg border border-border text-muted-foreground hover:text-red-500 hover:border-red-200 transition-colors disabled:opacity-50"
                        title="Xóa"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.total_pages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-8">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:border-primary/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Trước
            </button>
            <span className="text-sm text-muted-foreground">
              {page} / {pagination.total_pages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))}
              disabled={page === pagination.total_pages}
              className="px-4 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:border-primary/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Sau
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
