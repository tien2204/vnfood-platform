import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models.user import User
from app.schemas.meal_plan import (
    GroceryItemCreate,
    GroceryItemUpdate,
    MealPlanCreate,
    MealPlanItemCreate,
    MealPlanItemUpdate,
)
from app.services import meal_plan_service, recommend_service

router = APIRouter()


# ── Meal Plans ────────────────────────────────────────────────────────────────

@router.post("")
async def create_meal_plan(
    data: MealPlanCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    plan = await meal_plan_service.create_meal_plan(
        db, user_id=current_user.id, name=data.name, week_start=data.week_start
    )
    return {"success": True, "data": {"id": str(plan.id), "name": plan.name, "week_start": plan.week_start.isoformat()}}


@router.get("/suggestions")
async def get_suggestions(
    n: int = Query(default=6, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    data = await recommend_service.suggest_recipes_for_user(db, current_user.id, n=n)
    return {"success": True, "data": data}


@router.get("/{plan_id}")
async def get_meal_plan(
    plan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    data = await meal_plan_service.get_meal_plan_full(db, plan_id=plan_id, user_id=current_user.id)
    return {"success": True, "data": data}


@router.delete("/{plan_id}", status_code=204)
async def delete_meal_plan(
    plan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    await meal_plan_service.delete_meal_plan(db, plan_id=plan_id, user_id=current_user.id)


# ── Meal Plan Items ───────────────────────────────────────────────────────────

@router.post("/{plan_id}/items")
async def add_item(
    plan_id: uuid.UUID,
    data: MealPlanItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    item = await meal_plan_service.add_meal_plan_item(
        db, plan_id=plan_id, user_id=current_user.id, data=data
    )
    return {
        "success": True,
        "data": {
            "id": str(item.id),
            "recipe_id": str(item.recipe_id),
            "date": item.date.isoformat(),
            "meal_type": item.meal_type,
            "servings": item.servings,
            "note": item.note,
        },
    }


@router.put("/{plan_id}/items/{item_id}")
async def update_item(
    plan_id: uuid.UUID,
    item_id: uuid.UUID,
    data: MealPlanItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    item = await meal_plan_service.update_meal_plan_item(
        db, plan_id=plan_id, item_id=item_id, user_id=current_user.id, data=data
    )
    return {
        "success": True,
        "data": {"id": str(item.id), "servings": item.servings, "note": item.note},
    }


@router.delete("/{plan_id}/items/{item_id}", status_code=204)
async def delete_item(
    plan_id: uuid.UUID,
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    await meal_plan_service.delete_meal_plan_item(
        db, plan_id=plan_id, item_id=item_id, user_id=current_user.id
    )


# ── Grocery List ──────────────────────────────────────────────────────────────

@router.get("/{plan_id}/grocery-list")
async def get_grocery_list(
    plan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    data = await meal_plan_service.get_grocery_list(db, plan_id=plan_id, user_id=current_user.id)
    return {"success": True, "data": data}


@router.post("/{plan_id}/grocery-list/regenerate")
async def regenerate_grocery_list(
    plan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    data = await meal_plan_service.generate_grocery_list(db, plan_id=plan_id, user_id=current_user.id)
    return {"success": True, "data": data}


@router.post("/{plan_id}/grocery-list/items")
async def add_grocery_item_manual(
    plan_id: uuid.UUID,
    data: GroceryItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    item = await meal_plan_service.add_grocery_item_manual(
        db, plan_id=plan_id, user_id=current_user.id,
        ingredient_name=data.ingredient_name, quantity=data.quantity,
    )
    return {"success": True, "data": item}


# ── Grocery Items (standalone) ────────────────────────────────────────────────

grocery_router = APIRouter()


@grocery_router.patch("/grocery-items/{item_id}")
async def update_grocery_item(
    item_id: uuid.UUID,
    data: GroceryItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await meal_plan_service.update_grocery_item(
        db, item_id=item_id, user_id=current_user.id, is_checked=data.is_checked
    )
    return {"success": True, "data": result}


@grocery_router.delete("/grocery-items/{item_id}", status_code=204)
async def delete_grocery_item(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    await meal_plan_service.delete_grocery_item(db, item_id=item_id, user_id=current_user.id)
