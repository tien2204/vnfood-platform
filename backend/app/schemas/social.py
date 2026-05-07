import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class CommentCreate(BaseModel):
    content: str = Field(..., min_length=2, max_length=1000)


class CommentUpdate(BaseModel):
    content: str = Field(..., min_length=2, max_length=1000)


class CommentUserOut(BaseModel):
    id: uuid.UUID
    full_name: str | None
    avatar_url: str | None

    model_config = {"from_attributes": True}


class CommentOut(BaseModel):
    id: uuid.UUID
    content: str
    is_hidden: bool
    created_at: datetime
    updated_at: datetime
    user: CommentUserOut | None
    is_mine: bool = False

    model_config = {"from_attributes": True}


class RatingCreate(BaseModel):
    score: int = Field(..., ge=1, le=5)


class RatingOut(BaseModel):
    avg_rating: float
    rating_count: int
    user_rating: int


class SaveResponse(BaseModel):
    is_saved: bool
    save_count: int


class SavedRecipeOut(BaseModel):
    id: uuid.UUID
    title: str
    image_url: str | None
    avg_rating: float
    rating_count: int
    cooking_time: int | None
    servings: int | None
    difficulty: str | None
    source: str
    author: CommentUserOut | None
    save_count: int
    is_saved: bool = True
    saved_at: datetime

    model_config = {"from_attributes": True}
