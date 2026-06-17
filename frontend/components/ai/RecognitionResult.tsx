"use client";

import Image from "next/image";
import Link from "next/link";
import { Search } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { AIRecognitionResult } from "@/lib/types";
import RecipeImage from "@/components/common/RecipeImage";
import { CanonicalBadge, VariantBadge } from "@/components/recipes/CanonicalBadge";
import DishRecipeCard from "./DishRecipeCard";
import DishOverviewCard from "./DishOverviewCard";
import ModelMetrics from "./ModelMetrics";

function resolveImageUrl(src: string | null): string | null {
  if (!src) return null;
  if (src.startsWith("http")) return src;
  return `${process.env.NEXT_PUBLIC_UPLOAD_URL}/${src}`;
}

interface Props {
  result: AIRecognitionResult;
  imagePreview: string;
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 80 ? "from-[#2D6A4F] to-[#40916C]" : pct >= 50 ? "from-primary to-[#F4A261]" : "from-[#ADB5BD] to-[#CED4DA]";

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <span>Độ tin cậy cho ảnh này</span>
        <span className="font-semibold text-foreground">{pct}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ModelBadge({ model }: { model: "vnfood" | "openai" }) {
  if (model === "vnfood") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
        VNFood AI
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#2D6A4F]/10 text-[#2D6A4F] border border-[#2D6A4F]/20">
      <span className="w-1.5 h-1.5 rounded-full bg-[#2D6A4F]" />
      OpenAI Vision
    </span>
  );
}

export default function RecognitionResult({ result, imagePreview }: Props) {
  const isUnknown = result.match_tier === "unknown";
  const isTentative = result.match_tier === "tentative";

  const top3 = result.top_predictions.slice(0, 3);

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left — uploaded image */}
        <div className="relative aspect-square rounded-2xl overflow-hidden bg-muted shadow-sm">
          <Image
            src={imagePreview}
            alt="Ảnh đã tải lên"
            fill
            className="object-cover"
            unoptimized
          />
        </div>

        {/* Right — result */}
        <div className="flex flex-col gap-4 justify-center">
          {isUnknown ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                <span className="text-3xl">🤔</span>
              </div>
              <p className="text-lg font-semibold text-foreground">Không nhận diện được</p>
              <p className="text-sm text-muted-foreground mt-1">Thử ảnh rõ hơn hoặc chụp gần hơn</p>
            </div>
          ) : (
            <>
              {isTentative && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                  Có thể là <strong>{result.display_name}</strong> — độ tin cậy chưa cao, kiểm tra lại ảnh nếu chưa đúng.
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Món được nhận diện</p>
                <Link
                  href={`/search?q=${encodeURIComponent(result.display_name)}`}
                  className="inline-block group"
                >
                  <h2 className="text-3xl font-bold text-foreground leading-tight group-hover:text-primary transition-colors">
                    {result.display_name}
                  </h2>
                </Link>
                {result.subgroup && (
                  <p className="text-xs text-muted-foreground mt-1">Nhóm: {result.subgroup}</p>
                )}
              </div>

              <ModelBadge model={result.model_used} />
              <ConfidenceBar value={result.confidence} />

              {result.class_metrics && (
                <ModelMetrics metrics={result.class_metrics} />
              )}

              <Link
                href={`/search?q=${encodeURIComponent(result.display_name)}`}
                className={buttonVariants({ variant: "default" }) + " bg-primary hover:bg-[#cc1c22] text-white w-full sm:w-auto"}
              >
                <Search className="w-4 h-4 mr-2" />
                Tìm công thức &quot;{result.display_name}&quot;
              </Link>

              {result.model_used === "vnfood" && top3.length > 1 && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Top dự đoán</p>
                  <div className="flex flex-col gap-1.5">
                    {top3.map((pred, i) => (
                      <div
                        key={pred.class}
                        className={`flex items-center justify-between px-3 py-2 rounded-xl text-sm ${
                          i === 0
                            ? "bg-primary/10 border border-primary/20 font-medium text-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">#{i + 1}</span>
                          {pred.display_name}
                        </span>
                        <span className="font-medium">{Math.round(pred.confidence * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {!isUnknown && result.is_multi_variant && result.dish_overview && (
        <DishOverviewCard overview={result.dish_overview} />
      )}

      {!isUnknown && result.canonical_recipe && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold text-foreground mb-4">
            {result.is_multi_variant ? "Một công thức tiêu biểu" : "Công thức chuẩn cho món này"}
          </h2>
          <Link
            href={`/recipes/${result.canonical_recipe.id}`}
            className="block rounded-2xl border border-border bg-card overflow-hidden hover:shadow-lg transition-shadow"
          >
            <div className="grid grid-cols-1 md:grid-cols-3">
              <div className="aspect-square md:aspect-auto relative bg-muted md:min-h-[200px]">
                <RecipeImage
                  src={resolveImageUrl(result.canonical_recipe.image_url)}
                  alt={result.canonical_recipe.title}
                  fill
                  className="object-cover"
                  unoptimized
                  fallback={
                    <div className="absolute inset-0 flex items-center justify-center text-border">
                      <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M18.06 22.99h1.66c.84 0 1.53-.64 1.63-1.46L23 5.05h-5V1h-1.97v4.05h-4.97l.3 2.34c1.71.47 3.31 1.32 4.27 2.26 1.44 1.42 2.43 2.89 2.43 5.29v8.05zM1 21.99V21h15.03v.99c0 .55-.45 1-1.01 1H2.01c-.56 0-1.01-.45-1.01-1zm15.03-7c0-8.17-15.03-8.17-15.03 0h15.03zM1.02 17h15v2h-15z" />
                      </svg>
                    </div>
                  }
                />
              </div>
              <div className="md:col-span-2 p-4">
                {result.is_multi_variant ? <VariantBadge /> : <CanonicalBadge />}
                <h3 className="text-xl font-semibold mt-2 text-foreground">
                  {result.canonical_recipe.title}
                </h3>
                {result.canonical_recipe.cooking_time && (
                  <p className="text-sm text-muted-foreground mt-2">
                    ⏱ {result.canonical_recipe.cooking_time} phút
                  </p>
                )}
              </div>
            </div>
          </Link>
          {result.dish_recipe && <DishRecipeCard recipe={result.dish_recipe} />}
        </section>
      )}

      {!isUnknown && result.variants && result.variants.length > 0 && (
        <section className="mt-6">
          <h3 className="text-lg font-medium mb-3 text-foreground">
            Biến thể khác ({result.variants.length})
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {result.variants.map((v) => (
              <Link
                key={v.id}
                href={`/recipes/${v.id}`}
                className="block rounded-xl border border-border bg-card overflow-hidden hover:shadow transition-shadow"
              >
                <div className="aspect-[4/3] relative bg-muted">
                  <RecipeImage
                    src={resolveImageUrl(v.image_url)}
                    alt={v.title}
                    fill
                    className="object-cover"
                    unoptimized
                    fallback={
                      <div className="absolute inset-0 flex items-center justify-center text-border">
                        <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M18.06 22.99h1.66c.84 0 1.53-.64 1.63-1.46L23 5.05h-5V1h-1.97v4.05h-4.97l.3 2.34c1.71.47 3.31 1.32 4.27 2.26 1.44 1.42 2.43 2.89 2.43 5.29v8.05zM1 21.99V21h15.03v.99c0 .55-.45 1-1.01 1H2.01c-.56 0-1.01-.45-1.01-1zm15.03-7c0-8.17-15.03-8.17-15.03 0h15.03zM1.02 17h15v2h-15z" />
                        </svg>
                      </div>
                    }
                  />
                </div>
                <div className="p-2">
                  <h3 className="text-xs font-medium line-clamp-2 text-foreground">
                    {v.title}
                  </h3>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {!isUnknown && !result.canonical_recipe && result.dish_recipe && (
        <DishRecipeCard recipe={result.dish_recipe} />
      )}
    </div>
  );
}
