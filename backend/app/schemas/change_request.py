import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel

from app.schemas.recipe import RecipeCreate


class ChangeRequestCreate(BaseModel):
    type: Literal["create", "edit", "delete"]
    target_recipe_id: Optional[uuid.UUID] = None
    payload: Optional[RecipeCreate] = None


class ChangeRequestOut(BaseModel):
    id: uuid.UUID
    type: str
    target_recipe_id: Optional[uuid.UUID] = None
    target_title: Optional[str] = None
    status: str
    reject_reason: Optional[str] = None
    requested_by_name: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}
