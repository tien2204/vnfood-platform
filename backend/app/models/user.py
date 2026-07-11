import uuid
from sqlalchemy import Boolean, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from sqlalchemy import DateTime

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(Text, nullable=False)
    full_name: Mapped[str | None] = mapped_column(Text)
    avatar_url: Mapped[str | None] = mapped_column(Text)
    bio: Mapped[str | None] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="user", index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    recipes: Mapped[list["Recipe"]] = relationship(  # noqa: F821
        "Recipe", back_populates="author", foreign_keys="Recipe.author_id"
    )
    comments: Mapped[list["Comment"]] = relationship(  # noqa: F821
        "Comment", back_populates="user"
    )
    ratings: Mapped[list["Rating"]] = relationship(  # noqa: F821
        "Rating", back_populates="user"
    )
    saved_recipes: Mapped[list["SavedRecipe"]] = relationship(  # noqa: F821
        "SavedRecipe", back_populates="user", cascade="all, delete-orphan"
    )
    meal_plans: Mapped[list["MealPlan"]] = relationship(  # noqa: F821
        "MealPlan", back_populates="user", cascade="all, delete-orphan"
    )
    ai_logs: Mapped[list["AILog"]] = relationship(  # noqa: F821
        "AILog", back_populates="user"
    )
