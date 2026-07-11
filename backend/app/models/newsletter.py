import uuid

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func


from app.core.database import Base


class NewsletterSubscriber(Base):
    """Người đăng ký nhận bản tin công thức hàng tuần qua email.

    Không cần double opt-in: lưu thẳng is_active=True khi đăng ký. Hủy nhận
    bằng token trong email hoặc toggle trong trang hồ sơ.
    """

    __tablename__ = "newsletter_subscribers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, index=True
    )
    # Token bí mật dùng cho link hủy nhận trong email (không cần đăng nhập).
    unsubscribe_token: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False, index=True
    )
    # Nguồn đăng ký: "footer" | "prompt" | "profile"
    source: Mapped[str | None] = mapped_column(String(20))
    # Liên kết tới tài khoản nếu đăng ký khi đã đăng nhập (không bắt buộc).
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    unsubscribed_at: Mapped[DateTime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
