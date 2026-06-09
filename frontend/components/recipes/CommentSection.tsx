"use client";

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Trash2, Send, X, Check } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import api from "@/lib/api";
import type { Comment, PaginatedResponse } from "@/lib/types";

interface CommentSectionProps {
  recipeId: string;
  isLoggedIn: boolean;
  currentUserId?: string;
  isAdmin?: boolean;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "vừa xong";
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  return new Date(dateStr).toLocaleDateString("vi-VN");
}

export default function CommentSection({
  recipeId,
  isLoggedIn,
  currentUserId,
  isAdmin = false,
}: CommentSectionProps) {
  const router = useRouter();
  const [comments, setComments] = useState<Comment[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const [newContent, setNewContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadPage(1, true);
  }, [recipeId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function loadPage(p: number, reset = false) {
    if (p === 1) setInitialLoading(true);
    else setLoadingMore(true);
    try {
      const res = await api.get<PaginatedResponse<Comment>>(
        `/recipes/${recipeId}/comments?page=${p}&limit=20`
      );
      const data = res.data;
      setComments((prev) => (reset ? data.data : [...prev, ...data.data]));
      setPage(p);
      setTotalPages(data.pagination.total_pages);
    } catch {
      toast.error("Không thể tải bình luận");
    } finally {
      setInitialLoading(false);
      setLoadingMore(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoggedIn) {
      router.push(`/auth/login?next=/recipes/${recipeId}`);
      return;
    }
    const content = newContent.trim();
    if (content.length < 2) {
      toast.error("Bình luận phải có ít nhất 2 ký tự");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post<{ success: boolean; data: Comment }>(
        `/recipes/${recipeId}/comments`,
        { content }
      );
      setComments((prev) => [res.data.data, ...prev]);
      setNewContent("");
      toast.success("Đã gửi bình luận");
    } catch {
      toast.error("Không thể gửi bình luận");
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(comment: Comment) {
    setEditingId(comment.id);
    setEditContent(comment.content);
    setMenuOpenId(null);
  }

  async function saveEdit(commentId: string) {
    const content = editContent.trim();
    if (content.length < 2) {
      toast.error("Bình luận phải có ít nhất 2 ký tự");
      return;
    }
    setSavingEdit(true);
    try {
      const res = await api.put<{ success: boolean; data: Comment }>(
        `/comments/${commentId}`,
        { content }
      );
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? res.data.data : c))
      );
      setEditingId(null);
      toast.success("Đã cập nhật bình luận");
    } catch {
      toast.error("Không thể cập nhật bình luận");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(commentId: string) {
    setMenuOpenId(null);
    if (!confirm("Xóa bình luận này?")) return;
    try {
      await api.delete(`/comments/${commentId}`);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      toast.success("Đã xóa bình luận");
    } catch {
      toast.error("Không thể xóa bình luận");
    }
  }

  return (
    <div className="space-y-6">
      {/* Comment form */}
      {isLoggedIn ? (
        <form onSubmit={handleSubmit} className="flex gap-3">
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Viết bình luận của bạn..."
            rows={2}
            maxLength={1000}
            className="flex-1 resize-none rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
          />
          <button
            type="submit"
            disabled={submitting || newContent.trim().length < 2}
            className="self-end px-4 py-3 bg-primary hover:bg-[#cc1c22] disabled:opacity-50 text-white rounded-xl transition-colors"
            aria-label="Gửi bình luận"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      ) : (
        <button
          onClick={() => router.push(`/auth/login?next=/recipes/${recipeId}`)}
          className="w-full py-3 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
        >
          Đăng nhập để bình luận
        </button>
      )}

      {/* Comment list */}
      {initialLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="w-9 h-9 rounded-full bg-muted shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-24 bg-muted rounded" />
                <div className="h-3 w-full bg-muted rounded" />
                <div className="h-3 w-3/4 bg-muted rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : comments.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">
          Chưa có bình luận nào. Hãy là người đầu tiên!
        </p>
      ) : (
        <div className="space-y-5">
          {comments.map((comment) => (
            <div key={comment.id} className="flex gap-3">
              <Avatar className="w-9 h-9 shrink-0">
                <AvatarImage src={comment.user?.avatar_url ?? undefined} />
                <AvatarFallback className="bg-primary text-white text-sm font-semibold">
                  {comment.user?.full_name?.charAt(0)?.toUpperCase() ?? "?"}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-foreground truncate">
                    {comment.user?.full_name ?? "Người dùng"}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {relativeTime(comment.created_at)}
                  </span>
                  {comment.updated_at !== comment.created_at && (
                    <span className="text-xs text-muted-foreground shrink-0">(đã sửa)</span>
                  )}
                </div>

                {editingId === comment.id ? (
                  <div className="flex gap-2">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={2}
                      maxLength={1000}
                      className="flex-1 resize-none rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                    />
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => saveEdit(comment.id)}
                        disabled={savingEdit}
                        className="p-1.5 rounded-lg bg-primary text-white hover:bg-[#cc1c22] disabled:opacity-50 transition-colors"
                        aria-label="Lưu"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1.5 rounded-lg border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                        aria-label="Hủy"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
                    {comment.content}
                  </p>
                )}
              </div>

              {/* Actions menu — visible to comment owner OR admin */}
              {(comment.is_mine || isAdmin) && editingId !== comment.id && (
                <div className="relative shrink-0" ref={menuOpenId === comment.id ? menuRef : undefined}>
                  <button
                    onClick={() => setMenuOpenId((id) => id === comment.id ? null : comment.id)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    aria-label="Tùy chọn"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                  {menuOpenId === comment.id && (
                    <div className="absolute right-0 top-8 z-10 bg-card border border-border rounded-xl shadow-lg py-1 min-w-[120px]">
                      {comment.is_mine && (
                        <button
                          onClick={() => startEdit(comment)}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Sửa
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(comment.id)}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Xóa
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {page < totalPages && (
            <button
              onClick={() => loadPage(page + 1)}
              disabled={loadingMore}
              className="w-full py-2.5 text-sm text-primary border border-border rounded-xl hover:border-primary hover:bg-[var(--color-brand-pink-bg)] disabled:opacity-50 transition-colors"
            >
              {loadingMore ? "Đang tải..." : "Xem thêm bình luận"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
