'use client';

import { useState } from 'react';
import { Minus, Plus, Users } from 'lucide-react';

interface ServingsScalerProps {
  originalServings: number;
  onChange?: (newServings: number) => void;
  className?: string;
}

export function ServingsScaler({ originalServings, onChange, className }: ServingsScalerProps) {
  const [servings, setServings] = useState(originalServings);

  const update = (next: number) => {
    setServings(next);
    onChange?.(next);
  };

  const factor = servings / originalServings;
  const isScaled = factor !== 1;

  return (
    <div className={`flex items-center gap-3 mb-5 flex-wrap ${className ?? ''}`}>
      <span className="text-sm text-muted-foreground flex items-center gap-1.5">
        <Users className="w-4 h-4" />
        Khẩu phần:
      </span>

      <div className="flex items-center gap-1 bg-muted rounded-lg p-1 border border-border">
        <button
          onClick={() => update(servings - 1)}
          disabled={servings <= 1}
          className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-border disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Giảm khẩu phần"
        >
          <Minus className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
        <span className="font-medium text-foreground min-w-[5ch] text-center text-sm">
          {servings} người
        </span>
        <button
          onClick={() => update(servings + 1)}
          disabled={servings >= 20}
          className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-border disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Tăng khẩu phần"
        >
          <Plus className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>

      {isScaled && (
        <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
          ×{factor % 1 === 0 ? factor.toFixed(0) : factor.toFixed(1)}
        </span>
      )}
    </div>
  );
}
