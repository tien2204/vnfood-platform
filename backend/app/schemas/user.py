import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.schemas.recipe import RecipeCardOut


class UserStats(BaseModel):
    recipe_count: int
    follower_count: int
    following_count: int
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
    is_following: bool | None = None
    is_self: bool = False
    recent_recipes: list[RecipeCardOut]

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=1, max_length=100)
    bio: Optional[str] = Field(None, max_length=500)
    avatar_url: Optional[str] = None


class FollowResponse(BaseModel):
    is_following: bool
    follower_count: int


class FollowerOut(BaseModel):
    id: uuid.UUID
    full_name: str | None
    avatar_url: str | None
    bio: str | None = None
    is_following: bool | None = None

    model_config = {"from_attributes": True}


class FeedItem(BaseModel):
    type: str = "recipe"
    recipe: RecipeCardOut
    author: UserMiniOut
    posted_at: datetime
