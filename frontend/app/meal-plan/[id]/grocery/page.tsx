"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import GroceryList from "@/components/meal-plan/GroceryList";
import useSWR from "swr";
import api from "@/lib/api";
import type { GroceryList as GroceryListType } from "@/lib/types";

function fetcher(url: string) {
  return api.get(url).then((r) => r.data.data as GroceryListType);
}

export default function GroceryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading } = useSWR<GroceryListType>(`/meal-plans/${id}/grocery-list`, fetcher);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link
          href={`/meal-plan/${id}`}
          className="p-2 rounded-lg hover:bg-[#F7F0E8] text-[#7C6A56] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-[#2D2417]" style={{ fontFamily: "var(--font-playfair)" }}>
            Danh sách mua sắm
          </h1>
          <p className="text-sm text-[#7C6A56]">Tổng hợp nguyên liệu từ lịch ăn</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-[#E85D26]" />
        </div>
      ) : data ? (
        <GroceryList planId={id} initial={data} />
      ) : (
        <div className="text-center py-12">
          <p className="text-[#7C6A56]">Không thể tải danh sách mua sắm.</p>
          <p className="text-sm text-[#B8A898] mt-1">
            Thêm món vào lịch để tự động tổng hợp nguyên liệu.
          </p>
        </div>
      )}
    </div>
  );
}
