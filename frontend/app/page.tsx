import { type ReactNode } from "react";
import Link from "next/link";
import {
  ScanLine,
  ChevronRight,
  Flame,
  Star,
  Sparkles,
  ChefHat,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import RecipeCard from "@/components/recipes/RecipeCard";
import RecipeCardSkeleton from "@/components/recipes/RecipeCardSkeleton";
import SearchBar from "@/components/common/SearchBar";
import type { FeaturedRecipes, ApiResponse } from "@/lib/types";

const KEYWORD_GROUPS = [
  { label: "Bánh", slug: "banh" },
  { label: "Bún & Phở", slug: "bun" },
  { label: "Cơm", slug: "com" },
  { label: "Canh & Cháo", slug: "canh" },
  { label: "Món Khô", slug: "thit" },
  { label: "Xôi", slug: "xoi" },
  { label: "Gỏi & Cuốn", slug: "goi" },
  { label: "Đặc Biệt", slug: "dac-biet" },
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
      {/* ── HERO ─────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[#FFFBF5] border-b border-[#E8DDD4]">
        {/* Decorative background shapes */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-48 -top-48 w-[700px] h-[700px] rounded-full bg-[#E85D26]/[0.06]" />
          <div className="absolute -left-24 -bottom-24 w-[400px] h-[400px] rounded-full bg-[#F4A261]/[0.08]" />
          <div className="absolute right-1/3 top-1/3 w-3 h-3 rounded-full bg-[#E85D26]/25" />
          <div className="absolute right-1/4 bottom-1/3 w-2 h-2 rounded-full bg-[#F4A261]/35" />
          <div className="absolute left-1/2 top-1/4 w-1.5 h-1.5 rounded-full bg-[#2D6A4F]/20" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-20 lg:py-24">
          <div className="grid lg:grid-cols-[1fr_400px] gap-10 lg:gap-16 items-center">

            {/* Text side */}
            <div className="text-center lg:text-left">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#E85D26]/10 border border-[#E85D26]/20 text-[#E85D26] text-xs font-semibold tracking-widest uppercase mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-[#E85D26]" />
                Ẩm Thực Việt Nam
              </div>

              <h1 className="text-[2.25rem] sm:text-[3rem] lg:text-[3.75rem] font-bold leading-[1.08] tracking-tight text-[#1C1209] mb-5">
                Khám phá hàng<br className="hidden sm:block" /> ngàn{" "}
                <em className="not-italic text-[#E85D26]">công thức Việt</em>
              </h1>

              <p className="text-base sm:text-lg text-[#7C6A56] mb-8 max-w-md mx-auto lg:mx-0 leading-relaxed">
                Hơn 22.000 công thức truyền thống từ ba miền. AI nhận diện món ăn — chỉ cần chụp ảnh.
              </p>

              {/* Search */}
              <div className="max-w-md mx-auto lg:mx-0 mb-7">
                <SearchBar
                  placeholder="Tìm phở, bánh mì, bún bò Huế..."
                  className="w-full"
                />
              </div>

              {/* CTAs */}
              <div className="flex flex-wrap gap-3 justify-center lg:justify-start">
                <Link href="/recipes">
                  <Button
                    size="lg"
                    className="rounded-full h-12 px-7 bg-[#E85D26] hover:bg-[#D44E1E] text-white font-medium gap-2 shadow-warm"
                  >
                    <ChefHat className="w-4 h-4" />
                    Xem công thức
                  </Button>
                </Link>
                <Link href="/ai/scan">
                  <Button
                    size="lg"
                    variant="outline"
                    className="rounded-full h-12 px-7 border-[#E8DDD4] bg-white text-[#1C1209] hover:bg-[#F7F0E8] font-medium gap-2"
                  >
                    <ScanLine className="w-4 h-4" />
                    AI nhận diện
                  </Button>
                </Link>
              </div>
            </div>

            {/* Visual side — desktop only */}
            <div className="hidden lg:flex flex-col gap-4">
              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: "22K+", label: "Công thức" },
                  { value: "100+", label: "Loại món" },
                  { value: "AI", label: "Nhận diện" },
                ].map(({ value, label }) => (
                  <div
                    key={label}
                    className="bg-gradient-to-br from-white to-[#FFFBF5] rounded-2xl p-4 text-center border border-[#E8DDD4]/50 shadow-sm hover:shadow-warm hover:-translate-y-1 transition-all duration-200 cursor-default"
                  >
                    <div className="text-[1.75rem] font-bold text-[#E85D26] leading-none mb-1">
                      {value}
                    </div>
                    <div className="text-[11px] text-[#7C6A56] font-medium uppercase tracking-wide">
                      {label}
                    </div>
                  </div>
                ))}
              </div>

              {/* AI Feature card */}
              <div className="bg-[#E85D26] rounded-3xl p-7 text-white">
                <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center mb-4">
                  <ScanLine className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-bold mb-2">Bạn chụp, AI nhận diện</h3>
                <p className="text-white/75 text-sm leading-relaxed mb-5">
                  Camera nhận diện món ăn Việt và tìm công thức nấu ngay lập tức.
                </p>
                <Link
                  href="/ai/scan"
                  className="inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 rounded-full px-5 py-2.5 text-sm font-medium transition-colors duration-150"
                >
                  Thử ngay <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {/* Secondary stat */}
              <div className="bg-[#2D6A4F] rounded-2xl px-6 py-4 flex items-center justify-between text-white">
                <div className="text-sm">
                  <span className="font-semibold">Công thức mới</span>
                  <span className="text-white/65 ml-1">mỗi ngày</span>
                </div>
                <span className="text-2xl font-bold">+10</span>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── CATEGORY CHIPS ───────────────────────────── */}
      <section className="bg-white border-b border-[#E8DDD4]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <ScrollArea>
            <div className="flex gap-2 pb-1">
              {KEYWORD_GROUPS.map(({ label, slug }) => (
                <Link key={slug} href={`/keyword/${slug}`} className="shrink-0">
                  <span className="inline-flex items-center px-4 py-2 rounded-full bg-[#F7F0E8] border border-[#E8DDD4] text-sm font-medium text-[#1C1209] hover:bg-[#E85D26] hover:text-white hover:border-[#E85D26] hover:scale-105 hover:shadow-warm transition-all duration-200 whitespace-nowrap cursor-pointer">
                    {label}
                  </span>
                </Link>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      </section>

      {/* ── TRENDING ─────────────────────────────────── */}
      {featured?.trending && featured.trending.length > 0 && (
        <section className="bg-[#F7F0E8] py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <SectionHeader
              icon={<Flame className="w-5 h-5" />}
              iconColor="text-[#E85D26]"
              title="Đang Thịnh Hành"
              href="/recipes?sort=popular"
            />
            <ScrollArea className="mt-6">
              <div className="flex gap-5 pb-4" style={{ width: "max-content" }}>
                {featured.trending.map((recipe) => (
                  <div key={recipe.id} className="w-[276px] shrink-0">
                    <RecipeCard recipe={recipe} />
                  </div>
                ))}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
        </section>
      )}

      {/* ── TOP RATED ────────────────────────────────── */}
      {featured?.top_rated && featured.top_rated.length > 0 && (
        <section className="bg-[#FFFBF5] py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <SectionHeader
              icon={<Star className="w-5 h-5 fill-current" />}
              iconColor="text-[#F4A261]"
              title="Đánh Giá Cao Nhất"
              href="/recipes?sort=top_rated"
            />
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {featured.top_rated.slice(0, 8).map((recipe) => (
                <RecipeCard key={recipe.id} recipe={recipe} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── NEW RECIPES ──────────────────────────────── */}
      {featured?.new && featured.new.length > 0 && (
        <section className="bg-white border-t border-[#E8DDD4] py-12 pb-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <SectionHeader
              icon={<Sparkles className="w-5 h-5" />}
              iconColor="text-[#2D6A4F]"
              title="Mới Nhất"
              href="/recipes?sort=newest"
            />
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {featured.new.slice(0, 4).map((recipe) => (
                <RecipeCard key={recipe.id} recipe={recipe} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── FALLBACK ─────────────────────────────────── */}
      {!featured && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
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

function SectionHeader({
  icon,
  iconColor = "text-[#E85D26]",
  title,
  href,
}: {
  icon: ReactNode;
  iconColor?: string;
  title: string;
  href: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      {/* Left: icon + italic title + decorative line */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <span className={`shrink-0 ${iconColor}`}>{icon}</span>
        <h2 className="text-2xl font-bold italic text-[#1C1209] shrink-0">{title}</h2>
        <div className="flex-1 h-px bg-gradient-to-r from-[#E8DDD4] to-transparent" />
      </div>
      {/* Right: see more */}
      <Link
        href={href}
        className="group flex items-center gap-1 text-sm font-medium text-[#E85D26] hover:underline shrink-0"
      >
        Xem thêm
        <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform duration-150" />
      </Link>
    </div>
  );
}
