import pytest
from pydantic import ValidationError

from app.core.config import Settings


def _base_env(monkeypatch, secret):
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:p@localhost:5432/db")
    monkeypatch.setenv("SECRET_KEY", secret)


def test_rejects_placeholder_key(monkeypatch):
    _base_env(monkeypatch, "your-super-secret-key-change-this-to-random-64-chars")
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_rejects_short_key(monkeypatch):
    _base_env(monkeypatch, "short")
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_accepts_strong_key(monkeypatch):
    _base_env(monkeypatch, "a" * 48)
    s = Settings(_env_file=None)
    assert len(s.SECRET_KEY) >= 32
