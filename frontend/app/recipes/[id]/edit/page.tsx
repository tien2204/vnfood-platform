import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import RecipeForm from "@/components/recipes/RecipeForm";
import type { ApiResponse, RecipeDetail } from "@/lib/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getRecipeForEdit(id: string, token: string): Promise<RecipeDetail | null> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/recipes/${id}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    const json: ApiResponse<RecipeDetail> = await res.json();
    return json.success ? json.data : null;
  } catch {
    return null;
  }
}

export default async function EditRecipePage({ params }: PageProps) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;

  if (!token) redirect(`/auth/login?next=/recipes/${id}/edit`);

  const recipe = await getRecipeForEdit(id, token);
  if (!recipe) notFound();

  if (recipe.source === "cookpad") {
    redirect(`/recipes/${id}`);
  }

  return (
    <main className="min-h-screen bg-[#FFFBF5] py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#1C1209] font-heading">Chỉnh sửa công thức</h1>
          <p className="text-sm text-[#7C6A56] mt-1">
            {recipe.status === "approved"
              ? "Sau khi lưu, công thức sẽ chờ Admin duyệt lại."
              : "Cập nhật và gửi lại để Admin duyệt."}
          </p>
        </div>
        <RecipeForm mode="edit" initial={recipe} recipeId={id} />
      </div>
    </main>
  );
}
