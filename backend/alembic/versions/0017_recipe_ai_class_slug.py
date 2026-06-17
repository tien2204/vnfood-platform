"""add recipes.ai_class_slug (parent 103-class tag)

Revision ID: 0017
Revises: 0016
Create Date: 2026-06-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0017"
down_revision: Union[str, None] = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("recipes", sa.Column("ai_class_slug", sa.String(length=80), nullable=True))
    op.create_index("ix_recipes_ai_class_slug", "recipes", ["ai_class_slug"])


def downgrade() -> None:
    op.drop_index("ix_recipes_ai_class_slug", table_name="recipes")
    op.drop_column("recipes", "ai_class_slug")
