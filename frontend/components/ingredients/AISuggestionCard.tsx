"use client";

import { useRouter } from "next/navigation";
import { Sparkles, ChefHat, Plus } from "lucide-react";
import type { AISuggestion } from "@/lib/types";

interface Props {
  suggestion: AISuggestion;
}

export default function AISuggestionCard({ suggestion }: Props) {
  const router = useRouter();

  return (
    <article className="bg-white rounded-2xl border border-border p-4 flex flex-col gap-3 hover:border-primary/30 hover:shadow-sm transition-all duration-200">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Sparkles className="w-4.5 h-4.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground leading-snug">{suggestion.name}</h3>
          <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{suggestion.description}</p>
        </div>
      </div>

      {/* Key ingredients */}
      {suggestion.key_ingredients.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
            <ChefHat className="w-3.5 h-3.5" />
            Nguyên liệu chính
          </p>
          <div className="flex flex-wrap gap-1.5">
            {suggestion.key_ingredients.map((ing) => (
              <span
                key={ing}
                className="px-2 py-0.5 rounded-full bg-[#2D6A4F]/10 text-[#2D6A4F] text-xs font-medium border border-[#2D6A4F]/15"
              >
                {ing}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Additional needed */}
      {suggestion.additional_needed.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" />
            Cần thêm
          </p>
          <div className="flex flex-wrap gap-1.5">
            {suggestion.additional_needed.map((ing) => (
              <span
                key={ing}
                className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs border border-border"
              >
                {ing}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* CTA */}
      <button
        type="button"
        onClick={() => router.push(`/recipes?search=${encodeURIComponent(suggestion.name)}`)}
        className="mt-auto self-start text-sm font-medium text-primary hover:text-[#cc1c22] transition-colors flex items-center gap-1.5 group"
      >
        Tìm công thức tương tự
        <span className="transition-transform group-hover:translate-x-0.5">→</span>
      </button>
    </article>
  );
}
