from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import roles
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.user import User


async def register_user(
    db: AsyncSession, email: str, password: str, full_name: str | None
) -> User:
    result = await db.execute(select(User).where(User.email == email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email đã được sử dụng")

    user = User(
        email=email,
        hashed_password=hash_password(password),
        full_name=full_name,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


async def login(db: AsyncSession, email: str, password: str, *, portal: str = "consumer") -> dict:
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email hoặc mật khẩu không đúng",
        )

    # The consumer door must NOT authenticate staff accounts — fail with the exact
    # same generic 401 as a wrong password so a staff account can't be enumerated
    # here (no token ever issued, nothing different observable over the network).
    if portal == "consumer" and roles.role_at_least(user.role, roles.ADMIN):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email hoặc mật khẩu không đúng",
        )

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tài khoản đã bị khóa")

    access_token = create_access_token(str(user.id), user.role)
    refresh_token = create_refresh_token(str(user.id))
    return {"access_token": access_token, "refresh_token": refresh_token, "user": user}


async def refresh_access_token(db: AsyncSession, refresh_token: str) -> dict:
    payload = decode_token(refresh_token)
    if payload is None or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token không hợp lệ")

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Người dùng không hợp lệ")

    # Sliding session: hand back a fresh refresh token too so an actively-used
    # session keeps extending its 7-day window instead of dying abruptly. Tokens
    # are stateless JWTs (no server-side store), so the previous refresh token
    # stays valid until its own exp — concurrent refreshes don't invalidate it.
    return {
        "access_token": create_access_token(str(user.id), user.role),
        "refresh_token": create_refresh_token(str(user.id)),
    }


async def change_password(
    db: AsyncSession, user: User, old_password: str, new_password: str
) -> None:
    if not verify_password(old_password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mật khẩu cũ không đúng")

    user.hashed_password = hash_password(new_password)
    db.add(user)


async def change_email(
    db: AsyncSession, user: User, new_email: str, password: str
) -> None:
    if not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mật khẩu không đúng")
    if new_email == user.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email mới trùng email hiện tại"
        )
    result = await db.execute(select(User).where(User.email == new_email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email đã được sử dụng"
        )
    user.email = new_email
    db.add(user)
    await db.commit()
