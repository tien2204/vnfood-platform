"""in_scope flag, dish_slug, is_curated, source_url + drop social tables

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-24
"""
from alembic import op
import sqlalchemy as sa


revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add new columns to recipes
    op.add_column("recipes", sa.Column("is_in_scope", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("recipes", sa.Column("dish_slug", sa.String(length=50), nullable=True))
    op.add_column("recipes", sa.Column("is_curated", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("recipes", sa.Column("source_url", sa.String(length=500), nullable=True))

    op.create_index("ix_recipes_is_in_scope", "recipes", ["is_in_scope"], postgresql_where=sa.text("is_in_scope = true"))
    op.create_index("ix_recipes_dish_slug", "recipes", ["dish_slug"])
    op.create_index("ix_recipes_is_curated", "recipes", ["is_curated"], postgresql_where=sa.text("is_curated = true"))

    # 2. Drop social/meal-plan tables (off-PDF). Use IF EXISTS in case tables already dropped.
    op.execute("DROP TABLE IF EXISTS grocery_from_recipes CASCADE")
    op.execute("DROP TABLE IF EXISTS grocery_items CASCADE")
    op.execute("DROP TABLE IF EXISTS meal_plan_items CASCADE")
    op.execute("DROP TABLE IF EXISTS meal_plans CASCADE")
    op.execute("DROP TABLE IF EXISTS follows CASCADE")


def downgrade() -> None:
    # Best-effort: recreate follows only (meal_plan recreation should reference migration 0001)
    op.create_table(
        "follows",
        sa.Column("follower_id", sa.UUID(), nullable=False),
        sa.Column("followee_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("follower_id", "followee_id"),
    )

    op.drop_index("ix_recipes_is_curated", table_name="recipes")
    op.drop_index("ix_recipes_dish_slug", table_name="recipes")
    op.drop_index("ix_recipes_is_in_scope", table_name="recipes")
    op.drop_column("recipes", "source_url")
    op.drop_column("recipes", "is_curated")
    op.drop_column("recipes", "dish_slug")
    op.drop_column("recipes", "is_in_scope")
