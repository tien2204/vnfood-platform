import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_active_user, get_db
from app.models.user import User
from app.schemas.social import RatingCreate
from app.services import social_service

router = APIRouter()


@router.post("/recipes/{recipe_id}/rate")
async def rate_recipe(
    recipe_id: uuid.UUID,
    body: RatingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    rating_out = await social_service.upsert_rating(
        db, recipe_id=recipe_id, user_id=current_user.id, score=body.score
    )
    return {"success": True, "data": rating_out.model_dump()}


@router.get("/recipes/{recipe_id}/my-rating")
async def get_my_rating(
    recipe_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    score = await social_service.get_my_rating(
        db, recipe_id=recipe_id, user_id=current_user.id
    )
    return {"success": True, "data": {"score": score}}


@router.delete("/recipes/{recipe_id}/rate")
async def delete_rating(
    recipe_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    avg_rating, rating_count = await social_service.delete_rating(
        db, recipe_id=recipe_id, user_id=current_user.id
    )
    return {"success": True, "data": {"avg_rating": avg_rating, "rating_count": rating_count}}
