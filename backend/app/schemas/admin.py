import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class AdminUserCreate(BaseModel):
    email: str
    full_name: str = Field(..., min_length=1, max_length=200)
    role: str = "collaborator"


class AdminUserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=1, max_length=200)
    email: Optional[str] = None


class AdminUserOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str | None
    role: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class CreatedUserOut(BaseModel):
    user: AdminUserOut
    temp_password: str


class TempPasswordOut(BaseModel):
    temp_password: str
