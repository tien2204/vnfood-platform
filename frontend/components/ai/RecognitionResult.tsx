"use client";

import Image from "next/image";
import Link from "next/link";
import { Search } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { AIRecognitionResult } from "@/lib/types";
import DishRecipeCard from "./DishRecipeCard";
import ModelMetrics from "./ModelMetrics";

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
      <div className="flex justify-between text-xs text-[#7C6A56] mb-1">
        <span>Độ tin cậy cho ảnh này</span>
        <span className="font-semibold text-[#2D2417]">{pct}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-[#E8DDD4] overflow-hidden">
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
              <p className="text-sm text-[#7C6A56] mt-1">Thử ảnh rõ hơn hoặc chụp gần hơn</p>
            </div>
          ) : (
            <>
              <div>
                <p className="text-xs text-[#7C6A56] uppercase tracking-wider mb-1">Món được nhận diện</p>
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
                  <p className="text-xs text-[#7C6A56] mt-1">Nhóm: {result.subgroup}</p>
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
                  <p className="text-xs text-[#7C6A56] uppercase tracking-wider mb-2">Top dự đoán</p>
                  <div className="flex flex-col gap-1.5">
                    {top3.map((pred, i) => (
                      <div
                        key={pred.class}
                        className={`flex items-center justify-between px-3 py-2 rounded-xl text-sm ${
                          i === 0
                            ? "bg-[#E85D26]/10 border border-[#E85D26]/20 font-medium text-[#2D2417]"
                            : "bg-[#F7F0E8] text-[#7C6A56]"
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

      {!isUnknown && result.dish_recipe && (
        <DishRecipeCard recipe={result.dish_recipe} />
      )}
    </div>
  );
}
