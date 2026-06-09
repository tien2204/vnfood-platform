"use client";

import { useState } from "react";
import { Search, GitMerge, Pencil, X, Plus } from "lucide-react";
import { toast } from "sonner";
import useSWR, { mutate as globalMutate } from "swr";
import api from "@/lib/api";

interface Ingredient {
  name: string;
  usage_count: number;
}

interface IngredientsResponse {
  data: Ingredient[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
}

function cacheKey(page: number, search: string) {
  const params = new URLSearchParams({ page: String(page), limit: "50" });
  if (search) params.set("search", search);
  return `/admin/ingredients?${params}`;
}

async function fetcher(url: string) {
  const res = await api.get<IngredientsResponse>(url);
  return res.data;
}

// ── Merge Modal ────────────────────────────────────────────────────────────────

interface MergeModalProps {
  initial?: Ingredient;
  onClose: () => void;
  onDone: () => void;
}

function MergeModal({ initial, onClose, onDone }: MergeModalProps) {
  const [toName, setToName] = useState(initial?.name ?? "");
  const [fromInput, setFromInput] = useState("");
  const [fromList, setFromList] = useState<string[]>(initial ? [] : []);
  const [loading, setLoading] = useState(false);

  function addFrom() {
    const trimmed = fromInput.trim();
    if (!trimmed || fromList.includes(trimmed)) return;
    setFromList((prev) => [...prev, trimmed]);
    setFromInput("");
  }

  function removeFrom(name: string) {
    setFromList((prev) => prev.filter((n) => n !== name));
  }

  async function handleMerge() {
    if (!toName.trim()) { toast.error("Nhập tên đích"); return; }
    if (fromList.length === 0) { toast.error("Thêm ít nhất 1 tên nguồn"); return; }
    setLoading(true);
    try {
      const res = await api.post("/admin/ingredients/merge", { from_names: fromList, to_name: toName.trim() });
      toast.success(`Đã gộp ${res.data.data.updated_count} dòng`);
      onDone();
    } catch {
      toast.error("Đã có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <GitMerge className="w-4 h-4 text-primary" />
          Gộp nguyên liệu
        </h3>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Tên đích (kết quả sau gộp)</label>
          <input
            value={toName}
            onChange={(e) => setToName(e.target.value)}
            placeholder="vd: thịt bò"
            className="w-full px-3 py-2 rounded-xl border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Các tên nguồn (sẽ bị đổi thành tên đích)</label>
          <div className="flex gap-2">
            <input
              value={fromInput}
              onChange={(e) => setFromInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addFrom())}
              placeholder="Thêm tên và nhấn Enter"
              className="flex-1 px-3 py-2 rounded-xl border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              onClick={addFrom}
              className="p-2 rounded-xl bg-muted text-primary hover:bg-primary hover:text-white transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {fromList.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {fromList.map((name) => (
                <span key={name} className="flex items-center gap-1 bg-muted rounded-full px-2.5 py-1 text-xs text-foreground">
                  {name}
                  <button onClick={() => removeFrom(name)} className="text-muted-foreground hover:text-red-500">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-border text-sm text-muted-foreground">Hủy</button>
          <button
            onClick={handleMerge}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-[#cc1c22] disabled:opacity-60"
          >
            {loading ? "Đang gộp..." : "Gộp"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Rename Modal ───────────────────────────────────────────────────────────────

interface RenameModalProps {
  ingredient: Ingredient;
  onClose: () => void;
  onDone: () => void;
}

function RenameModal({ ingredient, onClose, onDone }: RenameModalProps) {
  const [toName, setToName] = useState(ingredient.name);
  const [loading, setLoading] = useState(false);

  async function handleRename() {
    if (!toName.trim() || toName.trim() === ingredient.name) { toast.error("Nhập tên mới khác tên cũ"); return; }
    setLoading(true);
    try {
      const res = await api.post("/admin/ingredients/rename", { from: ingredient.name, to: toName.trim() });
      toast.success(`Đã đổi tên ${res.data.data.updated_count} dòng`);
      onDone();
    } catch {
      toast.error("Đã có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Pencil className="w-4 h-4 text-primary" />
          Đổi tên nguyên liệu
        </h3>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Tên cũ</label>
          <p className="text-sm font-medium text-foreground bg-muted px-3 py-2 rounded-xl">{ingredient.name}</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Tên mới</label>
          <input
            value={toName}
            onChange={(e) => setToName(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-border text-sm text-muted-foreground">Hủy</button>
          <button
            onClick={handleRename}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-[#cc1c22] disabled:opacity-60"
          >
            {loading ? "Đang đổi..." : "Đổi tên"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AdminIngredientsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [mergeModal, setMergeModal] = useState<Ingredient | null | "new">(null);
  const [renameModal, setRenameModal] = useState<Ingredient | null>(null);

  const key = cacheKey(page, search);
  const { data, isLoading } = useSWR(key, fetcher);

  const ingredients = data?.data ?? [];
  const pagination = data?.pagination;

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  function handleDone() {
    setMergeModal(null);
    setRenameModal(null);
    globalMutate(key);
  }

  return (
    <div className="space-y-6">
      {/* Modals */}
      {mergeModal !== null && (
        <MergeModal
          initial={mergeModal === "new" ? undefined : mergeModal}
          onClose={() => setMergeModal(null)}
          onDone={handleDone}
        />
      )}
      {renameModal && (
        <RenameModal
          ingredient={renameModal}
          onClose={() => setRenameModal(null)}
          onDone={handleDone}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground font-heading">Nguyên liệu</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{pagination ? `${pagination.total} tên nguyên liệu` : ""}</p>
        </div>
        <button
          onClick={() => setMergeModal("new")}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-[#cc1c22] transition-colors"
        >
          <GitMerge className="w-4 h-4" />
          Gộp nguyên liệu
        </button>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Tìm nguyên liệu..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <button type="submit" className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-[#cc1c22]">
          Tìm
        </button>
        {search && (
          <button
            type="button"
            onClick={() => { setSearch(""); setSearchInput(""); setPage(1); }}
            className="px-3 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground"
          >
            Xóa
          </button>
        )}
      </form>

      {/* Table */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="space-y-0">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-14 border-b border-muted animate-pulse bg-muted" />
            ))}
          </div>
        ) : ingredients.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-3xl mb-2">🌿</p>
            <p className="font-medium text-foreground">Không có nguyên liệu nào</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-5 py-3 bg-muted text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <span>Tên nguyên liệu</span>
              <span className="text-right">Số lần dùng</span>
              <span>Hành động</span>
            </div>

            {ingredients.map((ingredient, idx) => (
              <div
                key={ingredient.name}
                className="grid grid-cols-[1fr_auto_auto] gap-4 px-5 py-3.5 border-b border-muted last:border-0 items-center hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs text-muted-foreground w-6 text-right shrink-0">
                    {(page - 1) * 50 + idx + 1}
                  </span>
                  <span className="text-sm font-medium text-foreground truncate">{ingredient.name}</span>
                </div>

                <div className="text-right">
                  <span className="text-sm text-muted-foreground">{ingredient.usage_count.toLocaleString("vi-VN")}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setMergeModal(ingredient)}
                    className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
                    title="Gộp vào nguyên liệu khác"
                  >
                    <GitMerge className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setRenameModal(ingredient)}
                    className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
                    title="Đổi tên"
                  >
                    <Pencil className="w-3.5 h-3.5" />
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

      {/* Info box */}
      <div className="bg-muted rounded-2xl p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1">Hướng dẫn</p>
        <ul className="space-y-1 list-disc list-inside">
          <li><strong>Gộp:</strong> Chọn tên đích → thêm các tên variant → tất cả sẽ đổi thành tên đích</li>
          <li><strong>Đổi tên:</strong> Sửa lỗi chính tả hoặc chuẩn hóa (vd: "Thit bo" → "thịt bò")</li>
        </ul>
      </div>
    </div>
  );
}
