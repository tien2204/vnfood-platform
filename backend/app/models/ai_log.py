import uuid
from sqlalchemy import Float, Index, String, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from sqlalchemy import DateTime

from app.core.database import Base


class AILog(Base):
    __tablename__ = "ai_logs"
    __table_args__ = (
        Index("ix_ai_logs_user_id", "user_id"),
        Index("ix_ai_logs_created_at", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    image_url: Mapped[str | None] = mapped_column(Text)
    predicted_class: Mapped[str | None] = mapped_column(Text)
    confidence: Mapped[float | None] = mapped_column(Float)
    model_used: Mapped[str | None] = mapped_column(String(20))
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship("User", back_populates="ai_logs")  # noqa: F821
