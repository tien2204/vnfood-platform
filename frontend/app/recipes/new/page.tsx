import RecipeForm from "@/components/recipes/RecipeForm";

export default function NewRecipePage() {
  return (
    <main className="min-h-screen bg-[#FFFBF5] py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#1C1209] font-heading">Đăng công thức mới</h1>
          <p className="text-sm text-[#7C6A56] mt-1">
            Công thức sẽ được Admin duyệt trước khi hiển thị công khai.
          </p>
        </div>
        <RecipeForm mode="create" />
      </div>
    </main>
  );
}
