import uuid
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.recipe import Recipe
from app.models.social import Comment, Follow, Rating, SavedRecipe
from app.models.user import User
from app.schemas.recipe import AuthorOut, PaginationOut, RecipeCardOut
from app.schemas.social import CommentOut, CommentUserOut, RatingOut, SaveResponse, SavedRecipeOut
from app.schemas.user import FeedItem, FollowResponse, FollowerOut, UserMiniOut


# ── Comments ───────────────────────────────────────────────────────────────────

async def list_comments(
    db: AsyncSession,
    recipe_id: uuid.UUID,
    page: int = 1,
    limit: int = 20,
    current_user: Optional[User] = None,
) -> tuple[list[CommentOut], PaginationOut]:
    limit = min(limit, 50)

    stmt = (
        select(Comment)
        .where(Comment.recipe_id == recipe_id)
        .options(selectinload(Comment.user))
    )
    if not (current_user and current_user.role == "admin"):
        stmt = stmt.where(Comment.is_hidden.is_(False))

    stmt = stmt.order_by(Comment.created_at.asc())

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    offset = (page - 1) * limit
    rows = (await db.execute(stmt.offset(offset).limit(limit))).scalars().all()

    def _to_out(c: Comment) -> CommentOut:
        user_out = None
        if c.user:
            user_out = CommentUserOut(
                id=c.user.id,
                full_name=c.user.full_name,
                avatar_url=c.user.avatar_url,
            )
        is_mine = bool(current_user and c.user_id == current_user.id)
        return CommentOut(
            id=c.id,
            content=c.content,
            is_hidden=c.is_hidden,
            created_at=c.created_at,
            updated_at=c.updated_at,
            user=user_out,
            is_mine=is_mine,
        )

    comments = [_to_out(c) for c in rows]
    total_pages = (total + limit - 1) // limit if total > 0 else 0
    pagination = PaginationOut(page=page, limit=limit, total=total, total_pages=total_pages)
    return comments, pagination


async def create_comment(
    db: AsyncSession,
    recipe_id: uuid.UUID,
    user_id: uuid.UUID,
    content: str,
) -> CommentOut:
    recipe = (await db.execute(select(Recipe).where(Recipe.id == recipe_id))).scalar_one_or_none()
    if recipe is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Công thức không tồn tại")

    comment = Comment(
        id=uuid.uuid4(),
        recipe_id=recipe_id,
        user_id=user_id,
        content=content,
        is_hidden=False,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)

    result = await db.execute(
        select(Comment).where(Comment.id == comment.id).options(selectinload(Comment.user))
    )
    comment = result.scalar_one()

    user_out = None
    if comment.user:
        user_out = CommentUserOut(
            id=comment.user.id,
            full_name=comment.user.full_name,
            avatar_url=comment.user.avatar_url,
        )

    return CommentOut(
        id=comment.id,
        content=comment.content,
        is_hidden=comment.is_hidden,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
        user=user_out,
        is_mine=True,
    )


async def update_comment(
    db: AsyncSession,
    comment_id: uuid.UUID,
    content: str,
    current_user: User,
) -> CommentOut:
    result = await db.execute(
        select(Comment).where(Comment.id == comment_id).options(selectinload(Comment.user))
    )
    comment = result.scalar_one_or_none()
    if comment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bình luận không tồn tại")
    if comment.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Không có quyền sửa bình luận này")

    comment.content = content
    await db.commit()
    await db.refresh(comment)

    result = await db.execute(
        select(Comment).where(Comment.id == comment_id).options(selectinload(Comment.user))
    )
    comment = result.scalar_one()

    user_out = None
    if comment.user:
        user_out = CommentUserOut(
            id=comment.user.id,
            full_name=comment.user.full_name,
            avatar_url=comment.user.avatar_url,
        )

    return CommentOut(
        id=comment.id,
        content=comment.content,
        is_hidden=comment.is_hidden,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
        user=user_out,
        is_mine=True,
    )


async def delete_comment(
    db: AsyncSession,
    comment_id: uuid.UUID,
    current_user: User,
) -> None:
    result = await db.execute(select(Comment).where(Comment.id == comment_id))
    comment = result.scalar_one_or_none()
    if comment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bình luận không tồn tại")
    if current_user.role != "admin" and comment.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Không có quyền xóa bình luận này")

    await db.delete(comment)
    await db.commit()


# ── Ratings ────────────────────────────────────────────────────────────────────

async def _recompute_rating(db: AsyncSession, recipe_id: uuid.UUID) -> tuple[float, int]:
    result = await db.execute(
        select(func.avg(Rating.score), func.count(Rating.id)).where(
            Rating.recipe_id == recipe_id
        )
    )
    avg, count = result.one()
    avg_rating = float(avg) if avg is not None else 0.0
    rating_count = count or 0
    await db.execute(
        update(Recipe)
        .where(Recipe.id == recipe_id)
        .values(avg_rating=round(avg_rating, 2), rating_count=rating_count)
    )
    await db.commit()
    return round(avg_rating, 2), rating_count


async def upsert_rating(
    db: AsyncSession,
    recipe_id: uuid.UUID,
    user_id: uuid.UUID,
    score: int,
) -> RatingOut:
    recipe = (await db.execute(select(Recipe).where(Recipe.id == recipe_id))).scalar_one_or_none()
    if recipe is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Công thức không tồn tại")

    result = await db.execute(
        select(Rating).where(Rating.recipe_id == recipe_id, Rating.user_id == user_id)
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.score = score
    else:
        db.add(Rating(
            id=uuid.uuid4(),
            recipe_id=recipe_id,
            user_id=user_id,
            score=score,
        ))
    await db.flush()

    avg_rating, rating_count = await _recompute_rating(db, recipe_id)
    return RatingOut(avg_rating=avg_rating, rating_count=rating_count, user_rating=score)


async def get_my_rating(
    db: AsyncSession,
    recipe_id: uuid.UUID,
    user_id: uuid.UUID,
) -> Optional[int]:
    result = await db.execute(
        select(Rating.score).where(Rating.recipe_id == recipe_id, Rating.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def delete_rating(
    db: AsyncSession,
    recipe_id: uuid.UUID,
    user_id: uuid.UUID,
) -> tuple[float, int]:
    result = await db.execute(
        select(Rating).where(Rating.recipe_id == recipe_id, Rating.user_id == user_id)
    )
    existing = result.scalar_one_or_none()
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chưa đánh giá công thức này")

    await db.delete(existing)
    await db.flush()

    return await _recompute_rating(db, recipe_id)


# ── Save / Unsave ───────────────────────────────────────────────────────────────

async def save_recipe(
    db: AsyncSession,
    recipe_id: uuid.UUID,
    user_id: uuid.UUID,
) -> SaveResponse:
    recipe = (await db.execute(select(Recipe).where(Recipe.id == recipe_id))).scalar_one_or_none()
    if recipe is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Công thức không tồn tại")

    existing = (await db.execute(
        select(SavedRecipe).where(SavedRecipe.recipe_id == recipe_id, SavedRecipe.user_id == user_id)
    )).scalar_one_or_none()

    if existing:
        return SaveResponse(is_saved=True, save_count=recipe.save_count)

    new_count = recipe.save_count + 1
    db.add(SavedRecipe(id=uuid.uuid4(), user_id=user_id, recipe_id=recipe_id))
    await db.execute(
        update(Recipe).where(Recipe.id == recipe_id).values(save_count=Recipe.save_count + 1)
    )
    await db.commit()
    return SaveResponse(is_saved=True, save_count=new_count)


async def unsave_recipe(
    db: AsyncSession,
    recipe_id: uuid.UUID,
    user_id: uuid.UUID,
) -> SaveResponse:
    recipe = (await db.execute(select(Recipe).where(Recipe.id == recipe_id))).scalar_one_or_none()
    if recipe is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Công thức không tồn tại")

    existing = (await db.execute(
        select(SavedRecipe).where(SavedRecipe.recipe_id == recipe_id, SavedRecipe.user_id == user_id)
    )).scalar_one_or_none()

    if not existing:
        return SaveResponse(is_saved=False, save_count=max(0, recipe.save_count))

    new_count = max(0, recipe.save_count - 1)
    await db.delete(existing)
    await db.execute(
        update(Recipe).where(Recipe.id == recipe_id).values(save_count=Recipe.save_count - 1)
    )
    await db.commit()
    return SaveResponse(is_saved=False, save_count=new_count)


async def list_saved_recipes(
    db: AsyncSession,
    user_id: uuid.UUID,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[SavedRecipeOut], PaginationOut]:
    limit = min(limit, 50)

    stmt = (
        select(SavedRecipe, Recipe, User)
        .join(Recipe, SavedRecipe.recipe_id == Recipe.id)
        .outerjoin(User, Recipe.author_id == User.id)
        .where(SavedRecipe.user_id == user_id, Recipe.status == "approved")
        .order_by(SavedRecipe.created_at.desc())
    )

    count_stmt = select(func.count()).select_from(
        select(SavedRecipe.id)
        .join(Recipe, SavedRecipe.recipe_id == Recipe.id)
        .where(SavedRecipe.user_id == user_id, Recipe.status == "approved")
        .subquery()
    )
    total = (await db.execute(count_stmt)).scalar_one()

    offset = (page - 1) * limit
    rows = (await db.execute(stmt.offset(offset).limit(limit))).all()

    results = []
    for saved, recipe, author in rows:
        author_out = None
        if author:
            author_out = CommentUserOut(id=author.id, full_name=author.full_name, avatar_url=author.avatar_url)
        results.append(SavedRecipeOut(
            id=recipe.id,
            title=recipe.title,
            image_url=recipe.image_url,
            avg_rating=recipe.avg_rating,
            rating_count=recipe.rating_count,
            cooking_time=recipe.cooking_time,
            servings=recipe.servings,
            difficulty=recipe.difficulty,
            source=recipe.source,
            author=author_out,
            save_count=recipe.save_count,
            is_saved=True,
            saved_at=saved.created_at,
        ))

    total_pages = (total + limit - 1) // limit if total > 0 else 0
    pagination = PaginationOut(page=page, limit=limit, total=total, total_pages=total_pages)
    return results, pagination


# ── Follow / Unfollow ──────────────────────────────────────────────────────────

async def follow_user(
    db: AsyncSession,
    follower_id: uuid.UUID,
    following_id: uuid.UUID,
) -> FollowResponse:
    if follower_id == following_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Không thể tự follow bản thân")

    target = (await db.execute(select(User).where(User.id == following_id))).scalar_one_or_none()
    if target is None or not target.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Người dùng không tồn tại")

    existing = (await db.execute(
        select(Follow).where(Follow.follower_id == follower_id, Follow.following_id == following_id)
    )).scalar_one_or_none()

    if not existing:
        db.add(Follow(id=uuid.uuid4(), follower_id=follower_id, following_id=following_id))
        await db.commit()

    follower_count = (await db.execute(
        select(func.count(Follow.id)).where(Follow.following_id == following_id)
    )).scalar_one()
    return FollowResponse(is_following=True, follower_count=follower_count)


async def unfollow_user(
    db: AsyncSession,
    follower_id: uuid.UUID,
    following_id: uuid.UUID,
) -> FollowResponse:
    existing = (await db.execute(
        select(Follow).where(Follow.follower_id == follower_id, Follow.following_id == following_id)
    )).scalar_one_or_none()

    if existing:
        await db.delete(existing)
        await db.commit()

    follower_count = (await db.execute(
        select(func.count(Follow.id)).where(Follow.following_id == following_id)
    )).scalar_one()
    return FollowResponse(is_following=False, follower_count=follower_count)


async def list_followers(
    db: AsyncSession,
    user_id: uuid.UUID,
    page: int = 1,
    limit: int = 20,
    current_user_id: Optional[uuid.UUID] = None,
) -> tuple[list[FollowerOut], PaginationOut]:
    limit = min(limit, 50)

    count_total = (await db.execute(
        select(func.count(Follow.id)).where(Follow.following_id == user_id)
    )).scalar_one()

    offset = (page - 1) * limit
    rows = (await db.execute(
        select(User)
        .join(Follow, Follow.follower_id == User.id)
        .where(Follow.following_id == user_id)
        .order_by(Follow.created_at.desc())
        .offset(offset).limit(limit)
    )).scalars().all()

    followed_ids: set[uuid.UUID] = set()
    if current_user_id:
        ids = [u.id for u in rows]
        if ids:
            res = await db.execute(
                select(Follow.following_id).where(
                    Follow.follower_id == current_user_id,
                    Follow.following_id.in_(ids),
                )
            )
            followed_ids = {r for r, in res.all()}

    result = [
        FollowerOut(
            id=u.id,
            full_name=u.full_name,
            avatar_url=u.avatar_url,
            bio=u.bio,
            is_following=(u.id in followed_ids) if current_user_id else None,
        )
        for u in rows
    ]
    total_pages = (count_total + limit - 1) // limit if count_total > 0 else 0
    return result, PaginationOut(page=page, limit=limit, total=count_total, total_pages=total_pages)


async def list_following(
    db: AsyncSession,
    user_id: uuid.UUID,
    page: int = 1,
    limit: int = 20,
    current_user_id: Optional[uuid.UUID] = None,
) -> tuple[list[FollowerOut], PaginationOut]:
    limit = min(limit, 50)

    count_total = (await db.execute(
        select(func.count(Follow.id)).where(Follow.follower_id == user_id)
    )).scalar_one()

    offset = (page - 1) * limit
    rows = (await db.execute(
        select(User)
        .join(Follow, Follow.following_id == User.id)
        .where(Follow.follower_id == user_id)
        .order_by(Follow.created_at.desc())
        .offset(offset).limit(limit)
    )).scalars().all()

    followed_ids: set[uuid.UUID] = set()
    if current_user_id:
        ids = [u.id for u in rows]
        if ids:
            res = await db.execute(
                select(Follow.following_id).where(
                    Follow.follower_id == current_user_id,
                    Follow.following_id.in_(ids),
                )
            )
            followed_ids = {r for r, in res.all()}

    result = [
        FollowerOut(
            id=u.id,
            full_name=u.full_name,
            avatar_url=u.avatar_url,
            bio=u.bio,
            is_following=(u.id in followed_ids) if current_user_id else None,
        )
        for u in rows
    ]
    total_pages = (count_total + limit - 1) // limit if count_total > 0 else 0
    return result, PaginationOut(page=page, limit=limit, total=count_total, total_pages=total_pages)


# ── Social Feed ────────────────────────────────────────────────────────────────

async def get_feed(
    db: AsyncSession,
    user_id: uuid.UUID,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[FeedItem], PaginationOut, bool]:
    limit = min(limit, 50)

    following_ids_res = await db.execute(
        select(Follow.following_id).where(Follow.follower_id == user_id)
    )
    following_ids = [r for r, in following_ids_res.all()]

    is_discover_mode = len(following_ids) == 0

    if is_discover_mode:
        base = (
            select(Recipe, User)
            .outerjoin(User, Recipe.author_id == User.id)
            .where(Recipe.status == "approved")
            .order_by(Recipe.save_count.desc(), Recipe.avg_rating.desc(), Recipe.created_at.desc())
        )
    else:
        base = (
            select(Recipe, User)
            .outerjoin(User, Recipe.author_id == User.id)
            .where(Recipe.status == "approved", Recipe.author_id.in_(following_ids))
            .order_by(Recipe.created_at.desc())
        )

    count_stmt = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    offset = (page - 1) * limit
    rows = (await db.execute(base.offset(offset).limit(limit))).all()

    items: list[FeedItem] = []
    for recipe, author in rows:
        author_out = UserMiniOut(
            id=author.id if author else uuid.uuid4(),
            full_name=author.full_name if author else None,
            avatar_url=author.avatar_url if author else None,
            bio=author.bio if author else None,
        )
        recipe_out = RecipeCardOut(
            id=recipe.id,
            title=recipe.title,
            image_url=recipe.image_url,
            avg_rating=recipe.avg_rating,
            rating_count=recipe.rating_count,
            cooking_time=recipe.cooking_time,
            servings=recipe.servings,
            difficulty=recipe.difficulty,
            source=recipe.source,
            author=AuthorOut(
                id=author.id if author else uuid.uuid4(),
                full_name=author.full_name if author else None,
                avatar_url=author.avatar_url if author else None,
            ),
            save_count=recipe.save_count,
            is_saved=None,
        )
        items.append(FeedItem(type="recipe", recipe=recipe_out, author=author_out, posted_at=recipe.created_at))

    total_pages = (total + limit - 1) // limit if total > 0 else 0
    return items, PaginationOut(page=page, limit=limit, total=total, total_pages=total_pages), is_discover_mode
