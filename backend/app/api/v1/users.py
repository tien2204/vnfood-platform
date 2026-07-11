import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_active_user, get_optional_current_user
from app.models.user import User
from app.schemas.auth import UserOut
from app.schemas.user import UserProfileOut, UserUpdate
from app.services import recipe_service, user_service

router = APIRouter()


# ── My recipes ────────────────────────────────────────────────────────────────

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


# ── Update profile ────────────────────────────────────────────────────────────

@router.put("/me/profile")
async def update_my_profile(
    data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    updated = await user_service.update_profile(db, current_user.id, data)
    return {
        "success": True,
        "data": UserOut(
            id=updated.id,
            email=updated.email,
            full_name=updated.full_name,
            avatar_url=updated.avatar_url,
            bio=updated.bio,
            role=updated.role,
            is_active=updated.is_active,
        ).model_dump(),
    }


# ── User profile (public) ─────────────────────────────────────────────────────

@router.get("/{user_id}/profile")
async def get_user_profile(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    profile = await user_service.get_user_profile(
        db,
        user_id=user_id,
        current_user_id=current_user.id if current_user else None,
    )
    return {"success": True, "data": profile.model_dump()}


# ── My Meal Plans ────────────────────────────────────────────────────────────

@router.get("/me/meal-plans")
async def get_my_meal_plans(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    from app.services import meal_plan_service
    plans, pagination = await meal_plan_service.list_user_meal_plans(
        db, user_id=current_user.id, page=page, limit=limit
    )
    return {"success": True, "data": plans, "pagination": pagination}


# ── User's public recipes ─────────────────────────────────────────────────────

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
