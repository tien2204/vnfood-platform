"use client";

import { useState } from "react";
import MealSlot from "./MealSlot";
import AddRecipeModal from "./AddRecipeModal";
import type { MealPlanDays, MealType } from "@/lib/types";
import api from "@/lib/api";
import { toast } from "sonner";

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const DAY_LABELS = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "CN"];
const VI_MONTHS = ["tháng 1","tháng 2","tháng 3","tháng 4","tháng 5","tháng 6","tháng 7","tháng 8","tháng 9","tháng 10","tháng 11","tháng 12"];

function fmtShort(isoDate: string) {
  const [, m, d] = isoDate.split("-");
  return `${parseInt(d)}/${parseInt(m)}`;
}

function fmtLong(isoDate: string) {
  const [, m, d] = isoDate.split("-");
  return `${parseInt(d)} ${VI_MONTHS[parseInt(m) - 1]}`;
}

interface WeeklyCalendarProps {
  planId: string;
  days: MealPlanDays;
  onRefresh: () => void;
}

interface ActiveSlot {
  date: string;
  mealType: MealType;
}

export default function WeeklyCalendar({ planId, days, onRefresh }: WeeklyCalendarProps) {
  const [activeSlot, setActiveSlot] = useState<ActiveSlot | null>(null);
  const dayKeys = Object.keys(days).sort();

  async function handleDelete(itemId: string) {
    try {
      await api.delete(`/meal-plans/${planId}/items/${itemId}`);
      // Grocery list is a live view (rebuilt on read) — no regenerate call needed.
      onRefresh();
    } catch {
      toast.error("Không thể xóa món");
    }
  }

  async function handleUpdateServings(itemId: string, servings: number) {
    try {
      await api.put(`/meal-plans/${planId}/items/${itemId}`, { servings });
      onRefresh();
    } catch {
      toast.error("Không thể cập nhật khẩu phần");
    }
  }

  return (
    <>
      {/* Desktop: 7-column grid */}
      <div className="hidden md:block overflow-x-auto">
        <div className="min-w-[900px]">
          <div className="grid grid-cols-7 gap-2 mb-2">
            {dayKeys.map((dayKey, i) => (
              <div key={dayKey} className="rounded-xl border border-[var(--color-brand-pink)] bg-[var(--color-brand-pink-bg)] text-center py-1.5">
                <div className="text-xs font-bold text-primary">{DAY_LABELS[i]}</div>
                <div className="text-sm font-extrabold text-foreground">{fmtShort(dayKey)}</div>
              </div>
            ))}
          </div>

          {MEAL_TYPES.map((mealType) => (
            <div key={mealType} className="grid grid-cols-7 gap-2 mb-2">
              {dayKeys.map((dayKey) => (
                <MealSlot
                  key={`${dayKey}-${mealType}`}
                  mealType={mealType}
                  items={days[dayKey][mealType]}
                  onAdd={() => setActiveSlot({ date: dayKey, mealType })}
                  onDelete={handleDelete}
                  onUpdateServings={handleUpdateServings}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Mobile: vertical accordion per day */}
      <div className="md:hidden flex flex-col gap-3">
        {dayKeys.map((dayKey, i) => (
          <MobileDay
            key={dayKey}
            dayKey={dayKey}
            dayLabel={DAY_LABELS[i]}
            longLabel={fmtLong(dayKey)}
            daySlots={days[dayKey]}
            onAdd={(mealType) => setActiveSlot({ date: dayKey, mealType })}
            onDelete={handleDelete}
            onUpdateServings={handleUpdateServings}
          />
        ))}
      </div>

      {activeSlot && (
        <AddRecipeModal
          planId={planId}
          date={activeSlot.date}
          mealType={activeSlot.mealType}
          onClose={() => setActiveSlot(null)}
          onAdded={() => { setActiveSlot(null); onRefresh(); }}
        />
      )}
    </>
  );
}

function MobileDay({
  dayKey,
  dayLabel,
  longLabel,
  daySlots,
  onAdd,
  onDelete,
  onUpdateServings,
}: {
  dayKey: string;
  dayLabel: string;
  longLabel: string;
  daySlots: Record<MealType, any[]>;
  onAdd: (mealType: MealType) => void;
  onDelete: (itemId: string) => void;
  onUpdateServings: (itemId: string, servings: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const totalItems = MEAL_TYPES.reduce((sum, mt) => sum + daySlots[mt].length, 0);

  return (
    <div className="rounded-xl border border-[var(--color-brand-pink)] bg-[var(--color-brand-pink-bg)] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[var(--color-brand-pink)] hover:brightness-95 transition-all"
      >
        <div className="flex items-center gap-3">
          <div className="text-left">
            <div className="font-bold text-primary text-sm">{dayLabel}</div>
            <div className="text-xs text-primary/70">{longLabel}</div>
          </div>
          {totalItems > 0 && (
            <span className="text-xs bg-primary text-white rounded-full px-2 py-0.5">
              {totalItems} món
            </span>
          )}
        </div>
        <span className="text-primary text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="grid grid-cols-2 gap-2 p-3 bg-[var(--color-brand-pink-bg)]">
          {MEAL_TYPES.map((mealType) => (
            <MealSlot
              key={mealType}
              mealType={mealType}
              items={daySlots[mealType]}
              onAdd={() => onAdd(mealType)}
              onDelete={onDelete}
              onUpdateServings={onUpdateServings}
            />
          ))}
        </div>
      )}
    </div>
  );
}
