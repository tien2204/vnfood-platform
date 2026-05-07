import RecipeCard from "./RecipeCard";
import RecipeCardSkeleton from "./RecipeCardSkeleton";
import type { RecipeCard as RecipeCardType } from "@/lib/types";

interface Props {
  recipes?: RecipeCardType[];
  loading?: boolean;
  skeletonCount?: number;
  onSaveChange?: (recipeId: string, isSaved: boolean, saveCount: number) => void;
}

export default function RecipeGrid({
  recipes,
  loading,
  skeletonCount = 8,
  onSaveChange,
}: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
      {loading
        ? Array.from({ length: skeletonCount }).map((_, i) => (
            <RecipeCardSkeleton key={i} />
          ))
        : recipes?.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              onSaveChange={
                onSaveChange
                  ? (isSaved, saveCount) =>
                      onSaveChange(recipe.id, isSaved, saveCount)
                  : undefined
              }
            />
          ))}
    </div>
  );
}
