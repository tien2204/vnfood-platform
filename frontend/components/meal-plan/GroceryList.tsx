"use client";

import { useState } from "react";
import { RefreshCw, ChevronDown, ChevronUp, Trash2, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GroceryList as GroceryListType, GroceryItem } from "@/lib/types";
import api from "@/lib/api";
import { toast } from "sonner";

const CATEGORY_LABELS: Record<string, string> = {
  "thit-ca": "Thịt & Hải sản",
  "rau-cu": "Rau củ quả",
  "gia-vi": "Gia vị & Nước chấm",
  "kho-dong-goi": "Khô & Đóng gói",
  khac: "Khác",
};
const CATEGORY_ORDER = ["thit-ca", "rau-cu", "gia-vi", "kho-dong-goi", "khac"];

interface GroceryListProps {
  planId: string;
  initial: GroceryListType;
}

export default function GroceryList({ planId, initial }: GroceryListProps) {
  const [data, setData] = useState<GroceryListType>(initial);
  const [regenerating, setRegenerating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newItem, setNewItem] = useState("");
  const [newQty, setNewQty] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleCheck(item: GroceryItem, checked: boolean) {
    // Optimistic update
    setData((prev) => ({
      ...prev,
      items: prev.items.map((i) => (i.id === item.id ? { ...i, is_checked: checked } : i)),
      checked_count: prev.items.filter((i) => (i.id === item.id ? checked : i.is_checked)).length,
    }));

    try {
      await api.patch(`/grocery-items/${item.id}`, { is_checked: checked });
    } catch {
      // Revert
      setData((prev) => ({
        ...prev,
        items: prev.items.map((i) => (i.id === item.id ? { ...i, is_checked: item.is_checked } : i)),
        checked_count: prev.items.filter((i) => (i.id === item.id ? item.is_checked : i.is_checked)).length,
      }));
      toast.error("Không thể cập nhật");
    }
  }

  async function handleDelete(itemId: string) {
    try {
      await api.delete(`/grocery-items/${itemId}`);
      setData((prev) => {
        const items = prev.items.filter((i) => i.id !== itemId);
        return { items, total_items: items.length, checked_count: items.filter((i) => i.is_checked).length };
      });
    } catch {
      toast.error("Không thể xóa");
    }
  }

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const res = await api.post(`/meal-plans/${planId}/grocery-list/regenerate`);
      setData(res.data.data);
      toast.success("Đã tạo lại danh sách mua sắm");
    } catch {
      toast.error("Không thể tạo lại danh sách");
    } finally {
      setRegenerating(false);
    }
  }

  async function handleAddManual() {
    if (!newItem.trim()) return;
    setAdding(true);
    try {
      const res = await api.post(`/meal-plans/${planId}/grocery-list/items`, {
        ingredient_name: newItem.trim(),
        quantity: newQty.trim() || null,
      });
      const item: GroceryItem = res.data.data;
      setData((prev) => ({
        items: [...prev.items, item],
        total_items: prev.total_items + 1,
        checked_count: prev.checked_count,
      }));
      setNewItem("");
      setNewQty("");
      toast.success("Đã thêm nguyên liệu");
    } catch {
      toast.error("Không thể thêm nguyên liệu");
    } finally {
      setAdding(false);
    }
  }

  const checkedItems = data.items.filter((i) => i.is_checked);
  const uncheckedItems = data.items.filter((i) => !i.is_checked);

  return (
    <div className="flex flex-col gap-4">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[#2D2417]">
            {data.checked_count}/{data.total_items} đã mua
          </span>
          {data.total_items > 0 && (
            <div className="w-24 h-1.5 bg-[#F0E8E0] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#2D6A4F] rounded-full transition-all"
                style={{ width: `${(data.checked_count / data.total_items) * 100}%` }}
              />
            </div>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-[#E8DDD4] text-[#7C6A56]"
          onClick={handleRegenerate}
          disabled={regenerating}
        >
          {regenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Tạo lại
        </Button>
      </div>

      {/* Items list */}
      {data.items.length === 0 ? (
        <div className="text-center py-12 text-[#B8A898]">
          <p className="text-4xl mb-3">🛒</p>
          <p className="font-medium">Danh sách mua sắm trống</p>
          <p className="text-sm mt-1">Thêm recipe vào lịch rồi nhấn "Tạo lại"</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {/* Unchecked — grouped by category */}
          {CATEGORY_ORDER.filter((cat) => uncheckedItems.some((i) => i.category === cat)).map((cat) => (
            <div key={cat} className="flex flex-col gap-1">
              <p className="text-[11px] font-semibold text-[#7C6A56] uppercase tracking-wide mt-2 mb-0.5">
                {CATEGORY_LABELS[cat] ?? cat}
              </p>
              {uncheckedItems
                .filter((i) => i.category === cat)
                .map((item) => (
                  <GroceryItemRow
                    key={item.id}
                    item={item}
                    expanded={expandedId === item.id}
                    onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
                    onCheck={(checked) => handleCheck(item, checked)}
                    onDelete={() => handleDelete(item.id)}
                  />
                ))}
            </div>
          ))}

          {/* Divider */}
          {checkedItems.length > 0 && uncheckedItems.length > 0 && (
            <div className="flex items-center gap-2 my-2">
              <div className="flex-1 h-px bg-[#E8DDD4]" />
              <span className="text-xs text-[#B8A898]">Đã mua ({checkedItems.length})</span>
              <div className="flex-1 h-px bg-[#E8DDD4]" />
            </div>
          )}

          {/* Checked */}
          {checkedItems.map((item) => (
            <GroceryItemRow
              key={item.id}
              item={item}
              expanded={expandedId === item.id}
              onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
              onCheck={(checked) => handleCheck(item, checked)}
              onDelete={() => handleDelete(item.id)}
            />
          ))}
        </div>
      )}

      {/* Add manual item */}
      <div className="border-t border-[#F0E8E0] pt-4">
        <p className="text-sm font-medium text-[#2D2417] mb-2">Thêm thủ công</p>
        <div className="flex gap-2">
          <Input
            placeholder="Tên nguyên liệu"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddManual()}
            className="flex-1 bg-[#F7F0E8] border-[#E8DDD4] focus-visible:ring-[#E85D26]"
          />
          <Input
            placeholder="Số lượng"
            value={newQty}
            onChange={(e) => setNewQty(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddManual()}
            className="w-28 bg-[#F7F0E8] border-[#E8DDD4] focus-visible:ring-[#E85D26]"
          />
          <Button
            onClick={handleAddManual}
            disabled={adding || !newItem.trim()}
            className="bg-[#E85D26] hover:bg-[#D44E1E] text-white shrink-0"
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function GroceryItemRow({
  item,
  expanded,
  onToggleExpand,
  onCheck,
  onDelete,
}: {
  item: GroceryItem;
  expanded: boolean;
  onToggleExpand: () => void;
  onCheck: (checked: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <div className={`rounded-lg border transition-colors ${item.is_checked ? "border-[#E8DDD4] bg-[#F9F6F2] opacity-70" : "border-[#E8DDD4] bg-white"}`}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <input
          type="checkbox"
          checked={item.is_checked}
          onChange={(e) => onCheck(e.target.checked)}
          className="w-4 h-4 rounded accent-[#2D6A4F] shrink-0 cursor-pointer"
        />
        <div className="flex-1 min-w-0">
          <span className={`text-sm font-medium ${item.is_checked ? "line-through text-[#B8A898]" : "text-[#2D2417]"}`}>
            {item.ingredient_name}
          </span>
          {item.quantity && (
            <span className="text-xs text-[#7C6A56] ml-1.5">{item.quantity}</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {item.from_recipes.length > 0 && (
            <button
              onClick={onToggleExpand}
              className="p-1 text-[#7C6A56] hover:text-[#E85D26] transition-colors"
              title="Từ công thức nào"
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
          <button
            onClick={onDelete}
            className="p-1 text-[#B8A898] hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {expanded && item.from_recipes.length > 0 && (
        <div className="px-3 pb-2.5 border-t border-[#F0E8E0]">
          <p className="text-[10px] font-semibold text-[#7C6A56] uppercase tracking-wide mb-1 pt-2">Từ công thức</p>
          <div className="flex flex-col gap-0.5">
            {item.from_recipes.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-xs text-[#7C6A56]">
                <span className="truncate">{r.title}</span>
                {r.quantity && <span className="ml-2 shrink-0 font-medium">{r.quantity}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
