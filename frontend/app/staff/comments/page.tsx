"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import useSWR, { mutate as globalMutate } from "swr";
import api from "@/lib/api";

interface AdminComment {
  id: string;
  content: string;
  is_hidden: boolean;
  created_at: string;
  user: { id: string | null; full_name: string | null; avatar_url: string | null };
  recipe: { id: string; title: string | null };
}

interface CommentsResponse {
  data: AdminComment[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
}

const FILTER_TABS = [
  { value: "", label: "Tất cả" },
  { value: "false", label: "Hiển thị" },
  { value: "true", label: "Đã ẩn" },
] as const;

function cacheKey(page: number, isHidden: string, search: string) {
  const params = new URLSearchParams({ page: String(page) });
  if (isHidden !== "") params.set("is_hidden", isHidden);
  if (search) params.set("search", search);
  return `/admin/comments?${params}`;
}

async function fetcher(url: string) {
  const res = await api.get<CommentsResponse>(url);
  return res.data;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function stripEmoji(text: string) {
  return text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, "").trim();
}

function UserAvatar({ user }: { user: AdminComment["user"] }) {
  if (user.avatar_url) {
    return (
      <div className="relative w-7 h-7 rounded-full overflow-hidden shrink-0">
        <Image src={user.avatar_url} alt={user.full_name ?? ""} fill className="object-cover" unoptimized />
      </div>
    );
  }
  return (
    <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 text-xs font-semibold text-primary">
      {(user.full_name ?? "?")[0].toUpperCase()}
    </div>
  );
}

export default function AdminCommentsPage() {
  const [page, setPage] = useState(1);
  const [isHiddenFilter, setIsHiddenFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const key = cacheKey(page, isHiddenFilter, search);
  const { data, isLoading } = useSWR(key, fetcher);

  const comments = data?.data ?? [];
  const pagination = data?.pagination;

  function handleFilterChange(val: string) {
    setIsHiddenFilter(val);
    setPage(1);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  async function toggleHide(comment: AdminComment) {
    setLoadingId(comment.id);
    try {
      await api.patch(`/admin/comments/${comment.id}`, { is_hidden: !comment.is_hidden });
      toast.success(comment.is_hidden ? "Đã hiện bình luận" : "Đã ẩn bình luận");
      globalMutate(key);
    } catch {
      toast.error("Đã có lỗi xảy ra");
    } finally {
      setLoadingId(null);
    }
  }

  async function deleteComment(comment: AdminComment) {
    if (!confirm("Xóa vĩnh viễn bình luận này?")) return;
    setLoadingId(comment.id);
    try {
      await api.delete(`/admin/comments/${comment.id}`);
      toast.success("Đã xóa bình luận");
      globalMutate(key);
    } catch {
      toast.error("Đã có lỗi xảy ra");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground font-heading">Bình luận</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{pagination ? `${pagination.total} bình luận` : ""}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {/* Tab filter */}
        <div className="flex gap-1 p-1 bg-muted rounded-xl">
          {FILTER_TABS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => handleFilterChange(value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${isHiddenFilter === value ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-0">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Tìm nội dung..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <button type="submit" className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-[#cc1c22]">
            Tìm
          </button>
        </form>
      </div>

      {/* Table */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="space-y-0">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-20 border-b border-muted animate-pulse bg-muted" />
            ))}
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-3xl mb-2">💬</p>
            <p className="font-medium text-foreground">Không có bình luận nào</p>
          </div>
        ) : (
          <>
            <div className="hidden md:grid grid-cols-[2fr_1.5fr_1fr_auto] gap-4 px-5 py-3 bg-muted text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <span>Nội dung</span>
              <span>Người dùng · Công thức</span>
              <span>Ngày · Trạng thái</span>
              <span>Hành động</span>
            </div>

            {comments.map((comment) => (
              <div
                key={comment.id}
                className={`grid grid-cols-1 md:grid-cols-[2fr_1.5fr_1fr_auto] gap-3 md:gap-4 px-5 py-4 border-b border-muted last:border-0 items-start md:items-center hover:bg-muted/50 transition-colors ${comment.is_hidden ? "opacity-70" : ""}`}
              >
                {/* Content */}
                <p className={`text-sm line-clamp-3 ${comment.is_hidden ? "line-through text-muted-foreground" : "text-foreground"}`}>
                  {comment.content}
                </p>

                {/* User + Recipe */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <UserAvatar user={comment.user} />
                    <span className="text-xs text-muted-foreground truncate">{comment.user.full_name ?? "Người dùng ẩn"}</span>
                  </div>
                  {comment.recipe.title && (
                    <Link
                      href={`/recipes/${comment.recipe.id}`}
                      target="_blank"
                      className="text-xs text-primary hover:underline line-clamp-1 block"
                    >
                      {stripEmoji(comment.recipe.title)}
                    </Link>
                  )}
                </div>

                {/* Date + Status */}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{formatDate(comment.created_at)}</p>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full inline-block ${comment.is_hidden ? "bg-red-100 text-red-600" : "bg-green-100 text-green-700"}`}>
                    {comment.is_hidden ? "Đã ẩn" : "Hiển thị"}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => toggleHide(comment)}
                    disabled={loadingId === comment.id}
                    className={`p-1.5 rounded-lg border transition-colors disabled:opacity-50 ${comment.is_hidden ? "border-green-200 text-green-600 hover:bg-green-50" : "border-orange-200 text-orange-500 hover:bg-orange-50"}`}
                    title={comment.is_hidden ? "Hiện" : "Ẩn"}
                  >
                    {comment.is_hidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => deleteComment(comment)}
                    disabled={loadingId === comment.id}
                    className="p-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                    title="Xóa"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.total_pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:border-primary/50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Trước
          </button>
          <span className="text-sm text-muted-foreground">{page} / {pagination.total_pages}</span>
          <button
            onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))}
            disabled={page === pagination.total_pages}
            className="px-4 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:border-primary/50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Sau
          </button>
        </div>
      )}
    </div>
  );
}
