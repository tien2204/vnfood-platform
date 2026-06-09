"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  value: number;
  onChange?: (score: number) => void;
  readonly?: boolean;
  size?: "sm" | "md" | "lg";
}

const SIZE = {
  sm: "w-4 h-4",
  md: "w-6 h-6",
  lg: "w-8 h-8",
};

export default function StarRating({
  value,
  onChange,
  readonly = false,
  size = "md",
}: StarRatingProps) {
  const [hover, setHover] = useState(0);

  const active = hover || 0;
  const iconSize = SIZE[size];

  return (
    <div
      className="flex items-center gap-0.5"
      onMouseLeave={() => !readonly && setHover(0)}
      role={readonly ? undefined : "radiogroup"}
      aria-label="Đánh giá sao"
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = readonly ? value >= star : active ? active >= star : value >= star;
        const halfFilled = readonly && value >= star - 0.5 && value < star;

        return (
          <button
            key={star}
            type="button"
            disabled={readonly}
            aria-label={`${star} sao`}
            className={cn(
              "relative transition-transform",
              !readonly && "cursor-pointer hover:scale-110 active:scale-95",
              readonly && "cursor-default"
            )}
            onMouseEnter={() => !readonly && setHover(star)}
            onClick={() => !readonly && onChange?.(star)}
          >
            {halfFilled ? (
              <span className={cn("relative inline-block", iconSize)}>
                <Star className={cn(iconSize, "text-[#f0f0f0] fill-[#f0f0f0] absolute inset-0")} />
                <span
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: "50%" }}
                >
                  <Star className={cn(iconSize, "text-[#F4A261] fill-[#F4A261]")} />
                </span>
              </span>
            ) : (
              <Star
                className={cn(
                  iconSize,
                  filled
                    ? "text-[#F4A261] fill-[#F4A261]"
                    : "text-[#f0f0f0] fill-[#f0f0f0]",
                  !readonly && !filled && "group-hover:text-[#F4A261]/50"
                )}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
