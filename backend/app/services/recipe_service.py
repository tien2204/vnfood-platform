import uuid
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import delete, func, or_, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.recipe import Recipe, RecipeIngredient, RecipeStep
from app.models.social import Rating, SavedRecipe
from app.models.user import User
from app.schemas.recipe import (
    AuthorDetailOut,
    AuthorOut,
    IngredientOut,
    PaginationOut,
    RecipeCardOut,
    RecipeCardWithStatus,
    RecipeCreate,
    RecipeDetailOut,
    RecipeMiniOut,
    RecipeStatusUpdate,
    RecipeUpdate,
    StepOut,
)

KEYWORD_MAP = {
    "banh": "Bánh",
    "bun": "Bún",
    "ca": "Cá",
    "canh": "Canh",
    "com": "Cơm",
    "goi": "Gỏi",
    "pho": "Phở",
    "thit": "Thịt",
    "xoi": "Xôi",
}


def _base_approved_query():
    return (
        select(Recipe, User)
        .outerjoin(User, Recipe.author_id == User.id)
        .where(
            Recipe.status == "approved",
            or_(Recipe.author_id.is_(None), User.is_active.is_(True)),
        )
    )


def _build_recipe_card(recipe: Recipe, author: Optional[User], saved_ids: set, user: Optional[User]) -> RecipeCardOut:
    author_out = None
    if author:
        author_out = AuthorOut(
            id=author.id,
            full_name=author.full_name,
            avatar_url=author.avatar_url,
        )
    is_saved = (recipe.id in saved_ids) if user else None
    return RecipeCardOut(
        id=recipe.id,
        title=recipe.title,
        image_url=recipe.image_url,
        avg_rating=recipe.avg_rating,
        rating_count=recipe.rating_count,
        cooking_time=recipe.cooking_time,
        servings=recipe.servings,
        difficulty=recipe.difficulty,
        source=recipe.source,
        original_author_name=recipe.original_author_name,
        author=author_out,
        save_count=recipe.save_count,
        is_saved=is_saved,
        is_canonical=recipe.is_canonical,
        variant_label=recipe.variant_label,
    )


def _build_recipe_mini(recipe: Recipe) -> RecipeMiniOut:
    return RecipeMiniOut(
        id=recipe.id,
        title=recipe.title,
        variant_label=recipe.variant_label,
        image_url=recipe.image_url,
    )


async def _get_saved_ids(db: AsyncSession, recipe_ids: list[uuid.UUID], user: Optional[User]) -> set:
    if not user or not recipe_ids:
        return set()
    result = await db.execute(
        select(SavedRecipe.recipe_id).where(
            SavedRecipe.user_id == user.id,
            SavedRecipe.recipe_id.in_(recipe_ids),
        )
    )
    return {row[0] for row in result.fetchall()}


async def list_recipes(
    db: AsyncSession,
    page: int = 1,
    limit: int = 20,
    keyword: Optional[str] = None,
    source: Optional[str] = None,
    difficulty: Optional[str] = None,
    sort: str = "newest",
    search: Optional[str] = None,
    current_user: Optional[User] = None,
    show_all: bool = False,
) -> tuple[list[RecipeCardOut], PaginationOut]:
    limit = min(limit, 50)
    stmt = _base_approved_query()

    if not show_all:
        stmt = stmt.where(
            Recipe.is_canonical.is_(True),
            Recipe.is_dessert.is_(False),
        )

    if keyword:
        stmt = stmt.where(Recipe.keyword == keyword)
    if source:
        stmt = stmt.where(Recipe.source == source)
    if difficulty:
        stmt = stmt.where(Recipe.difficulty == difficulty)
    if search:
        stmt = stmt.where(
            text(
                "to_tsvector('simple', recipes.title || ' ' || COALESCE(recipes.description, '')) "
                "@@ plainto_tsquery('simple', :q)"
            ).bindparams(q=search)
        )

    if sort == "popular":
        stmt = stmt.order_by(Recipe.view_count.desc())
    elif sort == "top_rated":
        stmt = stmt.order_by(Recipe.avg_rating.desc(), Recipe.rating_count.desc())
    else:
        stmt = stmt.order_by(Recipe.created_at.desc())

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    offset = (page - 1) * limit
    stmt = stmt.offset(offset).limit(limit)
    rows = (await db.execute(stmt)).all()

    recipe_ids = [r[0].id for r in rows]
    saved_ids = await _get_saved_ids(db, recipe_ids, current_user)

    cards = [_build_recipe_card(r[0], r[1], saved_ids, current_user) for r in rows]
    total_pages = (total + limit - 1) // limit if total > 0 else 0
    pagination = PaginationOut(page=page, limit=limit, total=total, total_pages=total_pages)
    return cards, pagination


async def get_recipe_detail(
    db: AsyncSession,
    recipe_id: uuid.UUID,
    current_user: Optional[User] = None,
) -> Optional[RecipeDetailOut]:
    stmt = (
        select(Recipe)
        .where(Recipe.id == recipe_id)
        .options(
            selectinload(Recipe.ingredients),
            selectinload(Recipe.steps),
            selectinload(Recipe.author),
        )
    )
    recipe = (await db.execute(stmt)).scalar_one_or_none()
    if recipe is None:
        return None

    author = recipe.author
    if author and not author.is_active:
        return None

    # Only non-approved recipes visible to owner/admin
    if recipe.status != "approved":
        if not current_user:
            return None
        if current_user.role != "admin" and (author is None or current_user.id != author.id):
            return None

    # Author detail (follow feature removed in refocus branch — table dropped)
    author_detail = None
    if author:
        author_detail = AuthorDetailOut(
            id=author.id,
            full_name=author.full_name,
            avatar_url=author.avatar_url,
            follower_count=0,
            is_following=False,
        )

    is_saved = None
    user_rating = None
    if current_user:
        saved_result = await db.execute(
            select(SavedRecipe).where(
                SavedRecipe.user_id == current_user.id,
                SavedRecipe.recipe_id == recipe_id,
            )
        )
        is_saved = saved_result.scalar_one_or_none() is not None

        rating_result = await db.execute(
            select(Rating.score).where(
                Rating.user_id == current_user.id,
                Rating.recipe_id == recipe_id,
            )
        )
        user_rating = rating_result.scalar_one_or_none()

    ingredients = [
        IngredientOut(
            id=ing.id,
            display_text=ing.display_text,
            ingredient_name=ing.ingredient_name,
            quantity=ing.quantity,
            order_index=ing.order_index,
        )
        for ing in recipe.ingredients
    ]
    steps = [
        StepOut(
            step_number=s.step_number,
            content=s.content,
            image_url=s.image_url,
            timer_seconds=s.timer_seconds,
        )
        for s in recipe.steps
    ]

    # Variants: other canonical recipes sharing same canonical_dish_slug
    variants: list[RecipeMiniOut] = []
    if recipe.is_canonical and recipe.canonical_dish_slug:
        variants_q = (
            select(Recipe)
            .where(
                Recipe.is_canonical.is_(True),
                Recipe.canonical_dish_slug == recipe.canonical_dish_slug,
                Recipe.id != recipe.id,
            )
            .limit(10)
        )
        variant_rows = (await db.execute(variants_q)).scalars().all()
        variants = [_build_recipe_mini(r) for r in variant_rows]

    return RecipeDetailOut(
        id=recipe.id,
        title=recipe.title,
        description=recipe.description,
        image_url=recipe.image_url,
        cooking_time=recipe.cooking_time,
        servings=recipe.servings,
        difficulty=recipe.difficulty,
        source=recipe.source,
        cookpad_url=recipe.cookpad_url,
        original_author_name=recipe.original_author_name,
        keyword=recipe.keyword,
        status=recipe.status,
        avg_rating=recipe.avg_rating,
        rating_count=recipe.rating_count,
        view_count=recipe.view_count,
        save_count=recipe.save_count,
        author=author_detail,
        ingredients=ingredients,
        steps=steps,
        is_saved=is_saved,
        user_rating=user_rating,
        created_at=recipe.created_at,
        updated_at=recipe.updated_at,
        is_canonical=recipe.is_canonical,
        canonical_dish_slug=recipe.canonical_dish_slug,
        variant_label=recipe.variant_label,
        refinement_notes=recipe.refinement_notes,
        is_manually_reviewed=recipe.is_manually_reviewed,
        variants=variants,
    )


async def increment_view_count(db: AsyncSession, recipe_id: uuid.UUID) -> None:
    try:
        await db.execute(
            update(Recipe)
            .where(Recipe.id == recipe_id)
            .values(view_count=Recipe.view_count + 1)
        )
        await db.commit()
    except Exception:
        await db.rollback()


async def search_recipes(
    db: AsyncSession,
    q: str,
    page: int = 1,
    limit: int = 20,
    keyword: Optional[str] = None,
    difficulty: Optional[str] = None,
    source: Optional[str] = None,
    current_user: Optional[User] = None,
    show_all: bool = False,
) -> tuple[list[RecipeCardOut], PaginationOut]:
    limit = min(limit, 50)
    stmt = _base_approved_query()

    if not show_all:
        stmt = stmt.where(
            Recipe.is_canonical.is_(True),
            Recipe.is_dessert.is_(False),
        )

    if q:
        stmt = stmt.where(
            text(
                "to_tsvector('simple', recipes.title || ' ' || COALESCE(recipes.description, '')) "
                "@@ plainto_tsquery('simple', :q)"
            ).bindparams(q=q)
        ).order_by(
            text(
                "ts_rank(to_tsvector('simple', recipes.title || ' ' || COALESCE(recipes.description, '')), "
                "plainto_tsquery('simple', :q2)) DESC"
            ).bindparams(q2=q),
            Recipe.avg_rating.desc(),
        )
    else:
        stmt = stmt.order_by(Recipe.created_at.desc())

    if keyword:
        stmt = stmt.where(Recipe.keyword == keyword)
    if difficulty:
        stmt = stmt.where(Recipe.difficulty == difficulty)
    if source:
        stmt = stmt.where(Recipe.source == source)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    offset = (page - 1) * limit
    stmt = stmt.offset(offset).limit(limit)
    rows = (await db.execute(stmt)).all()

    recipe_ids = [r[0].id for r in rows]
    saved_ids = await _get_saved_ids(db, recipe_ids, current_user)

    cards = [_build_recipe_card(r[0], r[1], saved_ids, current_user) for r in rows]
    total_pages = (total + limit - 1) // limit if total > 0 else 0
    pagination = PaginationOut(page=page, limit=limit, total=total, total_pages=total_pages)
    return cards, pagination


async def get_featured_recipes(
    db: AsyncSession,
    current_user: Optional[User] = None,
    show_all: bool = False,
) -> dict:
    base = (
        select(Recipe, User)
        .outerjoin(User, Recipe.author_id == User.id)
        .where(
            Recipe.status == "approved",
            or_(Recipe.author_id.is_(None), User.is_active.is_(True)),
        )
    )

    if not show_all:
        base = base.where(
            Recipe.is_canonical.is_(True),
            Recipe.is_dessert.is_(False),
        )

    trending_rows = (
        await db.execute(base.order_by(Recipe.view_count.desc()).limit(10))
    ).all()

    new_rows = (
        await db.execute(base.order_by(Recipe.created_at.desc()).limit(10))
    ).all()

    top_rated_rows = (
        await db.execute(
            base.where(Recipe.rating_count >= 5)
            .order_by(Recipe.avg_rating.desc(), Recipe.rating_count.desc())
            .limit(10)
        )
    ).all()

    all_recipe_ids = list({r[0].id for r in trending_rows + new_rows + top_rated_rows})
    saved_ids = await _get_saved_ids(db, all_recipe_ids, current_user)

    def to_cards(rows):
        return [_build_recipe_card(r[0], r[1], saved_ids, current_user) for r in rows]

    return {
        "trending": to_cards(trending_rows),
        "new": to_cards(new_rows),
        "top_rated": to_cards(top_rated_rows),
    }


async def get_recipes_by_keyword(
    db: AsyncSession,
    keyword_slug: str,
    page: int = 1,
    limit: int = 20,
    current_user: Optional[User] = None,
) -> tuple[list[RecipeCardOut], PaginationOut]:
    keyword = KEYWORD_MAP.get(keyword_slug.lower())
    if keyword is None:
        return [], PaginationOut(page=page, limit=limit, total=0, total_pages=0)

    return await list_recipes(
        db, page=page, limit=limit, keyword=keyword, current_user=current_user
    )


async def get_user_recipes(
    db: AsyncSession,
    user_id: uuid.UUID,
    page: int = 1,
    limit: int = 20,
    status_filter: Optional[str] = None,
    current_user: Optional[User] = None,
) -> tuple[list[RecipeCardOut], PaginationOut]:
    limit = min(limit, 50)

    is_owner_or_admin = current_user and (
        current_user.id == user_id or current_user.role == "admin"
    )

    stmt = (
        select(Recipe, User)
        .outerjoin(User, Recipe.author_id == User.id)
        .where(Recipe.author_id == user_id)
    )

    if is_owner_or_admin:
        if status_filter:
            stmt = stmt.where(Recipe.status == status_filter)
    else:
        stmt = stmt.where(Recipe.status == "approved", User.is_active.is_(True))

    stmt = stmt.order_by(Recipe.created_at.desc())

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    offset = (page - 1) * limit
    stmt = stmt.offset(offset).limit(limit)
    rows = (await db.execute(stmt)).all()

    recipe_ids = [r[0].id for r in rows]
    saved_ids = await _get_saved_ids(db, recipe_ids, current_user)

    cards = [_build_recipe_card(r[0], r[1], saved_ids, current_user) for r in rows]
    total_pages = (total + limit - 1) // limit if total > 0 else 0
    pagination = PaginationOut(page=page, limit=limit, total=total, total_pages=total_pages)
    return cards, pagination


# ── CRUD ──────────────────────────────────────────────────────────────────────

def _build_recipe_card_with_status(recipe: Recipe, author: Optional[User]) -> RecipeCardWithStatus:
    author_out = None
    if author:
        author_out = AuthorOut(
            id=author.id,
            full_name=author.full_name,
            avatar_url=author.avatar_url,
        )
    return RecipeCardWithStatus(
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
        status=recipe.status,
        reject_reason=recipe.reject_reason,
        created_at=recipe.created_at,
    )


async def create_recipe(
    db: AsyncSession,
    data: RecipeCreate,
    author_id: uuid.UUID,
) -> Recipe:
    recipe = Recipe(
        id=uuid.uuid4(),
        title=data.title,
        description=data.description,
        image_url=data.image_url,
        cooking_time=data.cooking_time,
        servings=data.servings,
        difficulty=data.difficulty,
        keyword=data.keyword,
        source="user",
        status="pending",
        author_id=author_id,
    )
    db.add(recipe)
    await db.flush()

    for ing in data.ingredients:
        db.add(RecipeIngredient(
            id=uuid.uuid4(),
            recipe_id=recipe.id,
            display_text=ing.display_text,
            ingredient_name=ing.ingredient_name,
            quantity=ing.quantity,
            order_index=ing.order_index,
        ))

    for step in data.steps:
        db.add(RecipeStep(
            id=uuid.uuid4(),
            recipe_id=recipe.id,
            step_number=step.step_number,
            content=step.content,
            image_url=step.image_url or None,
            timer_seconds=step.timer_seconds,
        ))

    await db.commit()
    await db.refresh(recipe)
    return recipe


async def update_recipe(
    db: AsyncSession,
    recipe_id: uuid.UUID,
    data: RecipeUpdate,
    current_user: User,
) -> Recipe:
    result = await db.execute(select(Recipe).where(Recipe.id == recipe_id))
    recipe = result.scalar_one_or_none()
    if recipe is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Công thức không tồn tại")

    if current_user.role != "admin":
        if recipe.source == "cookpad":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Không thể sửa công thức Cookpad")
        if recipe.author_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Không có quyền sửa công thức này")

    was_approved = recipe.status == "approved"

    update_data = data.model_dump(exclude_none=True, exclude={"ingredients", "steps"})
    for field, value in update_data.items():
        setattr(recipe, field, value)

    if was_approved and current_user.role != "admin":
        recipe.status = "pending"
        recipe.reject_reason = None

    if data.ingredients is not None:
        await db.execute(delete(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe_id))
        for ing in data.ingredients:
            db.add(RecipeIngredient(
                id=uuid.uuid4(),
                recipe_id=recipe_id,
                display_text=ing.display_text,
                ingredient_name=ing.ingredient_name,
                quantity=ing.quantity,
                order_index=ing.order_index,
            ))

    if data.steps is not None:
        await db.execute(delete(RecipeStep).where(RecipeStep.recipe_id == recipe_id))
        for step in data.steps:
            db.add(RecipeStep(
                id=uuid.uuid4(),
                recipe_id=recipe_id,
                step_number=step.step_number,
                content=step.content,
                image_url=step.image_url or None,
                timer_seconds=step.timer_seconds,
            ))

    await db.commit()
    await db.refresh(recipe)
    return recipe


async def delete_recipe(
    db: AsyncSession,
    recipe_id: uuid.UUID,
    current_user: User,
) -> None:
    result = await db.execute(select(Recipe).where(Recipe.id == recipe_id))
    recipe = result.scalar_one_or_none()
    if recipe is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Công thức không tồn tại")

    if current_user.role != "admin":
        if recipe.source == "cookpad":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Không thể xóa công thức Cookpad")
        if recipe.author_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Không có quyền xóa công thức này")

    await db.delete(recipe)
    await db.commit()


async def approve_recipe(
    db: AsyncSession,
    recipe_id: uuid.UUID,
    data: RecipeStatusUpdate,
) -> Recipe:
    result = await db.execute(select(Recipe).where(Recipe.id == recipe_id))
    recipe = result.scalar_one_or_none()
    if recipe is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Công thức không tồn tại")

    recipe.status = data.status
    recipe.reject_reason = data.reject_reason if data.status == "rejected" else None
    await db.commit()
    await db.refresh(recipe)
    return recipe


async def get_pending_recipes(
    db: AsyncSession,
    page: int = 1,
    limit: int = 20,
    status_filter: Optional[str] = None,
) -> tuple[list[RecipeCardWithStatus], PaginationOut]:
    limit = min(limit, 50)
    stmt = (
        select(Recipe, User)
        .outerjoin(User, Recipe.author_id == User.id)
    )
    if status_filter:
        stmt = stmt.where(Recipe.status == status_filter)
    stmt = stmt.order_by(Recipe.created_at.asc())

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    offset = (page - 1) * limit
    stmt = stmt.offset(offset).limit(limit)
    rows = (await db.execute(stmt)).all()

    cards = [_build_recipe_card_with_status(r[0], r[1]) for r in rows]
    total_pages = (total + limit - 1) // limit if total > 0 else 0
    pagination = PaginationOut(page=page, limit=limit, total=total, total_pages=total_pages)
    return cards, pagination


async def get_my_recipes(
    db: AsyncSession,
    user_id: uuid.UUID,
    page: int = 1,
    limit: int = 20,
    status_filter: Optional[str] = None,
) -> tuple[list[RecipeCardWithStatus], PaginationOut]:
    limit = min(limit, 50)
    stmt = (
        select(Recipe, User)
        .outerjoin(User, Recipe.author_id == User.id)
        .where(Recipe.author_id == user_id)
    )
    if status_filter:
        stmt = stmt.where(Recipe.status == status_filter)
    stmt = stmt.order_by(Recipe.created_at.desc())

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    offset = (page - 1) * limit
    stmt = stmt.offset(offset).limit(limit)
    rows = (await db.execute(stmt)).all()

    cards = [_build_recipe_card_with_status(r[0], r[1]) for r in rows]
    total_pages = (total + limit - 1) // limit if total > 0 else 0
    pagination = PaginationOut(page=page, limit=limit, total=total, total_pages=total_pages)
    return cards, pagination
