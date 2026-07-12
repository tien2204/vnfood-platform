from fastapi import FastAPI
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address
from starlette.requests import Request

from app.core.config import settings


def build_limiter(storage_uri: str | None = None) -> Limiter:
    """Build the limiter. Empty/None storage_uri → slowapi's in-memory default;
    a Redis URI (e.g. Upstash) makes the counter shared across instances."""
    return Limiter(key_func=get_remote_address, storage_uri=storage_uri or None)


limiter = build_limiter(settings.RATE_LIMIT_STORAGE_URI)


async def _rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={
            "success": False,
            "error": {"code": "RATE_LIMITED", "message": "Quá nhiều yêu cầu, vui lòng thử lại sau."},
        },
    )


def register_rate_limiting(app: FastAPI) -> None:
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_handler)
    app.add_middleware(SlowAPIMiddleware)
