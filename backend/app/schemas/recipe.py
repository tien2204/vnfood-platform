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
    author: AuthorOut | None
    save_count: int
    is_saved: bool | None = None

    model_config = {"from_attributes": True}


class RecipeCardWithStatus(RecipeCardOut):
    """RecipeCard extended with moderation fields — for owner/admin views."""
    status: str
    reject_reason: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


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

    model_config = {"from_attributes": True}
