import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class FamilyCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, name: str) -> str:
        value = name.strip()
        if not value:
            raise ValueError("Family name must not be empty")
        return value


class FamilyJoinRequest(BaseModel):
    invite_code: str = Field(min_length=6, max_length=16)

    @field_validator("invite_code")
    @classmethod
    def normalize_invite_code(cls, invite_code: str) -> str:
        return invite_code.strip().upper()


class FamilyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    created_at: datetime


class FamilyCreatedResponse(FamilyResponse):
    invite_code: str


class FamilyJoinResponse(BaseModel):
    family: FamilyResponse
    role: str
    joined_at: datetime


class FamilyMemberResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    role: str
    joined_at: datetime