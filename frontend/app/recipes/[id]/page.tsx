import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  Clock,
  Users,
  Star,
  Eye,
  Bookmark,
  ChevronLeft,
  ExternalLink,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ApiResponse, RecipeDetail } from "@/lib/types";

const DIFFICULTY_LABEL = {
  easy: "Dễ",
  medium: "Trung bình",
  hard: "Khó",
} as const;

async function getRecipe(id: string): Promise<RecipeDetail | null> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/recipes/${id}`,
      { next: { revalidate: 60 } }
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("fetch failed");
    const json: ApiResponse<RecipeDetail> = await res.json();
    return json.success ? json.data : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const recipe = await getRecipe(id);
  return {
    title: recipe?.title ?? "Công thức",
    description: recipe?.description ?? undefined,
  };
}

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const recipe = await getRecipe(id);

  if (!recipe) notFound();

  const imageUrl = recipe.image_url
    ? recipe.image_url.startsWith("http")
      ? recipe.image_url
      : `${process.env.NEXT_PUBLIC_UPLOAD_URL}/${recipe.image_url}`
    : null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      {/* Back */}
      <Link
        href="/recipes"
        className="inline-flex items-center gap-1.5 text-sm text-[#7C6A56] hover:text-[#E85D26] mb-5 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Quay lại
      </Link>

      {/* Hero image */}
      <div className="relative aspect-video rounded-2xl overflow-hidden bg-[#F7F0E8] mb-6">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={recipe.title}
            fill
            className="object-cover"
            priority
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[#E8DDD4]">
            <span className="text-8xl">🍽️</span>
          </div>
        )}
      </div>

      {/* Header */}
      <div className="mb-6">
        {/* Badges */}
        <div className="flex flex-wrap gap-2 mb-3">
          {recipe.keyword && (
            <Badge className="bg-[#F7F0E8] text-[#E85D26] border-[#E85D26] hover:bg-[#F7F0E8]">
              {recipe.keyword}
            </Badge>
          )}
          {recipe.difficulty && (
            <Badge variant="outline" className="border-[#E8DDD4] text-[#7C6A56]">
              {DIFFICULTY_LABEL[recipe.difficulty]}
            </Badge>
          )}
          {recipe.source === "cookpad" && (
            <Badge variant="outline" className="border-[#E8DDD4] text-[#7C6A56]">
              Cookpad
            </Badge>
          )}
        </div>

        {/* Title */}
        <h1
          className="text-3xl sm:text-4xl font-bold text-[#1C1209] leading-tight mb-4"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {recipe.title}
        </h1>

        {/* Meta stats */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-[#7C6A56] mb-4">
          {recipe.avg_rating > 0 && (
            <span className="flex items-center gap-1">
              <Star className="w-4 h-4 fill-[#F4A261] text-[#F4A261]" />
              <strong className="text-[#1C1209]">
                {recipe.avg_rating.toFixed(1)}
              </strong>
              <span>({recipe.rating_count} đánh giá)</span>
            </span>
          )}
          <span className="flex items-center gap-1">
            <Eye className="w-4 h-4" />
            {recipe.view_count.toLocaleString()} lượt xem
          </span>
          {recipe.cooking_time && (
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {recipe.cooking_time} phút
            </span>
          )}
          {recipe.servings && (
            <span className="flex items-center gap-1">
              <Users className="w-4 h-4" />
              {recipe.servings} người
            </span>
          )}
        </div>

        {/* Description */}
        {recipe.description && (
          <p className="text-[#7C6A56] leading-relaxed text-base">
            {recipe.description}
          </p>
        )}
      </div>

      {/* Author card */}
      {recipe.author ? (
        <div className="flex items-center gap-3 p-4 bg-[#F7F0E8] rounded-xl border border-[#E8DDD4] mb-6">
          <Avatar className="w-12 h-12">
            <AvatarImage src={recipe.author.avatar_url ?? undefined} />
            <AvatarFallback className="bg-[#E85D26] text-white font-semibold">
              {recipe.author.full_name?.charAt(0)?.toUpperCase() ?? "?"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[#1C1209]">
              {recipe.author.full_name}
            </p>
            {recipe.author.follower_count > 0 && (
              <p className="text-xs text-[#7C6A56]">
                {recipe.author.follower_count} người theo dõi
              </p>
            )}
          </div>
          <button
            disabled
            className="px-4 py-1.5 rounded-full border border-[#E8DDD4] text-sm text-[#7C6A56] cursor-not-allowed opacity-50"
          >
            Theo dõi
          </button>
        </div>
      ) : recipe.source === "cookpad" ? (
        <div className="flex items-center gap-3 p-4 bg-[#F7F0E8] rounded-xl border border-[#E8DDD4] mb-6">
          <Avatar className="w-12 h-12">
            <AvatarFallback className="bg-[#E85D26] text-white font-semibold">
              C
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[#1C1209]">Cookpad</p>
            <p className="text-xs text-[#7C6A56]">Công thức tổng hợp</p>
          </div>
          {recipe.cookpad_url && (
            <a
              href={recipe.cookpad_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[#E85D26] hover:underline"
            >
              Nguồn gốc
            </a>
          )}
        </div>
      ) : null}

      {/* Tabs */}
      <Tabs defaultValue="ingredients" className="mb-10">
        <TabsList className="bg-[#F7F0E8] border border-[#E8DDD4] p-1 h-auto rounded-xl mb-6">
          <TabsTrigger
            value="ingredients"
            className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#E85D26] data-[state=active]:shadow-sm"
          >
            Nguyên liệu ({recipe.ingredients.length})
          </TabsTrigger>
          <TabsTrigger
            value="steps"
            className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#E85D26] data-[state=active]:shadow-sm"
          >
            Các bước ({recipe.steps.length})
          </TabsTrigger>
          <TabsTrigger
            value="comments"
            disabled
            className="rounded-lg opacity-50"
          >
            Bình luận
          </TabsTrigger>
        </TabsList>

        {/* Ingredients tab */}
        <TabsContent value="ingredients">
          {recipe.ingredients.length > 0 ? (
            <ul className="space-y-2">
              {recipe.ingredients.map((ing, idx) => (
                <li
                  key={ing.id ?? idx}
                  className="flex items-start gap-3 py-2.5 border-b border-[#E8DDD4] last:border-0"
                >
                  <span className="w-2 h-2 rounded-full bg-[#E85D26] mt-2 shrink-0" />
                  <span className="text-[#1C1209] leading-relaxed">
                    {ing.display_text || `${ing.quantity} ${ing.ingredient_name}`}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[#7C6A56] py-4">Chưa có thông tin nguyên liệu.</p>
          )}
        </TabsContent>

        {/* Steps tab */}
        <TabsContent value="steps">
          {recipe.steps.length > 0 ? (
            <ol className="space-y-6">
              {recipe.steps.map((step) => (
                <li key={step.step_number} className="flex gap-4">
                  <div className="shrink-0 w-8 h-8 rounded-full bg-[#E85D26] text-white flex items-center justify-center text-sm font-bold">
                    {step.step_number}
                  </div>
                  <div className="flex-1 pt-1">
                    <p className="text-[#1C1209] leading-relaxed">
                      {step.content}
                    </p>
                    {step.timer_seconds && step.timer_seconds > 0 && (
                      <span className="inline-flex items-center gap-1 mt-2 text-xs text-[#7C6A56] bg-[#F7F0E8] px-2 py-1 rounded-full">
                        <Clock className="w-3 h-3" />
                        {Math.round(step.timer_seconds / 60)} phút
                      </span>
                    )}
                    {step.image_url && (
                      <div className="relative aspect-video rounded-xl overflow-hidden mt-3 bg-[#F7F0E8]">
                        <Image
                          src={
                            step.image_url.startsWith("http")
                              ? step.image_url
                              : `${process.env.NEXT_PUBLIC_UPLOAD_URL}/${step.image_url}`
                          }
                          alt={`Bước ${step.step_number}`}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[#7C6A56] py-4">Chưa có thông tin các bước.</p>
          )}
        </TabsContent>
      </Tabs>

      {/* Sticky CTA */}
      <div className="fixed bottom-16 md:bottom-0 inset-x-0 md:relative md:inset-x-auto bg-[#FFFBF5] md:bg-transparent border-t border-[#E8DDD4] md:border-0 p-4 md:p-0 flex gap-3 justify-center md:justify-start">
        <button className="flex-1 md:flex-none px-8 py-3 bg-[#E85D26] hover:bg-[#D44E1E] text-white rounded-xl font-semibold transition-colors">
          Bắt đầu nấu
        </button>
        <button className="p-3 rounded-xl border border-[#E8DDD4] hover:border-[#E85D26] hover:text-[#E85D26] transition-colors">
          <Bookmark className="w-5 h-5" />
        </button>
        {recipe.cookpad_url && (
          <a
            href={recipe.cookpad_url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-3 rounded-xl border border-[#E8DDD4] hover:border-[#E85D26] hover:text-[#E85D26] transition-colors"
            title="Xem trên Cookpad"
          >
            <ExternalLink className="w-5 h-5" />
          </a>
        )}
      </div>
    </div>
  );
}
