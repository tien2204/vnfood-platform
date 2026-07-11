import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import Date, cast, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_log import AILog
from app.models.recipe import Recipe, RecipeIngredient
from app.models.social import Comment, Rating, SavedRecipe
from app.models.user import User
from app.services import recipe_service


# ── Overview stats ─────────────────────────────────────────────────────────────

async def get_admin_stats(db: AsyncSession) -> dict:
    today = datetime.now(timezone.utc).date()
    week_ago = today - timedelta(days=7)

    total_users = (await db.execute(select(func.count(User.id)))).scalar_one()
    new_users_today = (await db.execute(
        select(func.count(User.id)).where(cast(User.created_at, Date) == today)
    )).scalar_one()
    new_users_week = (await db.execute(
        select(func.count(User.id)).where(User.created_at >= week_ago)
    )).scalar_one()
    banned_count = (await db.execute(
        select(func.count(User.id)).where(User.is_active.is_(False))
    )).scalar_one()

    # "Tổng công thức" mirrors exactly what the public /recipes page shows: one
    # representative per AI class + user-submitted posts (not the full raw import).
    visible_subq = (
        recipe_service._base_approved_query()
        .where(recipe_service.browse_visible_clause())
    ).subquery()
    total_recipes = (await db.execute(select(func.count()).select_from(visible_subq))).scalar_one()

    new_recipes_today = (await db.execute(
        select(func.count(Recipe.id)).where(cast(Recipe.created_at, Date) == today)
    )).scalar_one()

    # "Đã duyệt / Chờ duyệt / Từ chối" are moderation metrics — they count only
    # user-submitted recipes, not the pre-approved monngonmoingay catalog import.
    status_rows = (await db.execute(
        select(Recipe.status, func.count(Recipe.id))
        .where(Recipe.source == "user")
        .group_by(Recipe.status)
    )).all()
    status_counts = {s: c for s, c in status_rows}

    source_rows = (await db.execute(
        select(Recipe.source, func.count(Recipe.id)).group_by(Recipe.source)
    )).all()
    source_counts = {s: c for s, c in source_rows}

    total_comments = (await db.execute(select(func.count(Comment.id)))).scalar_one()
    total_ratings = (await db.execute(select(func.count(Rating.id)))).scalar_one()
    total_saves = (await db.execute(select(func.count(SavedRecipe.id)))).scalar_one()
    ai_today = (await db.execute(
        select(func.count(AILog.id)).where(cast(AILog.created_at, Date) == today)
    )).scalar_one()

    return {
        "users": {
            "total": total_users,
            "new_today": new_users_today,
            "new_this_week": new_users_week,
            "banned": banned_count,
        },
        "recipes": {
            "total": total_recipes,
            "approved": status_counts.get("approved", 0),
            "pending": status_counts.get("pending", 0),
            "rejected": status_counts.get("rejected", 0),
            "from_cookpad": source_counts.get("cookpad", 0),
            "from_users": source_counts.get("user", 0),
            "new_today": new_recipes_today,
        },
        "engagement": {
            "total_comments": total_comments,
            "total_ratings": total_ratings,
            "total_saves": total_saves,
            "ai_recognitions_today": ai_today,
        },
    }


async def get_chart_data(db: AsyncSession, days: int = 30) -> dict:
    start_date = datetime.now(timezone.utc).date() - timedelta(days=days)

    users_rows = (await db.execute(
        select(cast(User.created_at, Date).label("day"), func.count(User.id).label("count"))
        .where(User.created_at >= start_date)
        .group_by(cast(User.created_at, Date))
        .order_by(cast(User.created_at, Date))
    )).all()
    users_by_day = [{"date": str(r.day), "count": r.count} for r in users_rows]

    recipes_rows = (await db.execute(
        select(cast(Recipe.created_at, Date).label("day"), func.count(Recipe.id).label("count"))
        .where(Recipe.created_at >= start_date, Recipe.source == "user")
        .group_by(cast(Recipe.created_at, Date))
        .order_by(cast(Recipe.created_at, Date))
    )).all()
    recipes_by_day = [{"date": str(r.day), "count": r.count} for r in recipes_rows]

    keyword_rows = (await db.execute(
        select(Recipe.keyword, func.count(Recipe.id).label("count"))
        .where(Recipe.keyword.isnot(None))
        .group_by(Recipe.keyword)
        .order_by(func.count(Recipe.id).desc())
        .limit(10)
    )).all()
    top_keywords = [{"keyword": r[0], "count": r[1]} for r in keyword_rows]

    return {
        "users_by_day": users_by_day,
        "recipes_by_day": recipes_by_day,
        "top_keywords": top_keywords,
    }


# ── User management ────────────────────────────────────────────────────────────

async def list_admin_users(
    db: AsyncSession,
    page: int = 1,
    limit: int = 20,
    search: str | None = None,
    role: str | None = None,
    is_active: bool | None = None,
    sort: str = "newest",
) -> dict:
    query = select(User)
    if search:
        query = query.where(
            User.email.ilike(f"%{search}%") | User.full_name.ilike(f"%{search}%")
        )
    if role:
        query = query.where(User.role == role)
    if is_active is not None:
        query = query.where(User.is_active.is_(is_active))

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()

    order = User.created_at.asc() if sort == "oldest" else User.created_at.desc()
    users = (await db.execute(query.order_by(order).offset((page - 1) * limit).limit(limit))).scalars().all()

    user_ids = [u.id for u in users]
    recipe_map = {}
    comment_map = {}
    if user_ids:
        for uid, cnt in (await db.execute(
            select(Recipe.author_id, func.count(Recipe.id))
            .where(Recipe.author_id.in_(user_ids))
            .group_by(Recipe.author_id)
        )).all():
            recipe_map[uid] = cnt
        for uid, cnt in (await db.execute(
            select(Comment.user_id, func.count(Comment.id))
            .where(Comment.user_id.in_(user_ids))
            .group_by(Comment.user_id)
        )).all():
            comment_map[uid] = cnt

    return {
        "data": [{
            "id": str(u.id),
            "email": u.email,
            "full_name": u.full_name,
            "avatar_url": u.avatar_url,
            "role": u.role,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat(),
            "stats": {
                "recipe_count": recipe_map.get(u.id, 0),
                "comment_count": comment_map.get(u.id, 0),
            },
        } for u in users],
        "pagination": {"page": page, "limit": limit, "total": total, "total_pages": max(1, (total + limit - 1) // limit)},
    }


async def get_admin_user_detail(db: AsyncSession, user_id: str) -> dict | None:
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        return None

    user = await db.get(User, uid)
    if not user:
        return None

    recipe_count = (await db.execute(select(func.count(Recipe.id)).where(Recipe.author_id == uid))).scalar_one()
    comment_count = (await db.execute(select(func.count(Comment.id)).where(Comment.user_id == uid))).scalar_one()
    rating_count = (await db.execute(select(func.count(Rating.id)).where(Rating.user_id == uid))).scalar_one()
    ai_count = (await db.execute(select(func.count(AILog.id)).where(AILog.user_id == uid))).scalar_one()
    joined_days = (datetime.now(timezone.utc) - user.created_at).days

    recent_recipes = (await db.execute(
        select(Recipe).where(Recipe.author_id == uid).order_by(Recipe.created_at.desc()).limit(5)
    )).scalars().all()

    recent_comments = (await db.execute(
        select(Comment).where(Comment.user_id == uid).order_by(Comment.created_at.desc()).limit(5)
    )).scalars().all()

    recipe_ids = [c.recipe_id for c in recent_comments]
    recipes_map = {}
    if recipe_ids:
        for r in (await db.execute(select(Recipe).where(Recipe.id.in_(recipe_ids)))).scalars().all():
            recipes_map[r.id] = r

    return {
        "user": {
            "id": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "avatar_url": user.avatar_url,
            "bio": user.bio,
            "role": user.role,
            "is_active": user.is_active,
            "created_at": user.created_at.isoformat(),
            "updated_at": user.updated_at.isoformat(),
        },
        "stats": {
            "recipe_count": recipe_count,
            "comment_count": comment_count,
            "total_ratings_given": rating_count,
            "ai_recognitions": ai_count,
            "joined_days": joined_days,
        },
        "recent_recipes": [{
            "id": str(r.id),
            "title": r.title,
            "image_url": r.image_url,
            "status": r.status,
            "created_at": r.created_at.isoformat(),
        } for r in recent_recipes],
        "recent_comments": [{
            "id": str(c.id),
            "content": c.content,
            "is_hidden": c.is_hidden,
            "created_at": c.created_at.isoformat(),
            "recipe": {
                "id": str(c.recipe_id),
                "title": recipes_map[c.recipe_id].title if c.recipe_id in recipes_map else None,
            },
        } for c in recent_comments],
    }


async def update_user_status(db: AsyncSession, user_id: str, is_active: bool) -> User | None:
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        return None

    user = await db.get(User, uid)
    if not user:
        return None

    user.is_active = is_active
    if not is_active:
        await db.execute(
            update(Comment)
            .where(Comment.user_id == uid, Comment.is_hidden.is_(False))
            .values(is_hidden=True)
            .execution_options(synchronize_session=False)
        )
    else:
        await db.execute(
            update(Comment)
            .where(Comment.user_id == uid)
            .values(is_hidden=False)
            .execution_options(synchronize_session=False)
        )

    await db.commit()
    return user


async def update_user_role(db: AsyncSession, user_id: str, role: str) -> User | None:
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        return None

    user = await db.get(User, uid)
    if not user:
        return None

    user.role = role
    await db.commit()
    return user


# ── Comment management ─────────────────────────────────────────────────────────

async def list_admin_comments(
    db: AsyncSession,
    page: int = 1,
    limit: int = 20,
    is_hidden: bool | None = None,
    search: str | None = None,
) -> dict:
    query = select(Comment)
    if is_hidden is not None:
        query = query.where(Comment.is_hidden.is_(is_hidden))
    if search:
        query = query.where(Comment.content.ilike(f"%{search}%"))

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    comments = (await db.execute(
        query.order_by(Comment.created_at.desc()).offset((page - 1) * limit).limit(limit)
    )).scalars().all()

    user_ids = list({c.user_id for c in comments if c.user_id})
    recipe_ids = list({c.recipe_id for c in comments})

    users_map: dict = {}
    if user_ids:
        for u in (await db.execute(select(User).where(User.id.in_(user_ids)))).scalars().all():
            users_map[u.id] = u

    recipes_map: dict = {}
    if recipe_ids:
        for r in (await db.execute(select(Recipe).where(Recipe.id.in_(recipe_ids)))).scalars().all():
            recipes_map[r.id] = r

    return {
        "data": [{
            "id": str(c.id),
            "content": c.content,
            "is_hidden": c.is_hidden,
            "created_at": c.created_at.isoformat(),
            "user": {
                "id": str(c.user_id) if c.user_id else None,
                "full_name": users_map[c.user_id].full_name if c.user_id and c.user_id in users_map else None,
                "avatar_url": users_map[c.user_id].avatar_url if c.user_id and c.user_id in users_map else None,
            },
            "recipe": {
                "id": str(c.recipe_id),
                "title": recipes_map[c.recipe_id].title if c.recipe_id in recipes_map else None,
            },
        } for c in comments],
        "pagination": {"page": page, "limit": limit, "total": total, "total_pages": max(1, (total + limit - 1) // limit)},
    }


async def toggle_comment_hidden(db: AsyncSession, comment_id: str, is_hidden: bool) -> Comment | None:
    try:
        cid = uuid.UUID(comment_id)
    except ValueError:
        return None

    comment = await db.get(Comment, cid)
    if not comment:
        return None

    comment.is_hidden = is_hidden
    await db.commit()
    return comment


async def delete_comment(db: AsyncSession, comment_id: str) -> bool:
    try:
        cid = uuid.UUID(comment_id)
    except ValueError:
        return False

    comment = await db.get(Comment, cid)
    if not comment:
        return False

    await db.delete(comment)
    await db.commit()
    return True


# ── Ingredient management ──────────────────────────────────────────────────────

async def list_admin_ingredients(
    db: AsyncSession,
    page: int = 1,
    limit: int = 50,
    search: str | None = None,
) -> dict:
    query = (
        select(RecipeIngredient.ingredient_name, func.count(RecipeIngredient.id).label("usage_count"))
        .where(RecipeIngredient.ingredient_name.isnot(None))
        .group_by(RecipeIngredient.ingredient_name)
    )
    if search:
        query = query.where(RecipeIngredient.ingredient_name.ilike(f"%{search}%"))

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    rows = (await db.execute(
        query.order_by(func.count(RecipeIngredient.id).desc()).offset((page - 1) * limit).limit(limit)
    )).all()

    return {
        "data": [{"name": r[0], "usage_count": r[1]} for r in rows],
        "pagination": {"page": page, "limit": limit, "total": total, "total_pages": max(1, (total + limit - 1) // limit)},
    }


async def merge_ingredients(db: AsyncSession, from_names: list[str], to_name: str) -> int:
    result = await db.execute(
        update(RecipeIngredient)
        .where(RecipeIngredient.ingredient_name.in_(from_names))
        .values(ingredient_name=to_name)
        .execution_options(synchronize_session=False)
    )
    await db.commit()
    return result.rowcount


async def rename_ingredient(db: AsyncSession, from_name: str, to_name: str) -> int:
    result = await db.execute(
        update(RecipeIngredient)
        .where(RecipeIngredient.ingredient_name == from_name)
        .values(ingredient_name=to_name)
        .execution_options(synchronize_session=False)
    )
    await db.commit()
    return result.rowcount


# ── Canonical recipe management ────────────────────────────────────────────────

async def set_manual_review(db: AsyncSession, recipe_id: uuid.UUID, is_reviewed: bool) -> dict:
    result = await db.execute(
        update(Recipe)
        .where(Recipe.id == recipe_id)
        .values(is_manually_reviewed=is_reviewed)
        .execution_options(synchronize_session=False)
    )
    await db.commit()
    return {
        "success": True,
        "data": {
            "id": str(recipe_id),
            "is_manually_reviewed": is_reviewed,
            "updated": result.rowcount,
        },
    }


# ── Account lifecycle (SP5) ────────────────────────────────────────────────────

async def create_admin_user(
    db: AsyncSession, email: str, full_name: str, role: str, hashed_password: str
) -> User:
    exists = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if exists is not None:
        raise HTTPException(status_code=409, detail="Email đã tồn tại")
    user = User(
        id=uuid.uuid4(), email=email, full_name=full_name,
        role=role, hashed_password=hashed_password, is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def update_admin_user(
    db: AsyncSession, user_id: str, full_name: str | None, email: str | None
) -> User | None:
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        return None
    if email is not None and email != user.email:
        clash = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if clash is not None:
            raise HTTPException(status_code=409, detail="Email đã tồn tại")
        user.email = email
    if full_name is not None:
        user.full_name = full_name
    await db.commit()
    await db.refresh(user)
    return user


async def reset_admin_user_password(db: AsyncSession, user_id: str, hashed_password: str) -> User | None:
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        return None
    user.hashed_password = hashed_password
    await db.commit()
    await db.refresh(user)
    return user


async def delete_admin_user(db: AsyncSession, user_id: str) -> bool:
    from sqlalchemy import delete as sa_delete
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        return False
    result = await db.execute(sa_delete(User).where(User.id == uid))
    await db.commit()
    return result.rowcount > 0
