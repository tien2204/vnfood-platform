"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import StarRating from "./StarRating";
import api from "@/lib/api";
import { useUser } from "@/lib/hooks/useUser";
import type { RatingOut } from "@/lib/types";

interface RatingSectionProps {
  recipeId: string;
  avgRating: number;
  ratingCount: number;
  userRating: number | null;
  isLoggedIn: boolean;
}

export default function RatingSection({
  recipeId,
  avgRating: initialAvg,
  ratingCount: initialCount,
  userRating: initialUserRating,
  isLoggedIn,
}: RatingSectionProps) {
  const router = useRouter();
  const { isLoggedIn: clientLoggedIn } = useUser();
  // Server may send isLoggedIn=false when httpOnly cookie is stale;
  // fall back to client-side auth state once SWR resolves.
  const effectiveLoggedIn = isLoggedIn || clientLoggedIn;

  const [avgRating, setAvgRating] = useState(initialAvg);
  const [ratingCount, setRatingCount] = useState(initialCount);
  const [userRating, setUserRating] = useState<number | null>(initialUserRating);
  const [loading, setLoading] = useState(false);

  async function handleRate(score: number) {
    if (!effectiveLoggedIn) {
      router.push(`/auth/login?next=/recipes/${recipeId}`);
      return;
    }
    if (loading) return;
    setLoading(true);

    const prev = userRating;
    setUserRating(score);

    try {
      const res = await api.post<{ success: boolean; data: RatingOut }>(
        `/recipes/${recipeId}/rate`,
        { score }
      );
      const { avg_rating, rating_count, user_rating } = res.data.data;
      setAvgRating(avg_rating);
      setRatingCount(rating_count);
      setUserRating(user_rating);
      toast.success(prev ? "Đã cập nhật đánh giá" : "Đã đánh giá công thức");
    } catch {
      setUserRating(prev);
      toast.error("Không thể gửi đánh giá, vui lòng thử lại");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 py-4 border-y border-border my-4">
      <div className="flex items-center gap-2">
        <StarRating value={avgRating} readonly size="md" />
        <span className="font-semibold text-foreground">
          {avgRating > 0 ? avgRating.toFixed(1) : "—"}
        </span>
        {ratingCount > 0 && (
          <span className="text-sm text-muted-foreground">({ratingCount} đánh giá)</span>
        )}
      </div>

      <div className="sm:ml-auto flex items-center gap-2">
        {effectiveLoggedIn ? (
          <>
            <span className="text-sm text-muted-foreground">
              {userRating ? "Bạn đã đánh giá:" : "Đánh giá của bạn:"}
            </span>
            <StarRating
              value={userRating ?? 0}
              onChange={handleRate}
              readonly={loading}
              size="md"
            />
          </>
        ) : (
          <button
            onClick={() => router.push(`/auth/login?next=/recipes/${recipeId}`)}
            className="text-sm text-primary hover:underline"
          >
            Đăng nhập để đánh giá
          </button>
        )}
      </div>
    </div>
  );
}
