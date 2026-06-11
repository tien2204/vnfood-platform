import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_admin
from app.models.user import User
from app.schemas.change_request import ChangeRequestCreate
from app.schemas.recipe import RejectBody
from app.services import change_request_service as crs

router = APIRouter()


@router.post("")
async def create_change_request(
    data: ChangeRequestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    cr = await crs.create_change_request(db, current_user, data)
    return {"success": True, "data": {"id": str(cr.id), "status": cr.status}, "message": "Đã gửi đề xuất"}


@router.get("/mine")
async def my_change_requests(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    items, total, total_pages = await crs.list_my_change_requests(db, current_user, page, limit)
    return {"success": True, "data": [i.model_dump(mode="json") for i in items],
            "pagination": {"page": page, "limit": limit, "total": total, "total_pages": total_pages}}


@router.get("")
async def pending_change_requests(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    items, total, total_pages = await crs.list_pending_change_requests(db, page, limit)
    return {"success": True, "data": [i.model_dump(mode="json") for i in items],
            "pagination": {"page": page, "limit": limit, "total": total, "total_pages": total_pages}}


@router.post("/{cr_id}/approve")
async def approve_change_request(
    cr_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    cr = await crs.approve_change_request(db, cr_id, current_admin)
    return {"success": True, "data": {"id": str(cr.id), "status": cr.status}, "message": "Đã duyệt & áp dụng"}


@router.post("/{cr_id}/reject")
async def reject_change_request(
    cr_id: uuid.UUID,
    body: RejectBody,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    cr = await crs.reject_change_request(db, cr_id, current_admin, body.reason)
    return {"success": True, "data": {"id": str(cr.id), "status": cr.status}, "message": "Đã từ chối"}
