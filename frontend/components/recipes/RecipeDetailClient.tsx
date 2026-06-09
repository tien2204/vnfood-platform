'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Clock, ChefHat, ExternalLink } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SaveButton from './SaveButton';
import CommentSection from './CommentSection';
import { ServingsScaler } from './ServingsScaler';
import { CookingMode } from './CookingMode';
import { scaleQuantity } from '@/lib/scaleRecipe';
import { toast } from 'sonner';
import api from '@/lib/api';
import type { RecipeDetail } from '@/lib/types';
import RelatedRecipes from "./RelatedRecipes";

const DIFFICULTY_LABEL = {
  easy: 'Dễ',
  medium: 'Trung bình',
  hard: 'Khó',
} as const;

function difficultyLabel(d: string): string {
  return DIFFICULTY_LABEL[d as keyof typeof DIFFICULTY_LABEL] ?? d;
}

const TAB_TRIGGER =
  'px-4 py-3 text-sm font-medium rounded-lg -mb-px border-b-2 border-transparent ' +
  'text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-primary ' +
  'data-[state=active]:bg-transparent data-[state=active]:shadow-none ' +
  'hover:text-foreground transition-colors';

interface Props {
  recipe: RecipeDetail;
  isLoggedIn: boolean;
  currentUserId?: string;
  isAdmin: boolean;
  userRole?: string;
}

export function RecipeDetailClient({ recipe, isLoggedIn, currentUserId, isAdmin, userRole }: Props) {
  const originalServings = recipe.servings ?? 2;
  const [cookingMode, setCookingMode] = useState(false);
  const [currentServings, setCurrentServings] = useState(originalServings);

  const factor = currentServings / originalServings;
  const hasSteps = (recipe.steps?.length ?? 0) > 0;
  const TIP_RE = /^\s*mách nhỏ\s*[:.]/i;
  const tipSteps = recipe.steps.filter((s) => TIP_RE.test(s.content));
  const normalSteps = recipe.steps.filter((s) => !TIP_RE.test(s.content));

  return (
    <>
      {/* 2-col layout: tabs + sidebar */}
      <div className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-8">
        {/* Main content */}
        <div className="min-w-0">
          <Tabs defaultValue="ingredients" className="mb-10">
            <TabsList className="w-full justify-start bg-transparent p-0 h-auto rounded-lg border-b border-border gap-0 mb-6">
              <TabsTrigger value="ingredients" className={TAB_TRIGGER}>
                Nguyên liệu ({recipe.ingredients.length})
              </TabsTrigger>
              <TabsTrigger value="steps" className={TAB_TRIGGER}>
                Các bước ({normalSteps.length})
              </TabsTrigger>
              <TabsTrigger value="comments" className={TAB_TRIGGER}>
                Bình luận
              </TabsTrigger>
            </TabsList>

            {/* ── Ingredients ── */}
            <TabsContent value="ingredients">
              {recipe.ingredients.length > 0 ? (
                <>
                  <ServingsScaler
                    originalServings={originalServings}
                    onChange={setCurrentServings}
                  />
                  <div className="rounded-xl bg-[var(--color-brand-pink-bg)] border border-[var(--color-brand-pink)] p-5">
                    <ul>
                      {recipe.ingredients.map((ing, idx) => {
                        const raw = ing.display_text || `${ing.quantity} ${ing.ingredient_name}`;
                        const scaled = scaleQuantity(raw, factor);
                        const changed = factor !== 1 && scaled !== raw;
                        return (
                          <li
                            key={ing.id ?? idx}
                            className="flex justify-between gap-3 border-b border-border py-2 last:border-0"
                          >
                            <span
                              className={
                                changed
                                  ? 'text-primary font-medium leading-relaxed'
                                  : 'text-foreground leading-relaxed'
                              }
                            >
                              {scaled}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground py-4">Chưa có thông tin nguyên liệu.</p>
              )}
            </TabsContent>

            {/* ── Steps ── */}
            <TabsContent value="steps">
              {normalSteps.length > 0 ? (
                <div className="space-y-5 pb-4">
                  {normalSteps.map((step, idx) => (
                    <div key={step.step_number} className="flex gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-white font-bold text-sm">
                        {idx + 1}
                      </div>
                      <div className="flex-1 pt-0.5">
                        <p className="text-foreground leading-relaxed">{step.content}</p>
                        {(step.timer_seconds ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-1 mt-2 text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                            <Clock className="w-3 h-3" />
                            {Math.round(step.timer_seconds! / 60)} phút
                          </span>
                        )}
                        {step.image_url && (
                          <div className="relative aspect-video rounded-xl overflow-hidden mt-3 bg-muted max-w-md">
                            <Image
                              src={
                                step.image_url.startsWith('http')
                                  ? step.image_url
                                  : `${process.env.NEXT_PUBLIC_UPLOAD_URL}/${step.image_url}`
                              }
                              alt={`Bước ${idx + 1}`}
                              fill
                              className="object-cover"
                              unoptimized
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground py-4">Chưa có thông tin các bước.</p>
              )}
              {tipSteps.length > 0 && (
                <div className="mt-6 rounded-xl border border-border bg-muted p-4">
                  <h3 className="font-semibold text-foreground mb-2">💡 Mách nhỏ</h3>
                  <div className="space-y-2">
                    {tipSteps.map((s, i) => (
                      <p key={i} className="text-foreground leading-relaxed">
                        {s.content.replace(TIP_RE, "").trim()}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* ── Comments ── */}
            <TabsContent value="comments">
              <CommentSection
                recipeId={recipe.id}
                isLoggedIn={isLoggedIn}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
              />
            </TabsContent>
          </Tabs>

          <RelatedRecipes recipeId={recipe.id} />

          {/* Desktop action bar */}
          <div className="hidden lg:flex items-center gap-3 pt-6 border-t border-border">
            <button
              onClick={() => setCookingMode(true)}
              disabled={!hasSteps}
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-[var(--color-brand-primary-hover)] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-colors"
            >
              <ChefHat className="w-5 h-5" />
              Bắt đầu nấu
            </button>
            <SaveButton
              recipeId={recipe.id}
              initialSaved={recipe.is_saved ?? false}
              initialCount={recipe.save_count}
              variant="action"
            />
            {(userRole === "collaborator" || userRole === "admin") && (
              <div className="flex gap-2">
                <Link href={`/recipes/${recipe.id}/propose-edit`} className="px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-primary">Đề xuất sửa</Link>
                <button
                  onClick={async () => {
                    if (!confirm("Đề xuất xóa công thức hệ thống này?")) return;
                    try {
                      await api.post("/recipe-change-requests", { type: "delete", target_recipe_id: recipe.id });
                      toast.success("Đã gửi đề xuất xóa — chờ admin duyệt");
                    } catch {
                      toast.error("Không thể gửi đề xuất xóa");
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg border border-border text-sm text-red-500 hover:border-red-300"
                >Đề xuất xóa</button>
              </div>
            )}
            {recipe.source === 'cookpad' && recipe.cookpad_url && (
              <a
                href={recipe.cookpad_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-border hover:border-primary hover:text-primary text-muted-foreground transition-colors"
              >
                <ExternalLink className="w-5 h-5" />
                <span>Cookpad</span>
              </a>
            )}
          </div>
        </div>

        {/* Sticky sidebar (desktop only) */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-4">
            <div className="bg-muted rounded-xl p-5 border border-border shadow-card">
              <h3 className="text-base font-extrabold text-foreground mb-3">
                Thông tin <strong className="text-primary">món ăn</strong>
              </h3>
              <dl className="space-y-2 text-sm">
                {recipe.cooking_time && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Thời gian</dt>
                    <dd className="font-medium text-foreground">{recipe.cooking_time} phút</dd>
                  </div>
                )}
                {recipe.servings && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Khẩu phần</dt>
                    <dd className="font-medium text-foreground">{currentServings} người</dd>
                  </div>
                )}
                {recipe.difficulty && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Độ khó</dt>
                    <dd className="font-medium text-foreground">{difficultyLabel(recipe.difficulty)}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Nguồn</dt>
                  <dd className="font-medium text-foreground">
                    {recipe.source === 'cookpad' ? 'Cookpad' : 'Cộng đồng'}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="bg-white rounded-xl p-5 border border-border shadow-card">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Hành động nhanh</p>
              <div className="space-y-2.5">
                <button className="w-full text-left text-sm text-foreground hover:text-primary transition-colors">
                  📋 Copy danh sách nguyên liệu
                </button>
                <button className="w-full text-left text-sm text-foreground hover:text-primary transition-colors">
                  🖨 In công thức
                </button>
                <button className="w-full text-left text-sm text-foreground hover:text-primary transition-colors">
                  📤 Chia sẻ
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Mobile bottom action bar */}
      <div className="lg:hidden fixed bottom-16 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-border px-4 py-3 z-40 flex items-center gap-3">
        <button
          onClick={() => setCookingMode(true)}
          disabled={!hasSteps}
          className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 bg-primary hover:bg-[var(--color-brand-primary-hover)] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-colors text-sm"
        >
          <ChefHat className="w-4 h-4" />
          Bắt đầu nấu
        </button>
        <SaveButton
          recipeId={recipe.id}
          initialSaved={recipe.is_saved ?? false}
          initialCount={recipe.save_count}
          variant="action"
        />
        {recipe.source === 'cookpad' && recipe.cookpad_url && (
          <a
            href={recipe.cookpad_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-3 py-2.5 rounded-xl border border-border hover:border-primary hover:text-primary text-muted-foreground transition-colors"
          >
            <ExternalLink className="w-5 h-5" />
          </a>
        )}
      </div>

      {/* Cooking Mode overlay */}
      {cookingMode && (
        <CookingMode recipe={recipe} onClose={() => setCookingMode(false)} />
      )}
    </>
  );
}
