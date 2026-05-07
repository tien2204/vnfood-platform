import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_active_user, get_optional_current_user, get_db
from app.models.user import User
from app.schemas.recipe import PaginationOut
from app.schemas.social import CommentCreate, CommentOut, CommentUpdate
from app.services import social_service

router = APIRouter()


@router.get("/recipes/{recipe_id}/comments")
async def list_comments(
    recipe_id: uuid.UUID,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
):
    comments, pagination = await social_service.list_comments(
        db, recipe_id=recipe_id, page=page, limit=limit, current_user=current_user
    )
    return {
        "success": True,
        "data": [c.model_dump() for c in comments],
        "pagination": pagination.model_dump(),
    }


@router.post("/recipes/{recipe_id}/comments", status_code=status.HTTP_201_CREATED)
async def create_comment(
    recipe_id: uuid.UUID,
    body: CommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    comment = await social_service.create_comment(
        db, recipe_id=recipe_id, user_id=current_user.id, content=body.content
    )
    return {"success": True, "data": comment.model_dump()}


@router.put("/comments/{comment_id}")
async def update_comment(
    comment_id: uuid.UUID,
    body: CommentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    comment = await social_service.update_comment(
        db, comment_id=comment_id, content=body.content, current_user=current_user
    )
    return {"success": True, "data": comment.model_dump()}


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    comment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    await social_service.delete_comment(db, comment_id=comment_id, current_user=current_user)
