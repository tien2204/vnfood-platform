import { Suspense } from "react";
import RecipeBrowse from "./RecipeBrowse";

export const metadata = {
  title: "Tất cả công thức",
};

export default function RecipesPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 text-center text-muted-foreground">
          Đang tải...
        </div>
      }
    >
      <RecipeBrowse />
    </Suspense>
  );
}
