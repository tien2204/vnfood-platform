"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
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
  const [, startTransition] = useTransition();

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
      const nextUrl = `/recipes?${params.toString()}`;
      startTransition(() => {
        router.push(nextUrl);
      });
    },
    [searchParams, router]
  );

  useEffect(() => {
    let cancelled = false;

    const params: Record<string, string> = {
      page: String(page),
      limit: "20",
      sort,
    };
    if (keyword) params.keyword = keyword;
    if (difficulty) params.difficulty = difficulty;
    if (search) params.search = search;

    async function loadRecipes() {
      setLoading(true);
      try {
        const res = await api.get<PaginatedResponse<RecipeCard>>("/recipes", {
          params,
        });
        if (!cancelled) {
          setRecipes(res.data.data);
          setTotal(res.data.pagination.total);
          setTotalPages(res.data.pagination.total_pages);
        }
      } catch {
        if (!cancelled) setRecipes([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadRecipes();

    return () => {
      cancelled = true;
    };
  }, [page, keyword, difficulty, sort, search]);

  const hasFilters = keyword || difficulty || search;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-8 border-2 border-[#2c1810] bg-[#fff5e6] p-6 shadow-block sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
        <div className="flex-1">
          <p className="mb-2 text-sm font-bold uppercase tracking-wider text-[#ff6b35]">
            Our Menu
          </p>
          <h1
            className="text-3xl font-bold text-[#2c1810] sm:text-4xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Tất cả công thức
          </h1>
          {!loading && (
            <p className="mt-1 text-sm font-medium text-[#6b5344]">
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
            className="gap-1.5 rounded-none border-2 border-[#2c1810] bg-white shadow-block-sm hover:bg-[#fffaf0]"
          >
            <SlidersHorizontal className="w-4 h-4" />
            Lọc
            {hasFilters && (
              <Badge className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-none bg-[#ff6b35] p-0 text-[10px]">
                !
              </Badge>
            )}
          </Button>
        </div>
        </div>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div className="mb-6 flex flex-wrap items-center gap-3 border-2 border-[#2c1810] bg-white p-4 shadow-block-sm">
          {/* Sort */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[#6b5344]">Sắp xếp:</span>
            <Select
              value={sort}
              onValueChange={(v) => updateParam("sort", v ?? "newest")}
            >
              <SelectTrigger className="h-8 w-36 rounded-none border-2 border-[#2c1810] bg-white text-sm">
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
            <span className="text-sm font-medium text-[#6b5344]">Danh mục:</span>
            <Select
              value={keyword}
              onValueChange={(v) => updateParam("keyword", v === "__all__" ? "" : v ?? "")}
            >
              <SelectTrigger className="h-8 w-36 rounded-none border-2 border-[#2c1810] bg-white text-sm">
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
            <span className="text-sm font-medium text-[#6b5344]">Độ khó:</span>
            <Select
              value={difficulty}
              onValueChange={(v) => updateParam("difficulty", v === "__all__" ? "" : v ?? "")}
            >
              <SelectTrigger className="h-8 w-36 rounded-none border-2 border-[#2c1810] bg-white text-sm">
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
              className="ml-auto flex items-center gap-1 text-sm font-bold text-[#ff6b35] hover:underline"
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
              className={`border-2 px-3.5 py-1.5 text-sm font-bold transition-all ${
                active
                  ? "border-[#2c1810] bg-[#ff6b35] text-white shadow-block-sm"
                  : "border-[#2c1810] bg-[#fff5e6] text-[#2c1810] shadow-block-sm hover:bg-[#ff6b35] hover:text-white"
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
        <div className="border-2 border-[#2c1810] bg-white py-20 text-center shadow-block">
          <p className="text-4xl mb-3">🍽️</p>
          <p className="mb-1 text-lg font-bold text-[#2c1810]">
            Không tìm thấy công thức nào
          </p>
          <p className="text-sm text-[#6b5344]">
            Thử tìm kiếm với từ khóa khác hoặc xóa bộ lọc
          </p>
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="mt-10 flex items-center justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => updateParam("page", String(page - 1))}
            className="rounded-none border-2 border-[#2c1810] bg-white shadow-block-sm"
          >
            ← Trước
          </Button>

          <span className="px-2 text-sm font-medium text-[#6b5344]">
            Trang {page} / {totalPages}
          </span>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => updateParam("page", String(page + 1))}
            className="rounded-none border-2 border-[#2c1810] bg-white shadow-block-sm"
          >
            Sau →
          </Button>
        </div>
      )}
    </div>
  );
}
