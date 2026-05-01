import uuid
from sqlalchemy import Boolean, Date, Index, Integer, String, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from sqlalchemy import DateTime

from app.core.database import Base


class MealPlan(Base):
    __tablename__ = "meal_plans"
    __table_args__ = (
        Index("ix_meal_plans_user_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False, default="Meal Plan tuần này")
    week_start: Mapped[Date] = mapped_column(Date, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship("User", back_populates="meal_plans")  # noqa: F821
    items: Mapped[list["MealPlanItem"]] = relationship(
        "MealPlanItem", back_populates="meal_plan", cascade="all, delete-orphan"
    )
    grocery_items: Mapped[list["GroceryItem"]] = relationship(
        "GroceryItem", back_populates="meal_plan", cascade="all, delete-orphan"
    )


class MealPlanItem(Base):
    __tablename__ = "meal_plan_items"
    __table_args__ = (
        Index("ix_meal_plan_items_meal_plan_id", "meal_plan_id"),
        Index("ix_meal_plan_items_recipe_id", "recipe_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    meal_plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("meal_plans.id", ondelete="CASCADE"), nullable=False
    )
    recipe_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("recipes.id", ondelete="SET NULL")
    )
    date: Mapped[Date] = mapped_column(Date, nullable=False)
    meal_type: Mapped[str] = mapped_column(String(20), nullable=False)
    servings: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    note: Mapped[str | None] = mapped_column(Text)

    meal_plan: Mapped["MealPlan"] = relationship("MealPlan", back_populates="items")
    recipe: Mapped["Recipe"] = relationship("Recipe", back_populates="meal_plan_items")  # noqa: F821


class GroceryItem(Base):
    __tablename__ = "grocery_items"
    __table_args__ = (
        Index("ix_grocery_items_meal_plan_id", "meal_plan_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    meal_plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("meal_plans.id", ondelete="CASCADE"), nullable=False
    )
    ingredient_name: Mapped[str] = mapped_column(Text, nullable=False)
    quantity: Mapped[str | None] = mapped_column(Text)
    is_checked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    meal_plan: Mapped["MealPlan"] = relationship("MealPlan", back_populates="grocery_items")
