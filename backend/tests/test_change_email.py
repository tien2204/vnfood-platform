import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.core.security import hash_password
from app.models.user import User
from app.services import auth_service


def _make_user(email="old@example.com", password="correct-pass"):
    u = User()
    u.email = email
    u.hashed_password = hash_password(password)
    return u


def _db_with_existing(existing_user):
    """AsyncMock db whose execute().scalar_one_or_none() returns existing_user."""
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = existing_user
    db.execute.return_value = result
    return db


def test_change_email_wrong_password_raises_400():
    user = _make_user()
    db = _db_with_existing(None)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(auth_service.change_email(db, user, "new@example.com", "WRONG"))
    assert exc.value.status_code == 400
    db.commit.assert_not_awaited()


def test_change_email_duplicate_raises_400():
    user = _make_user()
    db = _db_with_existing(_make_user(email="new@example.com"))  # email taken
    with pytest.raises(HTTPException) as exc:
        asyncio.run(auth_service.change_email(db, user, "new@example.com", "correct-pass"))
    assert exc.value.status_code == 400
    db.commit.assert_not_awaited()


def test_change_email_success_updates_and_commits():
    user = _make_user()
    db = _db_with_existing(None)  # email free
    asyncio.run(auth_service.change_email(db, user, "new@example.com", "correct-pass"))
    assert user.email == "new@example.com"
    db.commit.assert_awaited_once()
