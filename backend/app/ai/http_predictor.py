import io
import logging

import requests
from fastapi import HTTPException
from PIL import Image

logger = logging.getLogger(__name__)

_REQUIRED_FIELDS = (
    "needs_fallback", "group", "group_confidence",
    "predicted_class", "display_name", "class_confidence", "top5",
)


class HttpPredictor:
    """Chạy suy luận trên service AI từ xa qua HTTP, giữ đúng interface
    predict() như TastyVietnamPredictor (local)."""

    def __init__(self, service_url: str, token: str = "", timeout: int = 30):
        if not service_url:
            raise ValueError("AI_SERVICE_URL bắt buộc khi AI_BACKEND='http'")
        self.base_url = service_url.rstrip("/")
        self.token = token
        self.timeout = timeout
        # Cho endpoint /ai/health đọc mà không vỡ:
        self.device = "remote"
        self.sub_models: dict = {}

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.token}"} if self.token else {}

    def _encode(self, pil_image: Image.Image) -> io.BytesIO:
        if pil_image.mode != "RGB":
            pil_image = pil_image.convert("RGB")
        buf = io.BytesIO()
        pil_image.save(buf, format="JPEG")
        buf.seek(0)
        return buf

    def predict(self, pil_image: Image.Image) -> dict:
        url = f"{self.base_url}/predict"
        buf = self._encode(pil_image)
        try:
            resp = requests.post(
                url, files={"file": ("image.jpg", buf, "image/jpeg")},
                headers=self._headers(), timeout=self.timeout,
            )
        except requests.RequestException:
            # Cold start / lỗi tạm thời — thử lại 1 lần với timeout dài hơn.
            buf.seek(0)
            try:
                resp = requests.post(
                    url, files={"file": ("image.jpg", buf, "image/jpeg")},
                    headers=self._headers(), timeout=self.timeout * 2,
                )
            except requests.RequestException:
                logger.exception("AI service không truy cập được: %s", url)
                raise HTTPException(status_code=503, detail="AI service không sẵn sàng")

        if resp.status_code >= 500:
            logger.error("AI service lỗi %s: %s", resp.status_code, resp.text[:200])
            raise HTTPException(status_code=503, detail="AI service không sẵn sàng")

        try:
            data = resp.json()
        except ValueError:
            raise HTTPException(status_code=502, detail="AI service trả dữ liệu không hợp lệ")

        if not isinstance(data, dict) or not all(k in data for k in _REQUIRED_FIELDS):
            raise HTTPException(status_code=502, detail="AI service trả dữ liệu không hợp lệ")
        return data
