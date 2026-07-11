"""newsletter subscribers table

Revision ID: 0019
Revises: 0018
Create Date: 2026-06-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "0019"
down_revision: Union[str, None] = "0018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "newsletter_subscribers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column(
            "is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
        sa.Column("unsubscribe_token", sa.String(length=64), nullable=False),
        sa.Column("source", sa.String(length=20), nullable=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("unsubscribed_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("email", name="uq_newsletter_subscribers_email"),
        sa.UniqueConstraint(
            "unsubscribe_token", name="uq_newsletter_subscribers_token"
        ),
    )
    op.create_index(
        "ix_newsletter_subscribers_email", "newsletter_subscribers", ["email"]
    )
    op.create_index(
        "ix_newsletter_subscribers_is_active",
        "newsletter_subscribers",
        ["is_active"],
    )
    op.create_index(
        "ix_newsletter_subscribers_unsubscribe_token",
        "newsletter_subscribers",
        ["unsubscribe_token"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_newsletter_subscribers_unsubscribe_token",
        table_name="newsletter_subscribers",
    )
    op.drop_index(
        "ix_newsletter_subscribers_is_active", table_name="newsletter_subscribers"
    )
    op.drop_index(
        "ix_newsletter_subscribers_email", table_name="newsletter_subscribers"
    )
    op.drop_table("newsletter_subscribers")
