import { Skeleton } from "@/components/ui/skeleton";

export default function RecipeCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-[#E8DDD4]">
      <Skeleton className="aspect-video w-full bg-[#F7F0E8]" />
      <div className="p-3.5 space-y-2">
        <Skeleton className="h-3.5 w-16 bg-[#F7F0E8]" />
        <Skeleton className="h-4 w-full bg-[#F7F0E8]" />
        <Skeleton className="h-4 w-3/4 bg-[#F7F0E8]" />
        <Skeleton className="h-3 w-24 bg-[#F7F0E8]" />
        <div className="flex items-center gap-2 pt-1">
          <Skeleton className="h-6 w-6 rounded-full bg-[#F7F0E8]" />
          <Skeleton className="h-3 w-20 bg-[#F7F0E8]" />
        </div>
      </div>
    </div>
  );
}
