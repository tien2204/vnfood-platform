import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_active_user, get_optional_current_user
from app.models.user import User
from app.services import recipe_service

router = APIRouter()


@router.get("/me/recipes")
async def get_my_recipes(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
    status: Optional[str] = Query(default=None, description="pending | approved | rejected"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    cards, pagination = await recipe_service.get_my_recipes(
        db,
        user_id=current_user.id,
        page=page,
        limit=limit,
        status_filter=status,
    )
    return {"success": True, "data": [c.model_dump() for c in cards], "pagination": pagination.model_dump()}


@router.get("/{user_id}/recipes")
async def get_user_recipes(
    user_id: uuid.UUID,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
    status: Optional[str] = Query(default=None, description="pending | approved | rejected"),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    cards, pagination = await recipe_service.get_user_recipes(
        db,
        user_id=user_id,
        page=page,
        limit=limit,
        status_filter=status,
        current_user=current_user,
    )
    return {"success": True, "data": [c.model_dump() for c in cards], "pagination": pagination.model_dump()}
