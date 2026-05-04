import uuid
from datetime import datetime

from pydantic import BaseModel


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
