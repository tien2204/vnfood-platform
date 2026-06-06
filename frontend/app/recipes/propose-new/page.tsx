"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import RecipeForm from "@/components/recipes/RecipeForm";
import api from "@/lib/api";
import type { RecipeCreate } from "@/lib/types";

export default function ProposeNewPage() {
  const router = useRouter();
  async function submit(payload: RecipeCreate) {
    await api.post("/recipe-change-requests", { type: "create", payload });
    toast.success("Đã gửi đề xuất công thức hệ thống mới — chờ admin duyệt");
    router.push("/staff/proposals");
  }
  return (
    <main className="min-h-screen bg-[#FFFBF5] py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-bold text-[#1C1209] mb-4">Đề xuất công thức hệ thống mới</h1>
        <RecipeForm mode="create" submitOverride={submit} />
      </div>
    </main>
  );
}
