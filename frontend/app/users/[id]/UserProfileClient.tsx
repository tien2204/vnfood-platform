"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { CalendarDays, ChefHat, Star } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import RecipeGrid from "@/components/recipes/RecipeGrid";
import UserCard from "@/components/users/UserCard";
import UserStatsBar from "@/components/users/UserStatsBar";
import FollowButton from "@/components/users/FollowButton";
import type { FollowerOut, RecipeCard, UserProfile, UserStats } from "@/lib/types";
import api from "@/lib/api";

interface Props {
  profile: UserProfile;
  currentUserId: string | null;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("vi-VN", { month: "long", year: "numeric" });
}

export default function UserProfileClient({ profile, currentUserId }: Props) {
  const [stats, setStats] = useState<UserStats>(profile.stats);
  const [activeTab, setActiveTab] = useState<"recipes" | "followers" | "following">("recipes");

  const [recipes, setRecipes] = useState<RecipeCard[]>(profile.recent_recipes);
  const [recipesLoaded, setRecipesLoaded] = useState(false);
  const [recipesPage, setRecipesPage] = useState(1);
  const [recipesTotalPages, setRecipesTotalPages] = useState(1);
  const [recipesLoading, setRecipesLoading] = useState(false);

  const [followers, setFollowers] = useState<FollowerOut[]>([]);
  const [followersLoaded, setFollowersLoaded] = useState(false);
  const [followersPage, setFollowersPage] = useState(1);
  const [followersTotalPages, setFollowersTotalPages] = useState(1);

  const [following, setFollowing] = useState<FollowerOut[]>([]);
  const [followingLoaded, setFollowingLoaded] = useState(false);
  const [followingPage, setFollowingPage] = useState(1);
  const [followingTotalPages, setFollowingTotalPages] = useState(1);

  const loadRecipes = useCallback(async (page: number) => {
    setRecipesLoading(true);
    try {
      const res = await api.get(`/users/${profile.id}/recipes`, { params: { page, limit: 12, status: "approved" } });
      if (page === 1) setRecipes(res.data.data);
      else setRecipes((prev) => [...prev, ...res.data.data]);
      setRecipesPage(page);
      setRecipesTotalPages(res.data.pagination.total_pages);
      setRecipesLoaded(true);
    } catch { /* ignore */ } finally {
      setRecipesLoading(false);
    }
  }, [profile.id]);

  const loadFollowers = useCallback(async (page: number) => {
    try {
      const res = await api.get(`/users/${profile.id}/followers`, { params: { page, limit: 20 } });
      if (page === 1) setFollowers(res.data.data);
      else setFollowers((prev) => [...prev, ...res.data.data]);
      setFollowersPage(page);
      setFollowersTotalPages(res.data.pagination.total_pages);
      setFollowersLoaded(true);
    } catch { /* ignore */ }
  }, [profile.id]);

  const loadFollowing = useCallback(async (page: number) => {
    try {
      const res = await api.get(`/users/${profile.id}/following`, { params: { page, limit: 20 } });
      if (page === 1) setFollowing(res.data.data);
      else setFollowing((prev) => [...prev, ...res.data.data]);
      setFollowingPage(page);
      setFollowingTotalPages(res.data.pagination.total_pages);
      setFollowingLoaded(true);
    } catch { /* ignore */ }
  }, [profile.id]);

  useEffect(() => {
    if (activeTab === "recipes" && !recipesLoaded) loadRecipes(1);
    if (activeTab === "followers" && !followersLoaded) loadFollowers(1);
    if (activeTab === "following" && !followingLoaded) loadFollowing(1);
  }, [activeTab, recipesLoaded, followersLoaded, followingLoaded, loadRecipes, loadFollowers, loadFollowing]);

  const avatarSrc = profile.avatar_url
    ? profile.avatar_url.startsWith("http")
      ? profile.avatar_url
      : `${process.env.NEXT_PUBLIC_API_URL}${profile.avatar_url}`
    : undefined;

  const isSelf = currentUserId === profile.id;

  const tabTriggerClass =
    "px-4 py-2.5 text-sm font-medium rounded-none -mb-px border-b-2 border-transparent " +
    "text-[#7C6A56] data-[state=active]:border-[#E85D26] data-[state=active]:text-[#E85D26] " +
    "data-[state=active]:bg-transparent data-[state=active]:shadow-none " +
    "hover:text-[#1C1209] transition-colors";

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 pb-24 lg:pb-8">

      {/* ── Profile Hero ── */}
      <div className="bg-white rounded-2xl border border-[#E8DDD4] overflow-hidden mb-6">
        {/* Cover gradient */}
        <div className="h-32 sm:h-40 bg-gradient-to-br from-[#E85D26]/20 via-[#F4A261]/20 to-[#2D6A4F]/10" />

        {/* Avatar + info */}
        <div className="px-6 pb-6">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 -mt-12 sm:-mt-14">
            {/* Avatar */}
            <Avatar className="w-24 h-24 sm:w-28 sm:h-28 border-4 border-white shadow-md shrink-0">
              <AvatarImage src={avatarSrc} alt={profile.full_name ?? "User"} />
              <AvatarFallback className="bg-[#E85D26] text-white text-3xl font-bold">
                {profile.full_name?.charAt(0)?.toUpperCase() ?? "?"}
              </AvatarFallback>
            </Avatar>

            {/* Follow button */}
            <div className="sm:pb-2">
              <FollowButton
                userId={profile.id}
                initialFollowing={profile.is_following ?? false}
                initialCount={stats.follower_count}
                isSelf={isSelf}
                onToggle={(isFollowing, count) =>
                  setStats((s) => ({ ...s, follower_count: count }))
                }
              />
            </div>
          </div>

          <div className="mt-4">
            <h1 className="text-2xl font-bold text-[#1C1209]" style={{ fontFamily: "var(--font-playfair)" }}>
              {profile.full_name ?? "Người dùng"}
            </h1>
            {profile.bio && (
              <p className="text-[#7C6A56] mt-1.5 leading-relaxed">{profile.bio}</p>
            )}
            <div className="flex flex-wrap gap-4 mt-3 text-sm text-[#7C6A56]">
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

          <div className="mt-5">
            <UserStatsBar
              stats={stats}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="w-full justify-start border-b border-[#E8DDD4] bg-transparent h-auto p-0 rounded-none mb-6">
          <TabsTrigger value="recipes" className={tabTriggerClass}>
            <ChefHat className="w-4 h-4 mr-1.5" />
            Công thức ({stats.recipe_count})
          </TabsTrigger>
          <TabsTrigger value="followers" className={tabTriggerClass}>
            Người theo dõi ({stats.follower_count})
          </TabsTrigger>
          <TabsTrigger value="following" className={tabTriggerClass}>
            Đang theo dõi ({stats.following_count})
          </TabsTrigger>
        </TabsList>

        {/* Recipes tab */}
        <TabsContent value="recipes">
          {recipes.length === 0 && !recipesLoading ? (
            <div className="text-center py-16 text-[#7C6A56]">
              <ChefHat className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Chưa có công thức nào</p>
            </div>
          ) : (
            <>
              <RecipeGrid recipes={recipes} />
              {recipesLoading && (
                <div className="flex justify-center py-8">
                  <div className="w-7 h-7 border-2 border-[#E85D26] border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {!recipesLoading && recipesPage < recipesTotalPages && (
                <div className="flex justify-center mt-6">
                  <button
                    onClick={() => loadRecipes(recipesPage + 1)}
                    className="px-6 py-2.5 rounded-xl border border-[#E8DDD4] text-sm text-[#7C6A56] hover:border-[#E85D26] hover:text-[#E85D26] transition-colors"
                  >
                    Xem thêm
                  </button>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* Followers tab */}
        <TabsContent value="followers">
          {followers.length === 0 && followersLoaded ? (
            <div className="text-center py-16 text-[#7C6A56]">
              <p>Chưa có người theo dõi</p>
            </div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 gap-3">
                {followers.map((u) => (
                  <UserCard key={u.id} user={u} currentUserId={currentUserId ?? undefined} />
                ))}
              </div>
              {followersPage < followersTotalPages && (
                <div className="flex justify-center mt-6">
                  <button
                    onClick={() => loadFollowers(followersPage + 1)}
                    className="px-6 py-2.5 rounded-xl border border-[#E8DDD4] text-sm text-[#7C6A56] hover:border-[#E85D26] hover:text-[#E85D26] transition-colors"
                  >
                    Xem thêm
                  </button>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* Following tab */}
        <TabsContent value="following">
          {following.length === 0 && followingLoaded ? (
            <div className="text-center py-16 text-[#7C6A56]">
              <p>Chưa theo dõi ai</p>
            </div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 gap-3">
                {following.map((u) => (
                  <UserCard key={u.id} user={u} currentUserId={currentUserId ?? undefined} />
                ))}
              </div>
              {followingPage < followingTotalPages && (
                <div className="flex justify-center mt-6">
                  <button
                    onClick={() => loadFollowing(followingPage + 1)}
                    className="px-6 py-2.5 rounded-xl border border-[#E8DDD4] text-sm text-[#7C6A56] hover:border-[#E85D26] hover:text-[#E85D26] transition-colors"
                  >
                    Xem thêm
                  </button>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
