"""Single source of truth for user roles + hierarchy (admin ⊇ collaborator ⊇ user)."""

USER = "user"
COLLABORATOR = "collaborator"
ADMIN = "admin"

ROLES = (USER, COLLABORATOR, ADMIN)  # valid role values for DB / API
ROLE_RANK = {USER: 0, COLLABORATOR: 1, ADMIN: 2}
ROLE_LABELS_VI = {USER: "Người dùng", COLLABORATOR: "Cộng tác viên", ADMIN: "Quản trị"}


def role_at_least(role: str, minimum: str) -> bool:
    """True if `role`'s rank >= `minimum`'s rank (unknown role -> below everything)."""
    return ROLE_RANK.get(role, -1) >= ROLE_RANK[minimum]
