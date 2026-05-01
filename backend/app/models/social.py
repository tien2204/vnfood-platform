import uuid
from sqlalchemy import Boolean, CheckConstraint, Index, Integer, Text, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from sqlalchemy import DateTime

from app.core.database import Base


class Comment(Base):
    __tablename__ = "comments"
    __table_args__ = (
        Index("ix_comments_recipe_id", "recipe_id"),
        Index("ix_comments_user_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    recipe_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_hidden: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    recipe: Mapped["Recipe"] = relationship("Recipe", back_populates="comments")  # noqa: F821
    user: Mapped["User"] = relationship("User", back_populates="comments")  # noqa: F821


class Rating(Base):
    __tablename__ = "ratings"
    __table_args__ = (
        UniqueConstraint("recipe_id", "user_id", name="uq_ratings_recipe_user"),
        CheckConstraint("score BETWEEN 1 AND 5", name="ck_ratings_score"),
        Index("ix_ratings_recipe_id", "recipe_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    recipe_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    recipe: Mapped["Recipe"] = relationship("Recipe", back_populates="ratings")  # noqa: F821
    user: Mapped["User"] = relationship("User", back_populates="ratings")  # noqa: F821


class SavedRecipe(Base):
    __tablename__ = "saved_recipes"
    __table_args__ = (
        UniqueConstraint("user_id", "recipe_id", name="uq_saved_recipes_user_recipe"),
        Index("ix_saved_recipes_user_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    recipe_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship("User", back_populates="saved_recipes")  # noqa: F821
    recipe: Mapped["Recipe"] = relationship("Recipe", back_populates="saved_by")  # noqa: F821


class Follow(Base):
    __tablename__ = "follows"
    __table_args__ = (
        UniqueConstraint("follower_id", "following_id", name="uq_follows_follower_following"),
        Index("ix_follows_follower_id", "follower_id"),
        Index("ix_follows_following_id", "following_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    follower_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    following_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    follower: Mapped["User"] = relationship(  # noqa: F821
        "User", back_populates="following", foreign_keys=[follower_id]
    )
    following: Mapped["User"] = relationship(  # noqa: F821
        "User", back_populates="followers", foreign_keys=[following_id]
    )
