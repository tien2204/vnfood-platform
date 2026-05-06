import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_admin
from app.models.user import User
from app.schemas.recipe import RecipeStatusUpdate
from app.services import recipe_service

router = APIRouter()


@router.get("/recipes")
async def list_admin_recipes(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
    status: Optional[str] = Query(default=None, description="pending | approved | rejected"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    cards, pagination = await recipe_service.get_pending_recipes(
        db, page=page, limit=limit, status_filter=status
    )
    return {"success": True, "data": [c.model_dump() for c in cards], "pagination": pagination.model_dump()}


@router.patch("/recipes/{recipe_id}/status")
async def update_recipe_status(
    recipe_id: uuid.UUID,
    data: RecipeStatusUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    recipe = await recipe_service.approve_recipe(db, recipe_id, data)
    return {"success": True, "data": {"id": str(recipe.id), "status": recipe.status}}


@router.delete("/recipes/{recipe_id}")
async def admin_delete_recipe(
    recipe_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    await recipe_service.delete_recipe(db, recipe_id, current_user)
    return {"success": True, "message": "Đã xóa công thức"}
