"""Logic đăng ký / hủy nhận và soạn-gửi bản tin công thức hàng tuần."""
import asyncio
import logging
import secrets
import uuid
from datetime import datetime, timezone
from html import escape

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.newsletter import NewsletterSubscriber
from app.models.recipe import Recipe
from app.models.user import User
from app.services import email_service
from app.services.recipe_service import _base_approved_query, catalog_visible_clause

logger = logging.getLogger(__name__)


def _new_token() -> str:
    return secrets.token_urlsafe(48)[:64]


def _abs_image(image_url: str | None) -> str:
    if not image_url:
        return ""
    if image_url.startswith("http://") or image_url.startswith("https://"):
        return image_url
    return f"{settings.APP_BASE_URL.rstrip('/')}{image_url}"


# ── Đăng ký / hủy ────────────────────────────────────────────────────────────

async def subscribe(
    db: AsyncSession,
    email: str,
    source: str | None = None,
    user_id: uuid.UUID | None = None,
) -> NewsletterSubscriber:
    """Đăng ký nhận bản tin. Idempotent: nếu email đã tồn tại thì kích hoạt lại."""
    email = email.strip().lower()
    existing = (
        await db.execute(
            select(NewsletterSubscriber).where(NewsletterSubscriber.email == email)
        )
    ).scalar_one_or_none()

    if existing:
        existing.is_active = True
        existing.unsubscribed_at = None
        if source:
            existing.source = source
        if user_id and not existing.user_id:
            existing.user_id = user_id
        await db.flush()
        return existing

    sub = NewsletterSubscriber(
        email=email,
        is_active=True,
        unsubscribe_token=_new_token(),
        source=source,
        user_id=user_id,
    )
    db.add(sub)
    await db.flush()
    return sub


async def unsubscribe_by_token(db: AsyncSession, token: str) -> bool:
    """Hủy nhận qua link trong email. Trả về True nếu tìm thấy & đã hủy."""
    sub = (
        await db.execute(
            select(NewsletterSubscriber).where(
                NewsletterSubscriber.unsubscribe_token == token
            )
        )
    ).scalar_one_or_none()
    if sub is None:
        return False
    if sub.is_active:
        sub.is_active = False
        sub.unsubscribed_at = datetime.now(timezone.utc)
        await db.flush()
    return True


async def get_status_for_email(db: AsyncSession, email: str) -> bool:
    email = email.strip().lower()
    sub = (
        await db.execute(
            select(NewsletterSubscriber).where(NewsletterSubscriber.email == email)
        )
    ).scalar_one_or_none()
    return bool(sub and sub.is_active)


async def set_for_user(db: AsyncSession, user: User, subscribed: bool) -> bool:
    """Bật/tắt nhận bản tin từ trang hồ sơ (dùng email tài khoản)."""
    if subscribed:
        await subscribe(db, user.email, source="profile", user_id=user.id)
        return True
    sub = (
        await db.execute(
            select(NewsletterSubscriber).where(
                NewsletterSubscriber.email == user.email.strip().lower()
            )
        )
    ).scalar_one_or_none()
    if sub and sub.is_active:
        sub.is_active = False
        sub.unsubscribed_at = datetime.now(timezone.utc)
        await db.flush()
    return False


# ── Soạn & gửi bản tin ───────────────────────────────────────────────────────

async def _pick_weekly_recipes(db: AsyncSession, limit: int = 6) -> list[Recipe]:
    # Cùng pool với trang /recipes (catalog monngonmoingay + món của user,
    # bỏ tráng miệng) — chỉ gửi những công thức đang hiển thị công khai.
    stmt = (
        _base_approved_query()
        .where(catalog_visible_clause(), Recipe.is_dessert.is_(False))
        .order_by(Recipe.created_at.desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()
    return [row[0] for row in rows]


def _render_html(recipes: list[Recipe], unsubscribe_url: str) -> str:
    fe = settings.FRONTEND_BASE_URL.rstrip("/")
    cards = []
    for r in recipes:
        img = _abs_image(r.image_url)
        link = f"{fe}/recipes/{r.id}"
        title = escape(r.title or "Công thức mới")
        meta_bits = []
        if r.cooking_time:
            meta_bits.append(f"⏱ {r.cooking_time} phút")
        if r.servings:
            meta_bits.append(f"🍽 {r.servings} người")
        meta = escape(" · ".join(meta_bits))
        img_html = (
            f'<img src="{escape(img)}" alt="{title}" width="120" height="90" '
            'style="display:block;width:120px;height:90px;object-fit:cover;'
            'border-radius:8px;border:0;" />'
            if img
            else ""
        )
        cards.append(
            f"""
            <tr>
              <td style="padding:12px 0;border-bottom:1px solid #eee;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
                  <tr>
                    <td style="width:120px;vertical-align:top;">{img_html}</td>
                    <td style="padding-left:14px;vertical-align:top;">
                      <a href="{link}" style="color:#1a1a1a;font-size:16px;font-weight:bold;text-decoration:none;">{title}</a>
                      <div style="color:#888;font-size:13px;margin-top:6px;">{meta}</div>
                      <a href="{link}" style="display:inline-block;margin-top:8px;color:#ec2028;font-size:13px;font-weight:bold;text-decoration:none;">Xem công thức →</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>"""
        )

    cards_html = "".join(cards) or (
        '<tr><td style="padding:20px 0;color:#888;">Tuần này chưa có công thức mới.</td></tr>'
    )

    return f"""<!DOCTYPE html>
<html lang="vi">
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f5f5f5;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:600px;max-width:92%;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:#ec2028;padding:24px 28px;">
            <span style="color:#ffffff;font-size:22px;font-weight:bold;letter-spacing:0.5px;">TastyVietnam</span>
            <div style="color:#ffe;opacity:0.9;font-size:13px;margin-top:4px;">Bản tin công thức hàng tuần</div>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 28px 8px;">
            <h1 style="margin:0 0 6px;font-size:20px;color:#1a1a1a;">Công thức mới trong tuần</h1>
            <p style="margin:0;color:#666;font-size:14px;line-height:1.6;">
              Những món ăn mới nhất vừa được thêm vào TastyVietnam. Chụp ảnh món ăn bất kỳ,
              để AI nhận diện và gợi ý công thức nấu ngay.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 28px 16px;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">{cards_html}</table>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 28px 28px;">
            <a href="{fe}/recipes" style="display:inline-block;background:#ec2028;color:#fff;font-size:14px;font-weight:bold;text-decoration:none;padding:12px 22px;border-radius:8px;">Khám phá tất cả công thức</a>
          </td>
        </tr>
        <tr>
          <td style="background:#fafafa;padding:18px 28px;border-top:1px solid #eee;">
            <p style="margin:0;color:#999;font-size:12px;line-height:1.6;">
              Bạn nhận được email này vì đã đăng ký bản tin TastyVietnam.<br/>
              Không muốn nhận nữa? <a href="{unsubscribe_url}" style="color:#ec2028;">Hủy nhận tại đây</a>
              hoặc tắt trong <a href="{fe}/me/profile" style="color:#ec2028;">trang hồ sơ</a>.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _render_text(recipes: list[Recipe], unsubscribe_url: str) -> str:
    fe = settings.FRONTEND_BASE_URL.rstrip("/")
    lines = ["TastyVietnam — Công thức mới trong tuần", ""]
    for r in recipes:
        lines.append(f"- {r.title or 'Công thức mới'}: {fe}/recipes/{r.id}")
    lines += [
        "",
        f"Tất cả công thức: {fe}/recipes",
        f"Hủy nhận: {unsubscribe_url}",
    ]
    return "\n".join(lines)


async def send_weekly_newsletter(db: AsyncSession) -> dict:
    """Soạn bản tin từ công thức mới nhất và gửi tới mọi subscriber đang active.

    Trả về thống kê {sent, failed, total, recipes}.
    """
    if not settings.email_enabled:
        return {
            "sent": 0,
            "failed": 0,
            "total": 0,
            "recipes": 0,
            "error": "SMTP chưa cấu hình (SMTP_USERNAME/SMTP_PASSWORD trong .env)",
        }

    recipes = await _pick_weekly_recipes(db)
    subs = (
        await db.execute(
            select(NewsletterSubscriber).where(NewsletterSubscriber.is_active.is_(True))
        )
    ).scalars().all()

    api = settings.APP_BASE_URL.rstrip("/")
    subject = "TastyVietnam — Công thức mới trong tuần"

    sent = 0
    failed = 0
    for sub in subs:
        unsub_url = f"{api}/api/v1/newsletter/unsubscribe?token={sub.unsubscribe_token}"
        html = _render_html(recipes, unsub_url)
        text = _render_text(recipes, unsub_url)
        ok = await email_service.send_email(sub.email, subject, html, text)
        if ok:
            sent += 1
        else:
            failed += 1
        # Nhường event loop giữa các lần gửi (Gmail có rate limit).
        await asyncio.sleep(0)

    logger.info(
        "Bản tin: gửi %d, lỗi %d, tổng %d subscriber, %d công thức",
        sent,
        failed,
        len(subs),
        len(recipes),
    )
    return {
        "sent": sent,
        "failed": failed,
        "total": len(subs),
        "recipes": len(recipes),
    }
