"use client";
import { CheckCircle } from "lucide-react";

export function ManualReviewBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs">
      <CheckCircle className="h-3 w-3" />
      Đã review thủ công
    </span>
  );
}
