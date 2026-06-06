import logging
import os
from contextlib import asynccontextmanager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1.admin import router as admin_router
from app.api.v1.meal_plans import router as meal_plans_router, grocery_router
from app.api.v1.ai import router as ai_router
from app.api.v1.auth import router as auth_router
from app.api.v1.comments import router as comments_router
from app.api.v1.feed import router as feed_router
from app.api.v1.ingredients import router as ingredients_router
from app.api.v1.ratings import router as ratings_router
from app.api.v1.recipes import router as recipes_router
from app.api.v1.saved import router as saved_router
from app.api.v1.recipe_change_requests import router as change_requests_router
from app.api.v1.tts import router as tts_router
from app.api.v1.upload import router as upload_router
from app.api.v1.users import router as users_router
from app.core.config import settings
from app.services.dish_recipe_service import load_dish_recipes
from app.services.metrics_service import load_model_metrics

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── startup ──────────────────────────────────────────────
    from app.ai.inference import VNFoodPredictor
    from app.ai.state import set_predictor

    weights_dir = os.path.abspath(settings.MODEL_WEIGHTS_DIR)
    if not os.path.isdir(weights_dir):
        logger.warning("Model weights dir not found: %s — AI features disabled", weights_dir)
    else:
        try:
            logger.info("Loading AI models from %s ...", weights_dir)
            set_predictor(VNFoodPredictor(weights_dir))
            logger.info("AI models loaded successfully")
        except Exception as exc:
            logger.error("Failed to load AI models: %s", exc)

    count = load_dish_recipes()
    logging.info(f"[startup] Loaded {count} curated dish recipes")

    metrics_count = load_model_metrics()
    logging.info(f"[startup] Loaded model metrics for {metrics_count} classes")

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
app.include_router(feed_router, prefix="/api/v1/feed", tags=["feed"])
app.include_router(ingredients_router, prefix="/api/v1/ingredients", tags=["ingredients"])
app.include_router(ai_router, prefix="/api/v1/ai", tags=["ai"])
app.include_router(meal_plans_router, prefix="/api/v1/meal-plans", tags=["meal-plans"])
app.include_router(grocery_router, prefix="/api/v1", tags=["grocery"])
app.include_router(tts_router, prefix="/api/v1", tags=["tts"])
app.include_router(change_requests_router, prefix="/api/v1/recipe-change-requests", tags=["change-requests"])


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
