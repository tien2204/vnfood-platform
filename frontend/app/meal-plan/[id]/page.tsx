"use client";

import { use } from "react";
import Link from "next/link";
import { ShoppingCart, ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import WeeklyCalendar from "@/components/meal-plan/WeeklyCalendar";
import useSWR from "swr";
import api from "@/lib/api";
import type { MealPlanDetail } from "@/lib/types";

const VI_MONTHS = ["Th1","Th2","Th3","Th4","Th5","Th6","Th7","Th8","Th9","Th10","Th11","Th12"];

function fmtWeekRange(weekStart: string) {
  const [y, m, d] = weekStart.split("-").map(Number);
  const end = new Date(y, m - 1, d + 6);
  return `${d} ${VI_MONTHS[m-1]} — ${end.getDate()} ${VI_MONTHS[end.getMonth()]} ${end.getFullYear()}`;
}

function fetcher(url: string) {
  return api.get(url).then((r) => r.data.data as MealPlanDetail);
}

export default function MealPlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: plan, isLoading, mutate } = useSWR<MealPlanDetail>(`/meal-plans/${id}`, fetcher);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Loader2 className="w-10 h-10 animate-spin text-[#E85D26]" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <p className="text-[#666666]">Không tìm thấy meal plan hoặc bạn không có quyền truy cập.</p>
        <Link href="/meal-plan" className="text-[#E85D26] text-sm mt-2 inline-block hover:underline">
          ← Quay lại
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/meal-plan"
            className="p-2 rounded-lg hover:bg-[#F7F0E8] text-[#666666] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-[#2D2417]" style={{ fontFamily: "var(--font-playfair)" }}>
              {plan.name}
            </h1>
            <p className="text-sm text-[#666666]">{fmtWeekRange(plan.week_start)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-[#f0f0f0] text-[#666666]"
            onClick={() => mutate()}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Làm mới
          </Button>
          <Link href={`/meal-plan/${id}/grocery`}>
            <Button className="bg-[#2D6A4F] hover:bg-[#245A42] text-white gap-2">
              <ShoppingCart className="w-4 h-4" />
              Grocery list
            </Button>
          </Link>
        </div>
      </div>

      {/* Legend */}
      <div className="hidden md:flex items-center gap-4 mb-4 text-xs text-[#666666]">
        {[
          { color: "bg-amber-100", label: "Sáng" },
          { color: "bg-green-100", label: "Trưa" },
          { color: "bg-orange-100", label: "Tối" },
          { color: "bg-purple-100", label: "Phụ" },
        ].map((l) => (
          <span key={l.label} className="flex items-center gap-1">
            <span className={`w-3 h-3 rounded ${l.color}`} />
            {l.label}
          </span>
        ))}
      </div>

      <WeeklyCalendar
        planId={id}
        days={plan.days}
        onRefresh={() => mutate()}
      />
    </div>
  );
}
