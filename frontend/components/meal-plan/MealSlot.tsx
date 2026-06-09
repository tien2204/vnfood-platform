"use client";

import Image from "next/image";
import { Plus, X, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import type { MealPlanSlotItem, MealType } from "@/lib/types";

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Sáng",
  lunch: "Trưa",
  dinner: "Tối",
  snack: "Phụ",
};

const MEAL_COLORS: Record<MealType, string> = {
  breakfast: "bg-amber-50 border-amber-200",
  lunch: "bg-green-50 border-green-200",
  dinner: "bg-orange-50 border-orange-200",
  snack: "bg-purple-50 border-purple-200",
};

interface MealSlotProps {
  mealType: MealType;
  items: MealPlanSlotItem[];
  onAdd: () => void;
  onDelete: (itemId: string) => void;
  onUpdateServings: (itemId: string, servings: number) => void;
}

export default function MealSlot({ mealType, items, onAdd, onDelete, onUpdateServings }: MealSlotProps) {
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  return (
    <div className={`rounded-lg border p-2 min-h-[80px] flex flex-col gap-1.5 ${MEAL_COLORS[mealType]}`}>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-xs font-semibold text-[#666666] uppercase tracking-wide">
          {MEAL_LABELS[mealType]}
        </span>
        <button
          onClick={onAdd}
          className="w-5 h-5 rounded-full bg-white border border-[#f0f0f0] flex items-center justify-center hover:bg-[#E85D26] hover:border-[#E85D26] hover:text-white transition-colors"
          title="Thêm món"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      {items.length === 0 ? (
        <button
          onClick={onAdd}
          className="flex-1 flex flex-col items-center justify-center gap-1 text-[#B8A898] hover:text-[#E85D26] transition-colors py-2"
        >
          <Plus className="w-4 h-4" />
          <span className="text-xs">Thêm món</span>
        </button>
      ) : (
        <div className="flex flex-col gap-1">
          {items.map((item) => (
            <div key={item.item_id} className="bg-white rounded border border-[#f0f0f0] overflow-hidden">
              <div className="flex items-center gap-1.5 p-1.5">
                {item.recipe?.image_url && (
                  <div className="w-8 h-8 rounded overflow-hidden shrink-0">
                    <Image
                      src={item.recipe.image_url.startsWith("http") ? item.recipe.image_url : `${process.env.NEXT_PUBLIC_UPLOAD_URL}/${item.recipe.image_url}`}
                      alt={item.recipe.title}
                      width={32}
                      height={32}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[#2D2417] truncate leading-tight">
                    {item.recipe?.title ?? "Recipe đã bị xóa"}
                  </p>
                  <p className="text-[10px] text-[#666666]">{item.servings} người</p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => setExpandedItem(expandedItem === item.item_id ? null : item.item_id)}
                    className="p-0.5 hover:text-[#E85D26] text-[#666666] transition-colors"
                  >
                    {expandedItem === item.item_id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  <button
                    onClick={() => onDelete(item.item_id)}
                    className="p-0.5 hover:text-red-500 text-[#666666] transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {expandedItem === item.item_id && (
                <div className="px-1.5 pb-1.5 border-t border-[#F0E8E0]">
                  <div className="flex items-center gap-1.5 pt-1.5">
                    <span className="text-[10px] text-[#666666]">Khẩu phần:</span>
                    <button
                      onClick={() => onUpdateServings(item.item_id, Math.max(1, item.servings - 1))}
                      className="w-4 h-4 rounded border border-[#f0f0f0] flex items-center justify-center text-xs hover:bg-[#F7F0E8]"
                    >
                      −
                    </button>
                    <span className="text-xs font-semibold w-4 text-center">{item.servings}</span>
                    <button
                      onClick={() => onUpdateServings(item.item_id, Math.min(20, item.servings + 1))}
                      className="w-4 h-4 rounded border border-[#f0f0f0] flex items-center justify-center text-xs hover:bg-[#F7F0E8]"
                    >
                      +
                    </button>
                  </div>
                  {item.note && (
                    <p className="text-[10px] text-[#666666] mt-1 italic">{item.note}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
