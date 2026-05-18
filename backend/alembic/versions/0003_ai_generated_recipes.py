"""Create ai_generated_recipes cache table

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-18
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_generated_recipes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("dish_name_normalized", sa.String(200), nullable=False),
        sa.Column("display_name", sa.String(200), nullable=False),
        sa.Column("recipe_json", postgresql.JSONB, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "created_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.UniqueConstraint("dish_name_normalized", name="uq_ai_generated_recipes_normalized"),
    )
    op.create_index(
        "ix_ai_generated_recipes_normalized",
        "ai_generated_recipes",
        ["dish_name_normalized"],
    )


def downgrade() -> None:
    op.drop_index("ix_ai_generated_recipes_normalized", table_name="ai_generated_recipes")
    op.drop_table("ai_generated_recipes")
