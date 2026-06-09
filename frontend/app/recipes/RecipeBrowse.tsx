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
import { FACETS } from "@/lib/facets";
import FacetDropdown from "@/components/recipes/FacetDropdown";

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
  const [openFacet, setOpenFacet] = useState<string | null>(null);

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

  const applyFacet = useCallback(
    (param: string, values: string[]) => updateParam(param, values.join(",")),
    [updateParam]
  );

  const closeFacet = useCallback(() => setOpenFacet(null), []);

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
    FACETS.forEach((f) => {
      const v = searchParams.get(f.param);
      if (v) params[f.param] = v;
    });

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
  }, [page, keyword, difficulty, sort, search, searchParams]);

  const facetCount = FACETS.reduce(
    (n, f) => n + (searchParams.get(f.param) ?? "").split(",").filter(Boolean).length,
    0
  );
  const hasFilters = keyword || difficulty || search || facetCount > 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-8 rounded-xl border border-border bg-muted p-6 shadow-card sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
        <div className="flex-1">
          <p className="mb-2 text-sm font-bold uppercase tracking-wider text-primary">
            Our Menu
          </p>
          <h1
            className="text-3xl font-extrabold text-foreground sm:text-4xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            <span className="border-l-4 border-primary pl-3">Tất cả công thức</span>
          </h1>
          {!loading && (
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              <strong className="text-primary">{total.toLocaleString()}</strong> công thức
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
            className="gap-1.5 rounded-lg border border-border bg-white shadow-card hover:bg-white"
          >
            <SlidersHorizontal className="w-4 h-4" />
            Lọc
            {hasFilters && (
              <Badge className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-lg bg-[#ec2028] p-0 text-[10px]">
                !
              </Badge>
            )}
          </Button>
        </div>
        </div>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-white p-4 shadow-card">
          {/* Sort */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[#666666]">Sắp xếp:</span>
            <Select
              value={sort}
              onValueChange={(v) => updateParam("sort", v ?? "newest")}
            >
              <SelectTrigger className="h-8 w-36 rounded-lg border border-border bg-white text-sm">
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
            <span className="text-sm font-medium text-[#666666]">Danh mục:</span>
            <Select
              value={keyword}
              onValueChange={(v) => updateParam("keyword", v === "__all__" ? "" : v ?? "")}
            >
              <SelectTrigger className="h-8 w-36 rounded-lg border border-border bg-white text-sm">
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
            <span className="text-sm font-medium text-[#666666]">Độ khó:</span>
            <Select
              value={difficulty}
              onValueChange={(v) => updateParam("difficulty", v === "__all__" ? "" : v ?? "")}
            >
              <SelectTrigger className="h-8 w-36 rounded-lg border border-border bg-white text-sm">
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
              className="ml-auto flex items-center gap-1 text-sm font-bold text-[#ec2028] hover:underline"
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
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                active
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-white text-foreground hover:border-primary"
              }`}
            >
              {k.label}
            </button>
          );
        })}
      </div>

      {/* Facet dropdown bar (MNMN parity) */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {FACETS.map((f) => (
          <FacetDropdown
            key={f.key}
            facet={f}
            selected={(searchParams.get(f.param) ?? "").split(",").filter(Boolean)}
            open={openFacet === f.key}
            onToggleOpen={() => setOpenFacet((cur) => (cur === f.key ? null : f.key))}
            onClose={closeFacet}
            onApply={(vals) => applyFacet(f.param, vals)}
          />
        ))}
        {facetCount > 0 && (
          <span className="ml-1 text-sm font-bold text-[#ec2028]">
            Hiện Bộ Lọc: {facetCount}
          </span>
        )}
      </div>

      {/* Results */}
      <RecipeGrid recipes={loading ? undefined : recipes} loading={loading} />

      {/* Empty state */}
      {!loading && recipes.length === 0 && (
        <div className="rounded-xl border border-border bg-white py-20 text-center shadow-card">
          <p className="text-4xl mb-3">🍽️</p>
          <p className="mb-1 text-lg font-bold text-[#0a0a0a]">
            Không tìm thấy công thức nào
          </p>
          <p className="text-sm text-[#666666]">
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
            className="rounded-lg border border-border bg-white shadow-card"
          >
            ← Trước
          </Button>

          <span className="px-2 text-sm font-medium text-[#666666]">
            Trang {page} / {totalPages}
          </span>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => updateParam("page", String(page + 1))}
            className="rounded-lg border border-border bg-white shadow-card"
          >
            Sau →
          </Button>
        </div>
      )}
    </div>
  );
}
