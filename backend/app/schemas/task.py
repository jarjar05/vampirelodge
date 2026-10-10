import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

TaskCategory = Literal["Appointment", "Medication", "Check-in"]
TaskPriority = Literal["High", "Normal", "Low"]


class TaskCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    detail: str = Field(default="", max_length=500)
    location: str | None = Field(default=None, max_length=120)
    due_at: datetime | None = None
    category: TaskCategory = "Check-in"
    priority: TaskPriority = "Normal"
    recipient: str = Field(default="Shared household", min_length=1, max_length=80)
    assignee_id: uuid.UUID | None = None

    @field_validator("title")
    @classmethod
    def normalize_title(cls, title: str) -> str:
        value = title.strip()
        if not value:
            raise ValueError("Task title must not be empty")
        return value

    @field_validator("location")
    @classmethod
    def normalize_location(cls, location: str | None) -> str | None:
        return (location or "").strip() or None


class TaskAssignRequest(BaseModel):
    assignee_id: uuid.UUID | None


class TaskActivityResponse(BaseModel):
    id: uuid.UUID
    action: str
    actor_id: uuid.UUID | None
    actor_name: str
    detail: str
    created_at: datetime


class TaskResponse(BaseModel):
    id: uuid.UUID
    title: str
    detail: str
    location: str | None
    due_at: datetime | None
    assignee_id: uuid.UUID | None
    category: str
    priority: str
    status: str
    recipient: str
    created_at: datetime
    completed_at: datetime | None
    activity: list[TaskActivityResponse]


class FamilyActivityResponse(TaskActivityResponse):
    task_id: uuid.UUID
    task_title: str
