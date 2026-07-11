from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models.user import User
from app.schemas.auth import (
    ChangeEmailRequest,
    ChangePasswordRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserOut,
)
from app.services import auth_service

router = APIRouter()


@router.post("/register", status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    await auth_service.register_user(db, body.email, body.password, body.full_name)
    return {"success": True, "message": "Đăng ký thành công"}


@router.post("/login")
async def login(
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await auth_service.login(db, body.email, body.password)
    return {
        "success": True,
        "data": TokenResponse(
            access_token=result["access_token"],
            refresh_token=result["refresh_token"],
            user=UserOut.model_validate(result["user"]),
        ),
    }


@router.post("/staff-login")
async def staff_login(
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    # Dedicated staff door. Authenticates anyone with valid credentials (the
    # frontend rejects non-staff with a clear message and never stores the session);
    # the point of the separate endpoint is that /login refuses staff entirely.
    result = await auth_service.login(db, body.email, body.password, portal="staff")
    return {
        "success": True,
        "data": TokenResponse(
            access_token=result["access_token"],
            refresh_token=result["refresh_token"],
            user=UserOut.model_validate(result["user"]),
        ),
    }


@router.post("/refresh")
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    tokens = await auth_service.refresh_access_token(db, body.refresh_token)
    return {
        "success": True,
        "data": {
            "access_token": tokens["access_token"],
            "refresh_token": tokens["refresh_token"],
            "token_type": "bearer",
        },
    }


@router.post("/logout")
async def logout(_: User = Depends(get_current_active_user)):
    return {"success": True, "message": "Đăng xuất thành công"}


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await auth_service.change_password(db, current_user, body.old_password, body.new_password)
    return {"success": True, "message": "Đổi mật khẩu thành công"}


@router.post("/change-email")
async def change_email(
    body: ChangeEmailRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await auth_service.change_email(db, current_user, body.new_email, body.password)
    return {"success": True, "message": "Đổi email thành công"}
