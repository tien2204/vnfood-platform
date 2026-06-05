import uuid
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_active_user, get_optional_current_user
from app.models.user import User
from app.schemas.recipe import RecipeCreate, RecipeUpdate
from app.services import recipe_service
from app.services.recipe_service import KEYWORD_MAP

router = APIRouter()


@router.post("")
async def create_recipe(
    data: RecipeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    recipe = await recipe_service.create_recipe(db, data, current_user.id)
    return {
        "success": True,
        "data": {"id": str(recipe.id), "status": recipe.status},
        "message": "Công thức đã được tạo, đang chờ Admin duyệt",
    }


@router.put("/{recipe_id}")
async def update_recipe(
    recipe_id: uuid.UUID,
    data: RecipeUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    recipe = await recipe_service.update_recipe(db, recipe_id, data, current_user)
    return {
        "success": True,
        "data": {"id": str(recipe.id), "status": recipe.status},
        "message": "Đã cập nhật công thức" + (" — đang chờ duyệt lại" if recipe.status == "pending" else ""),
    }


@router.delete("/{recipe_id}")
async def delete_recipe(
    recipe_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    await recipe_service.delete_recipe(db, recipe_id, current_user)
    return {"success": True, "message": "Đã xóa công thức"}


@router.get("/featured")
async def get_featured_recipes(
    show_all: bool = Query(default=False, description="Include non-canonical recipes (Cookpad pool)"),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    data = await recipe_service.get_featured_recipes(db, current_user=current_user, show_all=show_all)
    return {"success": True, "data": data}


@router.get("/search")
async def search_recipes(
    q: str = Query(default="", description="Search query"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
    keyword: Optional[str] = Query(default=None),
    difficulty: Optional[str] = Query(default=None),
    source: Optional[str] = Query(default=None),
    show_all: bool = Query(default=False, description="Include non-canonical recipes (Cookpad pool)"),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    if not q:
        cards, pagination = await recipe_service.list_recipes(
            db, page=page, limit=limit,
            keyword=keyword, difficulty=difficulty, source=source,
            current_user=current_user, show_all=show_all,
        )
    else:
        cards, pagination = await recipe_service.search_recipes(
            db, q=q, page=page, limit=limit,
            keyword=keyword, difficulty=difficulty, source=source,
            current_user=current_user, show_all=show_all,
        )
    return {"success": True, "data": [c.model_dump() for c in cards], "pagination": pagination.model_dump()}


@router.get("/by-keyword/{keyword_slug}")
async def get_recipes_by_keyword(
    keyword_slug: str,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    if keyword_slug.lower() not in KEYWORD_MAP:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Keyword '{keyword_slug}' không hợp lệ. Hợp lệ: {', '.join(KEYWORD_MAP.keys())}",
        )
    cards, pagination = await recipe_service.get_recipes_by_keyword(
        db, keyword_slug=keyword_slug, page=page, limit=limit, current_user=current_user
    )
    return {"success": True, "data": [c.model_dump() for c in cards], "pagination": pagination.model_dump()}


@router.get("")
async def list_recipes(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
    keyword: Optional[str] = Query(default=None),
    source: Optional[str] = Query(default=None),
    difficulty: Optional[str] = Query(default=None),
    sort: str = Query(default="newest", pattern="^(newest|popular|top_rated)$"),
    search: Optional[str] = Query(default=None),
    meal: Optional[str] = Query(default=None),
    region: Optional[str] = Query(default=None),
    occasion: Optional[str] = Query(default=None),
    dish_type: Optional[str] = Query(default=None),
    diet: Optional[str] = Query(default=None),
    main_ingredient: Optional[str] = Query(default=None),
    cooking_method: Optional[str] = Query(default=None),
    show_all: bool = Query(default=False, description="Include non-canonical recipes (Cookpad pool)"),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    cards, pagination = await recipe_service.list_recipes(
        db,
        page=page, limit=limit,
        keyword=keyword, source=source, difficulty=difficulty,
        sort=sort, search=search, meal=meal,
        region=region, occasion=occasion, dish_type=dish_type, diet=diet,
        main_ingredient=main_ingredient, cooking_method=cooking_method,
        current_user=current_user, show_all=show_all,
    )
    return {"success": True, "data": [c.model_dump() for c in cards], "pagination": pagination.model_dump()}


@router.get("/{recipe_id}")
async def get_recipe_detail(
    recipe_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    detail = await recipe_service.get_recipe_detail(db, recipe_id, current_user)
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Công thức không tồn tại")

    background_tasks.add_task(recipe_service.increment_view_count, db, recipe_id)
    return {"success": True, "data": detail.model_dump()}


@router.get("/{recipe_id}/related")
async def get_related(
    recipe_id: uuid.UUID,
    limit: int = 6,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    cards = await recipe_service.get_related_recipes(db, recipe_id, limit=limit, current_user=current_user)
    return {"success": True, "data": cards}
