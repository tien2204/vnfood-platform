import uuid
from sqlalchemy import ARRAY, Boolean, Float, Index, Integer, String, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from sqlalchemy import DateTime

from app.core.database import Base


class Recipe(Base):
    __tablename__ = "recipes"
    __table_args__ = (
        Index("ix_recipes_status", "status"),
        Index("ix_recipes_source", "source"),
        Index("ix_recipes_keyword", "keyword"),
        Index("ix_recipes_author_id", "author_id"),
        Index("ix_recipes_created_at", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="user")
    cookpad_url: Mapped[str | None] = mapped_column(Text, unique=True)
    keyword: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    reject_reason: Mapped[str | None] = mapped_column(Text)
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    image_url: Mapped[str | None] = mapped_column(Text)
    original_author_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    cooking_time: Mapped[int | None] = mapped_column(Integer)
    servings: Mapped[int | None] = mapped_column(Integer)
    difficulty: Mapped[str | None] = mapped_column(String(20))
    avg_rating: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    rating_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    view_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    save_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Canonical recipe metadata
    is_canonical: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false", default=False, index=True)
    canonical_dish_slug: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    variant_label: Mapped[str | None] = mapped_column(String(80), nullable=True)
    is_dessert: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false", default=False, index=True)
    llm_judge_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    llm_judge_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    derived_from_recipe_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("recipes.id"), nullable=True)
    refinement_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_manually_reviewed: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false", default=False)
    meal_types: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)

    # Relationships
    author: Mapped["User"] = relationship(  # noqa: F821
        "User", back_populates="recipes", foreign_keys=[author_id]
    )
    ingredients: Mapped[list["RecipeIngredient"]] = relationship(
        "RecipeIngredient", back_populates="recipe",
        cascade="all, delete-orphan", order_by="RecipeIngredient.order_index"
    )
    steps: Mapped[list["RecipeStep"]] = relationship(
        "RecipeStep", back_populates="recipe",
        cascade="all, delete-orphan", order_by="RecipeStep.step_number"
    )
    comments: Mapped[list["Comment"]] = relationship(  # noqa: F821
        "Comment", back_populates="recipe", cascade="all, delete-orphan"
    )
    ratings: Mapped[list["Rating"]] = relationship(  # noqa: F821
        "Rating", back_populates="recipe", cascade="all, delete-orphan"
    )
    saved_by: Mapped[list["SavedRecipe"]] = relationship(  # noqa: F821
        "SavedRecipe", back_populates="recipe", cascade="all, delete-orphan"
    )
    meal_plan_items: Mapped[list["MealPlanItem"]] = relationship(  # noqa: F821
        "MealPlanItem", back_populates="recipe"
    )


class RecipeIngredient(Base):
    __tablename__ = "recipe_ingredients"
    __table_args__ = (
        Index("ix_recipe_ingredients_recipe_id", "recipe_id"),
        Index("ix_recipe_ingredients_name", "ingredient_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    recipe_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False
    )
    display_text: Mapped[str] = mapped_column(Text, nullable=False)
    ingredient_name: Mapped[str | None] = mapped_column(Text)
    quantity: Mapped[str | None] = mapped_column(Text)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    recipe: Mapped["Recipe"] = relationship("Recipe", back_populates="ingredients")


class RecipeStep(Base):
    __tablename__ = "recipe_steps"
    __table_args__ = (
        Index("ix_recipe_steps_recipe_id", "recipe_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    recipe_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False
    )
    step_number: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    image_url: Mapped[str | None] = mapped_column(Text)
    timer_seconds: Mapped[int | None] = mapped_column(Integer)

    recipe: Mapped["Recipe"] = relationship("Recipe", back_populates="steps")
