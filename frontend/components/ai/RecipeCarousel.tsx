"use client";

import Image from "next/image";
import Link from "next/link";
import { Star, Clock } from "lucide-react";
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
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={recipe.title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            unoptimized
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl">🍽️</div>
        )}
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
