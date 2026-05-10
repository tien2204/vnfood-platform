"use client";

import Link from "next/link";
import Image from "next/image";
import { Star, Clock, CheckCircle, XCircle } from "lucide-react";
import type { RecipeMatchResult } from "@/lib/types";

function stripEmoji(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, "")
    .trim();
}

interface Props {
  match: RecipeMatchResult;
  totalIngredients: number;
}

export default function RecipeMatchCard({ match, totalIngredients }: Props) {
  const { recipe, match_score, matched_ingredients, missing_ingredients } = match;

  const imageUrl = recipe.image_url
    ? recipe.image_url.startsWith("http")
      ? recipe.image_url
      : `${process.env.NEXT_PUBLIC_UPLOAD_URL}/${recipe.image_url}`
    : null;

  const matchedCount = matched_ingredients.length;
  const pct = Math.round(match_score * 100);

  const badgeColor =
    pct >= 80
      ? "bg-green-100 text-green-700 border-green-200"
      : pct >= 50
      ? "bg-amber-100 text-amber-700 border-amber-200"
      : "bg-orange-100 text-orange-700 border-orange-200";

  return (
    <Link href={`/recipes/${recipe.id}`} className="group block">
      <article className="bg-white rounded-2xl overflow-hidden border border-[#E8DDD4] transition-all duration-200 hover:scale-[1.02] hover:shadow-warm h-full flex flex-col">
        {/* Image */}
        <div className="relative aspect-video bg-[#F7F0E8] shrink-0">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={stripEmoji(recipe.title)}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              unoptimized
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[#E8DDD4]">
              <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.06 22.99h1.66c.84 0 1.53-.64 1.63-1.46L23 5.05h-5V1h-1.97v4.05h-4.97l.3 2.34c1.71.47 3.31 1.32 4.27 2.26 1.44 1.42 2.43 2.89 2.43 5.29v8.05zM1 21.99V21h15.03v.99c0 .55-.45 1-1.01 1H2.01c-.56 0-1.01-.45-1.01-1zm15.03-7c0-8.17-15.03-8.17-15.03 0h15.03zM1.02 17h15v2h-15z" />
              </svg>
            </div>
          )}

          {/* Source badge */}
          <div className="absolute top-2 left-2 z-10">
            {recipe.source === "cookpad" ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/95 text-[10px] font-medium text-[#7C6A56] border border-[#E8DDD4]/50">
                <span className="w-1 h-1 rounded-full bg-[#E85D26]" />
                Cookpad
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#2D6A4F]/10 text-[10px] font-medium text-[#2D6A4F] border border-[#2D6A4F]/20">
                <span className="w-1 h-1 rounded-full bg-[#2D6A4F]" />
                Cộng đồng
              </span>
            )}
          </div>

          {/* Match badge */}
          <div className="absolute top-2 right-2 z-10">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${badgeColor}`}>
              Khớp {matchedCount}/{totalIngredients}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-3.5 flex flex-col gap-2 flex-1">
          {/* Rating */}
          <div className="flex items-center gap-1 min-h-[1.25rem]">
            {recipe.rating_count > 0 ? (
              <>
                <Star className="w-3.5 h-3.5 fill-[#F4A261] text-[#F4A261]" />
                <span className="text-sm font-medium text-[#1C1209]">
                  {recipe.avg_rating.toFixed(1)}
                </span>
                <span className="text-xs text-[#7C6A56]">({recipe.rating_count})</span>
              </>
            ) : (
              <span className="text-xs text-[#B0A090]">Chưa có đánh giá</span>
            )}
            {recipe.cooking_time != null && (
              <span className="ml-auto flex items-center gap-1 text-xs text-[#7C6A56]">
                <Clock className="w-3.5 h-3.5" />
                {recipe.cooking_time} phút
              </span>
            )}
          </div>

          <h3 className="font-semibold text-[#1C1209] line-clamp-2 leading-snug text-sm">
            {stripEmoji(recipe.title)}
          </h3>

          {/* Match details */}
          <div className="mt-auto space-y-1.5">
            {matched_ingredients.length > 0 && (
              <div className="flex items-start gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-green-700 leading-relaxed">
                  {matched_ingredients.slice(0, 4).join(", ")}
                  {matched_ingredients.length > 4 && ` +${matched_ingredients.length - 4}`}
                </p>
              </div>
            )}
            {missing_ingredients.length > 0 && (
              <div className="flex items-start gap-1.5">
                <XCircle className="w-3.5 h-3.5 text-[#B0A090] shrink-0 mt-0.5" />
                <p className="text-[11px] text-[#7C6A56] leading-relaxed">
                  Thiếu: {missing_ingredients.slice(0, 3).join(", ")}
                  {missing_ingredients.length > 3 && ` +${missing_ingredients.length - 3}`}
                </p>
              </div>
            )}
          </div>
        </div>
      </article>
    </Link>
  );
}
