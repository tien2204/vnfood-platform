"use client";

import { useState, useCallback, useRef } from "react";
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
  const [addToGrocery, setAddToGrocery] = useState(false);
  const [adding, setAdding] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [, m, d] = date.split("-");
  const dateDisplay = `${parseInt(d)}/${parseInt(m)}`;

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.get("/recipes/search", { params: { q, limit: 12 } });
        setResults(res.data.data ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
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

      if (addToGrocery) {
        await api.post(`/meal-plans/${planId}/grocery-list/regenerate`);
        toast.success(`Đã thêm ${selected.length} món và cập nhật grocery list!`);
      } else {
        toast.success(`Đã thêm ${selected.length} món vào ${MEAL_LABELS[mealType]}`);
      }
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
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-[#F0E8E0] shrink-0">
          <DialogTitle className="text-[#2D2417]">
            Thêm món — {MEAL_LABELS[mealType]} {dateDisplay}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto flex flex-col">
          {/* Search — always visible */}
          <div className="px-6 pt-4 pb-3 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#7C6A56]" />
              <Input
                autoFocus
                placeholder="Tìm công thức..."
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                className="pl-9 bg-[#F7F0E8] border-[#E8DDD4] focus-visible:ring-[#E85D26]"
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#7C6A56] animate-spin" />
              )}
            </div>
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
            <p className="text-center text-[#7C6A56] text-sm py-6 px-6">
              Không tìm thấy công thức nào
            </p>
          )}
          {!query && selected.length === 0 && (
            <p className="text-center text-[#B8A898] text-sm py-6 px-6">
              Nhập tên món để tìm kiếm
            </p>
          )}

          {/* Selected recipes */}
          {selected.length > 0 && (
            <div className="px-6 pb-4 flex flex-col gap-2">
              <p className="text-xs font-semibold text-[#7C6A56] uppercase tracking-wide">
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

              {/* Add to grocery checkbox */}
              <label className="flex items-start gap-3 mt-1 p-3 rounded-xl border border-[#E8DDD4] bg-[#F7F0E8] cursor-pointer hover:border-[#2D6A4F] transition-colors">
                <input
                  type="checkbox"
                  checked={addToGrocery}
                  onChange={(e) => setAddToGrocery(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[#2D6A4F] shrink-0 cursor-pointer"
                />
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-medium text-[#2D2417]">
                    <ShoppingCart className="w-3.5 h-3.5 text-[#2D6A4F]" />
                    Thêm nguyên liệu vào grocery list
                  </div>
                  <p className="text-xs text-[#7C6A56] mt-0.5">
                    Nguyên liệu trùng nhau sẽ được cộng dồn tự động
                  </p>
                </div>
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#F0E8E0] shrink-0 flex gap-3">
          <Button variant="outline" className="flex-1 border-[#E8DDD4]" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            className="flex-1 bg-[#E85D26] hover:bg-[#D44E1E] text-white"
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
          ? "border-[#E85D26] shadow-md ring-1 ring-[#E85D26]"
          : "border-[#E8DDD4] hover:border-[#E85D26] hover:shadow-md"
      }`}
    >
      {selected && (
        <div className="absolute top-1.5 right-1.5 z-10 w-5 h-5 rounded-full bg-[#E85D26] flex items-center justify-center">
          <Check className="w-3 h-3 text-white" />
        </div>
      )}
      <div className="aspect-video bg-[#F7F0E8] overflow-hidden">
        {recipe.image_url ? (
          <Image
            src={recipe.image_url}
            alt={recipe.title}
            width={200}
            height={112}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#B8A898] text-2xl">🍽</div>
        )}
      </div>
      <div className="p-2">
        <p className="text-xs font-semibold text-[#2D2417] line-clamp-2 leading-tight">{recipe.title}</p>
        {recipe.cooking_time && (
          <p className="text-[10px] text-[#7C6A56] mt-0.5 flex items-center gap-0.5">
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
    <div className="flex items-center gap-3 px-3 py-2 bg-white rounded-xl border border-[#E8DDD4]">
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
      <p className="flex-1 text-sm font-medium text-[#2D2417] truncate min-w-0">
        {item.recipe.title}
      </p>
      {/* Servings */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={() => onServingsChange(-1)}
          className="w-6 h-6 rounded-full border border-[#E8DDD4] flex items-center justify-center hover:bg-[#F7F0E8] transition-colors"
        >
          <Minus className="w-3 h-3" />
        </button>
        <span className="text-sm font-bold text-[#2D2417] w-5 text-center">{item.servings}</span>
        <button
          onClick={() => onServingsChange(1)}
          className="w-6 h-6 rounded-full border border-[#E8DDD4] flex items-center justify-center hover:bg-[#F7F0E8] transition-colors"
        >
          <Plus className="w-3 h-3" />
        </button>
        <span className="text-xs text-[#7C6A56]">người</span>
      </div>
      <button onClick={onRemove} className="text-[#B8A898] hover:text-red-500 transition-colors shrink-0 ml-1">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
