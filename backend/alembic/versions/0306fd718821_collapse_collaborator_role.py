"""collapse_collaborator_role

Revision ID: 0306fd718821
Revises: 0014
Create Date: 2026-06-11 23:27:14.953615

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0306fd718821'
down_revision: Union[str, None] = '0015'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Remap users: collaborator -> user (admins untouched)
    op.execute("UPDATE users SET role = 'user' WHERE role = 'collaborator'")
    # Remap recipes still in the collaborator review stage -> single admin queue
    op.execute("UPDATE recipes SET status = 'pending_admin' WHERE status = 'pending_collaborator'")
    # Clear any lingering claim locks (claim columns kept dormant, not dropped)
    op.execute("UPDATE recipes SET claimed_by = NULL, claimed_at = NULL WHERE claimed_by IS NOT NULL")


def downgrade() -> None:
    # Irreversible data remap: which users were collaborators is not recoverable.
    # No-op downgrade by design.
    pass
