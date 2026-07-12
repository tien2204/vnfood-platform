from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.rate_limit import build_limiter, limiter, register_rate_limiting


def _client() -> TestClient:
    app = FastAPI()
    register_rate_limiting(app)

    @app.get("/ping")
    @limiter.limit("2/minute")
    async def ping(request: Request):
        return {"ok": True}

    return TestClient(app, raise_server_exceptions=False)


def test_returns_429_envelope_after_limit():
    client = _client()
    assert client.get("/ping").status_code == 200
    assert client.get("/ping").status_code == 200
    r = client.get("/ping")
    assert r.status_code == 429
    body = r.json()
    assert body["success"] is False
    assert body["error"]["code"] == "RATE_LIMITED"


def test_default_storage_is_in_memory():
    # Empty config → in-memory (dev). Multi-instance prod sets a Redis URI.
    assert settings.RATE_LIMIT_STORAGE_URI == ""


def test_build_limiter_uses_configured_storage():
    lim = build_limiter("memory://")
    assert lim._storage_uri == "memory://"


def test_build_limiter_empty_uri_falls_back_to_default():
    # Empty string must not be passed through as a storage URI.
    lim = build_limiter("")
    assert lim._storage_uri in (None, "memory://")
