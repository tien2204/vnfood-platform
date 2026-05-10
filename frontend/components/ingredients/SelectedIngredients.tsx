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
      <span className="text-sm font-medium text-[#1C1209] shrink-0">
        Đã chọn ({selected.length})
      </span>
      {selected.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-xs text-[#7C6A56] hover:text-[#E85D26] transition-colors underline underline-offset-2 shrink-0"
        >
          Xóa tất cả
        </button>
      )}
      {selected.map((name) => (
        <span
          key={name}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#E85D26]/10 text-[#E85D26] text-sm font-medium border border-[#E85D26]/20"
        >
          {name}
          <button
            type="button"
            onClick={() => onRemove(name)}
            aria-label={`Bỏ chọn ${name}`}
            className="ml-0.5 hover:bg-[#E85D26]/20 rounded-full p-0.5 transition-colors"
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
