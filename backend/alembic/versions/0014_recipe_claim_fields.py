"""recipe claim fields (claim-lock on collaborator review queue)

Revision ID: 0014
Revises: 0013
Create Date: 2026-06-06
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("recipes", sa.Column("claimed_by", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("recipes", sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(
        "fk_recipes_claimed_by_users", "recipes", "users",
        ["claimed_by"], ["id"], ondelete="SET NULL",
    )
    op.create_index("ix_recipes_claimed_by", "recipes", ["claimed_by"])


def downgrade() -> None:
    op.drop_index("ix_recipes_claimed_by", table_name="recipes")
    op.drop_constraint("fk_recipes_claimed_by_users", "recipes", type_="foreignkey")
    op.drop_column("recipes", "claimed_at")
    op.drop_column("recipes", "claimed_by")
