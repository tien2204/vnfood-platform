import { Skeleton } from "@/components/ui/skeleton";

export default function RecipeDetailSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 animate-pulse">
      {/* Breadcrumb */}
      <Skeleton className="h-4 w-48 bg-[#221E19] mb-6" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Hero image */}
          <Skeleton className="w-full aspect-video rounded-2xl bg-[#221E19]" />

          {/* Title */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-24 bg-[#221E19]" />
            <Skeleton className="h-8 w-3/4 bg-[#221E19]" />
            <Skeleton className="h-8 w-1/2 bg-[#221E19]" />
          </div>

          {/* Meta row */}
          <div className="flex gap-4">
            <Skeleton className="h-5 w-20 bg-[#221E19]" />
            <Skeleton className="h-5 w-24 bg-[#221E19]" />
            <Skeleton className="h-5 w-16 bg-[#221E19]" />
          </div>

          {/* Tabs */}
          <div className="flex gap-6 border-b border-[#2D2620] pb-2">
            {[80, 100, 90].map((w, i) => (
              <Skeleton key={i} className={`h-5 w-${w === 80 ? '20' : w === 100 ? '24' : '28'} bg-[#221E19]`} />
            ))}
          </div>

          {/* Ingredients */}
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="w-2 h-2 rounded-full bg-[#221E19] shrink-0" />
                <Skeleton className="h-4 bg-[#221E19]" style={{ width: `${50 + (i % 3) * 20}%` }} />
              </div>
            ))}
          </div>

          {/* Steps */}
          <div className="space-y-4 mt-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="w-10 h-10 rounded-full bg-[#221E19] shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <Skeleton className="h-4 w-full bg-[#221E19]" />
                  <Skeleton className="h-4 w-5/6 bg-[#221E19]" />
                  <Skeleton className="h-4 w-3/4 bg-[#221E19]" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-[#2D2620] p-5 space-y-4">
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-full bg-[#221E19]" />
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-4 w-3/4 bg-[#221E19]" />
                <Skeleton className="h-3 w-1/2 bg-[#221E19]" />
              </div>
            </div>
            <Skeleton className="h-9 w-full bg-[#221E19] rounded-lg" />
          </div>
          <div className="rounded-2xl border border-[#2D2620] p-5 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-24 bg-[#221E19]" />
                <Skeleton className="h-4 w-16 bg-[#221E19]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

