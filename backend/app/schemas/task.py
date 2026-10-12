import uuid
from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

TaskCategory = Literal["Appointment", "Medication", "Check-in"]
TaskPriority = Literal["High", "Normal", "Low"]
TaskRecurrence = Literal["daily", "weekly", "biweekly", "monthly"]


class TaskCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    detail: str = Field(default="", max_length=500)
    location: str | None = Field(default=None, max_length=120)
    due_at: datetime | None = None
    category: TaskCategory = "Check-in"
    priority: TaskPriority = "Normal"
    recipient: str = Field(default="Shared household", min_length=1, max_length=80)
    assignee_id: uuid.UUID | None = None
    # A repeating task needs a due time to count from.
    recurrence: TaskRecurrence | None = None

    @model_validator(mode="after")
    def recurrence_needs_a_due_time(self) -> "TaskCreateRequest":
        if self.recurrence is not None and self.due_at is None:
            raise ValueError("A repeating task needs a due date")
        return self

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


class TaskUpdateRequest(BaseModel):
    """Changes to a task's details. Only the fields that are sent are changed; due_at and location accept null to clear them."""

    title: str | None = Field(default=None, min_length=1, max_length=100)
    detail: str | None = Field(default=None, max_length=500)
    location: str | None = Field(default=None, max_length=120)
    due_at: datetime | None = None
    priority: TaskPriority | None = None

    @field_validator("title")
    @classmethod
    def normalize_title(cls, title: str | None) -> str | None:
        if title is not None and not title.strip():
            raise ValueError("Task title must not be empty")
        return title.strip() if title is not None else None


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
    recurrence: TaskRecurrence | None
    activity: list[TaskActivityResponse]


class AssignmentSuggestionResponse(BaseModel):
    member_id: uuid.UUID
    reason: str
    # Titles of the family notes that were given to the model for this suggestion.
    note_titles: list[str]


class DocumentTasksRequest(BaseModel):
    """A document to draft tasks from: either an uploaded file, base64-encoded, or pasted text."""

    filename: str | None = Field(default=None, max_length=255)
    content_type: str | None = Field(default=None, max_length=120)
    # About 5 MB once decoded.
    data_base64: str | None = Field(default=None, max_length=7_000_000)
    text: str | None = Field(default=None, max_length=50_000)
    timezone: str | None = Field(default=None, max_length=64)


class TaskDraftResponse(BaseModel):
    title: str
    detail: str
    location: str | None
    # Local date and clock time as written in the document; either may be missing.
    due_date: date | None
    due_time: time | None
    priority: TaskPriority


class DocumentTasksResponse(BaseModel):
    summary: str
    tasks: list[TaskDraftResponse]


class TaskAvailabilityResponse(BaseModel):
    # Members with an appointment or a calendar event within an hour of the task's due time.
    busy_member_ids: list[uuid.UUID]


class DayPlanRequest(BaseModel):
    # IANA name of the person's time zone, e.g. "Asia/Singapore", so times read naturally in the summary.
    timezone: str | None = Field(default=None, max_length=64)
    # Ask the model again even when the last plan is still current.
    refresh: bool = False


class DayPlanStepResponse(BaseModel):
    task_id: uuid.UUID
    note: str


class DayPlanResponse(BaseModel):
    # None when the person has no open tasks; the model is not called in that case.
    summary: str | None
    steps: list[DayPlanStepResponse]
    generated_at: datetime | None


class FamilyActivityResponse(TaskActivityResponse):
    task_id: uuid.UUID
    task_title: str
