import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class AppointmentCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    place: str | None = Field(default=None, max_length=160)
    starts_at: datetime
    attendee_id: uuid.UUID | None = None
    related_task_id: uuid.UUID | None = None

    @field_validator("title")
    @classmethod
    def normalize_title(cls, title: str) -> str:
        value = title.strip()
        if not value:
            raise ValueError("Appointment title must not be empty")
        return value

    @field_validator("place")
    @classmethod
    def normalize_place(cls, place: str | None) -> str | None:
        return (place or "").strip() or None


class AppointmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    place: str | None
    starts_at: datetime
    attendee_id: uuid.UUID | None
    related_task_id: uuid.UUID | None
    created_at: datetime
