"use client";
import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import RecipeImage from "@/components/common/RecipeImage";
import type { RecipeMini } from "@/lib/types";

function resolveImageUrl(src: string | null): string | null {
  if (!src) return null;
  if (src.startsWith("http")) return src;
  return `${process.env.NEXT_PUBLIC_UPLOAD_URL}/${src}`;
}

export function VariantsAccordion({ variants, title }: { variants: RecipeMini[]; title?: string }) {
  const [open, setOpen] = useState(false);
  if (variants.length === 0) return null;

  return (
    <section className="mt-6 border-t border-[#f0f0f0] pt-6">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-lg font-medium w-full text-left text-[#2D2417] hover:text-[#E85D26] transition-colors"
      >
        <span>{title ?? `Xem ${variants.length} biến thể`}</span>
        <ChevronDown
          className={`h-5 w-5 ml-auto transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
          {variants.map((v) => {
            const imgUrl = resolveImageUrl(v.image_url);
            return (
              <Link
                key={v.id}
                href={`/recipes/${v.id}`}
                className="block rounded-md border border-[#f0f0f0] bg-white overflow-hidden hover:shadow transition-shadow"
              >
                <div className="aspect-[4/3] relative bg-[#F7F0E8]">
                  <RecipeImage
                    src={imgUrl}
                    alt={v.title}
                    fill
                    className="object-cover"
                    unoptimized
                    fallback={
                      <div className="absolute inset-0 flex items-center justify-center text-[#f0f0f0]">
                        <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M18.06 22.99h1.66c.84 0 1.53-.64 1.63-1.46L23 5.05h-5V1h-1.97v4.05h-4.97l.3 2.34c1.71.47 3.31 1.32 4.27 2.26 1.44 1.42 2.43 2.89 2.43 5.29v8.05zM1 21.99V21h15.03v.99c0 .55-.45 1-1.01 1H2.01c-.56 0-1.01-.45-1.01-1zm15.03-7c0-8.17-15.03-8.17-15.03 0h15.03zM1.02 17h15v2h-15z" />
                        </svg>
                      </div>
                    }
                  />
                </div>
                <div className="p-2">
                  <h3 className="text-sm font-medium line-clamp-2 text-[#2D2417]">
                    {v.title}
                  </h3>
                  {v.variant_label && (
                    <p className="text-xs text-[#666666] mt-0.5">{v.variant_label}</p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
