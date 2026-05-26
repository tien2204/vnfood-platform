"""canonical recipes columns

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("recipes", sa.Column("is_canonical", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("recipes", sa.Column("canonical_dish_slug", sa.String(80), nullable=True))
    op.add_column("recipes", sa.Column("variant_label", sa.String(80), nullable=True))
    op.add_column("recipes", sa.Column("is_dessert", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("recipes", sa.Column("llm_judge_score", sa.Float(), nullable=True))
    op.add_column("recipes", sa.Column("llm_judge_reason", sa.Text(), nullable=True))
    op.add_column("recipes", sa.Column("derived_from_recipe_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("recipes", sa.Column("refinement_notes", sa.Text(), nullable=True))
    op.add_column("recipes", sa.Column("is_manually_reviewed", sa.Boolean(), nullable=False, server_default=sa.text("false")))

    op.create_foreign_key(
        "fk_recipes_derived_from",
        "recipes", "recipes",
        ["derived_from_recipe_id"], ["id"],
        ondelete="SET NULL",
    )

    op.create_index("ix_recipes_is_canonical", "recipes", ["is_canonical"], postgresql_where=sa.text("is_canonical = true"))
    op.create_index("ix_recipes_canonical_dish_slug", "recipes", ["canonical_dish_slug"])
    op.create_index("ix_recipes_is_dessert", "recipes", ["is_dessert"], postgresql_where=sa.text("is_dessert = true"))


def downgrade() -> None:
    op.drop_index("ix_recipes_is_dessert", table_name="recipes")
    op.drop_index("ix_recipes_canonical_dish_slug", table_name="recipes")
    op.drop_index("ix_recipes_is_canonical", table_name="recipes")
    op.drop_constraint("fk_recipes_derived_from", "recipes", type_="foreignkey")

    for col in [
        "is_manually_reviewed", "refinement_notes", "derived_from_recipe_id",
        "llm_judge_reason", "llm_judge_score", "is_dessert",
        "variant_label", "canonical_dish_slug", "is_canonical",
    ]:
        op.drop_column("recipes", col)
