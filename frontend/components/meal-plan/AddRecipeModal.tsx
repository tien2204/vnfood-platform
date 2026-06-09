"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Image from "next/image";
import { Search, X, Clock, Minus, Plus, Loader2, ShoppingCart, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { MealType, RecipeCard } from "@/lib/types";
import api from "@/lib/api";
import { toast } from "sonner";

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Bữa sáng",
  lunch: "Bữa trưa",
  dinner: "Bữa tối",
  snack: "Bữa phụ",
};

interface SelectedRecipe {
  recipe: RecipeCard;
  servings: number;
}

interface AddRecipeModalProps {
  planId: string;
  date: string;
  mealType: MealType;
  onClose: () => void;
  onAdded: () => void;
}

export default function AddRecipeModal({ planId, date, mealType, onClose, onAdded }: AddRecipeModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RecipeCard[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<SelectedRecipe[]>([]);
  const [adding, setAdding] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [suggestions, setSuggestions] = useState<RecipeCard[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [, m, d] = date.split("-");
  const dateDisplay = `${parseInt(d)}/${parseInt(m)}`;

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.get("/recipes/search", { params: { q, limit: 12, show_all: showAll } });
        setResults(res.data.data ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [showAll]);

  // Re-run current query when the canonical/all toggle flips
  useEffect(() => {
    if (query.trim()) search(query);
  }, [showAll]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load personalized suggestions once on open
  useEffect(() => {
    let active = true;
    api.get("/meal-plans/suggestions", { params: { n: 6 } })
      .then((res) => { if (active) setSuggestions(res.data.data ?? []); })
      .catch(() => { if (active) setSuggestions([]); });
    return () => { active = false; };
  }, []);

  function handleQueryChange(val: string) {
    setQuery(val);
    search(val);
  }

  function toggleRecipe(recipe: RecipeCard) {
    setSelected((prev) => {
      const exists = prev.find((s) => s.recipe.id === recipe.id);
      if (exists) return prev.filter((s) => s.recipe.id !== recipe.id);
      return [...prev, { recipe, servings: 2 }];
    });
  }

  function updateServings(recipeId: string, delta: number) {
    setSelected((prev) =>
      prev.map((s) =>
        s.recipe.id === recipeId
          ? { ...s, servings: Math.max(1, Math.min(20, s.servings + delta)) }
          : s
      )
    );
  }

  function removeSelected(recipeId: string) {
    setSelected((prev) => prev.filter((s) => s.recipe.id !== recipeId));
  }

  async function handleAdd() {
    if (selected.length === 0) return;
    setAdding(true);
    try {
      await Promise.all(
        selected.map((s) =>
          api.post(`/meal-plans/${planId}/items`, {
            recipe_id: s.recipe.id,
            date,
            meal_type: mealType,
            servings: s.servings,
          })
        )
      );

      // Grocery list is a live view (rebuilt on read), so no regenerate call needed.
      toast.success(`Đã thêm ${selected.length} món vào ${MEAL_LABELS[mealType]}`);
      onAdded();
    } catch {
      toast.error("Không thể thêm món. Thử lại nhé.");
    } finally {
      setAdding(false);
    }
  }

  const selectedIds = new Set(selected.map((s) => s.recipe.id));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <DialogTitle className="text-foreground">
            Thêm món — {MEAL_LABELS[mealType]} {dateDisplay}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto flex flex-col">
          {/* Search — always visible */}
          <div className="px-6 pt-4 pb-3 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Tìm công thức..."
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                className="pl-9 bg-muted border-border focus-visible:ring-primary"
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
              )}
            </div>
            <label className="flex items-center gap-2 mt-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
                className="w-3.5 h-3.5 accent-[#ec2028] cursor-pointer"
              />
              Hiện tất cả công thức (mặc định chỉ công thức chuẩn)
            </label>
          </div>

          {/* Search results */}
          {results.length > 0 && (
            <div className="px-6 pb-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {results.map((r) => (
                  <RecipePickCard
                    key={r.id}
                    recipe={r}
                    selected={selectedIds.has(r.id)}
                    onToggle={() => toggleRecipe(r)}
                  />
                ))}
              </div>
            </div>
          )}
          {!results.length && query && !searching && (
            <p className="text-center text-muted-foreground text-sm py-6 px-6">
              Không tìm thấy công thức nào
            </p>
          )}
          {!query && suggestions.length > 0 && (
            <div className="px-6 pb-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Gợi ý cho bạn
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {suggestions.map((r) => (
                  <RecipePickCard
                    key={r.id}
                    recipe={r}
                    selected={selectedIds.has(r.id)}
                    onToggle={() => toggleRecipe(r)}
                  />
                ))}
              </div>
            </div>
          )}
          {!query && suggestions.length === 0 && selected.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-6 px-6">
              Nhập tên món để tìm kiếm
            </p>
          )}

          {/* Selected recipes */}
          {selected.length > 0 && (
            <div className="px-6 pb-4 flex flex-col gap-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Đã chọn ({selected.length} món)
              </p>
              {selected.map((s) => (
                <SelectedRow
                  key={s.recipe.id}
                  item={s}
                  onRemove={() => removeSelected(s.recipe.id)}
                  onServingsChange={(delta) => updateServings(s.recipe.id, delta)}
                />
              ))}

              <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                <ShoppingCart className="w-3.5 h-3.5 text-[#2D6A4F]" />
                Nguyên liệu sẽ tự động thêm vào grocery list
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border shrink-0 flex gap-3">
          <Button variant="outline" className="flex-1 border-border" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            className="flex-1 bg-primary hover:bg-[#cc1c22] text-white"
            onClick={handleAdd}
            disabled={adding || selected.length === 0}
          >
            {adding ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : null}
            Thêm vào lịch
            {selected.length > 0 && ` (${selected.length})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RecipePickCard({
  recipe,
  selected,
  onToggle,
}: {
  recipe: RecipeCard;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`text-left rounded-xl overflow-hidden border transition-all group relative ${
        selected
          ? "border-primary shadow-md ring-1 ring-primary"
          : "border-border hover:border-primary hover:shadow-md"
      }`}
    >
      {selected && (
        <div className="absolute top-1.5 right-1.5 z-10 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
          <Check className="w-3 h-3 text-white" />
        </div>
      )}
      <div className="aspect-video bg-muted overflow-hidden relative">
        {recipe.is_canonical && (
          <span className="absolute top-1 left-1 z-10 px-1.5 py-0.5 rounded-full bg-[#2D6A4F] text-white text-[9px] font-semibold">
            Chuẩn
          </span>
        )}
        {recipe.image_url ? (
          <Image
            src={recipe.image_url}
            alt={recipe.title}
            width={200}
            height={112}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-2xl">🍽</div>
        )}
      </div>
      <div className="p-2">
        <p className="text-xs font-semibold text-foreground line-clamp-2 leading-tight">{recipe.title}</p>
        {recipe.cooking_time && (
          <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-0.5">
            <Clock className="w-2.5 h-2.5" /> {recipe.cooking_time}p
          </p>
        )}
      </div>
    </button>
  );
}

function SelectedRow({
  item,
  onRemove,
  onServingsChange,
}: {
  item: SelectedRecipe;
  onRemove: () => void;
  onServingsChange: (delta: number) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-white rounded-xl border border-border">
      {item.recipe.image_url && (
        <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0">
          <Image
            src={item.recipe.image_url}
            alt={item.recipe.title}
            width={40}
            height={40}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <p className="flex-1 text-sm font-medium text-foreground truncate min-w-0">
        {item.recipe.title}
      </p>
      {/* Servings */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={() => onServingsChange(-1)}
          className="w-6 h-6 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors"
        >
          <Minus className="w-3 h-3" />
        </button>
        <span className="text-sm font-bold text-foreground w-5 text-center">{item.servings}</span>
        <button
          onClick={() => onServingsChange(1)}
          className="w-6 h-6 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors"
        >
          <Plus className="w-3 h-3" />
        </button>
        <span className="text-xs text-muted-foreground">người</span>
      </div>
      <button onClick={onRemove} className="text-muted-foreground hover:text-red-500 transition-colors shrink-0 ml-1">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
