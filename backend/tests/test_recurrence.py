from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text

from app.database import engine
from app.services.recurrence import next_due

UTC = timezone.utc


def _tasks(client):
    return sorted(client.get("/api/families/me/tasks").json(), key=lambda task: task["due_at"] or "")


def _create(client, **fields):
    response = client.post("/api/families/me/tasks", json={"title": "Give Grandma her tablets", **fields})
    assert response.status_code == 201, response.text
    return response.json()


def _in(days: float) -> datetime:
    return (datetime.now(UTC) + timedelta(days=days)).replace(microsecond=0)


@pytest.mark.parametrize("recurrence, anchor, after, expected", [
    ("daily", datetime(2026, 10, 1, 9, tzinfo=UTC), datetime(2026, 10, 1, 9, tzinfo=UTC), datetime(2026, 10, 2, 9, tzinfo=UTC)),
    ("daily", datetime(2026, 10, 1, 9, tzinfo=UTC), datetime(2026, 10, 5, 12, tzinfo=UTC), datetime(2026, 10, 6, 9, tzinfo=UTC)),
    ("weekly", datetime(2026, 10, 1, 9, tzinfo=UTC), datetime(2026, 10, 1, 9, tzinfo=UTC), datetime(2026, 10, 8, 9, tzinfo=UTC)),
    ("biweekly", datetime(2026, 10, 1, 9, tzinfo=UTC), datetime(2026, 10, 9, 9, tzinfo=UTC), datetime(2026, 10, 15, 9, tzinfo=UTC)),
    # A task due on the 31st lands on the last day of a shorter month, then returns to the 31st.
    ("monthly", datetime(2026, 1, 31, 9, tzinfo=UTC), datetime(2026, 1, 31, 9, tzinfo=UTC), datetime(2026, 2, 28, 9, tzinfo=UTC)),
    ("monthly", datetime(2026, 1, 31, 9, tzinfo=UTC), datetime(2026, 2, 28, 9, tzinfo=UTC), datetime(2026, 3, 31, 9, tzinfo=UTC)),
])
def test_next_due(recurrence, anchor, after, expected):
    assert next_due(anchor, after, recurrence) == expected


def test_completing_a_repeating_task_creates_the_next_one(family):
    admin, member = family
    due = _in(1)
    first = _create(admin, due_at=due.isoformat(), recurrence="weekly", assignee_id=member.user_id, location="Home", priority="High", detail="After dinner")
    assert first["recurrence"] == "weekly"
    assert len(_tasks(admin)) == 1

    admin.post(f"/api/families/me/tasks/{first['id']}/complete")
    done, following = _tasks(admin)
    assert done["status"] == "Completed" and following["status"] == "Open"
    assert datetime.fromisoformat(following["due_at"]) == due + timedelta(weeks=1)
    for field in ("title", "detail", "location", "priority", "assignee_id", "recurrence"):
        assert following[field] == first[field], field
    assert following["activity"][0]["detail"] == "Repeats every week"

    # Completing it again, or reopening and completing, does not create duplicates.
    admin.post(f"/api/families/me/tasks/{first['id']}/complete")
    admin.post(f"/api/families/me/tasks/{first['id']}/reopen")
    admin.post(f"/api/families/me/tasks/{first['id']}/complete")
    assert len(_tasks(admin)) == 2

    admin.post(f"/api/families/me/tasks/{following['id']}/complete")
    third = _tasks(admin)[-1]
    assert datetime.fromisoformat(third["due_at"]) == due + timedelta(weeks=2)


def test_a_missed_repeating_task_still_gets_its_next_occurrence_but_only_one(family):
    admin, _member = family
    due = _in(1)
    first = _create(admin, due_at=due.isoformat(), recurrence="daily")
    # Pretend it fell due five and a half days ago and nobody opened the app since.
    past = due - timedelta(days=6.5)
    with engine.begin() as connection:
        connection.execute(text("UPDATE tasks SET due_at = :due"), {"due": past})

    missed, following = _tasks(admin)
    assert missed["id"] == first["id"] and missed["status"] == "Open"
    upcoming = datetime.fromisoformat(following["due_at"])
    assert datetime.now(UTC) < upcoming <= datetime.now(UTC) + timedelta(days=1)
    # Looking again changes nothing.
    assert len(_tasks(admin)) == 2


def test_stop_repeating_ends_the_series(family):
    admin, _member = family
    first = _create(admin, due_at=_in(1).isoformat(), recurrence="daily")
    admin.post(f"/api/families/me/tasks/{first['id']}/complete")
    following = _tasks(admin)[-1]

    response = admin.post(f"/api/families/me/tasks/{following['id']}/stop-repeating")
    assert response.status_code == 200 and response.json()["recurrence"] is None
    assert all(task["recurrence"] is None for task in _tasks(admin))
    admin.post(f"/api/families/me/tasks/{following['id']}/complete")
    assert len(_tasks(admin)) == 2

    # Harmless on a task that never repeated.
    plain = _create(admin, title="One-off")
    assert admin.post(f"/api/families/me/tasks/{plain['id']}/stop-repeating").json()["recurrence"] is None


def test_recurrence_rules_and_family_scoping(family, login):
    admin, _member = family
    assert admin.post("/api/families/me/tasks", json={"title": "x", "recurrence": "weekly"}).status_code == 422
    assert admin.post("/api/families/me/tasks", json={"title": "x", "due_at": _in(1).isoformat(), "recurrence": "hourly"}).status_code == 422
    assert _create(admin, title="Plain")["recurrence"] is None

    task = _create(admin, due_at=_in(1).isoformat(), recurrence="monthly")
    outsider = login("Olivia")
    outsider.post("/api/families", json={"name": "Other Family"})
    assert outsider.post(f"/api/families/me/tasks/{task['id']}/stop-repeating").status_code == 404
    assert outsider.get("/api/families/me/tasks").json() == []
