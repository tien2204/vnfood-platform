import type { RecipeDetail } from "@/lib/types";

export default function RecipeContent({ recipe }: { recipe: RecipeDetail }) {
  return (
    <div className="space-y-6">
      {recipe.description && (
        <p className="text-[#3a2a1a] whitespace-pre-line">{recipe.description}</p>
      )}
      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h3 className="font-bold text-[#1C1209] mb-2">Nguyên liệu</h3>
          <ul className="space-y-1 text-sm text-[#3a2a1a]">
            {recipe.ingredients.map((ing) => (
              <li key={ing.id} className="flex gap-2">
                <span className="text-[#E85D26]">•</span>
                <span>{ing.display_text}</span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="font-bold text-[#1C1209] mb-2">Các bước</h3>
          <ol className="space-y-2 text-sm text-[#3a2a1a]">
            {recipe.steps.map((s) => (
              <li key={s.step_number} className="flex gap-2">
                <span className="font-semibold text-[#E85D26]">{s.step_number}.</span>
                <span className="whitespace-pre-line">{s.content}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
