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

export interface AuthorDetail extends Author {
  follower_count: number;
  is_following: boolean;
}

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
  author: Author;
  save_count: number;
  is_saved?: boolean;
}

export interface RecipeDetail extends RecipeCard {
  description: string | null;
  cookpad_url: string | null;
  keyword: string | null;
  status: "pending" | "approved" | "rejected";
  view_count: number;
  author: AuthorDetail;
  ingredients: Ingredient[];
  steps: Step[];
  user_rating: number | null;
  created_at: string;
  updated_at: string;
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
}

export type RecipeUpdate = Partial<RecipeCreate>;

export interface RecipeCardWithStatus extends RecipeCard {
  status: "pending" | "approved" | "rejected";
  reject_reason: string | null;
  created_at: string;
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
  follower_count: number;
  following_count: number;
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
  is_following: boolean | null;
  is_self: boolean;
  recent_recipes: RecipeCard[];
}

export interface FollowerOut {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_following: boolean | null;
}

export interface FollowResponse {
  is_following: boolean;
  follower_count: number;
}

export interface FeedItem {
  type: "recipe";
  recipe: RecipeCard;
  author: UserMini;
  posted_at: string;
}

export interface FeedResponse {
  success: boolean;
  data: FeedItem[];
  pagination: Pagination;
  is_discover_mode: boolean;
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

export interface AIRecognitionResult {
  predicted_class: string;
  display_name: string;
  confidence: number;
  model_used: "vnfood" | "openai";
  subgroup: string | null;
  top_predictions: AITopPrediction[];
  suggested_recipes: SuggestedRecipe[];
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

// ── Ingredient Suggest types ───────────────────────────────────────────────────

export interface IngredientItem {
  name: string;
  usage_count: number;
}

export interface RecipeMatchResult {
  recipe: {
    id: string;
    title: string;
    image_url: string | null;
    avg_rating: number;
    rating_count: number;
    cooking_time: number | null;
    source: "cookpad" | "user";
  };
  match_score: number;
  matched_ingredients: string[];
  missing_ingredients: string[];
}

export interface AISuggestion {
  name: string;
  description: string;
  key_ingredients: string[];
  additional_needed: string[];
}

export interface IngredientSuggestResult {
  match_mode: "any" | "all" | "most";
  selected_ingredients: string[];
  db_results: RecipeMatchResult[];
  total_db_results: number;
  ai_suggestions: AISuggestion[];
  ai_used: boolean;
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
  from_recipes: GroceryFromRecipe[];
}

export interface GroceryList {
  items: GroceryItem[];
  total_items: number;
  checked_count: number;
}
