import uuid
from datetime import date, timedelta
from collections import defaultdict
from sqlalchemy import select, delete, update
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException

from app.models.meal_plan import MealPlan, MealPlanItem, GroceryItem
from app.models.recipe import Recipe, RecipeIngredient


async def create_meal_plan(db: AsyncSession, user_id: uuid.UUID, name: str, week_start: date) -> MealPlan:
    if week_start.weekday() != 0:
        raise HTTPException(400, detail="week_start phải là Thứ 2 (Monday)")

    existing = await db.execute(
        select(MealPlan).where(
            MealPlan.user_id == user_id,
            MealPlan.week_start == week_start,
        )
    )
    found = existing.scalar_one_or_none()
    if found:
        return found

    plan = MealPlan(user_id=user_id, name=name, week_start=week_start)
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return plan


async def get_meal_plan_full(db: AsyncSession, plan_id: uuid.UUID, user_id: uuid.UUID) -> dict:
    result = await db.execute(
        select(MealPlan).where(
            MealPlan.id == plan_id, MealPlan.user_id == user_id
        ).options(selectinload(MealPlan.items))
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(404, detail="Meal plan không tồn tại")

    days = {}
    for i in range(7):
        day = plan.week_start + timedelta(days=i)
        days[day.isoformat()] = {"breakfast": [], "lunch": [], "dinner": [], "snack": []}

    recipe_ids = [str(it.recipe_id) for it in plan.items if it.recipe_id]
    recipe_map: dict = {}
    if recipe_ids:
        recipes_q = await db.execute(
            select(Recipe).where(Recipe.id.in_(recipe_ids))
        )
        recipe_map = {str(r.id): r for r in recipes_q.scalars().all()}

    for it in plan.items:
        d = it.date.isoformat()
        if d not in days:
            continue
        recipe = recipe_map.get(str(it.recipe_id)) if it.recipe_id else None
        recipe_data = None
        if recipe:
            recipe_data = {
                "id": str(recipe.id),
                "title": recipe.title,
                "image_url": recipe.image_url,
                "cooking_time": recipe.cooking_time,
            }
        days[d][it.meal_type].append({
            "item_id": str(it.id),
            "recipe": recipe_data,
            "servings": it.servings,
            "note": it.note,
        })

    return {
        "id": str(plan.id),
        "name": plan.name,
        "week_start": plan.week_start.isoformat(),
        "days": days,
    }


async def list_user_meal_plans(
    db: AsyncSession, user_id: uuid.UUID, page: int = 1, limit: int = 10
) -> tuple[list, dict]:
    offset = (page - 1) * limit
    from sqlalchemy import func as sqlfunc

    count_q = await db.execute(
        select(sqlfunc.count()).select_from(MealPlan).where(MealPlan.user_id == user_id)
    )
    total = count_q.scalar_one()

    plans_q = await db.execute(
        select(MealPlan)
        .where(MealPlan.user_id == user_id)
        .order_by(MealPlan.week_start.desc())
        .offset(offset)
        .limit(limit)
        .options(selectinload(MealPlan.items))
    )
    plans = plans_q.scalars().all()

    result = []
    for p in plans:
        result.append({
            "id": str(p.id),
            "name": p.name,
            "week_start": p.week_start.isoformat(),
            "items_count": len(p.items),
            "created_at": p.created_at.isoformat(),
        })

    pagination = {
        "page": page,
        "limit": limit,
        "total": total,
        "total_pages": max(1, -(-total // limit)),
    }
    return result, pagination


async def add_meal_plan_item(
    db: AsyncSession, plan_id: uuid.UUID, user_id: uuid.UUID, data
) -> MealPlanItem:
    plan_q = await db.execute(
        select(MealPlan).where(MealPlan.id == plan_id, MealPlan.user_id == user_id)
    )
    plan = plan_q.scalar_one_or_none()
    if not plan:
        raise HTTPException(404, detail="Meal plan không tồn tại")

    if not (plan.week_start <= data.date <= plan.week_start + timedelta(days=6)):
        raise HTTPException(400, detail="Ngày không nằm trong tuần của plan")

    item = MealPlanItem(
        meal_plan_id=plan_id,
        recipe_id=uuid.UUID(data.recipe_id),
        date=data.date,
        meal_type=data.meal_type,
        servings=data.servings,
        note=data.note,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


async def update_meal_plan_item(
    db: AsyncSession, plan_id: uuid.UUID, item_id: uuid.UUID, user_id: uuid.UUID, data
) -> MealPlanItem:
    # verify plan ownership
    plan_q = await db.execute(
        select(MealPlan).where(MealPlan.id == plan_id, MealPlan.user_id == user_id)
    )
    if not plan_q.scalar_one_or_none():
        raise HTTPException(404, detail="Meal plan không tồn tại")

    item_q = await db.execute(
        select(MealPlanItem).where(
            MealPlanItem.id == item_id, MealPlanItem.meal_plan_id == plan_id
        )
    )
    item = item_q.scalar_one_or_none()
    if not item:
        raise HTTPException(404, detail="Item không tồn tại")

    if data.servings is not None:
        item.servings = data.servings
    if data.note is not None:
        item.note = data.note

    await db.commit()
    await db.refresh(item)
    return item


async def delete_meal_plan_item(
    db: AsyncSession, plan_id: uuid.UUID, item_id: uuid.UUID, user_id: uuid.UUID
) -> None:
    plan_q = await db.execute(
        select(MealPlan).where(MealPlan.id == plan_id, MealPlan.user_id == user_id)
    )
    if not plan_q.scalar_one_or_none():
        raise HTTPException(404, detail="Meal plan không tồn tại")

    await db.execute(
        delete(MealPlanItem).where(
            MealPlanItem.id == item_id, MealPlanItem.meal_plan_id == plan_id
        )
    )
    await db.commit()


async def delete_meal_plan(db: AsyncSession, plan_id: uuid.UUID, user_id: uuid.UUID) -> None:
    plan_q = await db.execute(
        select(MealPlan).where(MealPlan.id == plan_id, MealPlan.user_id == user_id)
    )
    if not plan_q.scalar_one_or_none():
        raise HTTPException(404, detail="Meal plan không tồn tại")

    await db.execute(delete(MealPlan).where(MealPlan.id == plan_id))
    await db.commit()


async def generate_grocery_list(db: AsyncSession, plan_id: uuid.UUID, user_id: uuid.UUID) -> dict:
    plan_q = await db.execute(
        select(MealPlan).where(MealPlan.id == plan_id, MealPlan.user_id == user_id)
    )
    if not plan_q.scalar_one_or_none():
        raise HTTPException(404, detail="Meal plan không tồn tại")

    items_q = await db.execute(
        select(MealPlanItem).where(MealPlanItem.meal_plan_id == plan_id)
    )
    items = items_q.scalars().all()

    if not items:
        await db.execute(delete(GroceryItem).where(GroceryItem.meal_plan_id == plan_id))
        await db.commit()
        return {"items": [], "total_items": 0, "checked_count": 0}

    aggregated: dict = defaultdict(lambda: {"quantities": [], "from_recipes": []})

    for item in items:
        if not item.recipe_id:
            continue
        ing_q = await db.execute(
            select(RecipeIngredient, Recipe)
            .join(Recipe, Recipe.id == RecipeIngredient.recipe_id)
            .where(RecipeIngredient.recipe_id == item.recipe_id)
        )
        for ing, recipe in ing_q.all():
            name = ing.ingredient_name or ing.display_text
            if not name:
                continue
            aggregated[name]["quantities"].append(ing.quantity or "")
            aggregated[name]["from_recipes"].append({
                "recipe_id": str(recipe.id),
                "title": recipe.title,
                "quantity": ing.quantity or "",
            })

    # Preserve existing is_checked state
    existing_q = await db.execute(
        select(GroceryItem).where(GroceryItem.meal_plan_id == plan_id)
    )
    existing_map = {g.ingredient_name: g.is_checked for g in existing_q.scalars().all()}

    await db.execute(delete(GroceryItem).where(GroceryItem.meal_plan_id == plan_id))

    output_items = []
    for name, data in aggregated.items():
        qty_parts = [q for q in data["quantities"] if q]
        qty_str = ", ".join(qty_parts) if qty_parts else "vừa đủ"
        is_checked = existing_map.get(name, False)

        item = GroceryItem(
            meal_plan_id=plan_id,
            ingredient_name=name,
            quantity=qty_str,
            is_checked=is_checked,
        )
        db.add(item)
        await db.flush()

        output_items.append({
            "id": str(item.id),
            "ingredient_name": name,
            "quantity": qty_str,
            "is_checked": is_checked,
            "from_recipes": data["from_recipes"],
        })

    await db.commit()
    return {
        "items": output_items,
        "total_items": len(output_items),
        "checked_count": sum(1 for i in output_items if i["is_checked"]),
    }


async def get_grocery_list(db: AsyncSession, plan_id: uuid.UUID, user_id: uuid.UUID) -> dict:
    plan_q = await db.execute(
        select(MealPlan).where(MealPlan.id == plan_id, MealPlan.user_id == user_id)
    )
    if not plan_q.scalar_one_or_none():
        raise HTTPException(404, detail="Meal plan không tồn tại")

    grocery_q = await db.execute(
        select(GroceryItem).where(GroceryItem.meal_plan_id == plan_id).order_by(GroceryItem.ingredient_name)
    )
    items = grocery_q.scalars().all()

    output_items = []
    for g in items:
        output_items.append({
            "id": str(g.id),
            "ingredient_name": g.ingredient_name,
            "quantity": g.quantity,
            "is_checked": g.is_checked,
            "from_recipes": [],
        })

    return {
        "items": output_items,
        "total_items": len(output_items),
        "checked_count": sum(1 for i in output_items if i["is_checked"]),
    }


async def update_grocery_item(
    db: AsyncSession, item_id: uuid.UUID, user_id: uuid.UUID, is_checked: bool
) -> dict:
    # Join to verify ownership via meal_plan
    item_q = await db.execute(
        select(GroceryItem).join(MealPlan, MealPlan.id == GroceryItem.meal_plan_id).where(
            GroceryItem.id == item_id, MealPlan.user_id == user_id
        )
    )
    item = item_q.scalar_one_or_none()
    if not item:
        raise HTTPException(404, detail="Grocery item không tồn tại")

    item.is_checked = is_checked
    await db.commit()
    await db.refresh(item)
    return {"id": str(item.id), "is_checked": item.is_checked}


async def add_grocery_item_manual(
    db: AsyncSession, plan_id: uuid.UUID, user_id: uuid.UUID, ingredient_name: str, quantity: str | None
) -> dict:
    plan_q = await db.execute(
        select(MealPlan).where(MealPlan.id == plan_id, MealPlan.user_id == user_id)
    )
    if not plan_q.scalar_one_or_none():
        raise HTTPException(404, detail="Meal plan không tồn tại")

    item = GroceryItem(
        meal_plan_id=plan_id,
        ingredient_name=ingredient_name,
        quantity=quantity,
        is_checked=False,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return {
        "id": str(item.id),
        "ingredient_name": item.ingredient_name,
        "quantity": item.quantity,
        "is_checked": item.is_checked,
        "from_recipes": [],
    }


async def delete_grocery_item(
    db: AsyncSession, item_id: uuid.UUID, user_id: uuid.UUID
) -> None:
    item_q = await db.execute(
        select(GroceryItem).join(MealPlan, MealPlan.id == GroceryItem.meal_plan_id).where(
            GroceryItem.id == item_id, MealPlan.user_id == user_id
        )
    )
    if not item_q.scalar_one_or_none():
        raise HTTPException(404, detail="Grocery item không tồn tại")

    await db.execute(delete(GroceryItem).where(GroceryItem.id == item_id))
    await db.commit()
