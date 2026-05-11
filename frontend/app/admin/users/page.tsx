"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Search, Shield, ShieldOff, UserCog, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import useSWR, { mutate as globalMutate } from "swr";
import api from "@/lib/api";

interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: "user" | "admin";
  is_active: boolean;
  created_at: string;
  stats: { recipe_count: number; comment_count: number; follower_count: number };
}

interface UsersResponse {
  data: AdminUser[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
}

function cacheKey(page: number, search: string, role: string, isActive: string) {
  const params = new URLSearchParams({ page: String(page) });
  if (search) params.set("search", search);
  if (role) params.set("role", role);
  if (isActive !== "") params.set("is_active", isActive);
  return `/admin/users?${params}`;
}

async function fetcher(url: string) {
  const res = await api.get<UsersResponse>(url);
  return res.data;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function UserAvatar({ user }: { user: AdminUser }) {
  if (user.avatar_url) {
    return (
      <div className="relative w-9 h-9 rounded-full overflow-hidden shrink-0">
        <Image src={user.avatar_url} alt={user.full_name ?? ""} fill className="object-cover" unoptimized />
      </div>
    );
  }
  return (
    <div className="w-9 h-9 rounded-full bg-[#F7F0E8] flex items-center justify-center shrink-0 text-sm font-semibold text-[#E85D26]">
      {(user.full_name ?? user.email)[0].toUpperCase()}
    </div>
  );
}

// ── Role / Status Change Modal ─────────────────────────────────────────────────

interface ActionModalProps {
  user: AdminUser;
  action: "ban" | "unban" | "promote" | "demote";
  onClose: () => void;
  onDone: () => void;
}

function ActionModal({ user, action, onClose, onDone }: ActionModalProps) {
  const [loading, setLoading] = useState(false);

  const CONFIG = {
    ban: { title: "Ban người dùng", desc: "Người dùng sẽ không đăng nhập được. Bình luận sẽ bị ẩn.", confirmText: "Ban", danger: true },
    unban: { title: "Unban người dùng", desc: "Khôi phục quyền truy cập và hiển thị bình luận.", confirmText: "Unban", danger: false },
    promote: { title: "Thăng quyền Admin", desc: "Người dùng sẽ có toàn quyền Admin.", confirmText: "Thăng quyền", danger: false },
    demote: { title: "Hạ quyền về User", desc: "Người dùng sẽ mất quyền Admin.", confirmText: "Hạ quyền", danger: true },
  };

  const cfg = CONFIG[action];

  async function handleConfirm() {
    setLoading(true);
    try {
      if (action === "ban" || action === "unban") {
        await api.patch(`/admin/users/${user.id}/status`, { is_active: action === "unban" });
      } else {
        await api.patch(`/admin/users/${user.id}/role`, { role: action === "promote" ? "admin" : "user" });
      }
      toast.success("Cập nhật thành công");
      onDone();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Đã có lỗi xảy ra";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h3 className="font-semibold text-[#1C1209]">{cfg.title}</h3>
        <p className="text-sm text-[#7C6A56]">
          <span className="font-medium text-[#1C1209]">{user.full_name ?? user.email}</span>
        </p>
        <p className="text-sm text-[#7C6A56]">{cfg.desc}</p>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-[#E8DDD4] text-sm text-[#7C6A56] hover:text-[#1C1209]">Hủy</button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className={`px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-60 ${cfg.danger ? "bg-red-500 hover:bg-red-600" : "bg-[#E85D26] hover:bg-[#d04d1e]"}`}
          >
            {loading ? "Đang xử lý..." : cfg.confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [modal, setModal] = useState<{ user: AdminUser; action: "ban" | "unban" | "promote" | "demote" } | null>(null);

  const key = cacheKey(page, search, roleFilter, activeFilter);
  const { data, isLoading } = useSWR(key, fetcher);

  const users = data?.data ?? [];
  const pagination = data?.pagination;

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  function handleFilter(role: string, active: string) {
    setRoleFilter(role);
    setActiveFilter(active);
    setPage(1);
  }

  function handleModalDone() {
    setModal(null);
    globalMutate(key);
  }

  return (
    <div className="space-y-6">
      {modal && (
        <ActionModal
          user={modal.user}
          action={modal.action}
          onClose={() => setModal(null)}
          onDone={handleModalDone}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1C1209] font-heading">Người dùng</h1>
          <p className="text-sm text-[#7C6A56] mt-0.5">{pagination ? `${pagination.total} người dùng` : ""}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-0">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#7C6A56]" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Tìm email, tên..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#E8DDD4] bg-white text-sm text-[#1C1209] placeholder:text-[#B5A395] focus:outline-none focus:ring-2 focus:ring-[#E85D26]/30"
            />
          </div>
          <button type="submit" className="px-4 py-2 rounded-xl bg-[#E85D26] text-white text-sm font-medium hover:bg-[#d04d1e] transition-colors">
            Tìm
          </button>
        </form>

        <select
          value={roleFilter}
          onChange={(e) => handleFilter(e.target.value, activeFilter)}
          className="px-3 py-2 rounded-xl border border-[#E8DDD4] bg-white text-sm text-[#1C1209] focus:outline-none focus:ring-2 focus:ring-[#E85D26]/30"
        >
          <option value="">Tất cả role</option>
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>

        <select
          value={activeFilter}
          onChange={(e) => handleFilter(roleFilter, e.target.value)}
          className="px-3 py-2 rounded-xl border border-[#E8DDD4] bg-white text-sm text-[#1C1209] focus:outline-none focus:ring-2 focus:ring-[#E85D26]/30"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="true">Đang hoạt động</option>
          <option value="false">Đã bị ban</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-[#E8DDD4] overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="space-y-0">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-16 border-b border-[#F7F0E8] animate-pulse bg-[#FFFBF5]" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-16 text-[#7C6A56]">
            <p className="text-3xl mb-2">👥</p>
            <p className="font-medium text-[#1C1209]">Không có người dùng nào</p>
          </div>
        ) : (
          <>
            {/* Desktop header */}
            <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 bg-[#F7F0E8] text-xs font-semibold text-[#7C6A56] uppercase tracking-wider">
              <span>Người dùng</span>
              <span>Role</span>
              <span>Thống kê</span>
              <span>Ngày tham gia</span>
              <span>Hành động</span>
            </div>

            {users.map((user) => (
              <div
                key={user.id}
                className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 md:gap-4 px-5 py-4 border-b border-[#F7F0E8] last:border-0 items-center hover:bg-[#FFFBF5] transition-colors"
              >
                {/* User info */}
                <div className="flex items-center gap-3 min-w-0">
                  <UserAvatar user={user} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#1C1209] truncate">{user.full_name ?? "—"}</p>
                    <p className="text-xs text-[#7C6A56] truncate">{user.email}</p>
                    {!user.is_active && (
                      <span className="inline-block text-[10px] font-medium bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full mt-0.5">
                        Bị ban
                      </span>
                    )}
                  </div>
                </div>

                {/* Role */}
                <div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${user.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-[#F7F0E8] text-[#7C6A56]"}`}>
                    {user.role === "admin" ? "Admin" : "User"}
                  </span>
                </div>

                {/* Stats */}
                <div className="text-xs text-[#7C6A56] space-y-0.5">
                  <p>{user.stats.recipe_count} công thức</p>
                  <p>{user.stats.follower_count} người theo dõi</p>
                </div>

                {/* Date */}
                <div className="text-xs text-[#7C6A56]">{formatDate(user.created_at)}</div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Link
                    href={`/admin/users/${user.id}`}
                    className="p-1.5 rounded-lg border border-[#E8DDD4] text-[#7C6A56] hover:text-[#E85D26] hover:border-[#E85D26]/50 transition-colors"
                    title="Xem chi tiết"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                  <button
                    onClick={() => setModal({ user, action: user.is_active ? "ban" : "unban" })}
                    className={`p-1.5 rounded-lg border transition-colors ${user.is_active ? "border-red-200 text-red-500 hover:bg-red-50" : "border-green-200 text-green-600 hover:bg-green-50"}`}
                    title={user.is_active ? "Ban" : "Unban"}
                  >
                    {user.is_active ? <ShieldOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => setModal({ user, action: user.role === "admin" ? "demote" : "promote" })}
                    className="p-1.5 rounded-lg border border-purple-200 text-purple-600 hover:bg-purple-50 transition-colors"
                    title={user.role === "admin" ? "Hạ quyền" : "Thăng quyền Admin"}
                  >
                    <UserCog className="w-4 h-4" />
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
            className="px-4 py-2 rounded-xl border border-[#E8DDD4] text-sm text-[#7C6A56] hover:border-[#E85D26]/50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Trước
          </button>
          <span className="text-sm text-[#7C6A56]">{page} / {pagination.total_pages}</span>
          <button
            onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))}
            disabled={page === pagination.total_pages}
            className="px-4 py-2 rounded-xl border border-[#E8DDD4] text-sm text-[#7C6A56] hover:border-[#E85D26]/50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Sau
          </button>
        </div>
      )}
    </div>
  );
}
