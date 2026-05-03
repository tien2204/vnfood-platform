"""Make servings and timer_seconds nullable

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-03
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("recipes", "servings", existing_type=sa.Integer(), nullable=True)
    op.alter_column("recipe_steps", "timer_seconds", existing_type=sa.Integer(), nullable=True)

    # Clear the hardcoded defaults from existing Cookpad data
    op.execute("UPDATE recipes SET servings = NULL WHERE source = 'cookpad' AND servings = 2")
    op.execute("UPDATE recipe_steps SET timer_seconds = NULL WHERE timer_seconds = 0")


def downgrade() -> None:
    op.execute("UPDATE recipe_steps SET timer_seconds = 0 WHERE timer_seconds IS NULL")
    op.alter_column("recipe_steps", "timer_seconds", existing_type=sa.Integer(), nullable=False)

    op.execute("UPDATE recipes SET servings = 2 WHERE servings IS NULL")
    op.alter_column("recipes", "servings", existing_type=sa.Integer(), nullable=False)
