"use client";

import { Sparkles, Utensils } from "lucide-react";

import { DishOverview } from "@/lib/types";

interface Props {
  overview: DishOverview;
}

export default function DishOverviewCard({ overview }: Props) {
  return (
    <section className="w-full max-w-4xl mx-auto mt-8 bg-card rounded-2xl shadow-sm border border-border p-6">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-primary" />
        <p className="text-xs text-muted-foreground uppercase tracking-wider">
          Giới thiệu món
        </p>
      </div>
      <h3 className="text-2xl font-bold text-foreground leading-tight mb-1">
        {overview.display_name}
      </h3>
      <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800 mb-4">
        Món này có nhiều biến thể — đây là giới thiệu chung. Chọn một biến thể bên dưới để xem công thức chi tiết.
      </div>

      {overview.tasting && (
        <p className="text-sm text-foreground leading-relaxed mb-5">{overview.tasting}</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
            Nguyên liệu chủ chốt
          </p>
          <ul className="space-y-1 text-sm text-foreground">
            {overview.key_ingredients.map((item, idx) => (
              <li key={idx} className="flex gap-2">
                <span className="text-primary">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
            Các bước chính
          </p>
          <ol className="space-y-2 text-sm text-foreground">
            {overview.main_steps.map((step, idx) => (
              <li key={idx} className="flex gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                  {idx + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {overview.variant_examples.length > 0 && (
        <div className="mt-5 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
            <Utensils className="w-3 h-3" /> Một số biến thể phổ biến
          </p>
          <div className="flex flex-wrap gap-2">
            {overview.variant_examples.map((v, idx) => (
              <span
                key={idx}
                className="text-xs text-foreground bg-muted px-2.5 py-1 rounded-full"
              >
                {v}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
