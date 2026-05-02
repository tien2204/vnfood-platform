"""Seed default admin user. Idempotent — skips if already exists."""
import asyncio
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.user import User


ADMIN_EMAIL = "admin@vnfood.local"
ADMIN_PASSWORD = "Admin@123"
ADMIN_NAME = "Admin"


async def seed():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == ADMIN_EMAIL))
        if result.scalar_one_or_none():
            print(f"Admin '{ADMIN_EMAIL}' đã tồn tại, bỏ qua.")
            return

        admin = User(
            email=ADMIN_EMAIL,
            hashed_password=hash_password(ADMIN_PASSWORD),
            full_name=ADMIN_NAME,
            role="admin",
            is_active=True,
        )
        db.add(admin)
        await db.commit()
        print(f"Đã tạo admin: {ADMIN_EMAIL} / {ADMIN_PASSWORD}")


if __name__ == "__main__":
    asyncio.run(seed())
