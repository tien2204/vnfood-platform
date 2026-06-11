"""Single source of truth for user roles + hierarchy (admin ⊇ user)."""

USER = "user"
ADMIN = "admin"

ROLES = (USER, ADMIN)  # valid role values for DB / API
ROLE_RANK = {USER: 0, ADMIN: 1}
ROLE_LABELS_VI = {USER: "Người dùng", ADMIN: "Quản trị"}


def role_at_least(role: str, minimum: str) -> bool:
    """True if `role`'s rank >= `minimum`'s rank (unknown role -> below everything)."""
    return ROLE_RANK.get(role, -1) >= ROLE_RANK[minimum]
