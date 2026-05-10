from pydantic import BaseModel, Field
from datetime import date
from typing import Optional


class MealPlanCreate(BaseModel):
    name: str = Field(default="Meal Plan tuần này", max_length=100)
    week_start: date


class MealPlanItemCreate(BaseModel):
    recipe_id: str
    date: date
    meal_type: str = Field(..., pattern="^(breakfast|lunch|dinner|snack)$")
    servings: int = Field(default=2, ge=1, le=20)
    note: Optional[str] = None


class MealPlanItemUpdate(BaseModel):
    servings: Optional[int] = Field(default=None, ge=1, le=20)
    note: Optional[str] = None


class GroceryItemUpdate(BaseModel):
    is_checked: bool


class GroceryItemCreate(BaseModel):
    ingredient_name: str
    quantity: Optional[str] = None
