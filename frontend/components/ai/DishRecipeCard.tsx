"use client";

import { Clock, Users, ChefHat, AlertTriangle } from "lucide-react";

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

  return (
    <div className="w-full max-w-4xl mx-auto mt-8 bg-white rounded-2xl shadow-sm border border-[#E8DDD4] p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
        <div>
          <p className="text-xs text-[#7C6A56] uppercase tracking-wider mb-1">
            Công thức gợi ý
          </p>
          <h3
            className="text-2xl font-bold text-[#1C1209] leading-tight"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {recipe.title}
          </h3>
        </div>
        {isAIGenerated && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#C97B16]/10 text-[#C97B16] border border-[#C97B16]/20">
            <AlertTriangle className="w-3 h-3" />
            Công thức do AI sinh — cần kiểm tra
          </span>
        )}
      </div>

      {recipe.description && (
        <p className="text-sm text-[#7C6A56] leading-relaxed mb-4">{recipe.description}</p>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {recipe.cooking_time_minutes != null && (
          <span className="inline-flex items-center gap-1 text-xs text-[#7C6A56] bg-[#F7F0E8] px-2 py-1 rounded-full">
            <Clock className="w-3 h-3" />
            {recipe.cooking_time_minutes} phút
          </span>
        )}
        {recipe.servings != null && (
          <span className="inline-flex items-center gap-1 text-xs text-[#7C6A56] bg-[#F7F0E8] px-2 py-1 rounded-full">
            <Users className="w-3 h-3" />
            {recipe.servings} người
          </span>
        )}
        {recipe.difficulty && (
          <span className="inline-flex items-center gap-1 text-xs text-[#7C6A56] bg-[#F7F0E8] px-2 py-1 rounded-full">
            <ChefHat className="w-3 h-3" />
            {DIFFICULTY_LABEL[recipe.difficulty] ?? recipe.difficulty}
          </span>
        )}
      </div>

      <div className="border-t border-[#E8DDD4] pt-6 grid grid-cols-1 md:grid-cols-[260px_1fr] gap-8">
        <div className="bg-[#F7F0E8] rounded-xl p-4">
          <p className="text-xs text-[#7C6A56] uppercase tracking-wider mb-2">Nguyên liệu</p>
          <ul className="space-y-1 text-sm text-[#1C1209]">
            {recipe.ingredients.map((item, idx) => (
              <li key={idx} className="flex gap-2">
                <span className="text-[#E85D26]">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-xs text-[#7C6A56] uppercase tracking-wider mb-4">Cách làm</p>
          <div className="space-y-6">
            {recipe.steps.map((step, idx) => (
              <div key={idx} className="flex gap-4">
                <div
                  className="flex-shrink-0 w-12 h-12 rounded-full bg-[#E85D26]/10 flex items-center justify-center font-bold text-xl text-[#E85D26]"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  {idx + 1}
                </div>
                <p className="text-[#1C1209] leading-relaxed pt-2">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
