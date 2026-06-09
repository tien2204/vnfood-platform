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

// Pink frame for all slots — unified monngonmoingay style
const MEAL_COLORS: Record<MealType, string> = {
  breakfast: "bg-[var(--color-brand-pink-bg)] border-[var(--color-brand-pink)]",
  lunch: "bg-[var(--color-brand-pink-bg)] border-[var(--color-brand-pink)]",
  dinner: "bg-[var(--color-brand-pink-bg)] border-[var(--color-brand-pink)]",
  snack: "bg-[var(--color-brand-pink-bg)] border-[var(--color-brand-pink)]",
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
    <div className={`rounded-xl border overflow-hidden flex flex-col ${MEAL_COLORS[mealType]}`}>
      <div className="flex items-center justify-between px-2 py-1.5 bg-[var(--color-brand-pink)]">
        <span className="text-xs font-bold text-primary uppercase tracking-wide">
          {MEAL_LABELS[mealType]}
        </span>
        <button
          onClick={onAdd}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white border border-border text-primary hover:scale-110 transition-transform"
          style={{ boxShadow: '0 8px 16px #ec20283d' }}
          title="Thêm món"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>
      <div className="p-2 flex flex-col gap-1.5 min-h-[60px]">

      {items.length === 0 ? (
        <button
          onClick={onAdd}
          className="flex-1 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary transition-colors py-2"
        >
          <Plus className="w-4 h-4" />
          <span className="text-xs">Thêm món</span>
        </button>
      ) : (
        <div className="flex flex-col gap-1">
          {items.map((item) => (
            <div key={item.item_id} className="bg-white rounded-xl border border-border shadow-card overflow-hidden">
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
                  <p className="text-xs font-medium text-foreground truncate leading-tight">
                    {item.recipe?.title ?? "Recipe đã bị xóa"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{item.servings} người</p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => setExpandedItem(expandedItem === item.item_id ? null : item.item_id)}
                    className="p-0.5 hover:text-primary text-muted-foreground transition-colors"
                  >
                    {expandedItem === item.item_id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  <button
                    onClick={() => onDelete(item.item_id)}
                    className="p-0.5 hover:text-red-500 text-muted-foreground transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {expandedItem === item.item_id && (
                <div className="px-1.5 pb-1.5 border-t border-border">
                  <div className="flex items-center gap-1.5 pt-1.5">
                    <span className="text-[10px] text-muted-foreground">Khẩu phần:</span>
                    <button
                      onClick={() => onUpdateServings(item.item_id, Math.max(1, item.servings - 1))}
                      className="w-4 h-4 rounded border border-border flex items-center justify-center text-xs hover:bg-muted"
                    >
                      −
                    </button>
                    <span className="text-xs font-semibold w-4 text-center">{item.servings}</span>
                    <button
                      onClick={() => onUpdateServings(item.item_id, Math.min(20, item.servings + 1))}
                      className="w-4 h-4 rounded border border-border flex items-center justify-center text-xs hover:bg-muted"
                    >
                      +
                    </button>
                  </div>
                  {item.note && (
                    <p className="text-[10px] text-muted-foreground mt-1 italic">{item.note}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
