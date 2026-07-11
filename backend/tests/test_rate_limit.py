from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from app.core.rate_limit import limiter, register_rate_limiting


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
