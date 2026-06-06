import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ── Input schemas ──────────────────────────────────────────────────────────────

class IngredientCreate(BaseModel):
    display_text: str = Field(..., min_length=1, max_length=500)
    ingredient_name: Optional[str] = None
    quantity: Optional[str] = None
    order_index: int = 0


class StepCreate(BaseModel):
    step_number: int = Field(..., ge=1)
    content: str = Field(..., min_length=1, max_length=5000)
    image_url: Optional[str] = None
    timer_seconds: Optional[int] = Field(None, ge=0)


VALID_KEYWORDS = ["Bánh", "Bún", "Cá", "Canh", "Cơm", "Gỏi", "Phở", "Thịt", "Xôi"]
VALID_DIFFICULTIES = ["easy", "medium", "hard"]


class RecipeCreate(BaseModel):
    title: str = Field(..., min_length=5, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    image_url: Optional[str] = None
    cooking_time: Optional[int] = Field(None, ge=1, le=600)
    servings: Optional[int] = Field(None, ge=1, le=50)
    difficulty: Optional[str] = None
    keyword: Optional[str] = None
    ingredients: list[IngredientCreate] = Field(..., min_length=1, max_length=50)
    steps: list[StepCreate] = Field(..., min_length=1, max_length=30)


class RecipeUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=5, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    image_url: Optional[str] = None
    cooking_time: Optional[int] = Field(None, ge=1, le=600)
    servings: Optional[int] = Field(None, ge=1, le=50)
    difficulty: Optional[str] = None
    keyword: Optional[str] = None
    ingredients: Optional[list[IngredientCreate]] = Field(None, min_length=1, max_length=50)
    steps: Optional[list[StepCreate]] = Field(None, min_length=1, max_length=30)


class RecipeStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(approved|rejected)$")
    reject_reason: Optional[str] = None


class UploadResponse(BaseModel):
    url: str
    filename: str
    size_bytes: int


class AuthorOut(BaseModel):
    id: uuid.UUID
    full_name: str | None
    avatar_url: str | None

    model_config = {"from_attributes": True}


class AuthorDetailOut(AuthorOut):
    follower_count: int
    is_following: bool


class IngredientOut(BaseModel):
    id: uuid.UUID
    display_text: str
    ingredient_name: str | None
    quantity: str | None
    order_index: int

    model_config = {"from_attributes": True}


class StepOut(BaseModel):
    step_number: int
    content: str
    image_url: str | None
    timer_seconds: int | None

    model_config = {"from_attributes": True}


class PaginationOut(BaseModel):
    page: int
    limit: int
    total: int
    total_pages: int


class ClassMetricsOut(BaseModel):
    """Per-class evaluation metrics from test set (Precision / Recall / F1).

    Attached to recognize response so UI can show model performance for the
    predicted class on the held-out test set. Separate from per-prediction
    `confidence` (softmax probability for THIS image).
    """
    precision: float
    recall: float
    f1: float
    support: int


class DishRecipeOut(BaseModel):
    """Curated or AI-generated cooking recipe attached to recognize response."""
    source: str  # "curated" | "ai-generated"
    title: str
    description: str | None = None
    ingredients: list[str]
    steps: list[str]
    cooking_time_minutes: int | None = None
    servings: int | None = None
    difficulty: str | None = None


class RecipeMiniOut(BaseModel):
    id: uuid.UUID
    title: str
    variant_label: str | None = None
    image_url: str | None = None

    model_config = {"from_attributes": True}


class RecipeCardOut(BaseModel):
    id: uuid.UUID
    title: str
    image_url: str | None
    avg_rating: float
    rating_count: int
    cooking_time: int | None
    servings: int | None
    difficulty: str | None
    source: str
    original_author_name: str | None = None
    author: AuthorOut | None
    save_count: int
    is_saved: bool | None = None
    is_canonical: bool = False
    variant_label: str | None = None

    model_config = {"from_attributes": True}


class RecipeCardWithStatus(RecipeCardOut):
    """RecipeCard extended with moderation fields — for owner/admin/reviewer views."""
    status: str
    reject_reason: str | None = None
    created_at: datetime
    claimed_by_name: str | None = None

    model_config = {"from_attributes": True}


class RejectBody(BaseModel):
    reason: str


class RecipeDetailOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    image_url: str | None
    cooking_time: int | None
    servings: int | None
    difficulty: str | None
    source: str
    cookpad_url: str | None
    original_author_name: str | None = None
    keyword: str | None
    status: str
    avg_rating: float
    rating_count: int
    view_count: int
    save_count: int
    author: AuthorDetailOut | None
    ingredients: list[IngredientOut]
    steps: list[StepOut]
    is_saved: bool | None = None
    user_rating: int | None = None
    created_at: datetime
    updated_at: datetime
    is_canonical: bool = False
    canonical_dish_slug: str | None = None
    variant_label: str | None = None
    refinement_notes: str | None = None
    is_manually_reviewed: bool = False
    meal_types: list[str] | None = None
    video_url: str | None = None
    variants: list[RecipeMiniOut] = []

    model_config = {"from_attributes": True}
