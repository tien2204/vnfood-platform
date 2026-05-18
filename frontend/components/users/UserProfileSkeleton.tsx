import { Skeleton } from "@/components/ui/skeleton";
import RecipeCardSkeleton from "@/components/recipes/RecipeCardSkeleton";

export default function UserProfileSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 animate-pulse">
      {/* Avatar + name */}
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 mb-8">
        <Skeleton className="w-24 h-24 rounded-full bg-[#221E19] shrink-0" />
        <div className="flex-1 space-y-3 text-center sm:text-left">
          <Skeleton className="h-7 w-48 bg-[#221E19] mx-auto sm:mx-0" />
          <Skeleton className="h-4 w-64 bg-[#221E19] mx-auto sm:mx-0" />
          {/* Stats */}
          <div className="flex justify-center sm:justify-start gap-6 pt-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <Skeleton className="h-5 w-8 bg-[#221E19]" />
                <Skeleton className="h-3 w-12 bg-[#221E19]" />
              </div>
            ))}
          </div>
          <Skeleton className="h-9 w-28 bg-[#221E19] rounded-lg mx-auto sm:mx-0" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-[#2D2620] pb-2 mb-6">
        <Skeleton className="h-5 w-24 bg-[#221E19]" />
        <Skeleton className="h-5 w-20 bg-[#221E19]" />
      </div>

      {/* Recipe grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <RecipeCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

