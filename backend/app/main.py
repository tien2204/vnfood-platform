from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.auth import router as auth_router
from app.core.config import settings

app = FastAPI(
    title="VNFood API",
    description="Vietnamese Food Platform API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])


@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "1.0.0"}


@app.get("/api/v1/health")
async def api_health_check():
    return {
        "success": True,
        "data": {
            "status": "ok",
            "database": "not_connected",
            "version": "1.0.0",
        },
    }
