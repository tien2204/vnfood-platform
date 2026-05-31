"""grocery_items.is_manual flag (preserve manual items on regenerate)

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-31
"""
from alembic import op
import sqlalchemy as sa


revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "grocery_items",
        sa.Column("is_manual", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("grocery_items", "is_manual")
