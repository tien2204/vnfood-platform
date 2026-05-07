from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models.user import User
from app.services import social_service

router = APIRouter()


@router.get("")
async def get_feed(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    items, pagination, is_discover_mode = await social_service.get_feed(
        db, user_id=current_user.id, page=page, limit=limit
    )
    return {
        "success": True,
        "data": [i.model_dump() for i in items],
        "pagination": pagination.model_dump(),
        "is_discover_mode": is_discover_mode,
    }
