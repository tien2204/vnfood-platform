import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import {
  Clock,
  Users,
  Eye,
  ChevronLeft,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import RecipeImage from "@/components/common/RecipeImage";
import RatingSection from "@/components/recipes/RatingSection";
import { RecipeDetailClient } from "@/components/recipes/RecipeDetailClient";
import { CanonicalBadge } from "@/components/recipes/CanonicalBadge";
import { ManualReviewBadge } from "@/components/recipes/ManualReviewBadge";
import { VariantsAccordion } from "@/components/recipes/VariantsAccordion";
import { RecipeVideo } from "@/components/recipes/RecipeVideo";
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
        <RecipeImage
          src={imageUrl}
          alt={cleanTitle}
          fill
          className="object-cover"
          priority
          unoptimized
          fallback={
            <div className="absolute inset-0 flex items-center justify-center text-[#E8DDD4]">
              <svg className="w-40 h-40" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.06 22.99h1.66c.84 0 1.53-.64 1.63-1.46L23 5.05h-5V1h-1.97v4.05h-4.97l.3 2.34c1.71.47 3.31 1.32 4.27 2.26 1.44 1.42 2.43 2.89 2.43 5.29v8.05zM1 21.99V21h15.03v.99c0 .55-.45 1-1.01 1H2.01c-.56 0-1.01-.45-1.01-1zm15.03-7c0-8.17-15.03-8.17-15.03 0h15.03zM1.02 17h15v2h-15z" />
              </svg>
            </div>
          }
        />
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

        {/* Canonical / review badges */}
        {(recipe.is_canonical || recipe.is_manually_reviewed || recipe.variant_label) && (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {recipe.is_canonical && <CanonicalBadge size="md" />}
            {recipe.is_manually_reviewed && <ManualReviewBadge />}
            {recipe.variant_label && (
              <span className="text-sm text-[#7C6A56]">— {recipe.variant_label}</span>
            )}
          </div>
        )}

        {recipe.refinement_notes && (
          <details className="mb-4 p-3 bg-[#F7F0E8] border border-[#E8DDD4] rounded-xl text-sm">
            <summary className="cursor-pointer font-medium text-[#1C1209]">
              Ghi chú chỉnh sửa từ AI
            </summary>
            <p className="mt-2 text-[#7C6A56] whitespace-pre-wrap">
              {recipe.refinement_notes}
            </p>
          </details>
        )}

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

        {/* YouTube tutorial video */}
        <RecipeVideo url={recipe.video_url} />

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
        // Branch 1: User-uploaded recipe
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
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              href={`/users/${recipe.author.id}`}
              className="px-4 py-1.5 rounded-full border border-[#E85D26] text-sm text-[#E85D26] hover:bg-[#E85D26] hover:text-white transition-colors"
            >
              Xem hồ sơ
            </Link>
            {recipe.source === "cookpad" && recipe.cookpad_url && (
              <a
                href={recipe.cookpad_url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-1.5 rounded-full border border-[#7C6A56] text-sm text-[#7C6A56] hover:bg-[#7C6A56] hover:text-white transition-colors"
              >
                Xem trên Cookpad
              </a>
            )}
          </div>
        </div>
      ) : recipe.original_author_name && recipe.original_author_name.length > 0 ? (
        // Branch 2: Cookpad recipe with scraped author
        <div className="flex items-center gap-3 p-4 bg-[#F7F0E8] rounded-xl border border-[#E8DDD4] mb-6">
          <Avatar className="w-12 h-12">
            <AvatarFallback className="bg-[#2D6A4F] text-white font-semibold">
              {recipe.original_author_name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[#1C1209]">{recipe.original_author_name}</p>
            <p className="text-xs text-[#7C6A56]">Tác giả Cookpad</p>
          </div>
          {recipe.cookpad_url && (
            <a
              href={recipe.cookpad_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-1.5 rounded-full border border-[#E85D26] text-sm text-[#E85D26] hover:bg-[#E85D26] hover:text-white transition-colors"
            >
              Xem trên Cookpad
            </a>
          )}
        </div>
      ) : recipe.source === "cookpad" ? (
        // Branch 3: Cookpad recipe without scraped author — show "Unknown" placeholder
        <div className="flex items-center gap-3 p-4 bg-[#F7F0E8] rounded-xl border border-[#E8DDD4] mb-6">
          <Avatar className="w-12 h-12">
            <AvatarFallback className="bg-[#2D6A4F] text-white font-semibold">?</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[#1C1209]">Unknown</p>
            <p className="text-xs text-[#7C6A56]">Tác giả Cookpad</p>
          </div>
          {recipe.cookpad_url && (
            <a
              href={recipe.cookpad_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-1.5 rounded-full border border-[#E85D26] text-sm text-[#E85D26] hover:bg-[#E85D26] hover:text-white transition-colors"
            >
              Xem trên Cookpad
            </a>
          )}
        </div>
      ) : null}

      <RecipeDetailClient
        recipe={recipe}
        isLoggedIn={isLoggedIn}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
      />

      {recipe.variants && recipe.variants.length > 0 && (
        <VariantsAccordion variants={recipe.variants} />
      )}
    </div>
  );
}
