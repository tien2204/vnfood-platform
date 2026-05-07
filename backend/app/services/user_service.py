import uuid
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.recipe import Recipe
from app.models.social import Follow
from app.models.user import User
from app.schemas.recipe import AuthorOut, RecipeCardOut
from app.schemas.user import UserProfileOut, UserStats, UserUpdate


async def get_user_profile(
    db: AsyncSession,
    user_id: uuid.UUID,
    current_user_id: Optional[uuid.UUID] = None,
) -> UserProfileOut:
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Người dùng không tồn tại")

    recipe_count = (await db.execute(
        select(func.count(Recipe.id)).where(Recipe.author_id == user_id, Recipe.status == "approved")
    )).scalar_one()

    follower_count = (await db.execute(
        select(func.count(Follow.id)).where(Follow.following_id == user_id)
    )).scalar_one()

    following_count = (await db.execute(
        select(func.count(Follow.id)).where(Follow.follower_id == user_id)
    )).scalar_one()

    likes_result = await db.execute(
        select(func.sum(Recipe.rating_count))
        .where(Recipe.author_id == user_id, Recipe.status == "approved")
    )
    total_likes = likes_result.scalar_one() or 0

    is_following: Optional[bool] = None
    if current_user_id and current_user_id != user_id:
        existing = (await db.execute(
            select(Follow.id).where(
                Follow.follower_id == current_user_id,
                Follow.following_id == user_id,
            )
        )).scalar_one_or_none()
        is_following = existing is not None

    is_self = current_user_id == user_id

    recent_rows = (await db.execute(
        select(Recipe)
        .where(Recipe.author_id == user_id, Recipe.status == "approved")
        .order_by(Recipe.created_at.desc())
        .limit(6)
    )).scalars().all()

    recent_recipes = [
        RecipeCardOut(
            id=r.id,
            title=r.title,
            image_url=r.image_url,
            avg_rating=r.avg_rating,
            rating_count=r.rating_count,
            cooking_time=r.cooking_time,
            servings=r.servings,
            difficulty=r.difficulty,
            source=r.source,
            author=AuthorOut(id=user.id, full_name=user.full_name, avatar_url=user.avatar_url),
            save_count=r.save_count,
            is_saved=None,
        )
        for r in recent_rows
    ]

    return UserProfileOut(
        id=user.id,
        full_name=user.full_name,
        avatar_url=user.avatar_url,
        bio=user.bio,
        created_at=user.created_at,
        stats=UserStats(
            recipe_count=recipe_count,
            follower_count=follower_count,
            following_count=following_count,
            total_likes_received=total_likes,
        ),
        is_following=is_following,
        is_self=is_self,
        recent_recipes=recent_recipes,
    )


async def update_profile(
    db: AsyncSession,
    user_id: uuid.UUID,
    data: UserUpdate,
) -> User:
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Người dùng không tồn tại")

    updates: dict = {k: v for k, v in data.model_dump(exclude_none=True).items()}
    if updates:
        await db.execute(update(User).where(User.id == user_id).values(**updates))
        await db.commit()
        await db.refresh(user)

    return user
