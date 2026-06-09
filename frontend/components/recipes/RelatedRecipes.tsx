"use client";

import useSWR from "swr";
import api from "@/lib/api";
import RecipeCard from "./RecipeCard";
import type { RecipeCard as RecipeCardType } from "@/lib/types";

function fetcher(url: string) {
  return api.get(url).then((r) => r.data.data as RecipeCardType[]);
}

export default function RelatedRecipes({ recipeId }: { recipeId: string }) {
  const { data } = useSWR<RecipeCardType[]>(`/recipes/${recipeId}/related`, fetcher);
  if (!data || data.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className="text-2xl font-extrabold text-foreground mb-4">
        Món <strong className="text-primary">tương tự</strong>
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {data.map((recipe) => (
          <RecipeCard key={recipe.id} recipe={recipe} />
        ))}
      </div>
    </section>
  );
}
