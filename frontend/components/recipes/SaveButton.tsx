"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { useUser } from "@/lib/hooks/useUser";
import type { SaveResponse } from "@/lib/types";

interface Props {
  recipeId: string;
  initialSaved: boolean;
  initialCount: number;
  variant?: "card" | "action" | "sidebar";
  onChange?: (isSaved: boolean, saveCount: number) => void;
}

export default function SaveButton({
  recipeId,
  initialSaved,
  initialCount,
  variant = "card",
  onChange,
}: Props) {
  const { isLoggedIn } = useUser();
  const router = useRouter();
  const [isSaved, setIsSaved] = useState(initialSaved);
  const [saveCount, setSaveCount] = useState(initialCount);
  const [isAnimating, setIsAnimating] = useState(false);
  const inFlightRef = useRef(false);

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isLoggedIn) {
      toast.error("Vui lòng đăng nhập để lưu công thức");
      return;
    }

    if (inFlightRef.current) return;
    inFlightRef.current = true;

    const targetSaved = !isSaved;
    const previousSaved = isSaved;
    const previousCount = saveCount;

    setIsSaved(targetSaved);
    setSaveCount((prev) => (targetSaved ? prev + 1 : Math.max(0, prev - 1)));
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 300);

    try {
      const endpoint = `/recipes/${recipeId}/save`;
      const response = targetSaved
        ? await api.post<{ success: boolean; data: SaveResponse }>(endpoint)
        : await api.delete<{ success: boolean; data: SaveResponse }>(endpoint);

      const data = response.data.data;
      setIsSaved(data.is_saved);
      setSaveCount(data.save_count);
      onChange?.(data.is_saved, data.save_count);

      router.refresh();

      toast.success(data.is_saved ? "Đã lưu công thức" : "Đã bỏ lưu công thức");
    } catch {
      setIsSaved(previousSaved);
      setSaveCount(previousCount);
      toast.error("Có lỗi xảy ra, vui lòng thử lại");
    } finally {
      inFlightRef.current = false;
    }
  };

  if (variant === "card") {
    return (
      <button
        onClick={toggle}
        aria-label={isSaved ? "Bỏ lưu công thức" : "Lưu công thức"}
        className={`flex items-center gap-1 px-2 py-1 rounded-full bg-white/80 backdrop-blur-sm transition-colors ${
          isSaved ? "text-primary" : "text-muted-foreground hover:text-primary"
        }`}
      >
        <Heart
          className={`w-3.5 h-3.5 transition-transform duration-150 ${isAnimating ? "scale-125" : "scale-100"}`}
          fill={isSaved ? "currentColor" : "none"}
          stroke="currentColor"
        />
        {saveCount > 0 && (
          <span className="text-[10px] font-medium leading-none">{saveCount}</span>
        )}
      </button>
    );
  }

  if (variant === "sidebar") {
    return (
      <button
        onClick={toggle}
        aria-label={isSaved ? "Bỏ lưu công thức" : "Lưu công thức"}
        className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-white font-semibold transition-colors"
      >
        <Heart
          className={`w-5 h-5 transition-transform duration-150 ${isAnimating ? "scale-125" : "scale-100"} ${isSaved ? "text-primary" : ""}`}
          fill={isSaved ? "currentColor" : "none"}
          stroke="currentColor"
        />
        <span>{isSaved ? "Đã lưu công thức" : "Lưu công thức"}</span>
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      aria-label={isSaved ? "Bỏ lưu công thức" : "Lưu công thức"}
      className={`inline-flex items-center gap-2 px-4 py-3 rounded-xl border transition-colors ${
        isSaved
          ? "border-primary text-primary"
          : "border-border text-muted-foreground hover:border-primary hover:text-primary"
      }`}
    >
      <Heart
        className={`w-5 h-5 transition-transform duration-150 ${isAnimating ? "scale-125" : "scale-100"}`}
        fill={isSaved ? "currentColor" : "none"}
        stroke="currentColor"
      />
      {saveCount > 0 && <span className="text-sm">{saveCount}</span>}
    </button>
  );
}
