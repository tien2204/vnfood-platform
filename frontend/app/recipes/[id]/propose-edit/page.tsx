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

  useEffect(() => {
    api.get<ApiResponse<RecipeDetail>>(`/recipes/${id}`).then((r) => setRecipe(r.data.data)).catch(() => setRecipe(null));
  }, [id]);

  async function submit(payload: RecipeCreate) {
    await api.post("/recipe-change-requests", { type: "edit", target_recipe_id: id, payload });
    toast.success("Đã gửi đề xuất sửa — chờ admin duyệt");
    router.push("/me/change-requests");
  }

  if (!recipe) return <p className="p-8 text-[#7C6A56]">Đang tải…</p>;
  return (
    <main className="min-h-screen bg-[#FFFBF5] py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-bold text-[#1C1209] mb-4">Đề xuất sửa: {recipe.title}</h1>
        <RecipeForm initial={recipe} recipeId={id} mode="edit" submitOverride={submit} />
      </div>
    </main>
  );
}
