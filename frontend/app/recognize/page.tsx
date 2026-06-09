"use client";

import { useCallback, useState } from "react";
import { ScanLine, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { AIRecognitionResult } from "@/lib/types";
import ImageDropzone from "@/components/ai/ImageDropzone";
import RecognitionResult from "@/components/ai/RecognitionResult";
import RecipeCarousel from "@/components/ai/RecipeCarousel";

type State = "idle" | "loading" | "done" | "error";

export default function RecognizePage() {
  const [state, setState] = useState<State>("idle");
  const [result, setResult] = useState<AIRecognitionResult | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleSelect = useCallback(async (file: File) => {
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setState("loading");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("/ai/recognize", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(res.data.data as AIRecognitionResult);
      setState("done");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Nhận diện thất bại, thử lại sau";
      toast.error(msg);
      setState("error");
    }
  }, []);

  const handleReset = useCallback(() => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setResult(null);
    setState("idle");
  }, [preview]);

  const isLoading = state === "loading";

  return (
    <main className="min-h-screen bg-white">
      {/* Hero */}
      <section className="max-w-4xl mx-auto px-4 pt-12 pb-6 text-center">
        <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-medium mb-4">
          <ScanLine className="w-4 h-4" />
          AI Nhận diện món ăn
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-3">
          Nhận diện món Việt
        </h1>
        <p className="text-muted-foreground text-lg max-w-xl mx-auto">
          Chụp hoặc tải ảnh món ăn lên — AI sẽ nhận diện và gợi ý công thức cho bạn nấu tại nhà.
        </p>
      </section>

      <section className="max-w-4xl mx-auto px-4 pb-16 flex flex-col items-center gap-10">
        {/* Upload area — always visible when idle/error */}
        {(state === "idle" || state === "error") && (
          <ImageDropzone onSelect={handleSelect} disabled={isLoading} />
        )}

        {/* Loading */}
        {state === "loading" && (
          <div className="flex flex-col items-center gap-4 py-16">
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt="Đang nhận diện"
                className="w-48 h-48 object-cover rounded-2xl opacity-70 shadow"
              />
            )}
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="font-medium">Đang nhận diện...</span>
            </div>
          </div>
        )}

        {/* Result */}
        {state === "done" && result && preview && (
          <>
            <RecognitionResult result={result} imagePreview={preview} />

            <div className="w-full border-t border-border" />

            <RecipeCarousel recipes={result.suggested_recipes} />

            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors text-sm font-medium"
            >
              <RefreshCw className="w-4 h-4" />
              Thử ảnh khác
            </button>
          </>
        )}
      </section>
    </main>
  );
}
