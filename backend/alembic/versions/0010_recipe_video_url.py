"""recipes.video_url (YouTube tutorial URL, mainly monngonmoingay)

Revision ID: 0010
Revises: 0009
Create Date: 2026-06-03
"""
from alembic import op
import sqlalchemy as sa


revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("recipes", sa.Column("video_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("recipes", "video_url")
