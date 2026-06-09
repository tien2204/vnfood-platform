import { type ReactNode } from "react";
import { cookies } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import {
  Award,
  BookOpen,
  CalendarDays,
  ChefHat,
  ChevronRight,
  Clock,
  Flame,
  MapPin,
  Quote,
  ScanLine,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import RecipeCard from "@/components/recipes/RecipeCard";
import RecipeCardSkeleton from "@/components/recipes/RecipeCardSkeleton";
import RecipeImage from "@/components/common/RecipeImage";
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

function stripEmoji(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, "")
    .trim();
}

function getRecipeImageUrl(recipe: RecipeCardType) {
  if (!recipe.image_url) return null;
  return recipe.image_url.startsWith("http")
    ? recipe.image_url
    : `${process.env.NEXT_PUBLIC_UPLOAD_URL}/${recipe.image_url}`;
}

export default async function HomePage() {
  const jar = await cookies();
  const accessToken = jar.get("access_token")?.value;
  const featured = await getFeaturedRecipes(accessToken);
  const menuPreview = [
    ...(featured?.trending ?? []),
    ...(featured?.top_rated ?? []),
    ...(featured?.new ?? []),
  ].slice(0, 6);

  return (
    <div className="bg-[#ffffff] text-[#0a0a0a]">
      <section className="relative overflow-hidden border-b border-border px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 border border-border bg-[#f5f5f5] px-4 py-2 text-sm font-bold">
              <Award className="h-4 w-4 text-[#ec2028]" />
              Bản đồ ẩm thực Việt
            </div>

            <h1 className="mb-6 max-w-2xl text-4xl font-bold leading-tight text-[#0a0a0a] sm:text-5xl lg:text-6xl">
              Thưởng thức{" "}
              <span className="text-[#ec2028]">công thức Việt</span> theo
              phong cách nhà hàng.
            </h1>

            <p className="mb-8 max-w-xl text-lg leading-relaxed text-[#666666]">
              Khám phá món ngon ba miền, lưu công thức yêu thích và dùng AI để
              nhận diện món ăn từ ảnh trong vài giây.
            </p>

            <div className="mb-8 max-w-xl">
              <SearchBar placeholder="Tìm phở, bánh mì, bún bò Huế..." />
            </div>

            <div className="flex flex-wrap gap-4">
              <Link href="/recipes">
                <Button className="h-12 rounded-lg border border-border bg-[#ec2028] px-6 font-bold text-white shadow-block hover:bg-[#cc1c22]">
                  <BookOpen className="h-4 w-4" />
                  View Menu
                </Button>
              </Link>
              <Link href="/ai/scan">
                <Button
                  variant="outline"
                  className="h-12 rounded-lg border border-border bg-transparent px-6 font-bold text-[#0a0a0a] shadow-block hover:bg-[#0a0a0a] hover:text-[#ffffff]"
                >
                  <ScanLine className="h-4 w-4" />
                  AI nhận diện
                </Button>
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap gap-6 text-sm font-medium text-[#666666]">
              <span className="inline-flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-[#ec2028]" />
                Món mới mỗi ngày
              </span>
              <span className="inline-flex items-center gap-2">
                <MapPin className="h-5 w-5 text-[#ec2028]" />
                Hương vị ba miền
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="relative col-span-2 aspect-[16/10] overflow-hidden border border-border bg-white shadow-block lg:col-span-1 lg:row-span-2 lg:aspect-auto">
              <Image
                src={HERO_IMAGES[0]}
                alt="Không gian nhà hàng ấm áp"
                fill
                priority
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
              <div className="absolute bottom-4 left-1/2 w-[calc(100%-2rem)] -translate-x-1/2 border border-border bg-[#ec2028] px-5 py-3 text-center text-white shadow-block-sm sm:w-auto">
                <div className="text-2xl font-bold leading-none">22K+</div>
                <div className="text-xs font-bold uppercase tracking-wider">
                  Công thức
                </div>
              </div>
            </div>
            {HERO_IMAGES.slice(1).map((src, index) => (
              <div
                key={src}
                className="relative aspect-square overflow-hidden border border-border bg-white shadow-block"
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

      <section className="border-b border-border bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <ScrollArea>
            <div className="flex gap-3 pb-2">
              {KEYWORD_GROUPS.map(({ label, keyword }) => (
                <Link
                  key={keyword}
                  href={`/recipes?keyword=${encodeURIComponent(keyword)}`}
                  className="shrink-0"
                >
                  <span className="inline-flex border border-border bg-[#f5f5f5] px-4 py-2 text-sm font-bold text-[#0a0a0a] shadow-block-sm transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:bg-[#ec2028] hover:text-white hover:shadow-none">
                    {label}
                  </span>
                </Link>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      </section>

      {menuPreview.length > 0 && (
        <section className="bg-[#f5f5f5] px-4 py-14 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-7xl">
            <CenteredSectionHeader
              icon={<ChefHat className="h-6 w-6" />}
              title="Our Menu"
              subtitle="Món Việt quen thuộc, trình bày như một bảng menu nhà hàng."
            />
            <div className="grid gap-6 md:grid-cols-2">
              {menuPreview.map((recipe) => (
                <MenuListItem key={recipe.id} recipe={recipe} />
              ))}
            </div>
            <div className="mt-12 text-center">
              <Link href="/recipes">
                <Button className="h-12 rounded-lg border border-border bg-[#ec2028] px-7 font-bold text-white shadow-block hover:bg-[#cc1c22]">
                  View Full Menu
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      )}

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
        <section className="bg-[#ffffff] px-4 py-14 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-7xl">
            <SectionHeader
              icon={<Star className="h-5 w-5 fill-current" />}
              title="Đánh giá cao nhất"
              href="/recipes?sort=top_rated"
            />
            <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
            <div className="mb-5 h-0.5 w-12 bg-[#ec2028]" />
            <p className="mb-3 text-sm font-bold uppercase tracking-wider text-[#ec2028]">
              Our Story
            </p>
            <h2 className="mb-6 text-3xl font-bold sm:text-4xl">
              Từ mâm cơm gia đình đến trải nghiệm khám phá món ăn.
            </h2>
            <p className="mb-8 max-w-xl leading-relaxed text-white/70">
              VNFood giữ lại chất Việt của từng công thức, nhưng chuyển giao
              diện sang cảm giác menu nhà hàng: rõ món, nhiều ảnh, nhấn mạnh
              lựa chọn và hành động.
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
                  <div className="text-2xl font-bold text-[#ec2028]">
                    {value}
                  </div>
                  <div className="text-xs font-bold uppercase tracking-wider text-white/60">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-2 border-white bg-white p-6 text-[#0a0a0a] shadow-block">
            <Quote className="mb-4 h-8 w-8 text-[#ec2028]" />
            <p className="mb-5 text-lg italic leading-relaxed text-[#666666]">
              &quot;Món Việt ngon nhất khi có câu chuyện phía sau. Giao diện mới
              giúp câu chuyện đó nổi bật ngay từ ảnh, tên món và cách khám phá.&quot;
            </p>
            <div className="font-bold">VNFood Kitchen</div>
            <div className="text-sm text-[#666666]">Taste guide</div>
          </div>
        </div>
      </section>

      {featured?.new && featured.new.length > 0 && (
        <section className="bg-white px-4 py-14 pb-20 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-7xl">
            <SectionHeader
              icon={<Sparkles className="h-5 w-5" />}
              title="Mới nhất"
              href="/recipes?sort=newest"
            />
            <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
          <p className="mt-6 text-center text-sm text-[#666666]">
            Backend đang khởi động... Vui lòng refresh sau ít phút.
          </p>
        </section>
      )}
    </div>
  );
}

function MenuListItem({ recipe }: { recipe: RecipeCardType }) {
  const imageUrl = getRecipeImageUrl(recipe);
  const cleanTitle = stripEmoji(recipe.title);

  return (
    <Link
      href={`/recipes/${recipe.id}`}
      className="group flex gap-4 border border-border bg-white p-4 shadow-block transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-block-sm"
    >
      <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden border border-border bg-[#f5f5f5]">
        <RecipeImage
          src={imageUrl}
          alt={cleanTitle}
          fill
          className="object-cover"
          sizes="96px"
          unoptimized
          fallback={
            <ChefHat className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 text-[#f0f0f0]" />
          }
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 text-lg font-bold leading-snug group-hover:text-[#ec2028]">
            {cleanTitle}
          </h3>
          {recipe.avg_rating > 0 && (
            <span className="whitespace-nowrap font-bold text-[#ec2028]">
              {recipe.avg_rating.toFixed(1)}
            </span>
          )}
        </div>
        <p className="line-clamp-2 text-sm text-[#666666]">
          {recipe.author?.full_name ?? "VNFood"} tuyển chọn cho bữa ăn Việt.
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-xs font-medium text-[#666666]">
          {recipe.cooking_time != null && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {recipe.cooking_time} phút
            </span>
          )}
          {recipe.servings != null && (
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {recipe.servings} người
            </span>
          )}
        </div>
      </div>
    </Link>
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
    <section className="bg-[#f5f5f5] px-4 py-14 sm:px-6 sm:py-20">
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

function CenteredSectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-12 text-center">
      <div className="mb-4 inline-flex text-[#ec2028]">{icon}</div>
      <h2 className="mb-4 text-3xl font-bold sm:text-4xl">{title}</h2>
      <p className="mx-auto max-w-md text-[#666666]">{subtitle}</p>
    </div>
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
        <span className="shrink-0 text-[#ec2028]">{icon}</span>
        <h2 className="shrink-0 text-2xl font-bold text-[#0a0a0a] sm:text-3xl">
          {title}
        </h2>
        <div className="h-px flex-1 bg-[#f0f0f0]" />
      </div>
      <Link
        href={href}
        className="group flex shrink-0 items-center gap-1 text-sm font-bold text-[#ec2028] hover:underline"
      >
        Xem thêm
        <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}
