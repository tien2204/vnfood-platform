import io

from fastapi.testclient import TestClient
from PIL import Image

import app as svc

_FULL = {
    "needs_fallback": False, "group": "BANH", "group_confidence": 0.98,
    "predicted_class": "banh-mi", "display_name": "Bánh mì",
    "class_confidence": 0.91,
    "top5": [{"class": "banh-mi", "display_name": "Bánh mì", "confidence": 0.91}],
}


class _StubPredictor:
    device = "cpu"
    sub_models: dict = {}

    def __init__(self, *a, **k):
        pass

    def predict(self, img):
        return _FULL


def _img_bytes():
    buf = io.BytesIO()
    Image.new("RGB", (120, 120)).save(buf, format="JPEG")
    return buf.getvalue()


def test_predict_returns_contract(monkeypatch):
    monkeypatch.setattr(svc, "TastyVietnamPredictor", _StubPredictor)
    with TestClient(svc.app) as client:
        r = client.post("/predict", files={"file": ("x.jpg", _img_bytes(), "image/jpeg")})
    assert r.status_code == 200
    body = r.json()
    assert body["group"] == "BANH"
    assert set(("needs_fallback", "top5", "predicted_class")).issubset(body)


def test_health(monkeypatch):
    monkeypatch.setattr(svc, "TastyVietnamPredictor", _StubPredictor)
    with TestClient(svc.app) as client:
        r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_predict_rejects_wrong_token(monkeypatch):
    monkeypatch.setattr(svc, "TastyVietnamPredictor", _StubPredictor)
    monkeypatch.setattr(svc, "API_TOKEN", "secret")
    with TestClient(svc.app) as client:
        r = client.post("/predict",
                        files={"file": ("x.jpg", _img_bytes(), "image/jpeg")},
                        headers={"Authorization": "Bearer wrong"})
    assert r.status_code == 401


def test_predict_accepts_correct_token(monkeypatch):
    monkeypatch.setattr(svc, "TastyVietnamPredictor", _StubPredictor)
    monkeypatch.setattr(svc, "API_TOKEN", "secret")
    with TestClient(svc.app) as client:
        r = client.post("/predict",
                        files={"file": ("x.jpg", _img_bytes(), "image/jpeg")},
                        headers={"Authorization": "Bearer secret"})
    assert r.status_code == 200
