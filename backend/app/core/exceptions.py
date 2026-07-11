import logging

from fastapi import FastAPI, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.requests import Request

logger = logging.getLogger(__name__)

_STATUS_CODE_MAP = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMITED",
}


class AppException(HTTPException):
    """HTTPException mang thêm mã lỗi nghiệp vụ (vd RECIPE_NOT_FOUND)."""

    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(status_code=status_code, detail=message)
        self.code = code


def _code_for(status_code: int) -> str:
    if status_code >= 500:
        return "INTERNAL_ERROR"
    return _STATUS_CODE_MAP.get(status_code, "ERROR")


async def _http_exception_handler(request: Request, exc: StarletteHTTPException):
    code = getattr(exc, "code", None) or _code_for(exc.status_code)
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "error": {"code": code, "message": exc.detail}},
        headers=getattr(exc, "headers", None),
    )


async def _validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Dữ liệu không hợp lệ",
                "details": jsonable_encoder(exc.errors()),
            },
        },
    )


async def _unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": {"code": "INTERNAL_ERROR", "message": "Đã có lỗi hệ thống, vui lòng thử lại sau."},
        },
    )


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(StarletteHTTPException, _http_exception_handler)
    app.add_exception_handler(RequestValidationError, _validation_exception_handler)
    app.add_exception_handler(Exception, _unhandled_exception_handler)
