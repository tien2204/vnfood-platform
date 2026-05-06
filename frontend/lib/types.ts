export interface User {
  id: string;
  email: string;
  full_name: string;
  role: "user" | "admin";
  avatar_url: string | null;
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
