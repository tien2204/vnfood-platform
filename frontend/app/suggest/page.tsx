"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Salad, Search, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import type { IngredientItem, IngredientSuggestResult } from "@/lib/types";
import IngredientChip from "@/components/ingredients/IngredientChip";
import IngredientSearch from "@/components/ingredients/IngredientSearch";
import SelectedIngredients from "@/components/ingredients/SelectedIngredients";
import MatchModeSelector from "@/components/ingredients/MatchModeSelector";
import RecipeMatchCard from "@/components/ingredients/RecipeMatchCard";
import AISuggestionCard from "@/components/ingredients/AISuggestionCard";

type MatchMode = "any" | "all" | "most";

export default function SuggestPage() {
  const [popular, setPopular] = useState<IngredientItem[]>([]);
  const [loadingPopular, setLoadingPopular] = useState(true);
  const [showAllPopular, setShowAllPopular] = useState(false);

  const [selected, setSelected] = useState<string[]>([]);
  const selectedSet = new Set(selected);

  const [matchMode, setMatchMode] = useState<MatchMode>("most");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<IngredientSuggestResult | null>(null);

  const resultsRef = useRef<HTMLDivElement>(null);

  // Load popular ingredients on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/ingredients/popular", { params: { limit: 30 } });
        setPopular(res.data.data ?? []);
      } catch {
        // non-critical
      } finally {
        setLoadingPopular(false);
      }
    })();
  }, []);

  const toggleIngredient = useCallback((name: string) => {
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  }, []);

  const addIngredient = useCallback((name: string) => {
    setSelected((prev) => (prev.includes(name) ? prev : [...prev, name]));
  }, []);

  const removeIngredient = useCallback((name: string) => {
    setSelected((prev) => prev.filter((n) => n !== name));
  }, []);

  const clearAll = useCallback(() => setSelected([]), []);

  const handleSearch = useCallback(async () => {
    if (selected.length === 0) {
      toast.error("Hãy chọn ít nhất 1 nguyên liệu");
      return;
    }
    setSearching(true);
    setResult(null);
    try {
      const res = await api.post("/ingredients/suggest-recipes", {
        ingredient_names: selected,
        match_mode: matchMode,
      });
      setResult(res.data.data as IngredientSuggestResult);
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch {
      toast.error("Tìm kiếm thất bại, thử lại sau");
    } finally {
      setSearching(false);
    }
  }, [selected, matchMode]);

  const visiblePopular = showAllPopular ? popular : popular.slice(0, 18);

  return (
    <main className="min-h-screen bg-white">
      {/* ── Hero ── */}
      <section className="max-w-3xl mx-auto px-4 pt-12 pb-6 text-center">
        <div className="inline-flex items-center gap-2 bg-[#2D6A4F]/10 text-[#2D6A4F] px-4 py-1.5 rounded-full text-sm font-medium mb-4">
          <Salad className="w-4 h-4" />
          Gợi ý từ nguyên liệu
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-3">
          Hôm nay nấu gì?
        </h1>
        <p className="text-muted-foreground text-lg max-w-xl mx-auto">
          Chọn nguyên liệu bạn đang có — chúng tôi gợi ý công thức phù hợp nhất để nấu ngay hôm nay.
        </p>
      </section>

      {/* ── Input panel ── */}
      <section className="max-w-3xl mx-auto px-4 pb-8">
        <div className="bg-white rounded-2xl border border-border shadow-sm p-5 md:p-6 space-y-5">

          {/* Search autocomplete */}
          <div>
            <p className="text-sm font-medium text-foreground mb-2">Tìm thêm nguyên liệu</p>
            <IngredientSearch selectedNames={selectedSet} onAdd={addIngredient} />
          </div>

          {/* Popular chips */}
          <div>
            <p className="text-sm font-medium text-foreground mb-2.5">Phổ biến</p>
            {loadingPopular ? (
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="h-8 w-20 rounded-full bg-muted animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {visiblePopular.map((ing) => (
                  <IngredientChip
                    key={ing.name}
                    name={ing.name}
                    usageCount={ing.usage_count}
                    selected={selectedSet.has(ing.name)}
                    onToggle={toggleIngredient}
                  />
                ))}
                {popular.length > 18 && (
                  <button
                    type="button"
                    onClick={() => setShowAllPopular((v) => !v)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-dashed border-border text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  >
                    {showAllPopular ? (
                      <>Thu gọn <ChevronUp className="w-3.5 h-3.5" /></>
                    ) : (
                      <>+{popular.length - 18} nữa <ChevronDown className="w-3.5 h-3.5" /></>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Selected */}
          {selected.length > 0 && (
            <div className="border-t border-muted pt-4">
              <SelectedIngredients
                selected={selected}
                onRemove={removeIngredient}
                onClearAll={clearAll}
              />
            </div>
          )}

          {/* Match mode */}
          <div className="border-t border-muted pt-4">
            <MatchModeSelector value={matchMode} onChange={setMatchMode} />
          </div>

          {/* Search button */}
          <button
            type="button"
            onClick={handleSearch}
            disabled={selected.length === 0 || searching}
            className={[
              "w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-base transition-all duration-200",
              selected.length === 0
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : searching
                ? "bg-primary/80 text-white cursor-wait"
                : "bg-primary hover:bg-[#cc1c22] text-white shadow-sm hover:shadow active:scale-[0.98]",
            ].join(" ")}
            aria-disabled={selected.length === 0 || searching}
          >
            {searching ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Đang tìm...
              </>
            ) : (
              <>
                <Search className="w-5 h-5" />
                Tìm công thức
                {selected.length > 0 && (
                  <span className="ml-1 px-2 py-0.5 rounded-full bg-white/20 text-sm">
                    {selected.length} nguyên liệu
                  </span>
                )}
              </>
            )}
          </button>
        </div>
      </section>

      {/* ── Results ── */}
      {result && (
        <section ref={resultsRef} className="max-w-6xl mx-auto px-4 pb-16 space-y-10">

          {/* DB results */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-foreground">
                Có sẵn trong hệ thống
                <span className="ml-2 text-lg font-semibold text-primary">
                  ({result.total_db_results})
                </span>
              </h2>
            </div>

            {result.db_results.length === 0 ? (
              <div className="bg-white rounded-2xl border border-border p-10 text-center">
                <p className="text-muted-foreground text-lg font-medium">Không tìm thấy công thức phù hợp</p>
                <p className="text-muted-foreground text-sm mt-1">Thử bớt nguyên liệu hoặc chuyển sang chế độ "Có ít nhất 1"</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {result.db_results.map((match) => (
                  <RecipeMatchCard
                    key={match.recipe.id}
                    match={match}
                    totalIngredients={result.selected_ingredients.length}
                  />
                ))}
              </div>
            )}
          </div>

          {/* AI suggestions */}
          {result.ai_used && result.ai_suggestions.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-2xl font-bold text-foreground">
                  Gợi ý thêm từ AI
                  <span className="ml-2 text-lg font-semibold text-primary">
                    ({result.ai_suggestions.length})
                  </span>
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-semibold border border-primary/20">
                  GPT-4o mini
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {result.ai_suggestions.map((s, i) => (
                  <AISuggestionCard key={i} suggestion={s} />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Mobile sticky bottom bar ── */}
      {selected.length > 0 && !result && (
        <div className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-white/95 backdrop-blur border-t border-border px-4 py-3 safe-b">
          <div className="flex items-center gap-3">
            <div className="flex-1 flex flex-wrap gap-1 overflow-hidden max-h-8">
              {selected.slice(0, 5).map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/20 whitespace-nowrap"
                >
                  {name}
                </span>
              ))}
              {selected.length > 5 && (
                <span className="text-xs text-muted-foreground self-center">+{selected.length - 5}</span>
              )}
            </div>
            <button
              type="button"
              onClick={handleSearch}
              disabled={searching}
              className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold active:scale-95 transition-transform"
            >
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Tìm ({selected.length})
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
