from app.core.config import settings
from app.ai.http_predictor import HttpPredictor


def test_http_backend_returns_http_predictor(monkeypatch):
    from app.ai import factory
    monkeypatch.setattr(settings, "AI_BACKEND", "http")
    monkeypatch.setattr(settings, "AI_SERVICE_URL", "http://svc")
    p = factory.build_predictor()
    assert isinstance(p, HttpPredictor)
    assert p.base_url == "http://svc"


def test_local_backend_missing_weights_returns_none(monkeypatch):
    from app.ai import factory
    monkeypatch.setattr(settings, "AI_BACKEND", "local")
    monkeypatch.setattr(settings, "MODEL_WEIGHTS_DIR", "/khong-ton-tai-xyz")
    assert factory.build_predictor() is None
