"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import RecipeGrid from "@/components/recipes/RecipeGrid";
import RecipeCardSkeleton from "@/components/recipes/RecipeCardSkeleton";
import api from "@/lib/api";
import type { PaginatedResponse, RecipeCard } from "@/lib/types";

export default function SearchResults() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const q = searchParams.get("q") ?? "";

  const [recipes, setRecipes] = useState<RecipeCard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState(q);

  useEffect(() => {
    setInputValue(q);
    if (!q.trim()) {
      setRecipes([]);
      setTotal(0);
      return;
    }

    let cancelled = false;
    setLoading(true);

    api
      .get<PaginatedResponse<RecipeCard>>("/recipes", {
        params: { search: q, limit: "40", sort: "popular" },
      })
      .then((res) => {
        if (!cancelled) {
          setRecipes(res.data.data);
          setTotal(res.data.pagination.total);
        }
      })
      .catch(() => {
        if (!cancelled) setRecipes([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [q]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const v = inputValue.trim();
    if (v) router.push(`/search?q=${encodeURIComponent(v)}`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Search input */}
      <form onSubmit={handleSearch} className="max-w-2xl mx-auto mb-8">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#7C6A56]" />
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Tìm kiếm món ăn..."
            className="w-full pl-12 pr-12 h-12 text-base text-[#1C1209] bg-white border border-[#E8DDD4] rounded-xl shadow-sm outline-none focus:border-[#E85D26] focus:ring-2 focus:ring-[#E85D26]/20 placeholder:text-[#7C6A56] transition-colors"
          />
          {inputValue && (
            <button
              type="button"
              onClick={() => setInputValue("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#7C6A56] hover:text-[#1C1209]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </form>

      {/* Header */}
      {q && (
        <div className="mb-6">
          <h1
            className="text-2xl font-bold text-[#1C1209]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Kết quả cho &ldquo;{q}&rdquo;
          </h1>
          {!loading && (
            <p className="text-sm text-[#7C6A56] mt-0.5">
              {total > 0
                ? `${total.toLocaleString()} công thức`
                : "Không tìm thấy công thức nào"}
            </p>
          )}
        </div>
      )}

      {/* Empty state — no query */}
      {!q && (
        <div className="text-center py-20 text-[#7C6A56]">
          <Search className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg">Nhập tên món ăn để tìm kiếm</p>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <RecipeCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Results */}
      {!loading && recipes.length > 0 && <RecipeGrid recipes={recipes} />}

      {/* No results */}
      {!loading && q && recipes.length === 0 && (
        <div className="text-center py-20 text-[#7C6A56]">
          <p className="text-lg mb-2">Không tìm thấy &ldquo;{q}&rdquo;</p>
          <p className="text-sm">Thử từ khóa khác hoặc kiểm tra chính tả</p>
        </div>
      )}
    </div>
  );
}
