import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import roles
from app.core.database import get_db
from app.core.deps import require_admin
from app.core.security import generate_temp_password, hash_password
from app.models.user import User
from app.schemas.admin import AdminUserCreate, AdminUserOut, AdminUserUpdate, CreatedUserOut, TempPasswordOut
from app.schemas.recipe import RecipeStatusUpdate
from app.services import admin_service, recipe_service

router = APIRouter()


# ── Request bodies ─────────────────────────────────────────────────────────────

class UserStatusBody(BaseModel):
    is_active: bool
    reason: str | None = None


class UserRoleBody(BaseModel):
    role: str


class CommentToggleBody(BaseModel):
    is_hidden: bool


class MergeIngredientsBody(BaseModel):
    from_names: list[str]
    to_name: str


class RenameIngredientBody(BaseModel):
    from_name: str
    to_name: str


class ManualReviewPayload(BaseModel):
    is_reviewed: bool


# ── Stats ──────────────────────────────────────────────────────────────────────

@router.get("/stats")
async def admin_stats(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    data = await admin_service.get_admin_stats(db)
    return {"success": True, "data": data}


@router.get("/charts")
async def admin_charts(
    days: int = Query(default=30, ge=7, le=90),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    data = await admin_service.get_chart_data(db, days=days)
    return {"success": True, "data": data}


# ── Recipes (existing + enhanced) ─────────────────────────────────────────────

@router.get("/recipes")
async def list_admin_recipes(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
    status: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    cards, pagination = await recipe_service.get_pending_recipes(db, page=page, limit=limit, status_filter=status)
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


@router.patch("/recipes/{recipe_id}/manual-review")
async def mark_manually_reviewed(
    recipe_id: uuid.UUID,
    payload: ManualReviewPayload,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    return await admin_service.set_manual_review(db, recipe_id, payload.is_reviewed)


# ── Users ──────────────────────────────────────────────────────────────────────

@router.get("/users")
async def list_users(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    search: Optional[str] = Query(default=None),
    role: Optional[str] = Query(default=None),
    is_active: Optional[bool] = Query(default=None),
    sort: str = Query(default="newest"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await admin_service.list_admin_users(
        db, page=page, limit=limit, search=search, role=role, is_active=is_active, sort=sort
    )
    return {"success": True, **result}


@router.get("/users/{user_id}")
async def get_user_detail(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    data = await admin_service.get_admin_user_detail(db, user_id)
    if not data:
        raise HTTPException(404, detail="User không tồn tại")
    return {"success": True, "data": data}


@router.patch("/users/{user_id}/status")
async def update_user_status(
    user_id: str,
    body: UserStatusBody,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    if str(current_admin.id) == user_id:
        raise HTTPException(400, detail="Không thể ban chính mình")

    user = await admin_service.update_user_status(db, user_id, body.is_active)
    if not user:
        raise HTTPException(404, detail="User không tồn tại")

    action = "unban" if body.is_active else "ban"
    return {"success": True, "data": {"id": str(user.id), "is_active": user.is_active, "action": action}}


@router.patch("/users/{user_id}/role")
async def update_user_role(
    user_id: str,
    body: UserRoleBody,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    if str(current_admin.id) == user_id:
        raise HTTPException(400, detail="Không thể tự thay đổi role của mình")
    if body.role not in roles.ROLES:
        raise HTTPException(400, detail="Role không hợp lệ (user | admin)")

    user = await admin_service.update_user_role(db, user_id, body.role)
    if not user:
        raise HTTPException(404, detail="User không tồn tại")

    return {"success": True, "data": {"id": str(user.id), "role": user.role}}


@router.post("/users")
async def create_user(
    body: AdminUserCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    if body.role not in roles.ROLES:
        raise HTTPException(400, detail="Role không hợp lệ (user | admin)")
    temp = generate_temp_password()
    user = await admin_service.create_admin_user(
        db, email=str(body.email), full_name=body.full_name, role=body.role,
        hashed_password=hash_password(temp),
    )
    return {"success": True, "data": CreatedUserOut(user=AdminUserOut.model_validate(user), temp_password=temp).model_dump(mode="json")}


@router.patch("/users/{user_id}")
async def edit_user(
    user_id: str,
    body: AdminUserUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    user = await admin_service.update_admin_user(
        db, user_id, full_name=body.full_name, email=str(body.email) if body.email else None
    )
    if not user:
        raise HTTPException(404, detail="User không tồn tại")
    return {"success": True, "data": AdminUserOut.model_validate(user).model_dump(mode="json")}


@router.post("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    temp = generate_temp_password()
    user = await admin_service.reset_admin_user_password(db, user_id, hash_password(temp))
    if not user:
        raise HTTPException(404, detail="User không tồn tại")
    return {"success": True, "data": TempPasswordOut(temp_password=temp).model_dump(mode="json")}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    if str(current_admin.id) == user_id:
        raise HTTPException(400, detail="Không thể xóa chính mình")
    ok = await admin_service.delete_admin_user(db, user_id)
    if not ok:
        raise HTTPException(404, detail="User không tồn tại")
    return {"success": True, "message": "Đã xóa tài khoản"}


# ── Comments ───────────────────────────────────────────────────────────────────

@router.get("/comments")
async def list_comments(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    is_hidden: Optional[bool] = Query(default=None),
    search: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await admin_service.list_admin_comments(
        db, page=page, limit=limit, is_hidden=is_hidden, search=search
    )
    return {"success": True, **result}


@router.patch("/comments/{comment_id}")
async def toggle_comment(
    comment_id: str,
    body: CommentToggleBody,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    comment = await admin_service.toggle_comment_hidden(db, comment_id, body.is_hidden)
    if not comment:
        raise HTTPException(404, detail="Comment không tồn tại")
    return {"success": True, "data": {"id": str(comment.id), "is_hidden": comment.is_hidden}}


@router.delete("/comments/{comment_id}")
async def delete_comment(
    comment_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    ok = await admin_service.delete_comment(db, comment_id)
    if not ok:
        raise HTTPException(404, detail="Comment không tồn tại")
    return {"success": True, "message": "Đã xóa comment"}


# ── Ingredients ────────────────────────────────────────────────────────────────

@router.get("/ingredients")
async def list_ingredients(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    search: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await admin_service.list_admin_ingredients(db, page=page, limit=limit, search=search)
    return {"success": True, **result}


@router.post("/ingredients/merge")
async def merge_ingredients(
    body: MergeIngredientsBody,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    if not body.from_names:
        raise HTTPException(400, detail="from_names không được rỗng")
    count = await admin_service.merge_ingredients(db, body.from_names, body.to_name)
    return {"success": True, "data": {"updated_count": count}}


@router.post("/ingredients/rename")
async def rename_ingredient(
    body: RenameIngredientBody,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    count = await admin_service.rename_ingredient(db, body.from_name, body.to_name)
    return {"success": True, "data": {"updated_count": count}}
