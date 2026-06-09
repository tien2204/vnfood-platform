"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import RecipeForm from "@/components/recipes/RecipeForm";
import api from "@/lib/api";
import type { ApiResponse, RecipeDetail, RecipeCreate } from "@/lib/types";

export default function VariantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [source, setSource] = useState<RecipeDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [label, setLabel] = useState("Phiên bản của tôi");

  useEffect(() => {
    api.get<ApiResponse<RecipeDetail>>(`/recipes/${id}`)
      .then((r) => setSource(r.data.data))
      .catch(() => setFailed(true));
  }, [id]);

  async function submit(payload: RecipeCreate) {
    await api.post("/recipes", { ...payload, derived_from_recipe_id: id, variant_label: label || undefined });
    toast.success("Đã tạo biến thể (riêng tư) — bấm Gửi duyệt để đăng");
    router.push("/me/recipes");
  }

  if (failed) return <p className="p-8 text-muted-foreground">Không tải được công thức gốc. <a href="/recipes" className="text-primary underline">Quay lại</a></p>;
  if (!source) return <p className="p-8 text-muted-foreground">Đang tải…</p>;

  return (
    <main className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-bold text-foreground mb-1">Tạo biến thể</h1>
        <p className="text-sm text-muted-foreground mb-4">Phỏng theo: {source.title}</p>
        <div className="mb-4">
          <label className="block text-sm text-muted-foreground mb-1">Nhãn biến thể</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={80}
            placeholder="VD: Phiên bản ít béo"
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <RecipeForm initial={source} mode="create" submitOverride={submit} />
      </div>
    </main>
  );
}
