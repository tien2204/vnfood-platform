"use client";

import Link from "next/link";
import { Star, Clock } from "lucide-react";
import RecipeImage from "@/components/common/RecipeImage";
import { SuggestedRecipe } from "@/lib/types";

interface Props {
  recipes: SuggestedRecipe[];
  title?: string;
}

function SuggestedRecipeCard({ recipe }: { recipe: SuggestedRecipe }) {
  const imageUrl = recipe.image_url
    ? recipe.image_url.startsWith("http")
      ? recipe.image_url
      : `${process.env.NEXT_PUBLIC_UPLOAD_URL}/${recipe.image_url}`
    : null;

  return (
    <Link href={`/recipes/${recipe.id}`} className="group shrink-0 w-44 flex flex-col">
      <div className="relative w-full h-32 rounded-xl overflow-hidden bg-[#F7F0E8]">
        <RecipeImage
          src={imageUrl}
          alt={recipe.title}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          unoptimized
          fallback={
            <div className="absolute inset-0 flex items-center justify-center text-[#E8DDD4]">
              <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.06 22.99h1.66c.84 0 1.53-.64 1.63-1.46L23 5.05h-5V1h-1.97v4.05h-4.97l.3 2.34c1.71.47 3.31 1.32 4.27 2.26 1.44 1.42 2.43 2.89 2.43 5.29v8.05zM1 21.99V21h15.03v.99c0 .55-.45 1-1.01 1H2.01c-.56 0-1.01-.45-1.01-1zm15.03-7c0-8.17-15.03-8.17-15.03 0h15.03zM1.02 17h15v2h-15z" />
              </svg>
            </div>
          }
        />
        {recipe.source === "cookpad" && (
          <span className="absolute top-1.5 right-1.5 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded-full">
            Cookpad
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-col gap-0.5 px-0.5">
        <p className="text-sm font-medium text-[#2D2417] line-clamp-2 leading-snug group-hover:text-[#E85D26] transition-colors">
          {recipe.title}
        </p>
        <div className="flex items-center gap-2 text-xs text-[#7C6A56] mt-0.5">
          {recipe.avg_rating > 0 && (
            <span className="flex items-center gap-0.5">
              <Star className="w-3 h-3 fill-[#F4A261] stroke-[#F4A261]" />
              {recipe.avg_rating.toFixed(1)}
            </span>
          )}
          {recipe.cooking_time && (
            <span className="flex items-center gap-0.5">
              <Clock className="w-3 h-3" />
              {recipe.cooking_time}ph
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function RecipeCarousel({ recipes, title = "Công thức gợi ý" }: Props) {
  if (recipes.length === 0) {
    return (
      <div className="w-full max-w-4xl mx-auto">
        <h3
          className="text-xl font-bold text-[#2D2417] mb-3"
          style={{ fontFamily: "var(--font-playfair)" }}
        >
          {title}
        </h3>
        <p className="text-sm text-[#7C6A56] italic">Chưa có công thức cho món này</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto">
      <h3
        className="text-xl font-bold text-[#2D2417] mb-4"
        style={{ fontFamily: "var(--font-playfair)" }}
      >
        {title}
        <span className="ml-2 text-sm font-normal text-[#7C6A56]">({recipes.length} công thức)</span>
      </h3>

      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-[#E8DDD4] scrollbar-track-transparent">
        {recipes.map((recipe) => (
          <SuggestedRecipeCard key={recipe.id} recipe={recipe} />
        ))}
      </div>
    </div>
  );
}
