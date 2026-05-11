"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { use } from "react";
import {
  ArrowLeft, Shield, ShieldOff, UserCog,
  BookOpen, MessageSquare, Users, Star, Brain, Calendar,
} from "lucide-react";
import { toast } from "sonner";
import useSWR, { mutate as globalMutate } from "swr";
import api from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

interface UserDetail {
  user: {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
    bio: string | null;
    role: "user" | "admin";
    is_active: boolean;
    created_at: string;
    updated_at: string;
  };
  stats: {
    recipe_count: number;
    comment_count: number;
    follower_count: number;
    following_count: number;
    total_ratings_given: number;
    ai_recognitions: number;
    joined_days: number;
  };
  recent_recipes: { id: string; title: string; image_url: string | null; status: string; created_at: string }[];
  recent_comments: { id: string; content: string; is_hidden: boolean; created_at: string; recipe: { id: string; title: string | null } }[];
}

function cacheKey(id: string) {
  return `/admin/users/${id}`;
}

async function fetcher(url: string) {
  const res = await api.get(url);
  return res.data.data as UserDetail;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function stripEmoji(text: string) {
  return text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, "").trim();
}

function StatPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 bg-[#F7F0E8] rounded-xl px-3 py-2">
      <span className="text-[#7C6A56]">{icon}</span>
      <div>
        <p className="text-xs text-[#7C6A56]">{label}</p>
        <p className="text-sm font-bold text-[#1C1209]">{value.toLocaleString("vi-VN")}</p>
      </div>
    </div>
  );
}

// ── Confirm modal ──────────────────────────────────────────────────────────────

function ConfirmModal({ title, desc, confirmText, danger, onConfirm, onClose }: {
  title: string; desc: string; confirmText: string; danger: boolean;
  onConfirm: () => Promise<void>; onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  async function go() {
    setLoading(true);
    await onConfirm();
    setLoading(false);
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h3 className="font-semibold text-[#1C1209]">{title}</h3>
        <p className="text-sm text-[#7C6A56]">{desc}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-[#E8DDD4] text-sm text-[#7C6A56]">Hủy</button>
          <button
            onClick={go} disabled={loading}
            className={`px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-60 ${danger ? "bg-red-500 hover:bg-red-600" : "bg-[#E85D26] hover:bg-[#d04d1e]"}`}
          >
            {loading ? "Đang xử lý..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab] = useState<"recipes" | "comments">("recipes");
  const [modal, setModal] = useState<"ban" | "unban" | "promote" | "demote" | null>(null);

  const key = cacheKey(id);
  const { data, isLoading } = useSWR(key, fetcher);

  async function handleAction(action: "ban" | "unban" | "promote" | "demote") {
    try {
      if (action === "ban" || action === "unban") {
        await api.patch(`/admin/users/${id}/status`, { is_active: action === "unban" });
      } else {
        await api.patch(`/admin/users/${id}/role`, { role: action === "promote" ? "admin" : "user" });
      }
      toast.success("Cập nhật thành công");
      globalMutate(key);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Đã có lỗi xảy ra";
      toast.error(msg);
    }
    setModal(null);
  }

  const MODAL_CONFIG: Record<string, { title: string; desc: string; confirmText: string; danger: boolean }> = {
    ban: { title: "Ban người dùng", desc: "Người dùng sẽ không đăng nhập được. Bình luận sẽ bị ẩn.", confirmText: "Ban", danger: true },
    unban: { title: "Unban người dùng", desc: "Khôi phục quyền truy cập và hiển thị bình luận.", confirmText: "Unban", danger: false },
    promote: { title: "Thăng quyền Admin", desc: "Người dùng sẽ có toàn quyền Admin.", confirmText: "Thăng quyền", danger: false },
    demote: { title: "Hạ quyền về User", desc: "Người dùng sẽ mất quyền Admin.", confirmText: "Hạ quyền", danger: true },
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-32 bg-[#F7F0E8] rounded-xl animate-pulse" />
        <div className="h-48 bg-[#F7F0E8] rounded-2xl animate-pulse" />
        <div className="h-64 bg-[#F7F0E8] rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-16">
        <p className="text-[#7C6A56]">Không tìm thấy người dùng</p>
        <Link href="/admin/users" className="text-sm text-[#E85D26] mt-2 inline-block">← Quay lại</Link>
      </div>
    );
  }

  const { user, stats, recent_recipes, recent_comments } = data;

  return (
    <div className="space-y-6">
      {modal && (
        <ConfirmModal
          {...MODAL_CONFIG[modal]}
          onConfirm={() => handleAction(modal)}
          onClose={() => setModal(null)}
        />
      )}

      {/* Back */}
      <Link href="/admin/users" className="inline-flex items-center gap-1.5 text-sm text-[#7C6A56] hover:text-[#1C1209] transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Danh sách người dùng
      </Link>

      {/* Profile card */}
      <div className="bg-white rounded-2xl border border-[#E8DDD4] shadow-sm p-6">
        <div className="flex flex-col sm:flex-row gap-5">
          {/* Avatar */}
          <div className="shrink-0">
            {user.avatar_url ? (
              <div className="relative w-20 h-20 rounded-2xl overflow-hidden">
                <Image src={user.avatar_url} alt={user.full_name ?? ""} fill className="object-cover" unoptimized />
              </div>
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-[#F7F0E8] flex items-center justify-center text-2xl font-bold text-[#E85D26]">
                {(user.full_name ?? user.email)[0].toUpperCase()}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-[#1C1209] font-heading">{user.full_name ?? "Chưa đặt tên"}</h1>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${user.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-[#F7F0E8] text-[#7C6A56]"}`}>
                {user.role === "admin" ? "Admin" : "User"}
              </span>
              {!user.is_active && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-600">Bị ban</span>
              )}
            </div>
            <p className="text-sm text-[#7C6A56] mt-0.5">{user.email}</p>
            {user.bio && <p className="text-sm text-[#7C6A56] mt-2 line-clamp-2">{user.bio}</p>}
            <div className="flex items-center gap-1.5 mt-2 text-xs text-[#7C6A56]">
              <Calendar className="w-3 h-3" />
              Tham gia {formatDate(user.created_at)} · {stats.joined_days} ngày
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 shrink-0 flex-wrap sm:flex-col sm:items-end">
            <button
              onClick={() => setModal(user.is_active ? "ban" : "unban")}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${user.is_active ? "border-red-200 text-red-600 hover:bg-red-50" : "border-green-200 text-green-600 hover:bg-green-50"}`}
            >
              {user.is_active ? <ShieldOff className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
              {user.is_active ? "Ban" : "Unban"}
            </button>
            <button
              onClick={() => setModal(user.role === "admin" ? "demote" : "promote")}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border border-purple-200 text-purple-600 hover:bg-purple-50 transition-colors"
            >
              <UserCog className="w-3.5 h-3.5" />
              {user.role === "admin" ? "Hạ quyền" : "Thăng Admin"}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-5 pt-5 border-t border-[#F7F0E8]">
          <StatPill icon={<BookOpen className="w-4 h-4" />} label="Công thức" value={stats.recipe_count} />
          <StatPill icon={<MessageSquare className="w-4 h-4" />} label="Bình luận" value={stats.comment_count} />
          <StatPill icon={<Users className="w-4 h-4" />} label="Người theo dõi" value={stats.follower_count} />
          <StatPill icon={<Users className="w-4 h-4" />} label="Đang theo dõi" value={stats.following_count} />
          <StatPill icon={<Star className="w-4 h-4" />} label="Đã đánh giá" value={stats.total_ratings_given} />
          <StatPill icon={<Brain className="w-4 h-4" />} label="AI nhận diện" value={stats.ai_recognitions} />
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-[#E8DDD4] shadow-sm overflow-hidden">
        <div className="flex border-b border-[#E8DDD4]">
          {([["recipes", "Công thức gần đây", BookOpen], ["comments", "Bình luận gần đây", MessageSquare]] as const).map(([val, label, Icon]) => (
            <button
              key={val}
              onClick={() => setTab(val)}
              className={`flex items-center gap-1.5 px-5 py-3.5 text-sm font-medium border-b-2 transition-colors ${tab === val ? "border-[#E85D26] text-[#E85D26]" : "border-transparent text-[#7C6A56] hover:text-[#1C1209]"}`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {tab === "recipes" && (
            recent_recipes.length === 0 ? (
              <p className="text-sm text-[#7C6A56] text-center py-8">Chưa có công thức nào</p>
            ) : (
              <div className="space-y-3">
                {recent_recipes.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-[#F7F0E8] transition-colors">
                    {r.image_url && (
                      <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0">
                        <Image src={r.image_url.startsWith("http") ? r.image_url : `${process.env.NEXT_PUBLIC_API_URL}${r.image_url}`} alt="" fill className="object-cover" unoptimized />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <Link href={`/recipes/${r.id}`} target="_blank" className="text-sm font-medium text-[#1C1209] hover:text-[#E85D26] line-clamp-1">
                        {stripEmoji(r.title)}
                      </Link>
                      <p className="text-xs text-[#7C6A56]">{formatDate(r.created_at)}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.status === "approved" ? "bg-green-100 text-green-700" : r.status === "pending" ? "bg-orange-100 text-orange-700" : "bg-red-100 text-red-600"}`}>
                      {r.status === "approved" ? "Đã duyệt" : r.status === "pending" ? "Chờ duyệt" : "Từ chối"}
                    </span>
                  </div>
                ))}
              </div>
            )
          )}

          {tab === "comments" && (
            recent_comments.length === 0 ? (
              <p className="text-sm text-[#7C6A56] text-center py-8">Chưa có bình luận nào</p>
            ) : (
              <div className="space-y-3">
                {recent_comments.map((c) => (
                  <div key={c.id} className={`p-3 rounded-xl border ${c.is_hidden ? "border-red-100 bg-red-50" : "border-[#E8DDD4]"}`}>
                    <p className="text-sm text-[#1C1209] line-clamp-2">{c.content}</p>
                    <div className="flex items-center justify-between mt-1.5 text-xs text-[#7C6A56]">
                      <span>
                        {c.recipe.title && (
                          <Link href={`/recipes/${c.recipe.id}`} target="_blank" className="hover:text-[#E85D26]">
                            {stripEmoji(c.recipe.title)}
                          </Link>
                        )}
                      </span>
                      <div className="flex items-center gap-2">
                        {c.is_hidden && <span className="text-red-500 font-medium">Đã ẩn</span>}
                        <span>{formatDate(c.created_at)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
