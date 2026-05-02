"use client";

import Link from "next/link";
import Image from "next/image";
import { Clock, Users, Star, Bookmark } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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

interface Props {
  recipe: RecipeCardType;
}

export default function RecipeCard({ recipe }: Props) {
  const imageUrl = recipe.image_url
    ? recipe.image_url.startsWith("http")
      ? recipe.image_url
      : `${process.env.NEXT_PUBLIC_UPLOAD_URL}/${recipe.image_url}`
    : null;

  return (
    <Link href={`/recipes/${recipe.id}`} className="group block">
      <article className="bg-white rounded-2xl overflow-hidden border border-[#E8DDD4] transition-all duration-200 hover:scale-[1.02] hover:shadow-warm">
        {/* Image */}
        <div className="relative aspect-video bg-[#F7F0E8]">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={recipe.title}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              unoptimized
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[#E8DDD4]">
              <svg
                className="w-16 h-16"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
              </svg>
            </div>
          )}

          {/* Save icon */}
          <button
            onClick={(e) => {
              e.preventDefault();
              /* TODO: save/unsave */
            }}
            className="absolute top-2.5 right-2.5 p-1.5 rounded-full bg-white/80 backdrop-blur-sm text-[#7C6A56] hover:text-[#E85D26] transition-colors"
          >
            <Bookmark
              className="w-4 h-4"
              fill={recipe.is_saved ? "#E85D26" : "none"}
              stroke={recipe.is_saved ? "#E85D26" : "currentColor"}
            />
          </button>

          {/* Difficulty badge */}
          {recipe.difficulty && (
            <span
              className={`absolute bottom-2.5 left-2.5 text-xs px-2 py-0.5 rounded-full font-medium ${DIFFICULTY_COLOR[recipe.difficulty]}`}
            >
              {DIFFICULTY_LABEL[recipe.difficulty]}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="p-3.5">
          {/* Rating */}
          <div className="flex items-center gap-1 mb-1.5">
            <Star className="w-3.5 h-3.5 fill-[#F4A261] text-[#F4A261]" />
            <span className="text-sm font-medium text-[#1C1209]">
              {recipe.avg_rating > 0 ? recipe.avg_rating.toFixed(1) : "—"}
            </span>
            {recipe.rating_count > 0 && (
              <span className="text-xs text-[#7C6A56]">
                ({recipe.rating_count})
              </span>
            )}
          </div>

          {/* Title */}
          <h3
            className="font-semibold text-[#1C1209] line-clamp-2 leading-snug mb-2"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {recipe.title}
          </h3>

          {/* Meta */}
          <div className="flex items-center gap-3 text-xs text-[#7C6A56] mb-3">
            {recipe.cooking_time && (
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {recipe.cooking_time} phút
              </span>
            )}
            {recipe.servings && (
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                {recipe.servings} người
              </span>
            )}
          </div>

          {/* Author */}
          {recipe.author && (
            <div className="flex items-center gap-2">
              <Avatar className="w-6 h-6">
                <AvatarImage src={recipe.author.avatar_url ?? undefined} />
                <AvatarFallback className="text-[10px] bg-[#F7F0E8] text-[#E85D26]">
                  {recipe.author.full_name?.charAt(0)?.toUpperCase() ?? "?"}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs text-[#7C6A56] truncate">
                {recipe.author.full_name}
              </span>
            </div>
          )}
        </div>
      </article>
    </Link>
  );
}
