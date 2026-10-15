"""When people are busy: from the calendars they link, and from the schedules they type in by hand."""

import uuid
from datetime import datetime, timedelta, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ScheduleEntry, User
from app.services import calendar_feed
from app.services.calendar_feed import BusyBlock

MAX_ENTRIES_PER_PERSON = 40


def resolve_timezone(name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(name) if name else ZoneInfo("UTC")
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def entry_blocks(entry: ScheduleEntry, start: datetime, end: datetime) -> list[BusyBlock]:
    """The times one typed-in entry covers between start and end."""
    zone = resolve_timezone(entry.timezone)
    weekdays = set(entry.weekday_list)
    blocks = []
    # From the day before, so a time that runs past midnight into the window is caught.
    day = start.astimezone(zone).date() - timedelta(days=1)
    last = end.astimezone(zone).date()
    while day <= last:
        if day == entry.on_date or (entry.on_date is None and day.weekday() in weekdays):
            begins = datetime.combine(day, entry.start_time, tzinfo=zone)
            ends_on = day + timedelta(days=1) if entry.end_time <= entry.start_time else day
            ends = datetime.combine(ends_on, entry.end_time, tzinfo=zone)
            if begins < end and ends > start:
                blocks.append(BusyBlock(start=begins, end=ends, all_day=False, label=entry.label))
        day += timedelta(days=1)
    return blocks


def typed_in(database: Session, user_ids: list[uuid.UUID], start: datetime, end: datetime) -> dict[uuid.UUID, list[BusyBlock]]:
    """Busy times from typed-in schedules, for each person who has any entries."""
    found: dict[uuid.UUID, list[BusyBlock]] = {}
    if not user_ids:
        return found
    for entry in database.scalars(select(ScheduleEntry).where(ScheduleEntry.user_id.in_(user_ids))).all():
        found.setdefault(entry.user_id, []).extend(entry_blocks(entry, start, end))
    return found


def has_typed_in(database: Session, user_ids: list[uuid.UUID]) -> set[uuid.UUID]:
    if not user_ids:
        return set()
    return set(database.scalars(select(ScheduleEntry.user_id).where(ScheduleEntry.user_id.in_(user_ids)).distinct()).all())


def for_people(database: Session, users: list[User], start: datetime, end: datetime, zone: tzinfo) -> dict[uuid.UUID, list[BusyBlock]]:
    """Everyone's busy times, linked and typed in together, earliest first. Only people with a source are included."""
    combined = calendar_feed.busy_for_people({user.id: user.calendar_url for user in users}, start, end, zone)
    for user_id, blocks in typed_in(database, [user.id for user in users], start, end).items():
        combined[user_id] = combined.get(user_id, []) + blocks
    return {user_id: sorted(blocks, key=lambda block: block.start) for user_id, blocks in combined.items()}
