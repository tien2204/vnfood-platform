"use client";

import { useState } from "react";
import Link from "next/link";
import { Bookmark, BookmarkX, ChevronLeft, ChevronRight } from "lucide-react";
import useSWR from "swr";
import RecipeGrid from "@/components/recipes/RecipeGrid";
import api from "@/lib/api";
import type { PaginatedResponse, RecipeCard, SavedRecipeOut } from "@/lib/types";

const PAGE_SIZE = 20;

const fetcher = (url: string) =>
  api.get<PaginatedResponse<SavedRecipeOut>>(url).then((r) => r.data);

export default function SavedRecipesPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading, mutate } = useSWR(
    `/me/saved-recipes?page=${page}&limit=${PAGE_SIZE}`,
    fetcher
  );

  const recipes = (data?.data ?? []) as unknown as RecipeCard[];
  const pagination = data?.pagination;
  const isEmpty = !isLoading && recipes.length === 0;

  const handleSaveChange = (
    recipeId: string,
    isSaved: boolean,
  ) => {
    if (isSaved) return; // chỉ remove khi unsave
    mutate(
      (current) => {
        if (!current) return current;
        return {
          ...current,
          data: current.data.filter((r) => r.id !== recipeId),
          pagination: {
            ...current.pagination,
            total: Math.max(0, current.pagination.total - 1),
          },
        };
      },
      { revalidate: false }
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/recipes"
          className="inline-flex items-center gap-1.5 text-sm text-[#7C6A56] hover:text-[#E85D26] mb-4 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Khám phá công thức
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#E85D26]/10 flex items-center justify-center">
            <Bookmark className="w-5 h-5 text-[#E85D26]" />
          </div>
          <div>
            <h1
              className="text-2xl sm:text-3xl font-bold text-[#1C1209]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Công thức đã lưu
            </h1>
            {pagination && !isLoading && (
              <p className="text-sm text-[#7C6A56] mt-0.5">
                {pagination.total} công thức
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      {isEmpty ? (
        <EmptyState />
      ) : (
        <>
          <RecipeGrid
            recipes={recipes}
            loading={isLoading}
            skeletonCount={PAGE_SIZE}
            onSaveChange={handleSaveChange}
            showVariantAction
          />

          {/* Pagination */}
          {pagination && pagination.total_pages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-10">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg border border-[#E8DDD4] text-[#7C6A56] hover:border-[#E85D26] hover:text-[#E85D26] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Trang trước"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {Array.from({ length: pagination.total_pages }, (_, i) => i + 1)
                .filter(
                  (p) =>
                    p === 1 ||
                    p === pagination.total_pages ||
                    Math.abs(p - page) <= 1
                )
                .reduce<(number | "…")[]>((acc, p, i, arr) => {
                  if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) {
                    acc.push("…");
                  }
                  acc.push(p);
                  return acc;
                }, [])
                .map((item, i) =>
                  item === "…" ? (
                    <span key={`ellipsis-${i}`} className="px-2 text-[#7C6A56]">
                      …
                    </span>
                  ) : (
                    <button
                      key={item}
                      onClick={() => setPage(item as number)}
                      className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                        item === page
                          ? "bg-[#E85D26] text-white"
                          : "border border-[#E8DDD4] text-[#7C6A56] hover:border-[#E85D26] hover:text-[#E85D26]"
                      }`}
                    >
                      {item}
                    </button>
                  )
                )}

              <button
                onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))}
                disabled={page === pagination.total_pages}
                className="p-2 rounded-lg border border-[#E8DDD4] text-[#7C6A56] hover:border-[#E85D26] hover:text-[#E85D26] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Trang sau"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-24 h-24 rounded-full bg-[#F7F0E8] flex items-center justify-center mb-6">
        <BookmarkX className="w-12 h-12 text-[#E8DDD4]" />
      </div>
      <h2
        className="text-xl font-semibold text-[#1C1209] mb-2"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        Bạn chưa lưu công thức nào
      </h2>
      <p className="text-[#7C6A56] mb-8 max-w-sm leading-relaxed">
        Khám phá hàng ngàn công thức Việt Nam và nhấn{" "}
        <span className="text-[#E85D26] font-medium">♥</span> để lưu lại
        những món yêu thích.
      </p>
      <Link
        href="/recipes"
        className="inline-flex items-center gap-2 px-6 py-3 bg-[#E85D26] hover:bg-[#D44E1E] text-white rounded-xl font-semibold transition-colors"
      >
        Khám phá công thức
      </Link>
    </div>
  );
}
