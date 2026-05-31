"""restore meal_plan trio (recreate tables dropped by 0005)

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-31
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "meal_plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("week_start", sa.Date(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.func.now(), nullable=False,
        ),
    )
    op.create_index("ix_meal_plans_user_id", "meal_plans", ["user_id"])

    op.create_table(
        "meal_plan_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "meal_plan_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("meal_plans.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column(
            "recipe_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("recipes.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("meal_type", sa.String(length=20), nullable=False),
        sa.Column("servings", sa.Integer(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
    )
    op.create_index("ix_meal_plan_items_meal_plan_id", "meal_plan_items", ["meal_plan_id"])
    op.create_index("ix_meal_plan_items_recipe_id", "meal_plan_items", ["recipe_id"])

    op.create_table(
        "grocery_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "meal_plan_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("meal_plans.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("ingredient_name", sa.Text(), nullable=False),
        sa.Column("quantity", sa.Text(), nullable=True),
        sa.Column("is_checked", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_index("ix_grocery_items_meal_plan_id", "grocery_items", ["meal_plan_id"])


def downgrade() -> None:
    op.drop_table("grocery_items")
    op.drop_table("meal_plan_items")
    op.drop_table("meal_plans")
