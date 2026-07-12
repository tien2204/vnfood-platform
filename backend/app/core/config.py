from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 180
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    OPENAI_API_KEY: str = ""
    EDGE_TTS_VOICE: str = "vi-VN-HoaiMyNeural"
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE_MB: int = 10
    MODEL_WEIGHTS_DIR: str = "../model_weights"

    # Rate-limit storage. Empty → in-memory (single-instance dev). For horizontal
    # scaling set a shared Redis URI (Upstash: rediss://default:<pass>@<host>:<port>)
    # so the limit counter is shared across all backend instances.
    RATE_LIMIT_STORAGE_URI: str = ""

    # ── Email / Newsletter (Gmail SMTP) ──────────────────────────────
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 465
    SMTP_USE_SSL: bool = True  # True → SMTP_SSL (465); False → STARTTLS (587)
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""  # Gmail App Password (16 ký tự, không phải mật khẩu thường)
    SMTP_FROM_NAME: str = "VNFood"
    SMTP_FROM_EMAIL: str = ""  # mặc định lấy theo SMTP_USERNAME nếu để trống

    # Base URL dùng để dựng link trong email (hủy nhận, xem công thức, ảnh).
    APP_BASE_URL: str = "http://localhost:8000"  # backend
    FRONTEND_BASE_URL: str = "http://localhost:3000"  # frontend

    @field_validator("SECRET_KEY")
    @classmethod
    def _validate_secret_key(cls, v: str) -> str:
        placeholders = ("change-this", "your-super-secret", "changeme")
        low = v.lower()
        if not v or any(p in low for p in placeholders):
            raise ValueError(
                "SECRET_KEY là placeholder — đặt một chuỗi ngẫu nhiên ≥32 ký tự trong .env"
            )
        if len(v) < 32:
            raise ValueError("SECRET_KEY phải dài ít nhất 32 ký tự")
        return v

    @property
    def max_upload_size_bytes(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024

    @property
    def smtp_from_email(self) -> str:
        return self.SMTP_FROM_EMAIL or self.SMTP_USERNAME

    @property
    def email_enabled(self) -> bool:
        return bool(self.SMTP_USERNAME and self.SMTP_PASSWORD)


settings = Settings()
