"use client";
import { Award } from "lucide-react";

export function CanonicalBadge({ size = "sm" }: { size?: "sm" | "md" }) {
  const px = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";
  return (
    <span
      className={`inline-flex items-center gap-1 ${px} rounded-full bg-[#2D6A4F] text-white font-medium`}
    >
      <Award className="h-3 w-3" />
      Công thức chuẩn
    </span>
  );
}
