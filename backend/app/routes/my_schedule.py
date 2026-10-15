"""The signed-in person's own schedule, typed in by hand: for anyone who does not link a calendar, or wants to add
to it. Their family sees these times on the shared calendar, with the label if they give one."""

import uuid
from datetime import date, datetime, time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import AuthenticatedUser
from app.models import ScheduleEntry
from app.services import busy_times

router = APIRouter(prefix="/api/me/schedule", tags=["schedule"])
DatabaseSession = Annotated[Session, Depends(get_db)]


class ScheduleEntryRequest(BaseModel):
    label: str | None = Field(default=None, max_length=60)
    # Monday is 0. Give weekdays for a weekly time, or on_date for a one-off; not both.
    weekdays: list[int] = Field(default_factory=list, max_length=7)
    on_date: date | None = None
    start_time: time
    end_time: time
    timezone: str = Field(default="UTC", max_length=64)

    @field_validator("label")
    @classmethod
    def _tidy_label(cls, value: str | None) -> str | None:
        return value.strip() or None if value else None

    @field_validator("weekdays")
    @classmethod
    def _check_days(cls, value: list[int]) -> list[int]:
        if any(day < 0 or day > 6 for day in value):
            raise ValueError("Weekdays run from 0 (Monday) to 6 (Sunday)")
        return sorted(set(value))

    @model_validator(mode="after")
    def _one_kind(self) -> "ScheduleEntryRequest":
        if bool(self.weekdays) == (self.on_date is not None):
            raise ValueError("Choose either the days of the week it repeats on, or one date")
        if self.start_time == self.end_time:
            raise ValueError("The end time must be different from the start time")
        return self


class ScheduleEntryResponse(BaseModel):
    id: uuid.UUID
    label: str | None
    weekdays: list[int]
    on_date: date | None
    start_time: time
    end_time: time
    timezone: str
    created_at: datetime


def _response(entry: ScheduleEntry) -> ScheduleEntryResponse:
    return ScheduleEntryResponse(
        id=entry.id, label=entry.label, weekdays=entry.weekday_list, on_date=entry.on_date,
        start_time=entry.start_time, end_time=entry.end_time, timezone=entry.timezone, created_at=entry.created_at,
    )


def _apply(entry: ScheduleEntry, payload: ScheduleEntryRequest) -> None:
    entry.label = payload.label
    entry.weekdays = ",".join(str(day) for day in payload.weekdays) or None
    entry.on_date = payload.on_date
    entry.start_time = payload.start_time.replace(tzinfo=None, second=0, microsecond=0)
    entry.end_time = payload.end_time.replace(tzinfo=None, second=0, microsecond=0)
    entry.timezone = busy_times.resolve_timezone(payload.timezone).key


def _own_entry(database: Session, user_id: uuid.UUID, entry_id: uuid.UUID) -> ScheduleEntry:
    entry = database.get(ScheduleEntry, entry_id)
    if entry is None or entry.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="That time is not in your schedule")
    return entry


@router.get("", response_model=list[ScheduleEntryResponse])
def list_entries(user: AuthenticatedUser, database: DatabaseSession) -> list[ScheduleEntryResponse]:
    entries = database.scalars(select(ScheduleEntry).where(ScheduleEntry.user_id == user.id)).all()
    # Weekly times first, then one-offs by date; each by time of day.
    ordered = sorted(entries, key=lambda entry: (entry.on_date is not None, entry.on_date or date.min, entry.weekday_list[:1], entry.start_time))
    return [_response(entry) for entry in ordered]


@router.post("", response_model=ScheduleEntryResponse, status_code=status.HTTP_201_CREATED)
def add_entry(payload: ScheduleEntryRequest, user: AuthenticatedUser, database: DatabaseSession) -> ScheduleEntryResponse:
    count = database.scalar(select(func.count()).select_from(ScheduleEntry).where(ScheduleEntry.user_id == user.id)) or 0
    if count >= busy_times.MAX_ENTRIES_PER_PERSON:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=f"Your schedule can hold up to {busy_times.MAX_ENTRIES_PER_PERSON} times. Remove one first.")
    entry = ScheduleEntry(user_id=user.id)
    _apply(entry, payload)
    database.add(entry)
    database.commit()
    database.refresh(entry)
    return _response(entry)


@router.put("/{entry_id}", response_model=ScheduleEntryResponse)
def update_entry(entry_id: uuid.UUID, payload: ScheduleEntryRequest, user: AuthenticatedUser, database: DatabaseSession) -> ScheduleEntryResponse:
    entry = _own_entry(database, user.id, entry_id)
    _apply(entry, payload)
    database.commit()
    database.refresh(entry)
    return _response(entry)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(entry_id: uuid.UUID, user: AuthenticatedUser, database: DatabaseSession) -> Response:
    database.delete(_own_entry(database, user.id, entry_id))
    database.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
