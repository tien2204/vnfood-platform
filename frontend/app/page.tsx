import { type ReactNode } from "react";
import { cookies } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import {
  Award,
  BookOpen,
  CalendarDays,
  ChevronRight,
  Flame,
  MapPin,
  Quote,
  ScanLine,
  Sparkles,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import RecipeCard from "@/components/recipes/RecipeCard";
import RecipeCardSkeleton from "@/components/recipes/RecipeCardSkeleton";
import SearchBar from "@/components/common/SearchBar";
import type {
  ApiResponse,
  FeaturedRecipes,
  RecipeCard as RecipeCardType,
} from "@/lib/types";

const KEYWORD_GROUPS = [
  { label: "Bánh", keyword: "Bánh" },
  { label: "Bún & Phở", keyword: "Bún" },
  { label: "Cơm", keyword: "Cơm" },
  { label: "Canh & Cháo", keyword: "Canh" },
  { label: "Món Khô", keyword: "Thịt" },
  { label: "Xôi", keyword: "Xôi" },
  { label: "Gỏi & Cuốn", keyword: "Gỏi" },
  { label: "Đặc Biệt", keyword: "Đặc biệt" },
];

const HERO_IMAGES = [
  "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=900&h=700&fit=crop",
  "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=500&h=500&fit=crop",
  "https://images.unsplash.com/photo-1551218808-94e220e084d2?w=500&h=500&fit=crop",
];

async function getFeaturedRecipes(
  accessToken?: string
): Promise<FeaturedRecipes | null> {
  try {
    const headers: Record<string, string> = {};
    if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/recipes/featured`,
      accessToken
        ? { headers, cache: "no-store" }
        : { next: { revalidate: 60 } }
    );
    if (!res.ok) return null;
    const json: ApiResponse<FeaturedRecipes> = await res.json();
    return json.success ? json.data : null;
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const jar = await cookies();
  const accessToken = jar.get("access_token")?.value;
  const featured = await getFeaturedRecipes(accessToken);

  return (
    <div className="bg-background text-foreground">
      <section className="relative overflow-hidden border-b border-border bg-[var(--color-brand-pink-bg)] px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-bold shadow-card">
              <Award className="h-4 w-4 text-primary" />
              Bản đồ ẩm thực Việt
            </div>

            <h1 className="mb-6 max-w-2xl text-4xl font-extrabold leading-tight text-foreground sm:text-5xl lg:text-6xl">
              Chụp ảnh món ăn,{" "}
              <strong className="text-primary font-display font-normal">AI nhận diện</strong> và{" "}
              <strong className="text-primary font-display font-normal">gợi ý công thức</strong> nấu ngay.
            </h1>

            <p className="mb-8 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Khám phá món ngon ba miền, lưu công thức yêu thích và dùng AI để
              nhận diện món ăn từ ảnh trong vài giây.
            </p>

            <div className="mb-8 max-w-xl searchform-hero">
              <SearchBar placeholder="Tìm phở, bánh mì, bún bò Huế..." />
            </div>

            <div className="flex flex-wrap gap-4">
              <Link href="/recipes">
                <Button className="h-12 rounded-lg border-2 border-primary bg-primary px-6 font-bold text-white shadow-card hover:bg-[#cc1c22]">
                  <BookOpen className="h-4 w-4" />
                  Xem công thức
                </Button>
              </Link>
              <Link href="/ai/scan">
                <Button
                  variant="outline"
                  className="h-12 rounded-lg border border-border bg-transparent px-6 font-bold text-foreground shadow-card hover:bg-foreground hover:text-white"
                >
                  <ScanLine className="h-4 w-4" />
                  AI nhận diện
                </Button>
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap gap-6 text-sm font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" />
                Món mới mỗi ngày
              </span>
              <span className="inline-flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                Hương vị ba miền
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="relative col-span-2 aspect-[16/10] overflow-hidden rounded-xl border border-border bg-card shadow-card lg:col-span-1 lg:row-span-2 lg:aspect-auto">
              <Image
                src={HERO_IMAGES[0]}
                alt="Không gian nhà hàng ấm áp"
                fill
                priority
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            </div>
            {HERO_IMAGES.slice(1).map((src, index) => (
              <div
                key={src}
                className="relative aspect-square overflow-hidden rounded-xl border border-border bg-card shadow-card"
              >
                <Image
                  src={src}
                  alt={`Món ăn nổi bật ${index + 1}`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 50vw, 25vw"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-background">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <ScrollArea>
            <div className="flex gap-3 pb-2">
              {KEYWORD_GROUPS.map(({ label, keyword }) => (
                <Link
                  key={keyword}
                  href={`/recipes?keyword=${encodeURIComponent(keyword)}`}
                  className="shrink-0"
                >
                  <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium capitalize transition-colors hover:border-primary hover:text-primary">
                    {label}
                  </span>
                </Link>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      </section>

      {featured?.trending && featured.trending.length > 0 && (
        <RecipeRail
          icon={<Flame className="h-5 w-5" />}
          title="Đang thịnh hành"
          href="/recipes?sort=popular"
          recipes={featured.trending}
          variant="warm"
        />
      )}

      {featured?.top_rated && featured.top_rated.length > 0 && (
        <section className="bg-background px-4 py-14 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-7xl">
            <SectionHeader
              icon={<Star className="h-5 w-5 fill-current" />}
              title="Đánh giá cao nhất"
              href="/recipes?sort=top_rated"
            />
            <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {featured.top_rated.slice(0, 8).map((recipe) => (
                <RecipeCard key={recipe.id} recipe={recipe} />
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="bg-[#0a0a0a] px-4 py-14 text-white sm:px-6 sm:py-20">
        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-2">
          <div>
            <div className="mb-5 h-0.5 w-12 bg-primary" />
            <p className="mb-3 text-sm font-bold uppercase tracking-wider text-primary">
              Về chúng tôi
            </p>
            <h2 className="mb-6 text-3xl font-bold sm:text-4xl">
              Công nghệ AI kết nối bạn với kho công thức ẩm thực Việt.
            </h2>
            <p className="mb-8 max-w-xl leading-relaxed text-white/70">
              TastyVietnam ứng dụng trí tuệ nhân tạo để nhận diện món ăn từ ảnh, gợi
              ý công thức nấu chi tiết và giúp bạn khám phá nền ẩm thực phong
              phú của ba miền Việt Nam.
            </p>
            <div className="grid grid-cols-3 gap-4">
              {[
                ["100+", "Loại món"],
                ["AI", "Nhận diện"],
                ["3", "Miền vị"],
              ].map(([value, label]) => (
                <div
                  key={label}
                  className="border border-white/20 bg-white/5 p-4 text-center"
                >
                  <div className="text-2xl font-bold text-primary">
                    {value}
                  </div>
                  <div className="text-xs font-bold uppercase tracking-wider text-white/60">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 text-foreground shadow-card">
            <Quote className="mb-4 h-8 w-8 text-primary" />
            <p className="mb-5 text-lg italic leading-relaxed text-muted-foreground">
              &quot;Chỉ cần một tấm ảnh, AI sẽ nhận diện ngay món ăn và gợi ý công
              thức nấu chi tiết. Khám phá ẩm thực Việt chưa bao giờ dễ dàng
              đến thế.&quot;
            </p>
            <div className="font-bold">TastyVietnam AI</div>
            <div className="text-sm text-muted-foreground">Nhận diện món ăn thông minh</div>
          </div>
        </div>
      </section>

      {featured?.new && featured.new.length > 0 && (
        <section className="bg-background px-4 py-14 pb-20 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-7xl">
            <SectionHeader
              icon={<Sparkles className="h-5 w-5" />}
              title="Mới nhất"
              href="/recipes?sort=newest"
            />
            <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {featured.new.slice(0, 4).map((recipe) => (
                <RecipeCard key={recipe.id} recipe={recipe} />
              ))}
            </div>
          </div>
        </section>
      )}

      {!featured && (
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <RecipeCardSkeleton key={i} />
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Backend đang khởi động... Vui lòng refresh sau ít phút.
          </p>
        </section>
      )}
    </div>
  );
}

function RecipeRail({
  icon,
  title,
  href,
  recipes,
}: {
  icon: ReactNode;
  title: string;
  href: string;
  recipes: RecipeCardType[];
  variant?: "warm";
}) {
  return (
    <section className="bg-muted px-4 py-14 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-7xl">
        <SectionHeader icon={icon} title={title} href={href} />
        <ScrollArea className="mt-8">
          <div className="flex gap-6 pb-5" style={{ width: "max-content" }}>
            {recipes.map((recipe) => (
              <div key={recipe.id} className="w-[280px] shrink-0">
                <RecipeCard recipe={recipe} />
              </div>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    </section>
  );
}

function SectionHeader({
  icon,
  title,
  href,
}: {
  icon: ReactNode;
  title: string;
  href: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="shrink-0 text-primary">{icon}</span>
        <h2 className="shrink-0 text-2xl font-extrabold text-foreground sm:text-3xl">
          <span className="border-l-4 border-primary pl-3">{title}</span>
        </h2>
        <div className="h-px flex-1 bg-border" />
      </div>
      <Link
        href={href}
        className="group flex shrink-0 items-center gap-1 text-sm font-bold text-primary hover:underline"
      >
        Xem thêm
        <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}
