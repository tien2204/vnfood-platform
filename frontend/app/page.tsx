import Link from "next/link";
import { ScanLine, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import RecipeCard from "@/components/recipes/RecipeCard";
import RecipeCardSkeleton from "@/components/recipes/RecipeCardSkeleton";
import SearchBar from "@/components/common/SearchBar";
import type { FeaturedRecipes, ApiResponse } from "@/lib/types";

const KEYWORD_GROUPS = [
  { label: "🍰 Bánh", slug: "banh" },
  { label: "🍜 Bún / Phở", slug: "bun" },
  { label: "🍚 Cơm", slug: "com" },
  { label: "🥣 Canh / Cháo", slug: "canh" },
  { label: "🥩 Món Khô", slug: "thit" },
  { label: "🍡 Xôi", slug: "xoi" },
  { label: "🥗 Gỏi Cuốn", slug: "goi" },
  { label: "⭐ Đặc Biệt", slug: "dac-biet" },
];

async function getFeaturedRecipes(): Promise<FeaturedRecipes | null> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/recipes/featured`,
      { next: { revalidate: 300 } }
    );
    if (!res.ok) return null;
    const json: ApiResponse<FeaturedRecipes> = await res.json();
    return json.success ? json.data : null;
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const featured = await getFeaturedRecipes();

  return (
    <div>
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-[#E85D26] via-[#D44E1E] to-[#B83D10] text-white">
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-20 text-center">
          <h1
            className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-4"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Khám phá ẩm thực Việt
          </h1>
          <p className="text-lg sm:text-xl text-white/85 mb-8 max-w-2xl mx-auto">
            Hơn 22.000 công thức nấu ăn truyền thống, AI nhận diện món ăn tức thì
          </p>

          {/* Search */}
          <div className="max-w-lg mx-auto mb-6">
            <SearchBar
              placeholder="Tìm phở, bánh mì, bún bò..."
              className="w-full"
            />
          </div>

          {/* AI Scan CTA */}
          <Link href="/ai/scan">
            <Button
              size="lg"
              variant="outline"
              className="bg-white/15 border-white/40 text-white hover:bg-white/25 backdrop-blur-sm gap-2"
            >
              <ScanLine className="w-5 h-5" />
              Chụp ảnh → AI nhận diện ngay
            </Button>
          </Link>
        </div>
      </section>

      {/* Keyword chips */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <ScrollArea>
          <div className="flex gap-2.5 pb-2">
            {KEYWORD_GROUPS.map(({ label, slug }) => (
              <Link key={slug} href={`/keyword/${slug}`} className="shrink-0">
                <span className="inline-flex items-center px-4 py-2 rounded-full bg-[#F7F0E8] border border-[#E8DDD4] text-sm font-medium text-[#1C1209] hover:bg-[#E85D26] hover:text-white hover:border-[#E85D26] transition-all duration-150 whitespace-nowrap">
                  {label}
                </span>
              </Link>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </section>

      {/* Trending Recipes - horizontal scroll */}
      {featured?.trending && featured.trending.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-10">
          <div className="flex items-center justify-between mb-5">
            <h2
              className="text-2xl font-bold text-[#1C1209]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              🔥 Đang thịnh hành
            </h2>
            <Link
              href="/recipes?sort=popular"
              className="flex items-center gap-1 text-sm text-[#E85D26] hover:underline"
            >
              Xem thêm <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <ScrollArea>
            <div className="flex gap-5 pb-4" style={{ width: "max-content" }}>
              {featured.trending.map((recipe) => (
                <div key={recipe.id} className="w-64 shrink-0">
                  <RecipeCard recipe={recipe} />
                </div>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </section>
      )}

      {/* Top Rated */}
      {featured?.top_rated && featured.top_rated.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-10">
          <div className="flex items-center justify-between mb-5">
            <h2
              className="text-2xl font-bold text-[#1C1209]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              ⭐ Đánh giá cao nhất
            </h2>
            <Link
              href="/recipes?sort=top_rated"
              className="flex items-center gap-1 text-sm text-[#E85D26] hover:underline"
            >
              Xem thêm <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {featured.top_rated.slice(0, 8).map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
        </section>
      )}

      {/* New Recipes */}
      {featured?.new && featured.new.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-16">
          <div className="flex items-center justify-between mb-5">
            <h2
              className="text-2xl font-bold text-[#1C1209]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              🆕 Mới nhất
            </h2>
            <Link
              href="/recipes?sort=newest"
              className="flex items-center gap-1 text-sm text-[#E85D26] hover:underline"
            >
              Xem thêm <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {featured.new.slice(0, 4).map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
        </section>
      )}

      {/* Fallback khi backend offline / chưa có data */}
      {!featured && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <h2
            className="text-2xl font-bold text-[#1C1209] mb-5"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Công thức nổi bật
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <RecipeCardSkeleton key={i} />
            ))}
          </div>
          <p className="text-center text-[#7C6A56] mt-6 text-sm">
            Backend đang khởi động... Vui lòng refresh sau ít phút.
          </p>
        </section>
      )}
    </div>
  );
}
