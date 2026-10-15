"""Deleting tasks, changing how they repeat, schedule- and role-aware suggestions, admin roles and password reset."""

import re
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.database import SessionLocal
from app.models import User
from app.services import calendar_feed, password_reset, telegram_api

UTC = timezone.utc


def _in(days: float) -> datetime:
    return (datetime.now(UTC) + timedelta(days=days)).replace(microsecond=0)


def _task(client, **fields):
    response = client.post("/api/families/me/tasks", json={"title": "Pick up medication", **fields})
    assert response.status_code == 201, response.text
    return response.json()


# ── Deleting ───────────────────────────────────────────────────────────────────

def test_deleting_a_task(family, login):
    admin, member = family
    task = _task(admin, assignee_id=member.user_id, due_at=_in(1).isoformat())
    keep = _task(admin, title="Keep me")

    outsider = login("Olivia")
    outsider.post("/api/families", json={"name": "Other Family"})
    assert outsider.delete(f"/api/families/me/tasks/{task['id']}").status_code == 404

    # Anyone in the family can delete, as with editing.
    assert member.delete(f"/api/families/me/tasks/{task['id']}").status_code == 204
    assert [item["id"] for item in admin.get("/api/families/me/tasks").json()] == [keep["id"]]
    assert all(item["task_id"] != task["id"] for item in admin.get("/api/families/me/activity").json())
    assert member.delete(f"/api/families/me/tasks/{task['id']}").status_code == 404


def test_deleting_a_repeating_task_stops_the_series(family):
    admin, _member = family
    first = _task(admin, due_at=_in(1).isoformat(), recurrence="daily")
    admin.post(f"/api/families/me/tasks/{first['id']}/complete")
    done, upcoming = sorted(admin.get("/api/families/me/tasks").json(), key=lambda task: task["due_at"])

    assert admin.delete(f"/api/families/me/tasks/{upcoming['id']}").status_code == 204
    # It does not come back, and the completed one is kept as history.
    for _ in range(2):
        tasks = admin.get("/api/families/me/tasks").json()
        assert [task["id"] for task in tasks] == [done["id"]] and tasks[0]["recurrence"] is None


# ── Changing how a task repeats ────────────────────────────────────────────────

def test_repeat_can_be_started_changed_and_stopped_after_creation(family):
    admin, _member = family
    due = _in(1)
    task = _task(admin, due_at=due.isoformat())
    path = f"/api/families/me/tasks/{task['id']}"

    started = admin.patch(path, json={"recurrence": "weekly"}).json()
    assert started["recurrence"] == "weekly" and started["activity"][-1]["detail"] == "Changed the repeat"
    admin.post(f"{path}/complete")
    following = sorted(admin.get("/api/families/me/tasks").json(), key=lambda item: item["due_at"])[-1]
    assert datetime.fromisoformat(following["due_at"]) == due + timedelta(weeks=1)

    # Changing it on one occurrence changes the series.
    admin.patch(f"/api/families/me/tasks/{following['id']}", json={"recurrence": "daily"})
    assert {item["recurrence"] for item in admin.get("/api/families/me/tasks").json()} == {"daily"}
    admin.patch(f"/api/families/me/tasks/{following['id']}", json={"recurrence": None})
    assert {item["recurrence"] for item in admin.get("/api/families/me/tasks").json()} == {None}

    undated = _task(admin, title="No date")
    assert admin.patch(f"/api/families/me/tasks/{undated['id']}", json={"recurrence": "daily"}).status_code == 422
    assert admin.patch(f"/api/families/me/tasks/{undated['id']}", json={"recurrence": "daily", "due_at": _in(2).isoformat()}).json()["recurrence"] == "daily"


# ── Suggestions and clashes without the model ──────────────────────────────────

FEED = "https://calendar.example.com/feeds/ben.ics"


def _feed_with_event(start: datetime, end: datetime) -> str:
    stamp = lambda moment: moment.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")  # noqa: E731
    return f"BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//t//EN\r\nBEGIN:VEVENT\r\nUID:a\r\nDTSTAMP:20260101T000000Z\r\nDTSTART:{stamp(start)}\r\nDTEND:{stamp(end)}\r\nSUMMARY:Private\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"


def _quick(client, task):
    response = client.get(f"/api/families/me/tasks/{task['id']}/quick-suggestion?timezone=Asia/Singapore")
    assert response.status_code == 200, response.text
    return response.json()


def test_quick_suggestion_follows_schedule_role_and_workload(family, login, monkeypatch):
    admin, member = family
    invite = admin.get("/api/families/me").json()["invite_code"]
    grandma, helper = login("Mei"), login("Siti")
    for client, label in ((grandma, "Grandmother"), (helper, "Helper")):
        client.post("/api/families/join", json={"invite_code": invite})
        client.patch(f"/api/families/me/members/{client.user_id}", json={"relationship_label": label})
    member.patch(f"/api/families/me/members/{member.user_id}", json={"relationship_label": "Son"})

    due = _in(2)
    # A title that says nothing about who suits it, so only schedule, role and workload decide.
    task = _task(admin, title="Sort out the post", due_at=due.isoformat())
    # Alice and Ben are both working-age relatives; Alice carries more, so Ben is suggested over the idle grandmother.
    _task(admin, title="Alice's", assignee_id=admin.user_id)
    assert _quick(admin, task) == {"member_id": member.user_id, "member_ids": [member.user_id], "reason": "Has the fewest open tasks.", "busy_member_ids": []}

    # Ben's calendar shows him busy then, so it falls to Alice, still ahead of the helper and the grandmother.
    monkeypatch.setattr(calendar_feed, "_download", lambda url: _feed_with_event(due - timedelta(minutes=30), due + timedelta(hours=1)))
    assert member.put("/api/calendar", json={"url": FEED}).status_code == 200
    assert _quick(admin, task) == {"member_id": admin.user_id, "member_ids": [admin.user_id], "reason": "Free at that time, with the fewest open tasks.", "busy_member_ids": [member.user_id]}

    # With both relatives out, the helper comes before the grandmother.
    admin.patch(f"/api/families/me/members/{admin.user_id}", json={"availability": "Away today"})
    assert _quick(admin, task)["member_id"] == helper.user_id
    helper.patch(f"/api/families/me/members/{helper.user_id}", json={"availability": "Away today"})
    assert _quick(admin, task)["member_id"] == grandma.user_id

    # A note about school marks someone as a child, whatever their role says.
    child = login("Chloe")
    child.post("/api/families/join", json={"invite_code": invite})
    child.patch(f"/api/families/me/members/{child.user_id}", json={"relationship_label": "Daughter", "availability_note": "Free after school"})
    grandma.patch(f"/api/families/me/members/{grandma.user_id}", json={"availability": "Away today"})
    admin.patch(f"/api/families/me/members/{admin.user_id}", json={"availability": "Available"})
    assert _quick(admin, task)["member_id"] == admin.user_id

    outsider = login("Olivia")
    outsider.post("/api/families", json={"name": "Other Family"})
    assert outsider.get(f"/api/families/me/tasks/{task['id']}/quick-suggestion").status_code == 404


def test_conflicts_list_tasks_whose_assignee_is_busy(family, monkeypatch):
    admin, member = family
    due = _in(2)
    clash = _task(admin, due_at=due.isoformat(), assignee_id=member.user_id)
    _task(admin, title="Other day", due_at=(due + timedelta(days=3)).isoformat(), assignee_id=member.user_id)
    _task(admin, title="Someone else", due_at=due.isoformat(), assignee_id=admin.user_id)
    _task(admin, title="Unassigned", due_at=due.isoformat())
    done = _task(admin, title="Done", due_at=due.isoformat(), assignee_id=member.user_id)
    admin.post(f"/api/families/me/tasks/{done['id']}/complete")
    conflicts = lambda: admin.get("/api/families/me/tasks/conflicts?timezone=Asia/Singapore").json()["task_ids"]  # noqa: E731
    assert conflicts() == []

    monkeypatch.setattr(calendar_feed, "_download", lambda url: _feed_with_event(due - timedelta(minutes=30), due + timedelta(hours=1)))
    member.put("/api/calendar", json={"url": FEED})
    assert conflicts() == [clash["id"]]

    # Unlinking the calendar clears the clash.
    member.delete("/api/calendar")
    assert conflicts() == []


# ── Admins ─────────────────────────────────────────────────────────────────────

def test_admins_can_be_added_and_a_family_always_keeps_one(family):
    admin, member = family
    role_of = lambda client: next(item["role"] for item in admin.get("/api/families/me/members").json() if item["id"] == client.user_id)  # noqa: E731

    # A member cannot promote themselves or anyone else.
    assert member.patch(f"/api/families/me/members/{member.user_id}", json={"role": "ADMIN"}).status_code == 403
    assert member.patch(f"/api/families/me/members/{admin.user_id}", json={"role": "MEMBER"}).status_code == 403
    # The only admin cannot step down.
    assert admin.patch(f"/api/families/me/members/{admin.user_id}", json={"role": "MEMBER"}).status_code == 409

    assert admin.patch(f"/api/families/me/members/{member.user_id}", json={"role": "ADMIN"}).json()["role"] == "ADMIN"
    assert member.get("/api/families/me").json()["invite_code"]
    # With two admins, the first can hand over and step down.
    assert admin.patch(f"/api/families/me/members/{admin.user_id}", json={"role": "MEMBER"}).status_code == 200
    assert (role_of(admin), role_of(member)) == ("MEMBER", "ADMIN")
    assert admin.patch(f"/api/families/me/members/{member.user_id}", json={"role": "MEMBER"}).status_code == 403
    assert member.patch(f"/api/families/me/members/{member.user_id}", json={"role": "MEMBER"}).status_code == 409
    # Changing your own details still works without touching the role.
    assert admin.patch(f"/api/families/me/members/{admin.user_id}", json={"relationship_label": "Daughter"}).json()["role"] == "MEMBER"


# ── Forgotten passwords ────────────────────────────────────────────────────────

PASSWORD = "correct horse battery"
NEW_PASSWORD = "an entirely new password"


@pytest.fixture
def telegram(monkeypatch):
    sent = SimpleNamespace(messages=[])
    monkeypatch.setattr(telegram_api, "is_configured", lambda: True)
    monkeypatch.setattr(telegram_api, "send_message", lambda chat_id, text, buttons=None, reply_to=None: sent.messages.append((chat_id, text)))
    return sent


def _link_telegram(client, telegram_id=4242):
    with SessionLocal() as database:
        database.get(User, uuid.UUID(client.get("/api/auth/me").json()["id"])).telegram_id = telegram_id
        database.commit()


def _code(telegram):
    return re.search(r"\b(\d{6})\b", telegram.messages[-1][1]).group(1)


def test_reset_password_with_a_code_sent_to_telegram(login_with_password, telegram):
    from fastapi.testclient import TestClient

    from app.main import app

    client = login_with_password("Alice", PASSWORD)
    _link_telegram(client)
    anonymous = TestClient(app)

    assert anonymous.post("/api/auth/forgot-password", json={"email": "Alice@Example.com "}).status_code == 204
    chat_id, text = telegram.messages[-1]
    assert chat_id == 4242 and "password reset code" in text
    code = _code(telegram)
    # Asking again straight away does not send a second code.
    anonymous.post("/api/auth/forgot-password", json={"email": "alice@example.com"})
    assert len(telegram.messages) == 1

    wrong = "000000" if code != "000000" else "111111"
    assert anonymous.post("/api/auth/reset-password", json={"email": "alice@example.com", "code": wrong, "new_password": NEW_PASSWORD}).status_code == 400
    assert anonymous.post("/api/auth/reset-password", json={"email": "alice@example.com", "code": code, "new_password": "short"}).status_code == 422
    response = anonymous.post("/api/auth/reset-password", json={"email": "alice@example.com", "code": f" {code} ", "new_password": NEW_PASSWORD})
    assert response.status_code == 204, response.text

    # The old session is signed out, the old password no longer works, and the code cannot be reused.
    assert client.get("/api/auth/me").status_code == 401
    assert anonymous.post("/api/auth/login", json={"email": "alice@example.com", "password": PASSWORD}).status_code == 401
    assert anonymous.post("/api/auth/login", json={"email": "alice@example.com", "password": NEW_PASSWORD}).status_code == 200
    assert anonymous.post("/api/auth/reset-password", json={"email": "alice@example.com", "code": code, "new_password": PASSWORD}).status_code == 400


def test_reset_codes_expire_and_cannot_be_guessed(login_with_password, telegram):
    from fastapi.testclient import TestClient

    from app.main import app

    client = login_with_password("Alice", PASSWORD)
    _link_telegram(client)
    anonymous = TestClient(app)
    attempt = lambda code: anonymous.post("/api/auth/reset-password", json={"email": "alice@example.com", "code": code, "new_password": NEW_PASSWORD}).status_code  # noqa: E731

    anonymous.post("/api/auth/forgot-password", json={"email": "alice@example.com"})
    code = _code(telegram)
    for _ in range(password_reset.MAX_ATTEMPTS):
        assert attempt("999999" if code != "999999" else "888888") == 400
    # After too many wrong guesses even the right code is refused.
    assert attempt(code) == 400

    with SessionLocal() as database:
        user = database.query(User).filter_by(email="alice@example.com").one()
        # Old enough that a new code may be sent, and already expired.
        user.reset_code_expires_at = datetime.now(UTC) - timedelta(minutes=1)
        user.reset_code_attempts = 0
        database.commit()
    assert attempt(code) == 400

    anonymous.post("/api/auth/forgot-password", json={"email": "alice@example.com"})
    assert len(telegram.messages) == 2
    assert attempt(_code(telegram)) == 204


def test_forgot_password_gives_nothing_away(login_with_password, telegram):
    from fastapi.testclient import TestClient

    from app.main import app

    login_with_password("Alice", PASSWORD)  # has an account, but no Telegram
    anonymous = TestClient(app)
    for email in ("alice@example.com", "nobody@example.com"):
        response = anonymous.post("/api/auth/forgot-password", json={"email": email})
        assert response.status_code == 204 and response.text == ""
        assert anonymous.post("/api/auth/reset-password", json={"email": email, "code": "123456", "new_password": NEW_PASSWORD}).status_code == 400
    assert telegram.messages == []
    assert anonymous.post("/api/auth/login", json={"email": "alice@example.com", "password": PASSWORD}).status_code == 200
