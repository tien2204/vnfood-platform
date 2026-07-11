'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Clock, ChefHat, ExternalLink, Users } from 'lucide-react';
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

          {/* Desktop action bar — above related recipes */}
          <div className="hidden lg:flex items-center gap-3 pb-8 mb-8 border-b border-border">
            <button
              onClick={() => setCookingMode(true)}
              disabled={!hasSteps}
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-[var(--color-brand-primary-hover)] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-colors"
            >
              <ChefHat className="w-5 h-5" />
              Bắt đầu nấu
            </button>
            {isLoggedIn && (
              <Link
                href={`/recipes/${recipe.id}/variant`}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-primary text-primary font-semibold hover:bg-primary hover:text-white transition-colors"
              >
                Tạo biến thể
              </Link>
            )}
            {userRole === "admin" && (
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

          <RelatedRecipes recipeId={recipe.id} />
        </div>

        {/* Sticky sidebar (desktop only) */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-4">
            {/* Info card (image-2 format): 3 icon stats + save button — theme-aware */}
            <div className="rounded-xl bg-muted border border-border p-5 shadow-card">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="flex flex-col items-center gap-1">
                  <Users className="w-5 h-5 text-primary" />
                  <span className="text-[11px] leading-tight text-muted-foreground">Khẩu Phần</span>
                  <span className="text-sm font-bold text-foreground">
                    {recipe.servings ? `${currentServings} người` : '—'}
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <Clock className="w-5 h-5 text-primary" />
                  <span className="text-[11px] leading-tight text-muted-foreground">Thời gian thực hiện</span>
                  <span className="text-sm font-bold text-foreground">
                    {recipe.cooking_time ? `${recipe.cooking_time} phút` : '—'}
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <ChefHat className="w-5 h-5 text-primary" />
                  <span className="text-[11px] leading-tight text-muted-foreground">Độ khó</span>
                  <span className="text-sm font-bold text-foreground">
                    {recipe.difficulty ? difficultyLabel(recipe.difficulty) : '—'}
                  </span>
                </div>
              </div>
              <div className="mt-4">
                <SaveButton
                  recipeId={recipe.id}
                  initialSaved={recipe.is_saved ?? false}
                  initialCount={recipe.save_count}
                  variant="sidebar"
                />
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Mobile bottom action bar */}
      <div className="lg:hidden fixed bottom-16 left-0 right-0 bg-card/95 backdrop-blur-sm border-t border-border px-4 py-3 z-40 flex items-center gap-3">
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
