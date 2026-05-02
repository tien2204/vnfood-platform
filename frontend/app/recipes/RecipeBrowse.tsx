"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import RecipeGrid from "@/components/recipes/RecipeGrid";
import SearchBar from "@/components/common/SearchBar";
import api from "@/lib/api";
import type { PaginatedResponse, RecipeCard } from "@/lib/types";

const KEYWORDS = [
  { label: "Tất cả", value: "" },
  { label: "Bánh", value: "Bánh" },
  { label: "Bún / Phở", value: "Bún" },
  { label: "Cơm", value: "Cơm" },
  { label: "Canh", value: "Canh" },
  { label: "Món Khô", value: "Thịt" },
  { label: "Xôi", value: "Xôi" },
  { label: "Gỏi Cuốn", value: "Gỏi" },
  { label: "Đặc Biệt", value: "Đặc biệt" },
];

const DIFFICULTIES = [
  { label: "Tất cả", value: "" },
  { label: "Dễ", value: "easy" },
  { label: "Trung bình", value: "medium" },
  { label: "Khó", value: "hard" },
];

const SORTS = [
  { label: "Mới nhất", value: "newest" },
  { label: "Phổ biến", value: "popular" },
  { label: "Đánh giá cao", value: "top_rated" },
];

export default function RecipeBrowse() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [recipes, setRecipes] = useState<RecipeCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  const page = Number(searchParams.get("page") ?? "1");
  const keyword: string = searchParams.get("keyword") ?? "";
  const difficulty: string = searchParams.get("difficulty") ?? "";
  const sort: string = searchParams.get("sort") ?? "newest";
  const search: string = searchParams.get("search") ?? "";

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      if (key !== "page") params.set("page", "1");
      router.push(`/recipes?${params.toString()}`);
    },
    [searchParams, router]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const params: Record<string, string> = {
      page: String(page),
      limit: "20",
      sort,
    };
    if (keyword) params.keyword = keyword;
    if (difficulty) params.difficulty = difficulty;
    if (search) params.search = search;

    api
      .get<PaginatedResponse<RecipeCard>>("/recipes", { params })
      .then((res) => {
        if (!cancelled) {
          setRecipes(res.data.data);
          setTotal(res.data.pagination.total);
          setTotalPages(res.data.pagination.total_pages);
        }
      })
      .catch(() => {
        if (!cancelled) setRecipes([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, keyword, difficulty, sort, search]);

  const hasFilters = keyword || difficulty || search;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <div className="flex-1">
          <h1
            className="text-2xl font-bold text-[#1C1209]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Tất cả công thức
          </h1>
          {!loading && (
            <p className="text-sm text-[#7C6A56] mt-0.5">
              {total.toLocaleString()} công thức
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <SearchBar
            placeholder="Tìm kiếm..."
            initialValue={search}
            onSearch={(q) => updateParam("search", q)}
            className="w-48 sm:w-64"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-1.5 border-[#E8DDD4]"
          >
            <SlidersHorizontal className="w-4 h-4" />
            Lọc
            {hasFilters && (
              <Badge className="ml-0.5 h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-[#E85D26]">
                !
              </Badge>
            )}
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div className="bg-[#F7F0E8] rounded-xl p-4 mb-6 flex flex-wrap gap-3 items-center">
          {/* Sort */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-[#7C6A56]">Sắp xếp:</span>
            <Select
              value={sort}
              onValueChange={(v) => updateParam("sort", v ?? "newest")}
            >
              <SelectTrigger className="h-8 text-sm w-36 bg-white border-[#E8DDD4]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Keyword */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-[#7C6A56]">Danh mục:</span>
            <Select
              value={keyword}
              onValueChange={(v) => updateParam("keyword", v ?? "")}
            >
              <SelectTrigger className="h-8 text-sm w-36 bg-white border-[#E8DDD4]">
                <SelectValue placeholder="Tất cả" />
              </SelectTrigger>
              <SelectContent>
                {KEYWORDS.map((k) => (
                  <SelectItem key={k.value} value={k.value || "__all__"}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Difficulty */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-[#7C6A56]">Độ khó:</span>
            <Select
              value={difficulty}
              onValueChange={(v) => updateParam("difficulty", v ?? "")}
            >
              <SelectTrigger className="h-8 text-sm w-36 bg-white border-[#E8DDD4]">
                <SelectValue placeholder="Tất cả" />
              </SelectTrigger>
              <SelectContent>
                {DIFFICULTIES.map((d) => (
                  <SelectItem key={d.value} value={d.value || "__all__"}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Clear filters */}
          {hasFilters && (
            <button
              onClick={() => router.push("/recipes")}
              className="flex items-center gap-1 text-sm text-[#E85D26] hover:underline ml-auto"
            >
              <X className="w-3.5 h-3.5" /> Xóa bộ lọc
            </button>
          )}
        </div>
      )}

      {/* Keyword chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        {KEYWORDS.map((k) => {
          const active = keyword === k.value;
          return (
            <button
              key={k.value}
              onClick={() => updateParam("keyword", k.value)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all border ${
                active
                  ? "bg-[#E85D26] text-white border-[#E85D26]"
                  : "bg-[#F7F0E8] text-[#1C1209] border-[#E8DDD4] hover:border-[#E85D26] hover:text-[#E85D26]"
              }`}
            >
              {k.label}
            </button>
          );
        })}
      </div>

      {/* Results */}
      <RecipeGrid recipes={loading ? undefined : recipes} loading={loading} />

      {/* Empty state */}
      {!loading && recipes.length === 0 && (
        <div className="text-center py-20">
          <p className="text-4xl mb-3">🍽️</p>
          <p className="text-lg font-medium text-[#1C1209] mb-1">
            Không tìm thấy công thức nào
          </p>
          <p className="text-sm text-[#7C6A56]">
            Thử tìm kiếm với từ khóa khác hoặc xóa bộ lọc
          </p>
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-10">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => updateParam("page", String(page - 1))}
            className="border-[#E8DDD4]"
          >
            ← Trước
          </Button>

          <span className="text-sm text-[#7C6A56] px-2">
            Trang {page} / {totalPages}
          </span>

          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => updateParam("page", String(page + 1))}
            className="border-[#E8DDD4]"
          >
            Sau →
          </Button>
        </div>
      )}
    </div>
  );
}
