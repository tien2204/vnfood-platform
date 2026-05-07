import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models.user import User
from app.services import social_service

router = APIRouter()


@router.post("/recipes/{recipe_id}/save")
async def save_recipe(
    recipe_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await social_service.save_recipe(db, recipe_id, current_user.id)
    return {"success": True, "data": result.model_dump()}


@router.delete("/recipes/{recipe_id}/save")
async def unsave_recipe(
    recipe_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await social_service.unsave_recipe(db, recipe_id, current_user.id)
    return {"success": True, "data": result.model_dump()}


@router.get("/me/saved-recipes")
async def list_saved_recipes(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    items, pagination = await social_service.list_saved_recipes(
        db, user_id=current_user.id, page=page, limit=limit
    )
    return {
        "success": True,
        "data": [i.model_dump() for i in items],
        "pagination": pagination.model_dump(),
    }
