import uuid
from datetime import datetime
from typing import Literal

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


class FamilyUpdateRequest(FamilyCreateRequest):
    pass


class FamilyDeleteRequest(BaseModel):
    # The family's name, typed out, so a family cannot be deleted by a stray click.
    confirm_name: str = Field(max_length=120)


class FamilyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    created_at: datetime


class MyFamilyResponse(FamilyResponse):
    """The caller's family, with their role. The invite code is shown to admins only."""

    my_role: str
    invite_code: str | None


class FamilyCreatedResponse(FamilyResponse):
    invite_code: str


class FamilyJoinResponse(BaseModel):
    family: FamilyResponse
    role: str
    joined_at: datetime


Availability = Literal["Available", "With family", "Away today", "On duty"]


class FamilyMemberUpdateRequest(BaseModel):
    relationship_label: str | None = Field(default=None, max_length=80)
    availability: Availability | None = None
    availability_note: str | None = Field(default=None, max_length=200)
    # Only an admin can change this, and a family always keeps at least one admin.
    role: Literal["ADMIN", "MEMBER"] | None = None

    @field_validator("relationship_label", "availability_note")
    @classmethod
    def blank_to_none(cls, value: str | None) -> str | None:
        return (value or "").strip() or None


class FamilyMemberResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    avatar_url: str | None
    role: str
    relationship_label: str | None
    availability: str
    availability_note: str | None
    joined_at: datetime