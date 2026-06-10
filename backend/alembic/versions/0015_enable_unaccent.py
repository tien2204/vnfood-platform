"""Enable unaccent extension for accent-insensitive recipe title search

Revision ID: 0015
Revises: 0014
Create Date: 2026-06-10
"""
from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")


def downgrade() -> None:
    op.execute("DROP EXTENSION IF EXISTS unaccent")
