"""Repeating tasks. A series always has one occurrence waiting: when the latest is completed, or its due time
passes, the next one is created."""

import uuid
from datetime import datetime, timedelta, timezone

from dateutil.relativedelta import relativedelta
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Task
from app.services.tasks import record_activity, set_assignees

RECURRENCES = ("daily", "weekly", "biweekly", "monthly")
LABELS = {"daily": "every day", "weekly": "every week", "biweekly": "every 2 weeks", "monthly": "every month"}
_STEPS = {"daily": timedelta(days=1), "weekly": timedelta(weeks=1), "biweekly": timedelta(weeks=2)}


def next_due(anchor: datetime, after: datetime, recurrence: str) -> datetime:
    """The first occurrence later than `after`, counting from the series' first due time.

    Monthly dates are counted from the first one, so a task due on the 31st returns to the 31st after a shorter month.
    """
    if recurrence == "monthly":
        months = 1
        while anchor + relativedelta(months=months) <= after:
            months += 1
        return anchor + relativedelta(months=months)
    step = _STEPS[recurrence]
    periods = max(1, (after - anchor) // step + 1)
    return anchor + step * periods


def _on_schedule(anchor: datetime, moment: datetime, recurrence: str) -> bool:
    """True when `moment` is one of the times the series started at `anchor` falls on."""
    if moment < anchor:
        return False
    if recurrence == "monthly":
        months = (moment.year - anchor.year) * 12 + moment.month - anchor.month
        return anchor + relativedelta(months=months) == moment
    return (moment - anchor) % _STEPS[recurrence] == timedelta(0)


def start_series(task: Task) -> None:
    """Call once a new repeating task has an id."""
    task.series_id = task.id


def _schedule_next(database: Session, latest: Task, now: datetime) -> Task | None:
    if not latest.recurrence or latest.series_id is None or latest.due_at is None:
        return None
    if latest.status != "Completed" and latest.due_at > now:
        return None
    anchor = database.scalar(select(func.min(Task.due_at)).where(Task.series_id == latest.series_id)) or latest.due_at
    # If someone moved the latest occurrence to a different day or time, the series continues from there.
    if not _on_schedule(anchor, latest.due_at, latest.recurrence):
        anchor = latest.due_at
    following = Task(
        family_id=latest.family_id,
        title=latest.title,
        detail=latest.detail,
        location=latest.location,
        # Later than both the last one and now, so a long gap does not produce a pile of missed occurrences.
        due_at=next_due(anchor, max(latest.due_at, now), latest.recurrence),
        priority=latest.priority,
        created_by_id=latest.created_by_id,
        recurrence=latest.recurrence,
        series_id=latest.series_id,
    )
    # The next one goes to the same people.
    set_assignees(following, latest.assignee_ids)
    database.add(following)
    record_activity(following, latest.created_by_id, "Created", f"Repeats {LABELS[latest.recurrence]}")
    return following


def schedule_after(database: Session, task: Task, now: datetime | None = None) -> Task | None:
    """Create the next occurrence if `task` is the latest in its series and is done or past due. Does not commit."""
    if not task.recurrence or task.series_id is None:
        return None
    latest_due = database.scalar(select(func.max(Task.due_at)).where(Task.series_id == task.series_id))
    if latest_due is not None and task.due_at is not None and task.due_at < latest_due:
        return None
    return _schedule_next(database, task, now or datetime.now(timezone.utc))


def catch_up(database: Session, family_id: uuid.UUID, now: datetime | None = None) -> bool:
    """Create the next occurrence for every series in the family whose latest one is done or past due. Does not commit."""
    now = now or datetime.now(timezone.utc)
    latest_by_series: dict[uuid.UUID, Task] = {}
    for task in database.scalars(select(Task).where(Task.family_id == family_id, Task.recurrence.is_not(None), Task.series_id.is_not(None))).all():
        current = latest_by_series.get(task.series_id)
        if current is None or (task.due_at and current.due_at and task.due_at > current.due_at):
            latest_by_series[task.series_id] = task
    return any([_schedule_next(database, latest, now) is not None for latest in latest_by_series.values()])


def set_recurrence(database: Session, task: Task, recurrence: str | None) -> None:
    """Start, change or stop a task repeating. A task already in a series changes the whole series. Does not commit."""
    if recurrence is None:
        stop_series(database, task)
    elif task.series_id is None:
        task.recurrence = recurrence
        task.series_id = task.id
    else:
        for occurrence in database.scalars(select(Task).where(Task.series_id == task.series_id)).all():
            occurrence.recurrence = recurrence


def stop_series(database: Session, task: Task) -> None:
    """Stop the whole series repeating. Occurrences that already exist are kept. Does not commit."""
    if task.series_id is None:
        task.recurrence = None
        return
    for occurrence in database.scalars(select(Task).where(Task.series_id == task.series_id)).all():
        occurrence.recurrence = None
