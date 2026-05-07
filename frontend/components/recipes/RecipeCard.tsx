"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Clock, Users, Star } from "lucide-react";
import SaveButton from "./SaveButton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { RecipeCard as RecipeCardType } from "@/lib/types";

const DIFFICULTY_LABEL = {
  easy: "Dễ",
  medium: "Trung bình",
  hard: "Khó",
} as const;

const DIFFICULTY_COLOR = {
  easy: "bg-green-100 text-green-700",
  medium: "bg-yellow-100 text-yellow-700",
  hard: "bg-red-100 text-red-700",
} as const;

function stripEmoji(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, "")
    .trim();
}

interface Props {
  recipe: RecipeCardType;
  onSaveChange?: (isSaved: boolean, saveCount: number) => void;
}

export default function RecipeCard({ recipe, onSaveChange }: Props) {
  const router = useRouter();
  const imageUrl = recipe.image_url
    ? recipe.image_url.startsWith("http")
      ? recipe.image_url
      : `${process.env.NEXT_PUBLIC_UPLOAD_URL}/${recipe.image_url}`
    : null;

  const cleanTitle = stripEmoji(recipe.title);

  return (
    <Link href={`/recipes/${recipe.id}`} className="group block">
      <article className="bg-white rounded-2xl overflow-hidden border border-[#E8DDD4] transition-all duration-200 hover:scale-[1.02] hover:shadow-warm">

        {/* ── Image ── */}
        <div className="relative aspect-video bg-[#F7F0E8]">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={cleanTitle}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              unoptimized
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[#E8DDD4]">
              <svg className="w-14 h-14" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.06 22.99h1.66c.84 0 1.53-.64 1.63-1.46L23 5.05h-5V1h-1.97v4.05h-4.97l.3 2.34c1.71.47 3.31 1.32 4.27 2.26 1.44 1.42 2.43 2.89 2.43 5.29v8.05zM1 21.99V21h15.03v.99c0 .55-.45 1-1.01 1H2.01c-.56 0-1.01-.45-1.01-1zm15.03-7c0-8.17-15.03-8.17-15.03 0h15.03zM1.02 17h15v2h-15z" />
              </svg>
            </div>
          )}

          {/* Cookpad badge */}
          {recipe.source === "cookpad" && (
            <div className="absolute top-2 left-2 z-10">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/95 backdrop-blur-sm text-[10px] font-medium text-[#7C6A56] border border-[#E8DDD4]/50">
                <span className="w-1 h-1 rounded-full bg-[#E85D26]" />
                Cookpad
              </span>
            </div>
          )}

          {/* User recipe: community badge */}
          {recipe.source === "user" && (
            <div className="absolute top-2 left-2 z-10">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#2D6A4F]/10 text-[10px] font-medium text-[#2D6A4F] border border-[#2D6A4F]/20">
                <span className="w-1 h-1 rounded-full bg-[#2D6A4F]" />
                Cộng đồng
              </span>
            </div>
          )}

          {/* Save button */}
          <div className="absolute top-2 right-2 z-10">
            <SaveButton
              recipeId={recipe.id}
              initialSaved={recipe.is_saved ?? false}
              initialCount={recipe.save_count}
              variant="card"
              onChange={onSaveChange}
            />
          </div>

          {/* Difficulty badge */}
          {recipe.difficulty && (
            <span
              className={`absolute bottom-2 left-2 z-10 text-xs px-2 py-0.5 rounded-full font-medium ${DIFFICULTY_COLOR[recipe.difficulty]}`}
            >
              {DIFFICULTY_LABEL[recipe.difficulty]}
            </span>
          )}
        </div>

        {/* ── Content ── */}
        <div className="p-3.5">

          {/* Rating */}
          <div className="flex items-center gap-1 mb-1.5 min-h-[1.25rem]">
            {recipe.rating_count > 0 ? (
              <>
                <Star className="w-3.5 h-3.5 fill-[#F4A261] text-[#F4A261]" />
                <span className="text-sm font-medium text-[#1C1209]">
                  {recipe.avg_rating.toFixed(1)}
                </span>
                <span className="text-xs text-[#7C6A56]">({recipe.rating_count})</span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">Chưa có đánh giá</span>
            )}
          </div>

          {/* Title */}
          <h3 className="font-semibold text-[#1C1209] line-clamp-2 leading-snug mb-2">
            {cleanTitle}
          </h3>

          {/* Meta */}
          <div className="flex items-center gap-3 text-xs text-[#7C6A56] mb-3">
            {recipe.cooking_time != null && (
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {recipe.cooking_time} phút
              </span>
            )}
            {recipe.servings != null && (
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                {recipe.servings} người
              </span>
            )}
          </div>

          {/* Author */}
          {recipe.author && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); router.push(`/users/${recipe.author.id}`); }}
              className="flex items-center gap-2 group/author"
            >
              <Avatar className="w-6 h-6">
                <AvatarImage src={recipe.author.avatar_url ?? undefined} />
                <AvatarFallback className="text-[10px] bg-[#F7F0E8] text-[#E85D26]">
                  {recipe.author.full_name?.charAt(0)?.toUpperCase() ?? "?"}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs text-[#7C6A56] truncate group-hover/author:text-[#E85D26] transition-colors">
                {recipe.author.full_name}
              </span>
            </button>
          )}

        </div>
      </article>
    </Link>
  );
}
