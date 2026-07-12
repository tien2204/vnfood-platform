import io
import logging
import os

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from PIL import Image

from inference import TastyVietnamPredictor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

WEIGHTS_DIR = os.environ.get("MODEL_WEIGHTS_DIR", "model_weights")
API_TOKEN = os.environ.get("AI_SERVICE_TOKEN", "")

app = FastAPI(title="VNFood AI Service")
_predictor = None


@app.on_event("startup")
def _load():
    global _predictor
    try:
        _predictor = TastyVietnamPredictor(WEIGHTS_DIR)
        logger.info("AI model loaded from %s", WEIGHTS_DIR)
    except Exception:
        logger.exception("Failed to load AI model from %s", WEIGHTS_DIR)
        _predictor = None


@app.get("/health")
def health():
    return {"status": "ok" if _predictor is not None else "loading"}


@app.post("/predict")
async def predict(file: UploadFile = File(...), authorization: str = Header(default="")):
    if API_TOKEN and authorization != f"Bearer {API_TOKEN}":
        raise HTTPException(status_code=401, detail="Unauthorized")
    if _predictor is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    content = await file.read()
    try:
        img = Image.open(io.BytesIO(content))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image")
    return _predictor.predict(img)
