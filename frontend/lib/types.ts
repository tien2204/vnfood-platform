export interface User {
  id: string;
  email: string;
  full_name: string;
  role: "user" | "admin";
  avatar_url: string | null;
  bio?: string | null;
}

export interface Author {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

export type AuthorDetail = Author;

export interface Ingredient {
  id: string;
  display_text: string;
  ingredient_name: string;
  quantity: string;
  order_index: number;
}

export interface Step {
  step_number: number;
  content: string;
  image_url: string | null;
  timer_seconds: number | null;
}

export interface DishRecipe {
  source: "curated" | "ai-generated" | "canonical";
  title: string;
  description?: string | null;
  ingredients: string[];
  steps: string[];
  cooking_time_minutes?: number | null;
  servings?: number | null;
  difficulty?: "easy" | "medium" | "hard" | null;
}

export interface RecipeMini {
  id: string;
  title: string;
  variant_label: string | null;
  image_url: string | null;
}

export interface RecipeCard {
  id: string;
  title: string;
  image_url: string | null;
  avg_rating: number;
  rating_count: number;
  cooking_time: number | null;
  servings: number | null;
  difficulty: "easy" | "medium" | "hard" | null;
  source: "cookpad" | "user";
  original_author_name: string | null;
  author: Author | null;
  save_count: number;
  is_saved?: boolean;
  is_canonical?: boolean;
  variant_label?: string | null;
}

export type RecipeStatus =
  | "private"
  | "pending_admin"
  | "approved"
  | "rejected";

export interface RecipeDetail extends RecipeCard {
  description: string | null;
  cookpad_url: string | null;
  keyword: string | null;
  status: RecipeStatus;
  view_count: number;
  author: AuthorDetail | null;
  ingredients: Ingredient[];
  steps: Step[];
  user_rating: number | null;
  created_at: string;
  updated_at: string;
  is_canonical: boolean;
  canonical_dish_slug: string | null;
  variant_label: string | null;
  refinement_notes: string | null;
  is_manually_reviewed: boolean;
  variants: RecipeMini[];
  video_url?: string | null;
  derived_from?: RecipeMini | null;
  derived_variants?: RecipeMini[];
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: Pagination;
}

export interface FeaturedRecipes {
  trending: RecipeCard[];
  new: RecipeCard[];
  top_rated: RecipeCard[];
}

// ── Recipe CRUD types ──────────────────────────────────────────────────────────

export interface IngredientCreate {
  display_text: string;
  ingredient_name?: string;
  quantity?: string;
  order_index: number;
}

export interface StepCreate {
  step_number: number;
  content: string;
  image_url?: string;
  timer_seconds?: number;
}

export interface RecipeCreate {
  title: string;
  description?: string;
  image_url?: string;
  cooking_time?: number;
  servings?: number;
  difficulty?: "easy" | "medium" | "hard";
  keyword?: string;
  ingredients: IngredientCreate[];
  steps: StepCreate[];
  derived_from_recipe_id?: string;
  variant_label?: string;
}

export type RecipeUpdate = Partial<RecipeCreate>;

export interface RecipeCardWithStatus extends RecipeCard {
  status: RecipeStatus;
  reject_reason: string | null;
  created_at: string;
  is_manually_reviewed?: boolean;
  claimed_by_name?: string | null;
  claimed_by?: string | null;
}

export interface ChangeRequest {
  id: string;
  type: "create" | "edit" | "delete";
  target_recipe_id: string | null;
  target_title: string | null;
  status: "pending" | "approved" | "rejected";
  reject_reason: string | null;
  requested_by_name: string | null;
  created_at: string;
  payload?: RecipeCreate | null;
}

export interface UploadResponse {
  url: string;
  filename: string;
  size_bytes: number;
}

export const RECIPE_KEYWORDS = ["Bánh", "Bún", "Cá", "Canh", "Cơm", "Gỏi", "Phở", "Thịt", "Xôi"] as const;
export type RecipeKeyword = typeof RECIPE_KEYWORDS[number];

export const RECIPE_DIFFICULTIES = [
  { value: "easy", label: "Dễ" },
  { value: "medium", label: "Trung bình" },
  { value: "hard", label: "Khó" },
] as const;

// ── Social types ───────────────────────────────────────────────────────────────

export interface CommentUser {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

export interface Comment {
  id: string;
  content: string;
  is_hidden: boolean;
  created_at: string;
  updated_at: string;
  user: CommentUser | null;
  is_mine: boolean;
}

export interface RatingOut {
  avg_rating: number;
  rating_count: number;
  user_rating: number;
}

export interface SaveResponse {
  is_saved: boolean;
  save_count: number;
}

// ── User / Profile types ───────────────────────────────────────────────────────

export interface UserStats {
  recipe_count: number;
  total_likes_received: number;
}

export interface UserMini {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
}

export interface UserProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  stats: UserStats;
  is_self: boolean;
  recent_recipes: RecipeCard[];
}

// ── AI Recognition types ───────────────────────────────────────────────────────

export interface SuggestedRecipe {
  id: string;
  title: string;
  image_url: string | null;
  avg_rating: number;
  rating_count: number;
  cooking_time: number | null;
  source: "cookpad" | "user";
}

export interface AITopPrediction {
  class: string;
  display_name: string;
  confidence: number;
}

export interface ClassMetrics {
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

export interface DishOverview {
  display_name: string;
  tasting: string;
  key_ingredients: string[];
  main_steps: string[];
  variant_examples: string[];
}

export interface AIRecognitionResult {
  predicted_class: string;
  display_name: string;
  confidence: number;
  model_used: "vnfood" | "openai";
  match_tier: "confident" | "tentative" | "openai_known" | "unknown";
  resolved_slug: string | null;
  subgroup: string | null;
  top_predictions: AITopPrediction[];
  suggested_recipes: SuggestedRecipe[];
  canonical_recipe: SuggestedRecipe | null;
  variants: SuggestedRecipe[];
  dish_recipe: DishRecipe | null;
  class_metrics: ClassMetrics | null;
  is_multi_variant?: boolean;
  dish_overview?: DishOverview | null;
}

export interface SavedRecipeOut {
  id: string;
  title: string;
  image_url: string | null;
  avg_rating: number;
  rating_count: number;
  cooking_time: number | null;
  servings: number | null;
  difficulty: "easy" | "medium" | "hard" | null;
  source: "cookpad" | "user";
  author: Author | null;
  save_count: number;
  is_saved: boolean;
  saved_at: string;
}

// ── Meal Plan types ────────────────────────────────────────────────────────────

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export interface MealPlanRecipeSnippet {
  id: string;
  title: string;
  image_url: string | null;
  cooking_time: number | null;
}

export interface MealPlanSlotItem {
  item_id: string;
  recipe: MealPlanRecipeSnippet | null;
  servings: number;
  note: string | null;
}

export type MealPlanDaySlots = Record<MealType, MealPlanSlotItem[]>;
export type MealPlanDays = Record<string, MealPlanDaySlots>;

export interface MealPlanDetail {
  id: string;
  name: string;
  week_start: string;
  days: MealPlanDays;
}

export interface MealPlanSummary {
  id: string;
  name: string;
  week_start: string;
  items_count: number;
  created_at: string;
}

export interface GroceryFromRecipe {
  recipe_id: string;
  title: string;
  quantity: string;
}

export interface GroceryItem {
  id: string;
  ingredient_name: string;
  quantity: string | null;
  is_checked: boolean;
  category: string;
  from_recipes: GroceryFromRecipe[];
}

export interface GroceryList {
  items: GroceryItem[];
  total_items: number;
  checked_count: number;
}

// ── Admin/Staff user management types ─────────────────────────────────────────

export interface AdminUserDetailLite {
  id: string;
  email: string;
  full_name: string | null;
  role: "user" | "admin";
  is_active: boolean;
  created_at: string;
}

export interface AdminUserCreate {
  email: string;
  full_name: string;
  role: "user" | "admin";
}

export interface CreatedUserResponse {
  user: AdminUserDetailLite;
  temp_password: string;
}

export interface AdminUserUpdate {
  full_name?: string;
  email?: string;
}
