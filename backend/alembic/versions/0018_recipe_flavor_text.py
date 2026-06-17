"""add recipes.flavor_text (taste-focused description override)

Revision ID: 0018
Revises: 0017
Create Date: 2026-06-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0018"
down_revision: Union[str, None] = "0017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("recipes", sa.Column("flavor_text", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("recipes", "flavor_text")
