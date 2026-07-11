"""Gửi email qua Gmail SMTP bằng stdlib smtplib (không thêm dependency).

Việc gửi là blocking I/O nên được đẩy sang thread pool qua asyncio.to_thread
để không chặn event loop của FastAPI.
"""
import asyncio
import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr

from app.core.config import settings

logger = logging.getLogger(__name__)


def _send_sync(to_email: str, subject: str, html_body: str, text_body: str) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((settings.SMTP_FROM_NAME, settings.smtp_from_email))
    msg["To"] = to_email
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")

    if settings.SMTP_USE_SSL:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(
            settings.SMTP_HOST, settings.SMTP_PORT, context=context, timeout=30
        ) as server:
            server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            server.send_message(msg)
    else:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30) as server:
            server.starttls(context=ssl.create_default_context())
            server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            server.send_message(msg)


async def send_email(
    to_email: str, subject: str, html_body: str, text_body: str = ""
) -> bool:
    """Gửi 1 email. Trả về True nếu thành công, False nếu lỗi (đã log).

    Không raise — caller (vd: gửi hàng loạt) tự đếm thành công/thất bại.
    """
    if not settings.email_enabled:
        logger.warning(
            "SMTP chưa cấu hình (SMTP_USERNAME/SMTP_PASSWORD trống) — bỏ qua gửi tới %s",
            to_email,
        )
        return False

    if not text_body:
        text_body = "Email này cần trình đọc hỗ trợ HTML để hiển thị đầy đủ."

    try:
        await asyncio.to_thread(_send_sync, to_email, subject, html_body, text_body)
        return True
    except Exception:
        logger.exception("Gửi email tới %s thất bại", to_email)
        return False
