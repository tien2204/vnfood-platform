from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1.admin import router as admin_router
from app.api.v1.auth import router as auth_router
from app.api.v1.comments import router as comments_router
from app.api.v1.feed import router as feed_router
from app.api.v1.ratings import router as ratings_router
from app.api.v1.recipes import router as recipes_router
from app.api.v1.saved import router as saved_router
from app.api.v1.upload import router as upload_router
from app.api.v1.users import router as users_router
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

import os
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount("/static/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(recipes_router, prefix="/api/v1/recipes", tags=["recipes"])
app.include_router(users_router, prefix="/api/v1/users", tags=["users"])
app.include_router(upload_router, prefix="/api/v1/upload", tags=["upload"])
app.include_router(admin_router, prefix="/api/v1/admin", tags=["admin"])
app.include_router(comments_router, prefix="/api/v1", tags=["comments"])
app.include_router(ratings_router, prefix="/api/v1", tags=["ratings"])
app.include_router(saved_router, prefix="/api/v1", tags=["saved"])
app.include_router(feed_router, prefix="/api/v1/feed", tags=["feed"])


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
