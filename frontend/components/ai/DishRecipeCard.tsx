"use client";

import { useState } from "react";
import { Clock, Users, ChefHat, AlertTriangle, ChevronDown } from "lucide-react";

import { DishRecipe } from "@/lib/types";

interface Props {
  recipe: DishRecipe;
}

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: "Dễ",
  medium: "Trung bình",
  hard: "Khó",
};

export default function DishRecipeCard({ recipe }: Props) {
  const isAIGenerated = recipe.source === "ai-generated";
  const [open, setOpen] = useState(true);

  return (
    <div className="w-full max-w-4xl mx-auto mt-8 bg-card rounded-2xl shadow-sm border border-border p-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-4 text-left group"
      >
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            Công thức gợi ý
          </p>
          <h3 className="text-2xl font-bold text-foreground leading-tight group-hover:text-primary transition-colors">
            {recipe.title}
          </h3>
        </div>
        <ChevronDown
          className={`w-6 h-6 flex-shrink-0 text-muted-foreground transition-transform duration-200 ${
            open ? "" : "-rotate-90"
          }`}
        />
      </button>

      {open && (
        <div className="mt-3">
          {isAIGenerated && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#C97B16]/10 text-[#C97B16] border border-[#C97B16]/20 mb-3">
              <AlertTriangle className="w-3 h-3" />
              Công thức do AI sinh — cần kiểm tra
            </span>
          )}

          {recipe.description && (
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">{recipe.description}</p>
          )}

          <div className="flex flex-wrap gap-2 mb-4">
            {recipe.cooking_time_minutes != null && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                <Clock className="w-3 h-3" />
                {recipe.cooking_time_minutes} phút
              </span>
            )}
            {recipe.servings != null && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                <Users className="w-3 h-3" />
                {recipe.servings} người
              </span>
            )}
            {recipe.difficulty && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                <ChefHat className="w-3 h-3" />
                {DIFFICULTY_LABEL[recipe.difficulty] ?? recipe.difficulty}
              </span>
            )}
          </div>

          <div className="border-t border-border pt-6 grid grid-cols-1 md:grid-cols-[260px_1fr] gap-8">
            <div className="bg-muted rounded-xl p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Nguyên liệu</p>
              <ul className="space-y-1 text-sm text-foreground">
                {recipe.ingredients.map((item, idx) => (
                  <li key={idx} className="flex gap-2">
                    <span className="text-primary">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-4">Cách làm</p>
              <div className="space-y-6">
                {recipe.steps.map((step, idx) => (
                  <div key={idx} className="flex gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center font-bold text-xl text-primary">
                      {idx + 1}
                    </div>
                    <p className="text-foreground leading-relaxed pt-2">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
