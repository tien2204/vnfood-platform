import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import {
  Clock,
  Users,
  Eye,
  ChevronLeft,
  ExternalLink,
  ChefHat,
} from "lucide-react";
import SaveButton from "@/components/recipes/SaveButton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import RatingSection from "@/components/recipes/RatingSection";
import CommentSection from "@/components/recipes/CommentSection";
import type { ApiResponse, RecipeDetail } from "@/lib/types";

const DIFFICULTY_LABEL = {
  easy: "Dễ",
  medium: "Trung bình",
  hard: "Khó",
} as const;

function stripEmoji(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, "")
    .trim();
}

function difficultyLabel(d: string): string {
  return DIFFICULTY_LABEL[d as keyof typeof DIFFICULTY_LABEL] ?? d;
}

function decodeJWTPayload(token: string): { sub?: string; role?: string } | null {
  try {
    const part = token.split(".")[1];
    const padded = part + "==".slice(0, (4 - (part.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

async function getRecipe(id: string, accessToken?: string): Promise<RecipeDetail | null> {
  try {
    const headers: Record<string, string> = {};
    if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/recipes/${id}`,
      accessToken
        ? { headers, cache: "no-store" }
        : { next: { revalidate: 60 } }
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
    title: recipe ? stripEmoji(recipe.title) : "Công thức",
    description: recipe?.description ?? undefined,
  };
}

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const jar = await cookies();
  const accessToken = jar.get("access_token")?.value;
  const jwtPayload = accessToken ? decodeJWTPayload(accessToken) : null;
  const isLoggedIn = !!jwtPayload?.sub;
  const currentUserId = jwtPayload?.sub;
  const isAdmin = jwtPayload?.role === "admin";

  const recipe = await getRecipe(id, accessToken);
  if (!recipe) notFound();

  const imageUrl = recipe.image_url
    ? recipe.image_url.startsWith("http")
      ? recipe.image_url
      : `${process.env.NEXT_PUBLIC_UPLOAD_URL}/${recipe.image_url}`
    : null;

  const cleanTitle = stripEmoji(recipe.title);

  type MetaItem = { key: string; node: React.ReactNode };
  const metaItems: MetaItem[] = [];
  if (recipe.view_count >= 100) {
    metaItems.push({
      key: "views",
      node: (
        <span className="flex items-center gap-1">
          <Eye className="w-4 h-4" />
          {recipe.view_count.toLocaleString()} lượt xem
        </span>
      ),
    });
  }
  if (recipe.cooking_time) {
    metaItems.push({
      key: "time",
      node: (
        <span className="flex items-center gap-1">
          <Clock className="w-4 h-4" />
          {recipe.cooking_time} phút
        </span>
      ),
    });
  }
  if (recipe.servings) {
    metaItems.push({
      key: "servings",
      node: (
        <span className="flex items-center gap-1">
          <Users className="w-4 h-4" />
          {recipe.servings} người
        </span>
      ),
    });
  }

  const tabTriggerClass =
    "px-4 py-3 text-sm font-medium rounded-none -mb-px border-b-2 border-transparent " +
    "text-[#7C6A56] data-[state=active]:border-[#E85D26] data-[state=active]:text-[#E85D26] " +
    "data-[state=active]:bg-transparent data-[state=active]:shadow-none " +
    "hover:text-[#1C1209] transition-colors";

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-28 lg:pb-6">
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
            alt={cleanTitle}
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
              {difficultyLabel(recipe.difficulty)}
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
          {cleanTitle}
        </h1>

        {/* Meta stats */}
        {metaItems.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#7C6A56] mb-4">
            {metaItems.map((item, i) => (
              <span key={item.key} className="flex items-center gap-3">
                {i > 0 && <span className="select-none text-[#E8DDD4]">•</span>}
                {item.node}
              </span>
            ))}
          </div>
        )}

        {/* Description */}
        {recipe.description && (
          <blockquote
            className="border-l-4 border-[#E85D26]/30 pl-4 py-2 my-6 italic text-[#7C6A56] text-lg leading-relaxed"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {recipe.description}
          </blockquote>
        )}

        {/* Rating section */}
        <RatingSection
          recipeId={id}
          avgRating={recipe.avg_rating}
          ratingCount={recipe.rating_count}
          userRating={recipe.user_rating ?? null}
          isLoggedIn={isLoggedIn}
        />
      </div>

      {/* Author card */}
      {recipe.author ? (
        <div className="flex items-center gap-3 p-4 bg-[#F7F0E8] rounded-xl border border-[#E8DDD4] mb-6">
          <Link href={`/users/${recipe.author.id}`}>
            <Avatar className="w-12 h-12">
              <AvatarImage src={recipe.author.avatar_url ?? undefined} />
              <AvatarFallback className="bg-[#E85D26] text-white font-semibold">
                {recipe.author.full_name?.charAt(0)?.toUpperCase() ?? "?"}
              </AvatarFallback>
            </Avatar>
          </Link>
          <div className="flex-1 min-w-0">
            <Link href={`/users/${recipe.author.id}`}>
              <p className="font-semibold text-[#1C1209] hover:text-[#E85D26] transition-colors">
                {recipe.author.full_name}
              </p>
            </Link>
            {recipe.author.follower_count > 0 && (
              <p className="text-xs text-[#7C6A56]">
                {recipe.author.follower_count} người theo dõi
              </p>
            )}
          </div>
          <Link
            href={`/users/${recipe.author.id}`}
            className="px-4 py-1.5 rounded-full border border-[#E85D26] text-sm text-[#E85D26] hover:bg-[#E85D26] hover:text-white transition-colors"
          >
            Xem hồ sơ
          </Link>
        </div>
      ) : recipe.source === "cookpad" ? (
        <div className="flex items-center gap-3 p-4 bg-[#F7F0E8] rounded-xl border border-[#E8DDD4] mb-6">
          <Avatar className="w-12 h-12">
            <AvatarFallback className="bg-[#E85D26] text-white font-semibold">C</AvatarFallback>
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

      {/* 2-col layout: tabs + sidebar */}
      <div className="lg:grid lg:grid-cols-3 lg:gap-8">
        {/* Main content */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="ingredients" className="mb-10">
            <TabsList className="w-full justify-start bg-transparent p-0 h-auto rounded-none border-b border-[#E8DDD4] gap-0 mb-6">
              <TabsTrigger value="ingredients" className={tabTriggerClass}>
                Nguyên liệu ({recipe.ingredients.length})
              </TabsTrigger>
              <TabsTrigger value="steps" className={tabTriggerClass}>
                Các bước ({recipe.steps.length})
              </TabsTrigger>
              <TabsTrigger value="comments" className={tabTriggerClass}>
                Bình luận
              </TabsTrigger>
            </TabsList>

            {/* Ingredients */}
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

            {/* Steps */}
            <TabsContent value="steps">
              {recipe.steps.length > 0 ? (
                <div className="space-y-6 pb-4">
                  {recipe.steps.map((step, idx) => (
                    <div key={step.step_number} className="flex gap-4">
                      <div
                        className="flex-shrink-0 w-12 h-12 rounded-full bg-[#E85D26]/10 flex items-center justify-center font-bold text-xl text-[#E85D26]"
                        style={{ fontFamily: "var(--font-heading)" }}
                      >
                        {idx + 1}
                      </div>
                      <div className="flex-1 pt-2">
                        <p className="text-[#1C1209] leading-relaxed">{step.content}</p>
                        {(step.timer_seconds ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-1 mt-2 text-xs text-[#7C6A56] bg-[#F7F0E8] px-2 py-1 rounded-full">
                            <Clock className="w-3 h-3" />
                            {Math.round(step.timer_seconds! / 60)} phút
                          </span>
                        )}
                        {step.image_url && (
                          <div className="relative aspect-video rounded-xl overflow-hidden mt-3 bg-[#F7F0E8] max-w-md">
                            <Image
                              src={
                                step.image_url.startsWith("http")
                                  ? step.image_url
                                  : `${process.env.NEXT_PUBLIC_UPLOAD_URL}/${step.image_url}`
                              }
                              alt={`Bước ${idx + 1}`}
                              fill
                              className="object-cover"
                              unoptimized
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[#7C6A56] py-4">Chưa có thông tin các bước.</p>
              )}
            </TabsContent>

            {/* Comments */}
            <TabsContent value="comments">
              <CommentSection
                recipeId={id}
                isLoggedIn={isLoggedIn}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
              />
            </TabsContent>
          </Tabs>

          {/* Desktop action bar */}
          <div className="hidden lg:flex items-center gap-3 pt-6 border-t border-[#E8DDD4]">
            <button className="inline-flex items-center gap-2 px-6 py-3 bg-[#E85D26] hover:bg-[#D44E1E] text-white rounded-xl font-semibold transition-colors">
              <ChefHat className="w-5 h-5" />
              Bắt đầu nấu
            </button>
            <SaveButton
              recipeId={id}
              initialSaved={recipe.is_saved ?? false}
              initialCount={recipe.save_count}
              variant="action"
            />
            {recipe.source === "cookpad" && recipe.cookpad_url && (
              <a
                href={recipe.cookpad_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-[#E8DDD4] hover:border-[#E85D26] hover:text-[#E85D26] text-[#7C6A56] transition-colors"
              >
                <ExternalLink className="w-5 h-5" />
                <span>Cookpad</span>
              </a>
            )}
          </div>
        </div>

        {/* Sticky sidebar (desktop only) */}
        <aside className="hidden lg:block lg:col-span-1">
          <div className="sticky top-24 space-y-4">
            {/* Recipe info */}
            <div className="bg-[#F7F0E8] rounded-lg p-4 border border-[#E8DDD4]/50">
              <h3
                className="text-lg italic mb-3 text-[#1C1209]"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Thông tin món ăn
              </h3>
              <dl className="space-y-2 text-sm">
                {recipe.cooking_time && (
                  <div className="flex justify-between">
                    <dt className="text-[#7C6A56]">Thời gian</dt>
                    <dd className="font-medium text-[#1C1209]">{recipe.cooking_time} phút</dd>
                  </div>
                )}
                {recipe.servings && (
                  <div className="flex justify-between">
                    <dt className="text-[#7C6A56]">Khẩu phần</dt>
                    <dd className="font-medium text-[#1C1209]">{recipe.servings} người</dd>
                  </div>
                )}
                {recipe.difficulty && (
                  <div className="flex justify-between">
                    <dt className="text-[#7C6A56]">Độ khó</dt>
                    <dd className="font-medium text-[#1C1209]">{difficultyLabel(recipe.difficulty)}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-[#7C6A56]">Nguồn</dt>
                  <dd className="font-medium text-[#1C1209]">
                    {recipe.source === "cookpad" ? "Cookpad" : "Cộng đồng"}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Quick actions */}
            <div className="bg-white rounded-lg p-4 border border-[#E8DDD4]/50">
              <p className="text-xs text-[#7C6A56] mb-3">Hành động nhanh</p>
              <div className="space-y-2.5">
                <button className="w-full text-left text-sm text-[#1C1209] hover:text-[#E85D26] transition-colors">
                  📋 Copy danh sách nguyên liệu
                </button>
                <button className="w-full text-left text-sm text-[#1C1209] hover:text-[#E85D26] transition-colors">
                  🖨 In công thức
                </button>
                <button className="w-full text-left text-sm text-[#1C1209] hover:text-[#E85D26] transition-colors">
                  📤 Chia sẻ
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Mobile bottom action bar */}
      <div className="lg:hidden fixed bottom-16 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-[#E8DDD4] px-4 py-3 z-40 flex items-center gap-3">
        <button className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 bg-[#E85D26] hover:bg-[#D44E1E] text-white rounded-xl font-semibold transition-colors text-sm">
          <ChefHat className="w-4 h-4" />
          Bắt đầu nấu
        </button>
        <SaveButton
          recipeId={id}
          initialSaved={recipe.is_saved ?? false}
          initialCount={recipe.save_count}
          variant="action"
        />
        {recipe.source === "cookpad" && recipe.cookpad_url && (
          <a
            href={recipe.cookpad_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-3 py-2.5 rounded-xl border border-[#E8DDD4] hover:border-[#E85D26] hover:text-[#E85D26] text-[#7C6A56] transition-colors"
          >
            <ExternalLink className="w-5 h-5" />
          </a>
        )}
      </div>
    </div>
  );
}
