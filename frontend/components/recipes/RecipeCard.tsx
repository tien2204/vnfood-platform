"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, Users, Star } from "lucide-react";
import SaveButton from "./SaveButton";
import RecipeImage from "@/components/common/RecipeImage";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { RecipeCard as RecipeCardType } from "@/lib/types";

const DIFFICULTY_LABEL = {
  easy: "Dễ",
  medium: "Trung bình",
  hard: "Khó",
} as const;

const DIFFICULTY_COLOR = {
  easy: "bg-[#4a7c59] text-white",
  medium: "bg-[#fff5e6] text-[#2c1810]",
  hard: "bg-[#ff6b35] text-white",
} as const;

function stripEmoji(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, "")
    .trim();
}

interface Props {
  recipe: RecipeCardType;
  onSaveChange?: (isSaved: boolean, saveCount: number) => void;
  showVariantAction?: boolean;
}

export default function RecipeCard({ recipe, onSaveChange, showVariantAction }: Props) {
  const router = useRouter();

  const imageUrl = recipe.image_url
    ? recipe.image_url.startsWith("http")
      ? recipe.image_url
      : `${process.env.NEXT_PUBLIC_UPLOAD_URL}/${recipe.image_url}`
    : null;

  const cleanTitle = stripEmoji(recipe.title);

  return (
    <Link href={`/recipes/${recipe.id}`} className="group block h-full">
      <article className="restaurant-card restaurant-card-hover overflow-hidden h-full flex flex-col">

        {/* ── Image ── */}
        <div className="relative aspect-[4/3] bg-[#fff5e6] border-b-2 border-[#2c1810]">
          <RecipeImage
            src={imageUrl}
            alt={cleanTitle}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            unoptimized
            fallback={
              <div className="absolute inset-0 flex items-center justify-center text-[#e8ddd4]">
                <svg className="w-14 h-14" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.06 22.99h1.66c.84 0 1.53-.64 1.63-1.46L23 5.05h-5V1h-1.97v4.05h-4.97l.3 2.34c1.71.47 3.31 1.32 4.27 2.26 1.44 1.42 2.43 2.89 2.43 5.29v8.05zM1 21.99V21h15.03v.99c0 .55-.45 1-1.01 1H2.01c-.56 0-1.01-.45-1.01-1zm15.03-7c0-8.17-15.03-8.17-15.03 0h15.03zM1.02 17h15v2h-15z" />
                </svg>
              </div>
            }
          />

          {/* Cookpad badge */}
          {recipe.source === "cookpad" && (
            <div className="absolute top-2 left-2 z-10">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/95 backdrop-blur-sm text-[10px] font-bold uppercase tracking-wide text-[#6b5344] border-2 border-[#2c1810]">
                <span className="w-1 h-1 rounded-full bg-[#ff6b35]" />
                Cookpad
              </span>
            </div>
          )}

          {/* User recipe: community badge */}
          {!recipe.is_canonical && recipe.source === "user" && (
            <div className="absolute top-2 left-2 z-10">
              <span className="inline-flex items-center gap-1 rounded-full border border-[#2D6A4F]/20 bg-[#2D6A4F]/10 px-2 py-0.5 text-[10px] font-medium text-[#2D6A4F]">
                Cộng đồng{recipe.original_author_name ? ` · ${recipe.original_author_name}` : ""}
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
              className={`absolute bottom-2 left-2 z-10 text-xs px-2 py-0.5 border-2 border-[#2c1810] font-bold ${DIFFICULTY_COLOR[recipe.difficulty]}`}
            >
              {DIFFICULTY_LABEL[recipe.difficulty]}
            </span>
          )}
        </div>

        {/* ── Content ── */}
        <div className="p-4 flex flex-col flex-1">

          {/* Rating */}
          <div className="flex items-center gap-1 mb-1.5 min-h-[1.25rem]">
            {recipe.rating_count > 0 ? (
              <>
                <Star className="w-3.5 h-3.5 fill-[#ff6b35] text-[#ff6b35]" />
                <span className="text-sm font-bold text-[#2c1810]">
                  {recipe.avg_rating.toFixed(1)}
                </span>
                <span className="text-xs text-[#6b5344]">({recipe.rating_count})</span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">Chưa có đánh giá</span>
            )}
          </div>

          {/* Title — reserve 2 lines of height so 1-line and 2-line titles align */}
          <h3 className="font-bold text-lg text-[#2c1810] line-clamp-2 leading-snug mb-3 min-h-[3.25rem]">
            {cleanTitle}
          </h3>

          {/* Meta — reserve row even when both time & servings null */}
          <div className="flex items-center gap-3 text-xs font-medium text-[#6b5344] mb-4 min-h-[1.125rem]">
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

          {/* Author — mt-auto wrapper pins to bottom so cards align */}
          <div className="mt-auto">
          {(() => {
            const displayName =
              recipe.author?.full_name ??
              (recipe.original_author_name && recipe.original_author_name.length > 0
                ? recipe.original_author_name
                : "Unknown");
            const initials = displayName.slice(0, 2).toUpperCase();
            const isLinkable = !!recipe.author;

            const authorEl = (
              <div className="flex items-center gap-1.5">
                <Avatar className="w-[18px] h-[18px]">
                  {recipe.author?.avatar_url && <AvatarImage src={recipe.author.avatar_url} />}
                  <AvatarFallback className="text-[9px] bg-[#2D6A4F] text-white">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs text-[#7C6A56] truncate">{displayName}</span>
              </div>
            );

            return isLinkable ? (
              <span
                role="link"
                tabIndex={0}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  router.push(`/users/${recipe.author!.id}`);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    router.push(`/users/${recipe.author!.id}`);
                  }
                }}
                className="block w-fit cursor-pointer hover:opacity-80 transition-opacity"
              >
                {authorEl}
              </span>
            ) : (
              authorEl
            );
          })()}
          </div>

          {showVariantAction && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                router.push(`/recipes/${recipe.id}/variant`);
              }}
              className="mt-3 w-full text-center text-xs font-medium border-2 border-[#2c1810] bg-[#fff5e6] text-[#2c1810] py-1.5 hover:bg-[#ff6b35] hover:text-white transition-colors"
            >
              Tạo biến thể
            </button>
          )}

        </div>
      </article>
    </Link>
  );
}
