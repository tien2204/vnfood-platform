"use client";

import { useState, useCallback } from "react";
import { CalendarDays, ChefHat, Star } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import RecipeGrid from "@/components/recipes/RecipeGrid";
import type { RecipeCard, UserProfile } from "@/lib/types";
import api from "@/lib/api";

const PAGE_SIZE = 6;

interface Props {
  profile: UserProfile;
  currentUserId: string | null;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("vi-VN", { month: "long", year: "numeric" });
}

export default function UserProfileClient({ profile }: Props) {
  const stats = profile.stats;

  // recent_recipes là 6 món mới nhất = trang 1 (limit 6); "Xem thêm" tải trang kế.
  const [recipes, setRecipes] = useState<RecipeCard[]>(profile.recent_recipes);
  const [recipesPage, setRecipesPage] = useState(1);
  const [recipesLoading, setRecipesLoading] = useState(false);

  const totalPages = Math.max(1, Math.ceil(stats.recipe_count / PAGE_SIZE));

  const loadMore = useCallback(async () => {
    const next = recipesPage + 1;
    setRecipesLoading(true);
    try {
      const res = await api.get(`/users/${profile.id}/recipes`, {
        params: { page: next, limit: PAGE_SIZE, status: "approved" },
      });
      setRecipes((prev) => [...prev, ...res.data.data]);
      setRecipesPage(next);
    } catch { /* ignore */ } finally {
      setRecipesLoading(false);
    }
  }, [profile.id, recipesPage]);

  const avatarSrc = profile.avatar_url
    ? profile.avatar_url.startsWith("http")
      ? profile.avatar_url
      : `${process.env.NEXT_PUBLIC_API_URL}${profile.avatar_url}`
    : undefined;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 pb-24 lg:pb-8">

      {/* ── Profile Hero ── */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden mb-6">
        {/* Cover gradient */}
        <div className="h-32 sm:h-40 bg-gradient-to-br from-primary/20 via-[#F4A261]/20 to-[#2D6A4F]/10" />

        {/* Avatar + info */}
        <div className="px-6 pb-6">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-12 sm:-mt-14">
            <Avatar className="w-24 h-24 sm:w-28 sm:h-28 border-4 border-card shadow-md shrink-0">
              <AvatarImage src={avatarSrc} alt={profile.full_name ?? "User"} />
              <AvatarFallback className="bg-primary text-white text-3xl font-bold">
                {profile.full_name?.charAt(0)?.toUpperCase() ?? "?"}
              </AvatarFallback>
            </Avatar>
          </div>

          <div className="mt-4">
            <h1 className="text-2xl font-bold text-foreground">
              {profile.full_name ?? "Người dùng"}
            </h1>
            {profile.bio && (
              <p className="text-muted-foreground mt-1.5 leading-relaxed">{profile.bio}</p>
            )}
            <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="w-4 h-4" />
                Tham gia {formatDate(profile.created_at)}
              </span>
              {stats.total_likes_received > 0 && (
                <span className="flex items-center gap-1.5">
                  <Star className="w-4 h-4 fill-[#F4A261] text-[#F4A261]" />
                  {stats.total_likes_received.toLocaleString()} lượt đánh giá
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Recipes ── */}
      <h2 className="flex items-center gap-1.5 text-lg font-semibold text-foreground mb-4">
        <ChefHat className="w-5 h-5 text-primary" />
        Công thức ({stats.recipe_count})
      </h2>

      {recipes.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ChefHat className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Chưa có công thức nào</p>
        </div>
      ) : (
        <>
          <RecipeGrid recipes={recipes} />
          {recipesLoading && (
            <div className="flex justify-center py-8">
              <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!recipesLoading && recipesPage < totalPages && (
            <div className="flex justify-center mt-6">
              <button
                onClick={loadMore}
                className="px-6 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                Xem thêm
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
