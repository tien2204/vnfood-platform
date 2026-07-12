import asyncio
import logging
import os
from contextlib import asynccontextmanager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import register_exception_handlers
from app.core.rate_limit import register_rate_limiting
from app.core.database import get_db
from app.api.v1.admin import router as admin_router
from app.api.v1.meal_plans import router as meal_plans_router, grocery_router
from app.api.v1.ai import router as ai_router
from app.api.v1.newsletter import router as newsletter_router
from app.api.v1.auth import router as auth_router
from app.api.v1.comments import router as comments_router
from app.api.v1.ratings import router as ratings_router
from app.api.v1.recipes import router as recipes_router
from app.api.v1.saved import router as saved_router
from app.api.v1.recipe_change_requests import router as change_requests_router
from app.api.v1.tts import router as tts_router
from app.api.v1.upload import router as upload_router
from app.api.v1.users import router as users_router
from app.core.config import settings
from app.services.dish_recipe_service import load_dish_recipes
from app.services.dish_overview_service import load_dish_overviews
from app.services.metrics_service import load_model_metrics

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── startup ──────────────────────────────────────────────
    from app.ai.factory import build_predictor
    from app.ai.state import set_predictor

    try:
        predictor = build_predictor()
        set_predictor(predictor)
        if predictor is not None:
            logger.info("AI predictor ready (backend=%s)", settings.AI_BACKEND)
    except Exception as exc:
        logger.error("Failed to init AI predictor: %s", exc)

    count = load_dish_recipes()
    logging.info(f"[startup] Loaded {count} curated dish recipes")

    ov_count = load_dish_overviews()
    logging.info(f"[startup] Loaded {ov_count} dish overviews")

    metrics_count = load_model_metrics()
    logging.info(f"[startup] Loaded model metrics for {metrics_count} classes")

    # Warm the Piper TTS voice so the first cooking-mode request doesn't pay the
    # one-time model-load cost. Non-fatal: TTS lazy-loads on demand if this fails.
    try:
        from app.services.tts_service import _get_voice
        await asyncio.to_thread(_get_voice)
        logging.info("[startup] Piper TTS voice ready")
    except Exception:
        logger.exception("[startup] Piper TTS voice preload failed — will lazy-load on demand")

    # Coverage check must not block startup — on DB error, log and continue with an
    # empty canonical-slug cache (tentative/openai_known tiers simply won't trigger).
    from app.core.database import AsyncSessionLocal
    from app.services.canonical_coverage import compute_canonical_coverage
    try:
        async with AsyncSessionLocal() as _cov_db:
            cov = await compute_canonical_coverage(_cov_db)
        logging.info(f"[startup] Canonical coverage: {cov['covered']}/{cov['total']} slugs")
    except Exception:
        logger.exception("[startup] Canonical coverage check failed — continuing without it")

    yield

    # ── shutdown ─────────────────────────────────────────────
    from app.ai.state import set_predictor
    set_predictor(None)
    logger.info("AI models released")


app = FastAPI(
    title="VNFood API",
    description="Vietnamese Food Platform API",
    version="1.0.0",
    lifespan=lifespan,
)

register_exception_handlers(app)
register_rate_limiting(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
app.include_router(ai_router, prefix="/api/v1/ai", tags=["ai"])
app.include_router(meal_plans_router, prefix="/api/v1/meal-plans", tags=["meal-plans"])
app.include_router(grocery_router, prefix="/api/v1", tags=["grocery"])
app.include_router(tts_router, prefix="/api/v1", tags=["tts"])
app.include_router(change_requests_router, prefix="/api/v1/recipe-change-requests", tags=["change-requests"])
app.include_router(newsletter_router, prefix="/api/v1/newsletter", tags=["newsletter"])


@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "1.0.0"}


@app.get("/api/v1/health")
async def api_health_check(db: AsyncSession = Depends(get_db)):
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        return JSONResponse(
            status_code=503,
            content={
                "success": False,
                "error": {"code": "DB_UNAVAILABLE", "message": "Không kết nối được cơ sở dữ liệu"},
            },
        )
    return {
        "success": True,
        "data": {"status": "ok", "database": "connected", "version": "1.0.0"},
    }
