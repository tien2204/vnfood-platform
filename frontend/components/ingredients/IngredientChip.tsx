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
          ? "bg-[#E85D26] border-[#E85D26] text-white shadow-sm"
          : "bg-white border-[#E8DDD4] text-[#4A3728] hover:border-[#E85D26] hover:text-[#E85D26]",
      ].join(" ")}
      aria-pressed={selected}
    >
      {selected && <Check className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />}
      <span>{name}</span>
      {usageCount !== undefined && (
        <span className={`text-[10px] ${selected ? "text-white/70" : "text-[#7C6A56]"}`}>
          {usageCount >= 1000 ? `${(usageCount / 1000).toFixed(1)}k` : usageCount}
        </span>
      )}
    </button>
  );
}
