"""recipe facets v2: main_ingredients + cooking_methods

Revision ID: 0012
Revises: 0011
Create Date: 2026-06-05
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None

_COLS = ("main_ingredients", "cooking_methods")


def upgrade() -> None:
    for col in _COLS:
        op.add_column("recipes", sa.Column(col, postgresql.ARRAY(sa.String()), nullable=True))


def downgrade() -> None:
    for col in reversed(_COLS):
        op.drop_column("recipes", col)
