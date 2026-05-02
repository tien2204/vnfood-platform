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
