"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Calendar, Trash2, ChevronRight, Loader2, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import useSWR from "swr";
import api from "@/lib/api";
import { toast } from "sonner";
import type { MealPlanSummary, PaginatedResponse } from "@/lib/types";

const DAY_LABELS = ["Thứ 2","Thứ 3","Thứ 4","Thứ 5","Thứ 6","Thứ 7","CN"];
const VI_MONTHS = ["Th1","Th2","Th3","Th4","Th5","Th6","Th7","Th8","Th9","Th10","Th11","Th12"];

function fmtWeekRange(weekStart: string) {
  const [y, m, d] = weekStart.split("-").map(Number);
  const start = new Date(y, m - 1, d);
  const end = new Date(y, m - 1, d + 6);
  return `${d} ${VI_MONTHS[m-1]} — ${end.getDate()} ${VI_MONTHS[end.getMonth()]} ${end.getFullYear()}`;
}

function getMonday(d: Date): string {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return monday.toISOString().split("T")[0];
}

function getMondayOptions(): { value: string; label: string }[] {
  const options = [];
  const today = new Date();
  for (let w = -4; w <= 8; w++) {
    const monday = new Date(today);
    monday.setDate(today.getDate() + w * 7 - (today.getDay() === 0 ? 6 : today.getDay() - 1));
    const iso = monday.toISOString().split("T")[0];
    const [y, m, d] = iso.split("-").map(Number);
    const label = w === 0 ? `Tuần này (${d} ${VI_MONTHS[m-1]})` : w < 0 ? `${Math.abs(w)} tuần trước (${d} ${VI_MONTHS[m-1]})` : `${w} tuần tới (${d} ${VI_MONTHS[m-1]})`;
    options.push({ value: iso, label });
  }
  return options;
}

function fetcher(url: string) {
  return api.get(url).then((r) => r.data);
}

export default function MealPlanListPage() {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [planName, setPlanName] = useState("Meal Plan tuần này");
  const [weekStart, setWeekStart] = useState(getMonday(new Date()));
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, mutate } = useSWR<{ success: boolean; data: MealPlanSummary[]; pagination: any }>(
    "/users/me/meal-plans",
    fetcher
  );

  const plans = data?.data ?? [];
  const mondayOptions = getMondayOptions();

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await api.post("/meal-plans", { name: planName, week_start: weekStart });
      const plan = res.data.data;
      toast.success("Đã tạo meal plan!");
      setShowCreate(false);
      setPlanName("Meal Plan tuần này");
      mutate();
      router.push(`/meal-plan/${plan.id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Không thể tạo meal plan");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(planId: string) {
    if (!confirm("Xóa meal plan này? Grocery list cũng sẽ bị xóa.")) return;
    setDeletingId(planId);
    try {
      await api.delete(`/meal-plans/${planId}`);
      toast.success("Đã xóa");
      mutate();
    } catch {
      toast.error("Không thể xóa");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#2D2417]" style={{ fontFamily: "var(--font-playfair)" }}>
            Meal Plan
          </h1>
          <p className="text-sm text-[#7C6A56] mt-1">Lên kế hoạch bữa ăn theo tuần</p>
        </div>
        <Button
          onClick={() => setShowCreate(true)}
          className="bg-[#E85D26] hover:bg-[#D44E1E] text-white gap-2"
        >
          <Plus className="w-4 h-4" />
          Tạo plan mới
        </Button>
      </div>

      {/* Plans list */}
      {!data ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-[#E85D26]" />
        </div>
      ) : plans.length === 0 ? (
        <div className="text-center py-16 flex flex-col items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-[#F7F0E8] flex items-center justify-center">
            <UtensilsCrossed className="w-10 h-10 text-[#E85D26]" />
          </div>
          <div>
            <p className="font-semibold text-[#2D2417] text-lg">Chưa có meal plan nào</p>
            <p className="text-sm text-[#7C6A56] mt-1">Tạo plan đầu tiên để bắt đầu lên lịch bữa ăn!</p>
          </div>
          <Button
            onClick={() => setShowCreate(true)}
            className="bg-[#E85D26] hover:bg-[#D44E1E] text-white gap-2 mt-2"
          >
            <Plus className="w-4 h-4" />
            Tạo plan mới
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {plans.map((plan) => (
            <Link
              key={plan.id}
              href={`/meal-plan/${plan.id}`}
              className="block border border-[#E8DDD4] rounded-xl p-4 bg-white hover:border-[#E85D26] hover:shadow-md transition-all group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-[#F7F0E8] flex items-center justify-center shrink-0">
                    <Calendar className="w-5 h-5 text-[#E85D26]" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-[#2D2417] truncate">{plan.name}</p>
                    <p className="text-xs text-[#7C6A56] mt-0.5">{fmtWeekRange(plan.week_start)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-xs text-[#7C6A56] hidden sm:block">
                    {plan.items_count} món
                  </span>
                  <button
                    onClick={(e) => { e.preventDefault(); handleDelete(plan.id); }}
                    className="p-1.5 text-[#B8A898] hover:text-red-500 transition-colors"
                  >
                    {deletingId === plan.id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Trash2 className="w-4 h-4" />
                    }
                  </button>
                  <ChevronRight className="w-4 h-4 text-[#B8A898] group-hover:text-[#E85D26] transition-colors" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create modal */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#2D2417]">Tạo Meal Plan mới</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 pt-2">
            <div>
              <label className="text-sm font-medium text-[#2D2417] block mb-1.5">Tên plan</label>
              <Input
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                placeholder="VD: Tuần này"
                className="bg-[#F7F0E8] border-[#E8DDD4] focus-visible:ring-[#E85D26]"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[#2D2417] block mb-1.5">Tuần bắt đầu</label>
              <select
                value={weekStart}
                onChange={(e) => setWeekStart(e.target.value)}
                className="w-full rounded-md border border-[#E8DDD4] bg-[#F7F0E8] px-3 py-2 text-sm text-[#2D2417] focus:outline-none focus:ring-2 focus:ring-[#E85D26]"
              >
                {mondayOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <Button
              onClick={handleCreate}
              disabled={creating || !planName.trim()}
              className="bg-[#E85D26] hover:bg-[#D44E1E] text-white w-full mt-1"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Tạo plan
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
