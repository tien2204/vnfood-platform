from sqlalchemy import select, func, distinct
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.recipe import Recipe, RecipeIngredient


async def get_popular_ingredients(db: AsyncSession, limit: int = 30) -> list[dict]:
    query = (
        select(
            RecipeIngredient.ingredient_name,
            func.count(distinct(RecipeIngredient.recipe_id)).label("usage_count"),
        )
        .join(Recipe, Recipe.id == RecipeIngredient.recipe_id)
        .where(
            Recipe.status == "approved",
            RecipeIngredient.ingredient_name.isnot(None),
            RecipeIngredient.ingredient_name != "",
        )
        .group_by(RecipeIngredient.ingredient_name)
        .order_by(func.count(distinct(RecipeIngredient.recipe_id)).desc())
        .limit(limit)
    )
    result = await db.execute(query)
    return [{"name": r[0], "usage_count": r[1]} for r in result.all()]


async def search_ingredients(db: AsyncSession, q: str, limit: int = 20) -> list[dict]:
    query = (
        select(
            RecipeIngredient.ingredient_name,
            func.count(RecipeIngredient.id).label("usage_count"),
        )
        .where(
            RecipeIngredient.ingredient_name.ilike(f"%{q}%"),
            RecipeIngredient.ingredient_name.isnot(None),
            RecipeIngredient.ingredient_name != "",
        )
        .group_by(RecipeIngredient.ingredient_name)
        .order_by(func.count(RecipeIngredient.id).desc())
        .limit(limit)
    )
    result = await db.execute(query)
    return [{"name": r[0], "usage_count": r[1]} for r in result.all()]


async def suggest_recipes_by_ingredients(
    db: AsyncSession,
    ingredient_names: list[str],
    match_mode: str = "any",
    limit: int = 20,
) -> dict:
    from sqlalchemy.dialects.postgresql import array_agg

    match_subq = (
        select(
            Recipe.id.label("recipe_id"),
            func.count(distinct(RecipeIngredient.ingredient_name)).label("match_count"),
            func.array_agg(distinct(RecipeIngredient.ingredient_name)).label("matched"),
        )
        .join(RecipeIngredient, RecipeIngredient.recipe_id == Recipe.id)
        .where(
            Recipe.status == "approved",
            RecipeIngredient.ingredient_name.in_(ingredient_names),
        )
        .group_by(Recipe.id)
    )

    if match_mode == "all":
        match_subq = match_subq.having(
            func.count(distinct(RecipeIngredient.ingredient_name)) == len(ingredient_names)
        )

    match_subq = (
        match_subq
        .order_by(func.count(distinct(RecipeIngredient.ingredient_name)).desc())
        .limit(limit)
        .subquery()
    )

    full_query = (
        select(Recipe, match_subq.c.match_count, match_subq.c.matched)
        .join(match_subq, match_subq.c.recipe_id == Recipe.id)
        .order_by(match_subq.c.match_count.desc(), Recipe.avg_rating.desc().nullslast())
    )
    result = await db.execute(full_query)

    db_results = []
    for recipe, match_count, matched in result.all():
        matched_list = list(matched) if matched else []
        db_results.append({
            "recipe": {
                "id": str(recipe.id),
                "title": recipe.title,
                "image_url": recipe.image_url,
                "avg_rating": recipe.avg_rating or 0,
                "rating_count": recipe.rating_count or 0,
                "cooking_time": recipe.cooking_time,
                "source": recipe.source,
            },
            "match_score": round(match_count / len(ingredient_names), 2),
            "matched_ingredients": matched_list,
            "missing_ingredients": [
                ing for ing in ingredient_names if ing not in matched_list
            ],
        })

    return {
        "match_mode": match_mode,
        "selected_ingredients": ingredient_names,
        "db_results": db_results,
        "total_db_results": len(db_results),
    }
