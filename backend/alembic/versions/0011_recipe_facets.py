"""recipes facet tags: regions / occasions / dish_types / diets

Revision ID: 0011
Revises: 0010
Create Date: 2026-06-05
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None

_COLS = ("regions", "occasions", "dish_types", "diets")


def upgrade() -> None:
    for col in _COLS:
        op.add_column("recipes", sa.Column(col, postgresql.ARRAY(sa.String()), nullable=True))


def downgrade() -> None:
    for col in reversed(_COLS):
        op.drop_column("recipes", col)
