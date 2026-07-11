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
