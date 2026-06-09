"use client";

import { Check } from "lucide-react";

interface Props {
  name: string;
  usageCount?: number;
  selected: boolean;
  onToggle: (name: string) => void;
}

export default function IngredientChip({ name, usageCount, selected, onToggle }: Props) {
  return (
    <button
      type="button"
      onClick={() => onToggle(name)}
      className={[
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium",
        "border transition-all duration-150 cursor-pointer select-none",
        "active:scale-95 touch-manipulation",
        selected
          ? "bg-primary border-primary text-white shadow-sm"
          : "bg-white border-border text-foreground hover:border-primary hover:text-primary",
      ].join(" ")}
      aria-pressed={selected}
    >
      {selected && <Check className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />}
      <span>{name}</span>
      {usageCount !== undefined && (
        <span className={`text-[10px] ${selected ? "text-white/70" : "text-muted-foreground"}`}>
          {usageCount >= 1000 ? `${(usageCount / 1000).toFixed(1)}k` : usageCount}
        </span>
      )}
    </button>
  );
}
