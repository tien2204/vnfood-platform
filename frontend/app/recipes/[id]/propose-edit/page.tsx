"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import RecipeForm from "@/components/recipes/RecipeForm";
import api from "@/lib/api";
import type { ApiResponse, RecipeDetail, RecipeCreate } from "@/lib/types";

export default function ProposeEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.get<ApiResponse<RecipeDetail>>(`/recipes/${id}`)
      .then((r) => setRecipe(r.data.data))
      .catch(() => setFailed(true));
  }, [id]);

  async function submit(payload: RecipeCreate) {
    await api.post("/recipe-change-requests", { type: "edit", target_recipe_id: id, payload });
    toast.success("Đã gửi đề xuất sửa — chờ admin duyệt");
    router.push("/staff/proposals");
  }

  if (failed) return <p className="p-8 text-muted-foreground">Không tải được công thức. <a href="/recipes" className="text-primary underline">Quay lại</a></p>;
  if (!recipe) return <p className="p-8 text-muted-foreground">Đang tải…</p>;
  return (
    <main className="min-h-screen bg-white py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-bold text-foreground mb-4">Đề xuất sửa: {recipe.title}</h1>
        <RecipeForm initial={recipe} recipeId={id} mode="edit" submitOverride={submit} />
      </div>
    </main>
  );
}
