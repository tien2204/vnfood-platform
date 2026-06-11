"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Plus, Edit2, Trash2, Clock, Users } from "lucide-react";
import { toast } from "sonner";
import useSWR, { mutate } from "swr";
import StatusBadge from "@/components/recipes/StatusBadge";
import api from "@/lib/api";
import type { PaginatedResponse, RecipeCardWithStatus } from "@/lib/types";

const TABS = [
  { value: "", label: "Tất cả" },
  { value: "private", label: "Riêng tư" },
  { value: "approved", label: "Đã đăng" },
  { value: "rejected", label: "Bị từ chối" },
] as const;

type TabValue = "" | "private" | "pending_admin" | "approved" | "rejected";

function cacheKey(status: TabValue, page: number) {
  return `/users/me/recipes?status=${status}&page=${page}`;
}

async function fetcher(url: string) {
  const res = await api.get<PaginatedResponse<RecipeCardWithStatus>>(url);
  return res.data;
}

function stripEmoji(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, "")
    .trim();
}

export default function MyRecipesPage() {
  const [tab, setTab] = useState<TabValue>("");
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const key = cacheKey(tab, page);
  const { data, isLoading } = useSWR(key, fetcher);

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Xóa công thức "${title}"?`)) return;
    setDeleting(id);
    try {
      await api.delete(`/recipes/${id}`);
      toast.success("Đã xóa công thức");
      mutate(key);
    } catch {
      toast.error("Xóa thất bại");
    } finally {
      setDeleting(null);
    }
  }

  async function handleAction(id: string, path: string, okMsg: string) {
    setActing(id);
    try {
      await api.post(`/recipes/${id}/${path}`);
      toast.success(okMsg);
      mutate(key);
    } catch {
      toast.error("Thao tác thất bại");
    } finally {
      setActing(null);
    }
  }

  function handleTabChange(val: TabValue) {
    setTab(val);
    setPage(1);
  }

  const recipes = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <main className="min-h-screen bg-background py-10 px-4">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground font-heading">Công thức của tôi</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {pagination ? `${pagination.total} công thức` : "Đang tải..."}
            </p>
          </div>
          <Link
            href="/recipes/new"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-[#cc1c22] transition-colors"
          >
            <Plus className="w-4 h-4" /> Đăng công thức
          </Link>
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
                  ? "bg-card text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
                }
              `}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-40 rounded-2xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : recipes.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-4xl mb-3">🍽</p>
            <p className="font-medium text-foreground mb-1">Chưa có công thức nào</p>
            <p className="text-sm mb-6">Hãy đăng công thức đầu tiên của bạn!</p>
            <Link
              href="/recipes/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-[#cc1c22] transition-colors"
            >
              <Plus className="w-4 h-4" /> Đăng công thức
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {recipes.map((recipe) => {
              const cleanTitle = stripEmoji(recipe.title);
              const imgSrc = recipe.image_url
                ? recipe.image_url.startsWith("http")
                  ? recipe.image_url
                  : `${process.env.NEXT_PUBLIC_API_URL}${recipe.image_url}`
                : null;

              return (
                <article
                  key={recipe.id}
                  className="bg-card border border-border rounded-2xl overflow-hidden flex gap-0"
                >
                  {/* Thumbnail */}
                  <div className="relative w-28 shrink-0 bg-muted">
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
                  <div className="flex-1 p-3.5 flex flex-col justify-between min-w-0">
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <Link
                          href={`/recipes/${recipe.id}`}
                          className="font-semibold text-foreground text-sm line-clamp-2 hover:text-primary transition-colors leading-snug"
                        >
                          {cleanTitle}
                        </Link>
                        <StatusBadge status={recipe.status} rejectReason={recipe.reject_reason} />
                      </div>

                      {recipe.status === "rejected" && recipe.reject_reason && (
                        <p className="text-xs text-red-600 bg-red-50 rounded-md px-2 py-1 mt-1 line-clamp-2">
                          Lý do: {recipe.reject_reason}
                        </p>
                      )}

                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
                        {recipe.cooking_time && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {recipe.cooking_time}p
                          </span>
                        )}
                        {recipe.servings && (
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" /> {recipe.servings}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-2.5">
                      {(recipe.status === "private" || recipe.status === "rejected") && (
                        <button
                          onClick={() => handleAction(recipe.id, "submit", "Đã gửi duyệt")}
                          disabled={acting === recipe.id}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#2D6A4F] text-xs font-medium text-white hover:bg-[#245a43] transition-colors disabled:opacity-50"
                        >
                          Gửi duyệt
                        </button>
                      )}
                      {recipe.status === "pending_admin" && (
                        <button
                          onClick={() => handleAction(recipe.id, "withdraw", "Đã thu hồi")}
                          disabled={acting === recipe.id}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-50"
                        >
                          Thu hồi
                        </button>
                      )}
                      {recipe.source !== "cookpad" && (
                        <Link
                          href={`/recipes/${recipe.id}/edit`}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" /> Sửa
                        </Link>
                      )}
                      <button
                        onClick={() => handleDelete(recipe.id, recipe.title)}
                        disabled={deleting === recipe.id}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:border-red-300 hover:text-red-500 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {deleting === recipe.id ? "..." : "Xóa"}
                      </button>
                    </div>
                  </div>
                </article>
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
