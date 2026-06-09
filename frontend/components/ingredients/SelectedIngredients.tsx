"use client";

import { X } from "lucide-react";

interface Props {
  selected: string[];
  onRemove: (name: string) => void;
  onClearAll: () => void;
}

export default function SelectedIngredients({ selected, onRemove, onClearAll }: Props) {
  if (selected.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-foreground shrink-0">
        Đã chọn ({selected.length})
      </span>
      {selected.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-xs text-muted-foreground hover:text-primary transition-colors underline underline-offset-2 shrink-0"
        >
          Xóa tất cả
        </button>
      )}
      {selected.map((name) => (
        <span
          key={name}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium border border-primary/20"
        >
          {name}
          <button
            type="button"
            onClick={() => onRemove(name)}
            aria-label={`Bỏ chọn ${name}`}
            className="ml-0.5 hover:bg-primary/20 rounded-full p-0.5 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      {selected.length > 10 && (
        <p className="w-full text-xs text-amber-600 font-medium mt-1">
          Chọn quá nhiều nguyên liệu có thể không tìm được kết quả phù hợp.
        </p>
      )}
    </div>
  );
}
