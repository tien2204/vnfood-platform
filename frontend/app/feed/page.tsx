"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Clock, Compass, Newspaper, Star, UserPlus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import SaveButton from "@/components/recipes/SaveButton";
import useSWRInfinite from "swr/infinite";
import api from "@/lib/api";
import { useUser } from "@/lib/hooks/useUser";
import type { FeedItem, FeedResponse } from "@/lib/types";

const PAGE_SIZE = 20;

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} ngày trước`;
  return new Date(iso).toLocaleDateString("vi-VN");
}

function stripEmoji(text: string): string {
  return text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, "").trim();
}

async function fetchFeedPage(url: string) {
  const res = await api.get<FeedResponse>(url);
  return res.data;
}

export default function FeedPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isLoggedIn } = useUser();

  const getKey = (pageIndex: number, previous: FeedResponse | null) => {
    if (!isLoggedIn) return null;
    if (previous && previous.pagination.page >= previous.pagination.total_pages) return null;
    return `/feed?page=${pageIndex + 1}&limit=${PAGE_SIZE}`;
  };

  const { data, size, setSize, isLoading } = useSWRInfinite<FeedResponse>(
    getKey,
    fetchFeedPage,
    { revalidateFirstPage: false }
  );

  const allItems: FeedItem[] = data ? data.flatMap((d) => d.data) : [];
  const isDiscoverMode = data?.[0]?.is_discover_mode ?? false;
  const lastPage = data?.[data.length - 1];
  const hasMore = lastPage ? lastPage.pagination.page < lastPage.pagination.total_pages : false;
  const loadingMore = isLoading || size > (data?.length ?? 0);

  if (!authLoading && !isLoggedIn) {
    router.replace("/auth/login");
    return null;
  }

  if (authLoading || isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 flex justify-center">
        <div className="w-8 h-8 border-2 border-[#E85D26] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 pb-24 lg:pb-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        {isDiscoverMode ? (
          <Compass className="w-6 h-6 text-[#E85D26]" />
        ) : (
          <Newspaper className="w-6 h-6 text-[#E85D26]" />
        )}
        <div>
          <h1 className="text-2xl font-bold text-[#1C1209]" style={{ fontFamily: "var(--font-playfair)" }}>
            {isDiscoverMode ? "Khám phá" : "Bảng tin"}
          </h1>
          <p className="text-sm text-[#666666]">
            {isDiscoverMode
              ? "Những công thức được yêu thích nhất"
              : "Công thức mới từ những người bạn đang theo dõi"}
          </p>
        </div>
      </div>

      {/* Discover mode CTA */}
      {isDiscoverMode && (
        <div className="bg-[#FFF5F0] border border-[#E85D26]/20 rounded-2xl p-4 mb-6 flex items-start gap-3">
          <UserPlus className="w-5 h-5 text-[#E85D26] shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[#1C1209]">Chưa theo dõi ai</p>
            <p className="text-xs text-[#666666] mt-0.5">
              Theo dõi các đầu bếp để xem công thức mới nhất của họ trong Bảng tin
            </p>
          </div>
          <Link href="/recipes">
            <Button size="sm" variant="outline" className="border-[#E85D26] text-[#E85D26] hover:bg-[#E85D26] hover:text-white shrink-0 text-xs">
              Khám phá
            </Button>
          </Link>
        </div>
      )}

      {/* Feed items */}
      <div className="space-y-5">
        {allItems.map((item, idx) => (
          <FeedCard key={`${item.recipe.id}-${idx}`} item={item} />
        ))}
      </div>

      {/* Empty state */}
      {!loadingMore && allItems.length === 0 && (
        <div className="text-center py-20 text-[#666666]">
          <Newspaper className="w-14 h-14 mx-auto mb-4 opacity-20" />
          <p className="font-medium">Bảng tin trống</p>
          <p className="text-sm mt-1">Theo dõi người dùng để xem công thức của họ</p>
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center mt-8">
          <Button
            variant="outline"
            onClick={() => setSize(size + 1)}
            disabled={loadingMore}
            className="border-[#f0f0f0] text-[#666666] hover:border-[#E85D26] hover:text-[#E85D26]"
          >
            {loadingMore ? (
              <div className="w-4 h-4 border-2 border-[#E85D26] border-t-transparent rounded-full animate-spin" />
            ) : (
              "Xem thêm"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

function FeedCard({ item }: { item: FeedItem }) {
  const { recipe, author, posted_at } = item;
  const imageUrl = recipe.image_url
    ? recipe.image_url.startsWith("http")
      ? recipe.image_url
      : `${process.env.NEXT_PUBLIC_API_URL}${recipe.image_url}`
    : null;

  const avatarSrc = author.avatar_url
    ? author.avatar_url.startsWith("http")
      ? author.avatar_url
      : `${process.env.NEXT_PUBLIC_API_URL}${author.avatar_url}`
    : undefined;

  const [saved, setSaved] = useState(recipe.is_saved ?? false);
  const [saveCount, setSaveCount] = useState(recipe.save_count);

  return (
    <article className="bg-white rounded-2xl border border-[#f0f0f0] overflow-hidden">
      {/* Author header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#F7F0E8]">
        <Link href={`/users/${author.id}`} className="shrink-0">
          <Avatar className="w-9 h-9">
            <AvatarImage src={avatarSrc} alt={author.full_name ?? "User"} />
            <AvatarFallback className="bg-[#F7F0E8] text-[#E85D26] text-sm font-semibold">
              {author.full_name?.charAt(0)?.toUpperCase() ?? "?"}
            </AvatarFallback>
          </Avatar>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <Link href={`/users/${author.id}`}>
              <span className="text-sm font-semibold text-[#1C1209] hover:text-[#E85D26] transition-colors">
                {author.full_name ?? "Người dùng"}
              </span>
            </Link>
            <span className="text-xs text-[#666666]">đã đăng công thức mới</span>
          </div>
          <p className="text-xs text-[#B09A88] mt-0.5">{relativeTime(posted_at)}</p>
        </div>
      </div>

      {/* Recipe card compact */}
      <Link href={`/recipes/${recipe.id}`} className="block group">
        <div className="flex gap-3 p-4">
          {/* Thumbnail */}
          <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden bg-[#F7F0E8] shrink-0">
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={stripEmoji(recipe.title)}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-200"
                unoptimized
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-[#f0f0f0]">
                <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.06 22.99h1.66c.84 0 1.53-.64 1.63-1.46L23 5.05h-5V1h-1.97v4.05h-4.97l.3 2.34c1.71.47 3.31 1.32 4.27 2.26 1.44 1.42 2.43 2.89 2.43 5.29v8.05zM1 21.99V21h15.03v.99c0 .55-.45 1-1.01 1H2.01c-.56 0-1.01-.45-1.01-1zm15.03-7c0-8.17-15.03-8.17-15.03 0h15.03zM1.02 17h15v2h-15z" />
                </svg>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 flex flex-col justify-between">
            <div>
              <h3 className="font-semibold text-[#1C1209] line-clamp-2 leading-snug group-hover:text-[#E85D26] transition-colors">
                {stripEmoji(recipe.title)}
              </h3>
              {recipe.rating_count > 0 && (
                <div className="flex items-center gap-1 mt-1.5">
                  <Star className="w-3.5 h-3.5 fill-[#F4A261] text-[#F4A261]" />
                  <span className="text-sm font-medium text-[#1C1209]">
                    {recipe.avg_rating.toFixed(1)}
                  </span>
                  <span className="text-xs text-[#666666]">({recipe.rating_count})</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 mt-2 text-xs text-[#666666]">
              {recipe.cooking_time != null && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {recipe.cooking_time} phút
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>

      {/* Footer */}
      <div className="px-4 pb-3 flex items-center justify-between border-t border-[#F7F0E8] pt-3">
        <Link href={`/recipes/${recipe.id}`}>
          <Button size="sm" variant="outline" className="text-xs border-[#f0f0f0] text-[#666666] hover:border-[#E85D26] hover:text-[#E85D26]">
            Xem công thức
          </Button>
        </Link>
        <SaveButton
          recipeId={recipe.id}
          initialSaved={saved}
          initialCount={saveCount}
          variant="card"
          onChange={(isSaved, count) => { setSaved(isSaved); setSaveCount(count); }}
        />
      </div>
    </article>
  );
}
