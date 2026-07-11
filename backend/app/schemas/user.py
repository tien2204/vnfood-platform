import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.schemas.recipe import RecipeCardOut


class UserStats(BaseModel):
    recipe_count: int
    total_likes_received: int


class UserMiniOut(BaseModel):
    id: uuid.UUID
    full_name: str | None
    avatar_url: str | None
    bio: str | None = None

    model_config = {"from_attributes": True}


class UserProfileOut(BaseModel):
    id: uuid.UUID
    full_name: str | None
    avatar_url: str | None
    bio: str | None
    created_at: datetime
    stats: UserStats
    is_self: bool = False
    recent_recipes: list[RecipeCardOut]

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=1, max_length=100)
    bio: Optional[str] = Field(None, max_length=500)
    avatar_url: Optional[str] = None
