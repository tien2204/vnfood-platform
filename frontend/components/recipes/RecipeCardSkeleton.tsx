import { Skeleton } from "@/components/ui/skeleton";

export default function RecipeCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-border">
      <Skeleton className="aspect-video w-full bg-muted" />
      <div className="p-3.5 space-y-2">
        <Skeleton className="h-3.5 w-16 bg-muted" />
        <Skeleton className="h-4 w-full bg-muted" />
        <Skeleton className="h-4 w-3/4 bg-muted" />
        <Skeleton className="h-3 w-24 bg-muted" />
        <div className="flex items-center gap-2 pt-1">
          <Skeleton className="h-6 w-6 rounded-full bg-muted" />
          <Skeleton className="h-3 w-20 bg-muted" />
        </div>
      </div>
    </div>
  );
}
