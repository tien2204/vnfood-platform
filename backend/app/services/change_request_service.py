import uuid

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.class_names import CLASS_DISPLAY_NAMES
from app.models.recipe import Recipe, RecipeIngredient, RecipeStep
from app.models.recipe_change_request import RecipeChangeRequest
from app.models.user import User
from app.schemas.change_request import ChangeRequestCreate, ChangeRequestOut
from app.schemas.recipe import RecipeCreate


async def _get_cr_or_404(db: AsyncSession, cr_id: uuid.UUID) -> RecipeChangeRequest:
    cr = (await db.execute(
        select(RecipeChangeRequest).where(RecipeChangeRequest.id == cr_id)
    )).scalar_one_or_none()
    if cr is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Đề xuất không tồn tại")
    return cr


async def _get_recipe_or_404(db: AsyncSession, recipe_id: uuid.UUID) -> Recipe:
    r = (await db.execute(select(Recipe).where(Recipe.id == recipe_id))).scalar_one_or_none()
    if r is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Công thức không tồn tại")
    return r


async def create_change_request(
    db: AsyncSession, user, data: ChangeRequestCreate
) -> RecipeChangeRequest:
    if data.type in ("edit", "delete"):
        if data.target_recipe_id is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Thiếu target_recipe_id")
        await _get_recipe_or_404(db, data.target_recipe_id)  # 404 if missing
    if data.type in ("create", "edit") and data.payload is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Thiếu payload công thức")
    cr = RecipeChangeRequest(
        id=uuid.uuid4(),
        type=data.type,
        target_recipe_id=data.target_recipe_id,
        payload=data.payload.model_dump(mode="json") if data.payload else None,
        requested_by=user.id,
        status="pending",
    )
    db.add(cr)
    await db.commit()
    await db.refresh(cr)
    return cr


def _to_out(cr: RecipeChangeRequest, target_title: str | None, requester_name: str | None) -> ChangeRequestOut:
    return ChangeRequestOut(
        id=cr.id, type=cr.type, target_recipe_id=cr.target_recipe_id,
        target_title=target_title, status=cr.status, reject_reason=cr.reject_reason,
        requested_by_name=requester_name, created_at=cr.created_at,
    )


async def _list(db: AsyncSession, where, order, page: int, limit: int):
    limit = min(limit, 50)
    base = select(RecipeChangeRequest).where(where)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (await db.execute(
        base.order_by(order).offset((page - 1) * limit).limit(limit)
    )).scalars().all()
    out = []
    for cr in rows:
        title = None
        if cr.target_recipe_id:
            title = (await db.execute(select(Recipe.title).where(Recipe.id == cr.target_recipe_id))).scalar_one_or_none()
        name = (await db.execute(select(User.full_name).where(User.id == cr.requested_by))).scalar_one_or_none()
        out.append(_to_out(cr, title, name))
    total_pages = (total + limit - 1) // limit if total > 0 else 0
    return out, total, total_pages


async def list_my_change_requests(db: AsyncSession, user, page: int = 1, limit: int = 20):
    return await _list(db, RecipeChangeRequest.requested_by == user.id,
                       RecipeChangeRequest.created_at.desc(), page, limit)


async def list_pending_change_requests(db: AsyncSession, page: int = 1, limit: int = 20):
    return await _list(db, RecipeChangeRequest.status == "pending",
                       RecipeChangeRequest.created_at.asc(), page, limit)


async def _write_ingredients_steps(db: AsyncSession, recipe_id: uuid.UUID, data: RecipeCreate) -> None:
    for ing in data.ingredients:
        db.add(RecipeIngredient(
            id=uuid.uuid4(), recipe_id=recipe_id, display_text=ing.display_text,
            ingredient_name=ing.ingredient_name, quantity=ing.quantity, order_index=ing.order_index,
        ))
    for s in data.steps:
        db.add(RecipeStep(
            id=uuid.uuid4(), recipe_id=recipe_id, step_number=s.step_number,
            content=s.content, image_url=s.image_url or None, timer_seconds=s.timer_seconds,
        ))


async def approve_change_request(db: AsyncSession, cr_id: uuid.UUID, admin) -> RecipeChangeRequest:
    cr = await _get_cr_or_404(db, cr_id)
    if cr.status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Đề xuất đã được xử lý")

    if cr.type == "create":
        data = RecipeCreate(**cr.payload)
        new_id = uuid.uuid4()
        db.add(Recipe(
            id=new_id, title=data.title, description=data.description, image_url=data.image_url,
            cooking_time=data.cooking_time, servings=data.servings, difficulty=data.difficulty,
            keyword=data.keyword, source="collaborator", status="approved",
            is_canonical=True, author_id=cr.requested_by,
        ))
        await db.flush()
        await _write_ingredients_steps(db, new_id, data)

    elif cr.type == "edit":
        data = RecipeCreate(**cr.payload)
        target = await _get_recipe_or_404(db, cr.target_recipe_id)
        target.title = data.title
        target.description = data.description
        target.image_url = data.image_url
        target.cooking_time = data.cooking_time
        target.servings = data.servings
        target.difficulty = data.difficulty
        target.keyword = data.keyword
        await db.execute(delete(RecipeIngredient).where(RecipeIngredient.recipe_id == target.id))
        await db.execute(delete(RecipeStep).where(RecipeStep.recipe_id == target.id))
        await _write_ingredients_steps(db, target.id, data)

    elif cr.type == "delete":
        target = await _get_recipe_or_404(db, cr.target_recipe_id)
        if target.is_canonical and target.canonical_dish_slug in CLASS_DISPLAY_NAMES:
            cnt = (await db.execute(
                select(func.count()).select_from(Recipe).where(
                    Recipe.is_canonical.is_(True),
                    Recipe.canonical_dish_slug == target.canonical_dish_slug,
                )
            )).scalar_one()
            if cnt <= 1:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Không thể xóa: canonical duy nhất cho lớp AI '{target.canonical_dish_slug}'",
                )
        await db.delete(target)

    cr.status = "approved"
    cr.reviewed_by = admin.id
    await db.commit()
    await db.refresh(cr)
    return cr


async def reject_change_request(db: AsyncSession, cr_id: uuid.UUID, admin, reason: str) -> RecipeChangeRequest:
    cr = await _get_cr_or_404(db, cr_id)
    if cr.status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Đề xuất đã được xử lý")
    cr.status = "rejected"
    cr.reject_reason = reason
    cr.reviewed_by = admin.id
    await db.commit()
    await db.refresh(cr)
    return cr
