"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ChevronLeft, ChevronRight, Check, Timer, GripVertical } from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";
import ImageUploader from "@/components/common/ImageUploader";
import api from "@/lib/api";
import type {
  RecipeCreate,
  IngredientCreate,
  StepCreate,
  RecipeDetail,
} from "@/lib/types";
import { RECIPE_KEYWORDS, RECIPE_DIFFICULTIES } from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  initial?: Partial<RecipeDetail>;
  recipeId?: string;
  mode: "create" | "edit";
  submitOverride?: (payload: RecipeCreate) => Promise<void>;
}

interface BasicInfo {
  title: string;
  description: string;
  image_url: string;
  cooking_time: string;
  servings: string;
  difficulty: string;
  keyword: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyIngredient(idx: number): IngredientCreate {
  return { display_text: "", ingredient_name: "", quantity: "", order_index: idx };
}

function emptyStep(num: number): StepCreate {
  return { step_number: num, content: "", image_url: "", timer_seconds: undefined };
}

function previewImageSrc(url: string): string {
  if (!url) return "";
  return url.startsWith("http") ? url : `${process.env.NEXT_PUBLIC_API_URL}${url}`;
}

// ── Step indicators ───────────────────────────────────────────────────────────

const STEPS = ["Thông tin", "Nguyên liệu", "Các bước", "Xem trước"] as const;

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {STEPS.map((label, i) => (
        <div key={i} className="flex items-center gap-2 flex-1 last:flex-none">
          <div className={`
            w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0
            ${i < current ? "bg-[#E85D26] text-white" : i === current ? "bg-[#E85D26] text-white ring-2 ring-[#E85D26]/30" : "bg-[#F7F0E8] text-[#7C6A56]"}
          `}>
            {i < current ? <Check className="w-4 h-4" /> : i + 1}
          </div>
          <span className={`text-sm hidden sm:block ${i === current ? "text-[#1C1209] font-medium" : "text-[#7C6A56]"}`}>
            {label}
          </span>
          {i < STEPS.length - 1 && (
            <div className={`flex-1 h-px mx-1 ${i < current ? "bg-[#E85D26]" : "bg-[#E8DDD4]"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RecipeForm({ initial, recipeId, mode, submitOverride }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Basic info state
  const [basic, setBasic] = useState<BasicInfo>({
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    image_url: initial?.image_url ?? "",
    cooking_time: initial?.cooking_time?.toString() ?? "",
    servings: initial?.servings?.toString() ?? "",
    difficulty: initial?.difficulty ?? "",
    keyword: initial?.keyword ?? "",
  });

  // Ingredients state
  const [ingredients, setIngredients] = useState<IngredientCreate[]>(
    initial?.ingredients?.map((ing, i) => ({
      display_text: ing.display_text,
      ingredient_name: ing.ingredient_name ?? "",
      quantity: ing.quantity ?? "",
      order_index: i,
    })) ?? [emptyIngredient(0)]
  );

  // Steps state
  const [steps, setSteps] = useState<StepCreate[]>(
    initial?.steps?.map((s) => ({
      step_number: s.step_number,
      content: s.content,
      image_url: s.image_url ?? "",
      timer_seconds: s.timer_seconds ?? undefined,
    })) ?? [emptyStep(1)]
  );

  // ── Validation ──────────────────────────────────────────────────────────────

  const [errors, setErrors] = useState<Record<string, string>>({});

  function validateBasic(): boolean {
    const e: Record<string, string> = {};
    if (basic.title.trim().length < 5) e.title = "Tiêu đề tối thiểu 5 ký tự";
    if (basic.title.trim().length > 200) e.title = "Tiêu đề tối đa 200 ký tự";
    if (basic.description && basic.description.length > 2000) e.description = "Mô tả tối đa 2000 ký tự";
    if (basic.cooking_time) {
      const t = parseInt(basic.cooking_time);
      if (isNaN(t) || t < 1 || t > 600) e.cooking_time = "Thời gian 1–600 phút";
    }
    if (basic.servings) {
      const s = parseInt(basic.servings);
      if (isNaN(s) || s < 1 || s > 50) e.servings = "Số người 1–50";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function validateIngredients(): boolean {
    const e: Record<string, string> = {};
    if (ingredients.length === 0) e.ingredients = "Cần ít nhất 1 nguyên liệu";
    if (ingredients.some((ing) => !ing.display_text.trim())) {
      e.ingredients = "Tất cả nguyên liệu cần có tên";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function validateSteps(): boolean {
    const e: Record<string, string> = {};
    if (steps.length === 0) e.steps = "Cần ít nhất 1 bước";
    if (steps.some((s) => !s.content.trim())) {
      e.steps = "Tất cả bước cần có nội dung";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ── Navigation ──────────────────────────────────────────────────────────────

  function goNext() {
    if (step === 0 && !validateBasic()) return;
    if (step === 1 && !validateIngredients()) return;
    if (step === 2 && !validateSteps()) return;
    setErrors({});
    setStep((s) => s + 1);
  }

  function goBack() {
    setErrors({});
    setStep((s) => s - 1);
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const payload: RecipeCreate = {
        title: basic.title.trim(),
        description: basic.description.trim() || undefined,
        image_url: basic.image_url || undefined,
        cooking_time: basic.cooking_time ? parseInt(basic.cooking_time) : undefined,
        servings: basic.servings ? parseInt(basic.servings) : undefined,
        difficulty: (basic.difficulty as "easy" | "medium" | "hard") || undefined,
        keyword: basic.keyword || undefined,
        ingredients: ingredients.map((ing, i) => ({
          display_text: ing.display_text.trim(),
          ingredient_name: ing.ingredient_name?.trim() || undefined,
          quantity: ing.quantity?.trim() || undefined,
          order_index: i,
        })),
        steps: steps.map((s, i) => ({
          step_number: i + 1,
          content: s.content.trim(),
          image_url: s.image_url?.trim() || undefined,
          timer_seconds: s.timer_seconds ?? undefined,
        })),
      };

      if (submitOverride) {
        await submitOverride(payload);
        return;
      }

      if (mode === "create") {
        await api.post("/recipes", payload);
        toast.success("Công thức đã được tạo, đang chờ Admin duyệt");
        router.push("/me/recipes");
      } else {
        const wasApproved = initial?.status === "approved";
        await api.put(`/recipes/${recipeId}`, payload);
        if (wasApproved) {
          toast.success("Đã cập nhật — công thức đang chờ duyệt lại");
        } else {
          toast.success("Đã cập nhật công thức");
        }
        router.push("/me/recipes");
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Đã có lỗi xảy ra";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Ingredient helpers ──────────────────────────────────────────────────────

  function addIngredient() {
    if (ingredients.length >= 50) return;
    setIngredients((prev) => [...prev, emptyIngredient(prev.length)]);
  }

  function removeIngredient(idx: number) {
    setIngredients((prev) => prev.filter((_, i) => i !== idx).map((ing, i) => ({ ...ing, order_index: i })));
  }

  function updateIngredient(idx: number, field: keyof IngredientCreate, value: string) {
    setIngredients((prev) => prev.map((ing, i) => i === idx ? { ...ing, [field]: value } : ing));
  }

  // ── Step helpers ────────────────────────────────────────────────────────────

  function addStep() {
    if (steps.length >= 30) return;
    setSteps((prev) => [...prev, emptyStep(prev.length + 1)]);
  }

  function removeStep(idx: number) {
    setSteps((prev) => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, step_number: i + 1 })));
  }

  function updateStep(idx: number, field: keyof StepCreate, value: string | number | undefined) {
    setSteps((prev) => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  }

  // ── Render steps ────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto">
      <StepIndicator current={step} />

      {/* ── Step 0: Basic Info ── */}
      {step === 0 && (
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-[#1C1209] mb-1.5">
              Tiêu đề <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={basic.title}
              onChange={(e) => setBasic({ ...basic, title: e.target.value })}
              placeholder="Ví dụ: Bánh xèo miền Tây giòn rụm..."
              maxLength={200}
              className="w-full px-4 py-2.5 rounded-xl border border-[#E8DDD4] bg-white focus:outline-none focus:ring-2 focus:ring-[#E85D26]/30 focus:border-[#E85D26] text-[#1C1209] placeholder:text-[#B5A395] text-sm"
            />
            {errors.title && <p className="mt-1 text-xs text-red-500">{errors.title}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1C1209] mb-1.5">Mô tả</label>
            <textarea
              value={basic.description}
              onChange={(e) => setBasic({ ...basic, description: e.target.value })}
              placeholder="Giới thiệu ngắn về món ăn..."
              maxLength={2000}
              rows={3}
              className="w-full px-4 py-2.5 rounded-xl border border-[#E8DDD4] bg-white focus:outline-none focus:ring-2 focus:ring-[#E85D26]/30 focus:border-[#E85D26] text-[#1C1209] placeholder:text-[#B5A395] text-sm resize-none"
            />
            {errors.description && <p className="mt-1 text-xs text-red-500">{errors.description}</p>}
          </div>

          <ImageUploader
            value={basic.image_url}
            onChange={(url) => setBasic({ ...basic, image_url: url })}
            category="recipe"
            label="Ảnh bìa công thức"
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1C1209] mb-1.5">Thời gian (phút)</label>
              <input
                type="number"
                value={basic.cooking_time}
                onChange={(e) => setBasic({ ...basic, cooking_time: e.target.value })}
                min={1} max={600}
                placeholder="45"
                className="w-full px-4 py-2.5 rounded-xl border border-[#E8DDD4] bg-white focus:outline-none focus:ring-2 focus:ring-[#E85D26]/30 focus:border-[#E85D26] text-[#1C1209] placeholder:text-[#B5A395] text-sm"
              />
              {errors.cooking_time && <p className="mt-1 text-xs text-red-500">{errors.cooking_time}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1C1209] mb-1.5">Số khẩu phần</label>
              <input
                type="number"
                value={basic.servings}
                onChange={(e) => setBasic({ ...basic, servings: e.target.value })}
                min={1} max={50}
                placeholder="4"
                className="w-full px-4 py-2.5 rounded-xl border border-[#E8DDD4] bg-white focus:outline-none focus:ring-2 focus:ring-[#E85D26]/30 focus:border-[#E85D26] text-[#1C1209] placeholder:text-[#B5A395] text-sm"
              />
              {errors.servings && <p className="mt-1 text-xs text-red-500">{errors.servings}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1C1209] mb-1.5">Độ khó</label>
              <select
                value={basic.difficulty}
                onChange={(e) => setBasic({ ...basic, difficulty: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-[#E8DDD4] bg-white focus:outline-none focus:ring-2 focus:ring-[#E85D26]/30 focus:border-[#E85D26] text-[#1C1209] text-sm appearance-none"
              >
                <option value="">-- Chọn độ khó --</option>
                {RECIPE_DIFFICULTIES.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1C1209] mb-1.5">Nhóm món</label>
              <select
                value={basic.keyword}
                onChange={(e) => setBasic({ ...basic, keyword: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-[#E8DDD4] bg-white focus:outline-none focus:ring-2 focus:ring-[#E85D26]/30 focus:border-[#E85D26] text-[#1C1209] text-sm appearance-none"
              >
                <option value="">-- Chọn nhóm --</option>
                {RECIPE_KEYWORDS.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 1: Ingredients ── */}
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-[#7C6A56]">
            Thêm nguyên liệu cần thiết ({ingredients.length}/50)
          </p>

          {errors.ingredients && (
            <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {errors.ingredients}
            </p>
          )}

          <div className="space-y-2">
            {ingredients.map((ing, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <div className="mt-2.5 text-[#B5A395] cursor-move">
                  <GripVertical className="w-4 h-4" />
                </div>
                <div className="flex-1 grid grid-cols-5 gap-2">
                  <div className="col-span-3">
                    <input
                      type="text"
                      value={ing.display_text}
                      onChange={(e) => updateIngredient(idx, "display_text", e.target.value)}
                      placeholder="200g bột gạo..."
                      className="w-full px-3 py-2 rounded-lg border border-[#E8DDD4] bg-white focus:outline-none focus:ring-2 focus:ring-[#E85D26]/30 focus:border-[#E85D26] text-sm text-[#1C1209] placeholder:text-[#B5A395]"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="text"
                      value={ing.quantity ?? ""}
                      onChange={(e) => updateIngredient(idx, "quantity", e.target.value)}
                      placeholder="Số lượng"
                      className="w-full px-3 py-2 rounded-lg border border-[#E8DDD4] bg-white focus:outline-none focus:ring-2 focus:ring-[#E85D26]/30 focus:border-[#E85D26] text-sm text-[#1C1209] placeholder:text-[#B5A395]"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeIngredient(idx)}
                  disabled={ingredients.length === 1}
                  className="mt-1.5 p-1.5 rounded-lg text-[#7C6A56] hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {ingredients.length < 50 && (
            <button
              type="button"
              onClick={addIngredient}
              className="flex items-center gap-2 text-sm text-[#E85D26] hover:text-[#D44E1E] font-medium"
            >
              <Plus className="w-4 h-4" /> Thêm nguyên liệu
            </button>
          )}
        </div>
      )}

      {/* ── Step 2: Steps ── */}
      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-[#7C6A56]">
            Mô tả từng bước thực hiện ({steps.length}/30)
          </p>

          {errors.steps && (
            <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {errors.steps}
            </p>
          )}

          <div className="space-y-4">
            {steps.map((s, idx) => (
              <div key={idx} className="p-4 bg-white border border-[#E8DDD4] rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 rounded-full bg-[#E85D26] text-white flex items-center justify-center text-sm font-semibold">
                    {idx + 1}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeStep(idx)}
                    disabled={steps.length === 1}
                    className="p-1.5 rounded-lg text-[#7C6A56] hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <textarea
                  value={s.content}
                  onChange={(e) => updateStep(idx, "content", e.target.value)}
                  placeholder={`Mô tả bước ${idx + 1}...`}
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl border border-[#E8DDD4] bg-[#FFFBF5] focus:outline-none focus:ring-2 focus:ring-[#E85D26]/30 focus:border-[#E85D26] text-sm text-[#1C1209] placeholder:text-[#B5A395] resize-none"
                />

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 flex-1">
                    <Timer className="w-4 h-4 text-[#7C6A56] shrink-0" />
                    <input
                      type="number"
                      value={s.timer_seconds ?? ""}
                      onChange={(e) => updateStep(idx, "timer_seconds", e.target.value ? parseInt(e.target.value) : undefined)}
                      min={0}
                      placeholder="Timer (giây)"
                      className="w-full px-3 py-1.5 rounded-lg border border-[#E8DDD4] bg-white focus:outline-none focus:ring-2 focus:ring-[#E85D26]/30 focus:border-[#E85D26] text-sm text-[#1C1209] placeholder:text-[#B5A395]"
                    />
                  </div>
                </div>

                <ImageUploader
                  value={s.image_url}
                  onChange={(url) => updateStep(idx, "image_url", url)}
                  category="step"
                  label={`Ảnh bước ${idx + 1} (tùy chọn)`}
                  className="!aspect-auto"
                />
              </div>
            ))}
          </div>

          {steps.length < 30 && (
            <button
              type="button"
              onClick={addStep}
              className="flex items-center gap-2 text-sm text-[#E85D26] hover:text-[#D44E1E] font-medium"
            >
              <Plus className="w-4 h-4" /> Thêm bước
            </button>
          )}
        </div>
      )}

      {/* ── Step 3: Preview ── */}
      {step === 3 && (
        <div className="space-y-5">
          <div className="bg-white border border-[#E8DDD4] rounded-2xl overflow-hidden">
            {basic.image_url && (
              <div className="relative aspect-video w-full bg-[#F7F0E8]">
                <Image
                  src={previewImageSrc(basic.image_url)}
                  alt={basic.title}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
            )}
            <div className="p-5 space-y-4">
              <h2 className="text-xl font-bold text-[#1C1209] font-heading">{basic.title}</h2>
              {basic.description && (
                <p className="text-sm text-[#7C6A56] leading-relaxed">{basic.description}</p>
              )}
              <div className="flex flex-wrap gap-3 text-sm text-[#7C6A56]">
                {basic.cooking_time && <span>⏱ {basic.cooking_time} phút</span>}
                {basic.servings && <span>👤 {basic.servings} người</span>}
                {basic.difficulty && <span>📊 {RECIPE_DIFFICULTIES.find(d => d.value === basic.difficulty)?.label}</span>}
                {basic.keyword && <span>🍽 {basic.keyword}</span>}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-[#1C1209] mb-2">Nguyên liệu ({ingredients.length})</h3>
                <ul className="space-y-1">
                  {ingredients.map((ing, i) => (
                    <li key={i} className="text-sm text-[#7C6A56] flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#E85D26] mt-1.5 shrink-0" />
                      {ing.display_text}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-[#1C1209] mb-2">Các bước ({steps.length})</h3>
                <ol className="space-y-2">
                  {steps.map((s, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <span className="w-6 h-6 rounded-full bg-[#F7F0E8] text-[#E85D26] font-semibold flex items-center justify-center shrink-0 text-xs">
                        {i + 1}
                      </span>
                      <span className="text-[#1C1209] leading-relaxed">{s.content}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>

          {mode === "edit" && initial?.status === "approved" && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-yellow-50 border border-yellow-200 text-sm text-yellow-700">
              <span className="shrink-0">⚠️</span>
              Công thức đang được duyệt. Sau khi lưu, công thức sẽ chuyển về trạng thái chờ duyệt lại.
            </div>
          )}
        </div>
      )}

      {/* ── Navigation buttons ── */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t border-[#E8DDD4]">
        <button
          type="button"
          onClick={goBack}
          disabled={step === 0}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#E8DDD4] text-sm font-medium text-[#7C6A56] hover:border-[#E85D26]/50 hover:text-[#E85D26] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" /> Quay lại
        </button>

        {step < 3 ? (
          <button
            type="button"
            onClick={goNext}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#E85D26] text-white text-sm font-medium hover:bg-[#D44E1E] transition-colors"
          >
            Tiếp theo <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#E85D26] text-white text-sm font-medium hover:bg-[#D44E1E] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                Đang lưu...
              </>
            ) : (
              <>{mode === "create" ? "Đăng công thức" : "Lưu thay đổi"}</>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
