import { Suspense } from "react";
import SearchResults from "./SearchResults";

export function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  void searchParams;
  return { title: "Tìm kiếm — TastyVietnam" };
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 text-center text-muted-foreground">
          Đang tìm kiếm...
        </div>
      }
    >
      <SearchResults />
    </Suspense>
  );
}
