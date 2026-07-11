from fastapi import APIRouter, Depends, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_active_user, require_admin
from app.models.user import User
from app.services import newsletter_service

router = APIRouter()


# ── Request bodies ───────────────────────────────────────────────────────────

class SubscribeBody(BaseModel):
    source: str | None = None


class ToggleBody(BaseModel):
    subscribed: bool


# ── Authenticated: đăng ký / hủy chỉ dành cho người dùng đã đăng nhập ─────────

@router.post("/subscribe")
async def subscribe(
    body: SubscribeBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    # Luôn dùng email của tài khoản đăng nhập — không nhận email tùy ý từ khách.
    await newsletter_service.subscribe(
        db, current_user.email, source=body.source or "user", user_id=current_user.id
    )
    return {
        "success": True,
        "data": {"subscribed": True},
        "message": "Đăng ký nhận bản tin thành công.",
    }


# ── Public: chỉ giữ link hủy nhận bằng token trong email (không cần đăng nhập) ─

@router.get("/unsubscribe", response_class=HTMLResponse)
async def unsubscribe(
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    ok = await newsletter_service.unsubscribe_by_token(db, token)
    fe = settings.FRONTEND_BASE_URL.rstrip("/")
    if ok:
        heading = "Đã hủy nhận bản tin"
        msg = "Bạn sẽ không nhận email công thức hàng tuần từ VNFood nữa."
    else:
        heading = "Link không hợp lệ"
        msg = "Link hủy nhận không đúng hoặc đã hết hiệu lực."
    html = f"""<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>{heading} — VNFood</title></head>
<body style="margin:0;font-family:Arial,sans-serif;background:#f5f5f5;">
  <div style="max-width:480px;margin:64px auto;background:#fff;border-radius:12px;padding:32px;text-align:center;">
    <div style="color:#ec2028;font-size:24px;font-weight:bold;">VNFood</div>
    <h1 style="font-size:20px;color:#1a1a1a;margin:20px 0 8px;">{heading}</h1>
    <p style="color:#666;font-size:14px;line-height:1.6;">{msg}</p>
    <a href="{fe}" style="display:inline-block;margin-top:20px;background:#ec2028;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold;">Về trang chủ</a>
  </div>
</body></html>"""
    return HTMLResponse(content=html)


# ── Authenticated (trang hồ sơ) ──────────────────────────────────────────────

@router.get("/me")
async def get_my_subscription(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    subscribed = await newsletter_service.get_status_for_email(db, current_user.email)
    return {"success": True, "data": {"subscribed": subscribed}}


@router.put("/me")
async def set_my_subscription(
    body: ToggleBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    subscribed = await newsletter_service.set_for_user(db, current_user, body.subscribed)
    return {
        "success": True,
        "data": {"subscribed": subscribed},
        "message": "Đã cập nhật tùy chọn nhận bản tin.",
    }


# ── Admin ────────────────────────────────────────────────────────────────────

@router.post("/send-weekly")
async def send_weekly(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    result = await newsletter_service.send_weekly_newsletter(db)
    return {
        "success": True,
        "data": result,
        "message": f"Đã gửi {result['sent']} email ({result['failed']} lỗi).",
    }
