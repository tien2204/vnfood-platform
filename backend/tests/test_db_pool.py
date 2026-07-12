from app.core.config import settings
from app.core.database import engine


def test_pool_config_defaults():
    # Defaults preserve current single-instance behaviour; prod overrides via env.
    assert settings.DB_POOL_SIZE == 10
    assert settings.DB_MAX_OVERFLOW == 20
    assert settings.DB_POOL_RECYCLE_SECONDS == 1800


def test_engine_uses_configured_pool_size():
    # Engine wiring reads the configurable pool size (not a hardcoded literal).
    assert engine.pool.size() == settings.DB_POOL_SIZE
