"""Everyone's week at a glance: tasks due, and busy times from linked calendars and typed-in schedules."""

from datetime import date, datetime, time, timedelta, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.family import FamilyMemberContext
from app.models import FamilyMembership, Task, User
from app.services import busy_times, calendar_feed
from app.services.day_plan import resolve_timezone

router = APIRouter(prefix="/api/families/me", tags=["schedule"])
DatabaseSession = Annotated[Session, Depends(get_db)]
MAX_DAYS = 31


class ScheduleItem(BaseModel):
    # "busy" from a linked calendar never carries a title: only the time is shared. One typed in by hand carries
    # the label its owner chose to share, if any.
    kind: Literal["busy", "task"]
    start: datetime
    end: datetime | None = None
    all_day: bool = False
    title: str | None = None
    # The task behind a task entry, so the page can link to it.
    id: str | None = None


class MemberSchedule(BaseModel):
    member_id: str
    linked_calendar: bool
    # Whether the calendar could be read just now; false with linked_calendar true means busy times may be missing.
    calendar_ok: bool
    # Whether they have typed in a schedule of their own.
    manual_schedule: bool = False
    items: list[ScheduleItem]


class ScheduleResponse(BaseModel):
    start: date
    days: int
    members: list[MemberSchedule]


@router.get("/schedule", response_model=ScheduleResponse)
def read_schedule(
    family_access: FamilyMemberContext,
    database: DatabaseSession,
    start: date | None = None,
    days: Annotated[int, Query(ge=1, le=MAX_DAYS)] = 7,
    timezone_name: Annotated[str | None, Query(alias="timezone", max_length=64)] = None,
) -> ScheduleResponse:
    """Each member's open tasks due, and calendar busy times for `days` days from `start` (local)."""
    zone = resolve_timezone(timezone_name)
    first_day = start or datetime.now(zone).date()
    window_start = datetime.combine(first_day, time.min, tzinfo=zone)
    window_end = window_start + timedelta(days=days)
    family_id = family_access.family.id

    rows = database.execute(
        select(FamilyMembership, User).join(User, User.id == FamilyMembership.user_id)
        .where(FamilyMembership.family_id == family_id).order_by(FamilyMembership.joined_at, User.name)
    ).all()
    users = [user for _membership, user in rows]
    busy = busy_times.for_people(database, users, window_start, window_end, zone)
    typed_in = busy_times.has_typed_in(database, [user.id for user in users])

    items: dict = {user.id: [] for user in users}
    for task in database.scalars(
        select(Task).where(Task.family_id == family_id, Task.assignee_id.is_not(None), Task.status != "Completed",
                           Task.due_at >= window_start, Task.due_at < window_end)
    ).all():
        # A shared task shows in the week of everyone on it.
        for assignee_id in task.assignee_ids:
            if assignee_id in items:
                items[assignee_id].append(ScheduleItem(kind="task", start=task.due_at, title=task.title, id=str(task.id)))
    for user_id, blocks in busy.items():
        for block in blocks:
            items[user_id].append(ScheduleItem(kind="busy", start=block.start.astimezone(timezone.utc), end=block.end.astimezone(timezone.utc), all_day=block.all_day, title=block.label))

    members = []
    for user in users:
        linked = bool(user.calendar_url)
        calendar_ok = not linked or calendar_feed.check(user.id, user.calendar_url).error is None
        members.append(MemberSchedule(
            member_id=str(user.id), linked_calendar=linked, calendar_ok=calendar_ok, manual_schedule=user.id in typed_in,
            items=sorted(items[user.id], key=lambda item: (not item.all_day, item.start)),
        ))
    return ScheduleResponse(start=first_day, days=days, members=members)
