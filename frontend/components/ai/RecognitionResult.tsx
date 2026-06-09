"use client";

import Image from "next/image";
import Link from "next/link";
import { Search } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { AIRecognitionResult } from "@/lib/types";
import RecipeImage from "@/components/common/RecipeImage";
import { CanonicalBadge } from "@/components/recipes/CanonicalBadge";
import DishRecipeCard from "./DishRecipeCard";
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
    pct >= 80 ? "from-[#2D6A4F] to-[#40916C]" : pct >= 50 ? "from-[#E85D26] to-[#F4A261]" : "from-[#ADB5BD] to-[#CED4DA]";

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-[#666666] mb-1">
        <span>Độ tin cậy cho ảnh này</span>
        <span className="font-semibold text-[#2D2417]">{pct}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-[#f0f0f0] overflow-hidden">
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
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#E85D26]/10 text-[#E85D26] border border-[#E85D26]/20">
        <span className="w-1.5 h-1.5 rounded-full bg-[#E85D26]" />
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
  const isUnknown =
    !result.display_name ||
    result.display_name === "Không nhận diện được" ||
    result.display_name === "Không xác định" ||
    result.display_name.toLowerCase() === "unknown";

  const top3 = result.top_predictions.slice(0, 3);

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left — uploaded image */}
        <div className="relative aspect-square rounded-2xl overflow-hidden bg-[#F7F0E8] shadow-sm">
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
              <div className="w-16 h-16 rounded-full bg-[#F7F0E8] flex items-center justify-center mx-auto mb-3">
                <span className="text-3xl">🤔</span>
              </div>
              <p className="text-lg font-semibold text-[#2D2417]">Không nhận diện được</p>
              <p className="text-sm text-[#666666] mt-1">Thử ảnh rõ hơn hoặc chụp gần hơn</p>
            </div>
          ) : (
            <>
              <div>
                <p className="text-xs text-[#666666] uppercase tracking-wider mb-1">Món được nhận diện</p>
                <Link
                  href={`/search?q=${encodeURIComponent(result.display_name)}`}
                  className="inline-block group"
                >
                  <h2
                    className="text-3xl font-bold text-[#2D2417] leading-tight group-hover:text-[#E85D26] transition-colors"
                    style={{ fontFamily: "var(--font-playfair)" }}
                  >
                    {result.display_name}
                  </h2>
                </Link>
                {result.subgroup && (
                  <p className="text-xs text-[#666666] mt-1">Nhóm: {result.subgroup}</p>
                )}
              </div>

              <ModelBadge model={result.model_used} />
              <ConfidenceBar value={result.confidence} />

              {result.class_metrics && (
                <ModelMetrics metrics={result.class_metrics} />
              )}

              <Link
                href={`/search?q=${encodeURIComponent(result.display_name)}`}
                className={buttonVariants({ variant: "default" }) + " bg-[#E85D26] hover:bg-[#D14E1C] text-white w-full sm:w-auto"}
              >
                <Search className="w-4 h-4 mr-2" />
                Tìm công thức &quot;{result.display_name}&quot;
              </Link>

              {result.model_used === "vnfood" && top3.length > 1 && (
                <div>
                  <p className="text-xs text-[#666666] uppercase tracking-wider mb-2">Top dự đoán</p>
                  <div className="flex flex-col gap-1.5">
                    {top3.map((pred, i) => (
                      <div
                        key={pred.class}
                        className={`flex items-center justify-between px-3 py-2 rounded-xl text-sm ${
                          i === 0
                            ? "bg-[#E85D26]/10 border border-[#E85D26]/20 font-medium text-[#2D2417]"
                            : "bg-[#F7F0E8] text-[#666666]"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-xs text-[#A69588]">#{i + 1}</span>
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

      {!isUnknown && result.canonical_recipe && (
        <section className="mt-8">
          <h2
            className="text-xl font-semibold text-[#2D2417] mb-4"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            Công thức chuẩn cho món này
          </h2>
          <Link
            href={`/recipes/${result.canonical_recipe.id}`}
            className="block rounded-2xl border border-[#f0f0f0] bg-white overflow-hidden hover:shadow-lg transition-shadow"
          >
            <div className="grid grid-cols-1 md:grid-cols-3">
              <div className="aspect-square md:aspect-auto relative bg-[#F7F0E8] md:min-h-[200px]">
                <RecipeImage
                  src={resolveImageUrl(result.canonical_recipe.image_url)}
                  alt={result.canonical_recipe.title}
                  fill
                  className="object-cover"
                  unoptimized
                  fallback={
                    <div className="absolute inset-0 flex items-center justify-center text-[#f0f0f0]">
                      <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M18.06 22.99h1.66c.84 0 1.53-.64 1.63-1.46L23 5.05h-5V1h-1.97v4.05h-4.97l.3 2.34c1.71.47 3.31 1.32 4.27 2.26 1.44 1.42 2.43 2.89 2.43 5.29v8.05zM1 21.99V21h15.03v.99c0 .55-.45 1-1.01 1H2.01c-.56 0-1.01-.45-1.01-1zm15.03-7c0-8.17-15.03-8.17-15.03 0h15.03zM1.02 17h15v2h-15z" />
                      </svg>
                    </div>
                  }
                />
              </div>
              <div className="md:col-span-2 p-4">
                <CanonicalBadge />
                <h3 className="text-xl font-semibold mt-2 text-[#2D2417]">
                  {result.canonical_recipe.title}
                </h3>
                {result.canonical_recipe.cooking_time && (
                  <p className="text-sm text-[#666666] mt-2">
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
          <h3
            className="text-lg font-medium mb-3 text-[#2D2417]"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            Biến thể khác ({result.variants.length})
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {result.variants.map((v) => (
              <Link
                key={v.id}
                href={`/recipes/${v.id}`}
                className="block rounded-xl border border-[#f0f0f0] bg-white overflow-hidden hover:shadow transition-shadow"
              >
                <div className="aspect-[4/3] relative bg-[#F7F0E8]">
                  <RecipeImage
                    src={resolveImageUrl(v.image_url)}
                    alt={v.title}
                    fill
                    className="object-cover"
                    unoptimized
                    fallback={
                      <div className="absolute inset-0 flex items-center justify-center text-[#f0f0f0]">
                        <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M18.06 22.99h1.66c.84 0 1.53-.64 1.63-1.46L23 5.05h-5V1h-1.97v4.05h-4.97l.3 2.34c1.71.47 3.31 1.32 4.27 2.26 1.44 1.42 2.43 2.89 2.43 5.29v8.05zM1 21.99V21h15.03v.99c0 .55-.45 1-1.01 1H2.01c-.56 0-1.01-.45-1.01-1zm15.03-7c0-8.17-15.03-8.17-15.03 0h15.03zM1.02 17h15v2h-15z" />
                        </svg>
                      </div>
                    }
                  />
                </div>
                <div className="p-2">
                  <h3 className="text-xs font-medium line-clamp-2 text-[#2D2417]">
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
