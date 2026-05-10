from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db
from app.services.ingredient_service import (
    get_popular_ingredients,
    search_ingredients,
    suggest_recipes_by_ingredients,
)
from app.services.ingredient_ai_service import ai_suggest_recipes

router = APIRouter()


@router.get("/popular")
async def popular_ingredients(
    limit: int = Query(30, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    items = await get_popular_ingredients(db, limit=limit)
    return {"success": True, "data": items}


@router.get("/search")
async def search_ingredients_endpoint(
    q: str = Query(..., min_length=1, max_length=100),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    items = await search_ingredients(db, q, limit=limit)
    return {"success": True, "data": items}


class SuggestRequest(BaseModel):
    ingredient_names: list[str]
    match_mode: str = "any"

    @field_validator("ingredient_names")
    @classmethod
    def validate_ingredients(cls, v: list[str]) -> list[str]:
        cleaned = [name.strip() for name in v if name.strip()]
        if not cleaned:
            raise ValueError("Chọn ít nhất 1 nguyên liệu")
        return cleaned

    @field_validator("match_mode")
    @classmethod
    def validate_match_mode(cls, v: str) -> str:
        if v not in ("any", "all", "most"):
            raise ValueError("match_mode phải là 'any', 'all', hoặc 'most'")
        return v


@router.post("/suggest-recipes")
async def suggest_recipes(
    req: SuggestRequest,
    db: AsyncSession = Depends(get_db),
):
    db_data = await suggest_recipes_by_ingredients(
        db,
        req.ingredient_names,
        match_mode=req.match_mode,
        limit=20,
    )

    ai_suggestions: list[dict] = []
    if len(db_data["db_results"]) < 3:
        ai_suggestions = await ai_suggest_recipes(req.ingredient_names)

    return {
        "success": True,
        "data": {
            **db_data,
            "ai_suggestions": ai_suggestions,
            "ai_used": len(ai_suggestions) > 0,
        },
    }
