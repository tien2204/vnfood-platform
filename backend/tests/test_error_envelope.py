from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.core.exceptions import AppException, register_exception_handlers


def _client() -> TestClient:
    app = FastAPI()
    register_exception_handlers(app)

    class Body(BaseModel):
        n: int

    @app.get("/not-found")
    def not_found():
        raise HTTPException(status_code=404, detail="Không tìm thấy")

    @app.get("/coded")
    def coded():
        raise AppException(status_code=404, code="RECIPE_NOT_FOUND", message="Công thức không tồn tại")

    @app.post("/validate")
    def validate(body: Body):
        return {"ok": body.n}

    @app.get("/boom")
    def boom():
        raise ValueError("kaboom")

    return TestClient(app, raise_server_exceptions=False)


def test_http_exception_wrapped_in_envelope():
    r = _client().get("/not-found")
    assert r.status_code == 404
    body = r.json()
    assert body["success"] is False
    assert body["error"]["code"] == "NOT_FOUND"
    assert body["error"]["message"] == "Không tìm thấy"


def test_app_exception_custom_code():
    r = _client().get("/coded")
    assert r.json()["error"]["code"] == "RECIPE_NOT_FOUND"


def test_validation_error_envelope():
    r = _client().post("/validate", json={"n": "not-an-int"})
    assert r.status_code == 422
    body = r.json()
    assert body["success"] is False
    assert body["error"]["code"] == "VALIDATION_ERROR"


def test_unhandled_exception_wrapped_in_envelope():
    r = _client().get("/boom")
    assert r.status_code == 500
    body = r.json()
    assert body["success"] is False
    assert body["error"]["code"] == "INTERNAL_ERROR"
