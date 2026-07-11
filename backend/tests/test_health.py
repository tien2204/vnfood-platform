import asyncio
from unittest.mock import AsyncMock

from fastapi.responses import JSONResponse

from app.main import api_health_check


def test_health_reports_connected_when_db_ok():
    db = AsyncMock()  # db.execute(...) awaits fine
    res = asyncio.run(api_health_check(db))
    assert res["success"] is True
    assert res["data"]["database"] == "connected"


def test_health_returns_503_when_db_down():
    db = AsyncMock()
    db.execute.side_effect = Exception("db down")
    res = asyncio.run(api_health_check(db))
    assert isinstance(res, JSONResponse)
    assert res.status_code == 503
