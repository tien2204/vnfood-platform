"use client";

import useSWR from "swr";
import api from "@/lib/api";
import RecipeGrid from "./RecipeGrid";
import type { RecipeCard } from "@/lib/types";

function fetcher(url: string) {
  return api.get(url).then((r) => r.data.data as RecipeCard[]);
}

export default function RelatedRecipes({ recipeId }: { recipeId: string }) {
  const { data } = useSWR<RecipeCard[]>(`/recipes/${recipeId}/related`, fetcher);
  if (!data || data.length === 0) return null;
  return (
    <section className="mt-10">
      <h2
        className="text-xl font-bold text-[#1C1209] mb-4"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        Món tương tự
      </h2>
      <RecipeGrid recipes={data} />
    </section>
  );
}
