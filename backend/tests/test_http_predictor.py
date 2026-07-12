import io

import pytest
import requests
from fastapi import HTTPException
from PIL import Image

from app.ai import http_predictor as hp
from app.ai.http_predictor import HttpPredictor

_FULL = {
    "needs_fallback": False,
    "group": "BANH",
    "group_confidence": 0.98,
    "predicted_class": "banh-mi",
    "display_name": "Bánh mì",
    "class_confidence": 0.91,
    "top5": [{"class": "banh-mi", "display_name": "Bánh mì", "confidence": 0.91}],
}


class _Resp:
    def __init__(self, status=200, payload=None, raise_json=False):
        self.status_code = status
        self._payload = payload
        self._raise_json = raise_json
        self.text = "err"

    def json(self):
        if self._raise_json:
            raise ValueError("no json")
        return self._payload


def _img():
    return Image.new("RGB", (120, 120))


def test_requires_url():
    with pytest.raises(ValueError):
        HttpPredictor("")


def test_posts_image_and_parses_dict(monkeypatch):
    captured = {}

    def fake_post(url, files=None, headers=None, timeout=None):
        captured["url"] = url
        captured["files"] = files
        captured["headers"] = headers
        return _Resp(200, _FULL)

    monkeypatch.setattr(hp.requests, "post", fake_post)
    out = HttpPredictor("http://svc/", token="secret").predict(_img())
    assert out == _FULL
    assert captured["url"] == "http://svc/predict"
    assert captured["headers"]["Authorization"] == "Bearer secret"
    assert "file" in captured["files"]


def test_no_token_no_auth_header(monkeypatch):
    captured = {}
    monkeypatch.setattr(hp.requests, "post",
                        lambda url, files=None, headers=None, timeout=None:
                        (captured.update(headers=headers) or _Resp(200, _FULL)))
    HttpPredictor("http://svc").predict(_img())
    assert "Authorization" not in captured["headers"]


def test_timeout_retries_then_503(monkeypatch):
    calls = {"n": 0}

    def fake_post(*a, **k):
        calls["n"] += 1
        raise requests.ConnectionError("down")

    monkeypatch.setattr(hp.requests, "post", fake_post)
    with pytest.raises(HTTPException) as exc:
        HttpPredictor("http://svc").predict(_img())
    assert exc.value.status_code == 503
    assert calls["n"] == 2  # 1 lần + 1 retry


def test_server_5xx_maps_503(monkeypatch):
    monkeypatch.setattr(hp.requests, "post",
                        lambda *a, **k: _Resp(500, None))
    with pytest.raises(HTTPException) as exc:
        HttpPredictor("http://svc").predict(_img())
    assert exc.value.status_code == 503


def test_missing_field_maps_502(monkeypatch):
    monkeypatch.setattr(hp.requests, "post",
                        lambda *a, **k: _Resp(200, {"group": "BANH"}))
    with pytest.raises(HTTPException) as exc:
        HttpPredictor("http://svc").predict(_img())
    assert exc.value.status_code == 502


def test_bad_json_maps_502(monkeypatch):
    monkeypatch.setattr(hp.requests, "post",
                        lambda *a, **k: _Resp(200, None, raise_json=True))
    with pytest.raises(HTTPException) as exc:
        HttpPredictor("http://svc").predict(_img())
    assert exc.value.status_code == 502
