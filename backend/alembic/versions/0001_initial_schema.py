"""Initial schema

Revision ID: 0001
Revises:
Create Date: 2026-05-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- users ---
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("hashed_password", sa.Text(), nullable=False),
        sa.Column("full_name", sa.Text()),
        sa.Column("avatar_url", sa.Text()),
        sa.Column("bio", sa.Text()),
        sa.Column("role", sa.String(20), nullable=False, server_default="user"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_role", "users", ["role"])
    op.create_index("ix_users_is_active", "users", ["is_active"])

    # --- recipes ---
    op.create_table(
        "recipes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("source", sa.String(20), nullable=False, server_default="user"),
        sa.Column("cookpad_url", sa.Text(), unique=True),
        sa.Column("keyword", sa.Text()),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("reject_reason", sa.Text()),
        sa.Column(
            "author_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
        ),
        sa.Column("image_url", sa.Text()),
        sa.Column("cooking_time", sa.Integer()),
        sa.Column("servings", sa.Integer(), nullable=False, server_default="2"),
        sa.Column("difficulty", sa.String(20)),
        sa.Column("avg_rating", sa.Float(), nullable=False, server_default="0"),
        sa.Column("rating_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("view_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("save_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_recipes_status", "recipes", ["status"])
    op.create_index("ix_recipes_source", "recipes", ["source"])
    op.create_index("ix_recipes_keyword", "recipes", ["keyword"])
    op.create_index("ix_recipes_author_id", "recipes", ["author_id"])
    op.create_index("ix_recipes_created_at", "recipes", ["created_at"])

    # --- recipe_ingredients ---
    op.create_table(
        "recipe_ingredients",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "recipe_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("recipes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("display_text", sa.Text(), nullable=False),
        sa.Column("ingredient_name", sa.Text()),
        sa.Column("quantity", sa.Text()),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_recipe_ingredients_recipe_id", "recipe_ingredients", ["recipe_id"])
    op.create_index("ix_recipe_ingredients_name", "recipe_ingredients", ["ingredient_name"])

    # --- recipe_steps ---
    op.create_table(
        "recipe_steps",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "recipe_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("recipes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("step_number", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("image_url", sa.Text()),
        sa.Column("timer_seconds", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_recipe_steps_recipe_id", "recipe_steps", ["recipe_id"])

    # --- comments ---
    op.create_table(
        "comments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "recipe_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("recipes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
        ),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("is_hidden", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_comments_recipe_id", "comments", ["recipe_id"])
    op.create_index("ix_comments_user_id", "comments", ["user_id"])

    # --- ratings ---
    op.create_table(
        "ratings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "recipe_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("recipes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
        ),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint("score BETWEEN 1 AND 5", name="ck_ratings_score"),
        sa.UniqueConstraint("recipe_id", "user_id", name="uq_ratings_recipe_user"),
    )
    op.create_index("ix_ratings_recipe_id", "ratings", ["recipe_id"])

    # --- saved_recipes ---
    op.create_table(
        "saved_recipes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "recipe_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("recipes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("user_id", "recipe_id", name="uq_saved_recipes_user_recipe"),
    )
    op.create_index("ix_saved_recipes_user_id", "saved_recipes", ["user_id"])

    # --- follows ---
    op.create_table(
        "follows",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "follower_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "following_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("follower_id", "following_id", name="uq_follows_follower_following"),
    )
    op.create_index("ix_follows_follower_id", "follows", ["follower_id"])
    op.create_index("ix_follows_following_id", "follows", ["following_id"])

    # --- meal_plans ---
    op.create_table(
        "meal_plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.Text(), nullable=False, server_default="Meal Plan tuần này"),
        sa.Column("week_start", sa.Date(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_meal_plans_user_id", "meal_plans", ["user_id"])

    # --- meal_plan_items ---
    op.create_table(
        "meal_plan_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "meal_plan_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("meal_plans.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "recipe_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("recipes.id", ondelete="SET NULL"),
        ),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("meal_type", sa.String(20), nullable=False),
        sa.Column("servings", sa.Integer(), nullable=False, server_default="2"),
        sa.Column("note", sa.Text()),
    )
    op.create_index("ix_meal_plan_items_meal_plan_id", "meal_plan_items", ["meal_plan_id"])
    op.create_index("ix_meal_plan_items_recipe_id", "meal_plan_items", ["recipe_id"])

    # --- grocery_items ---
    op.create_table(
        "grocery_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "meal_plan_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("meal_plans.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("ingredient_name", sa.Text(), nullable=False),
        sa.Column("quantity", sa.Text()),
        sa.Column("is_checked", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.create_index("ix_grocery_items_meal_plan_id", "grocery_items", ["meal_plan_id"])

    # --- ai_logs ---
    op.create_table(
        "ai_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
        ),
        sa.Column("image_url", sa.Text()),
        sa.Column("predicted_class", sa.Text()),
        sa.Column("confidence", sa.Float()),
        sa.Column("model_used", sa.String(20)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_ai_logs_user_id", "ai_logs", ["user_id"])
    op.create_index("ix_ai_logs_created_at", "ai_logs", ["created_at"])


def downgrade() -> None:
    op.drop_table("ai_logs")
    op.drop_table("grocery_items")
    op.drop_table("meal_plan_items")
    op.drop_table("meal_plans")
    op.drop_table("follows")
    op.drop_table("saved_recipes")
    op.drop_table("ratings")
    op.drop_table("comments")
    op.drop_table("recipe_steps")
    op.drop_table("recipe_ingredients")
    op.drop_table("recipes")
    op.drop_table("users")
