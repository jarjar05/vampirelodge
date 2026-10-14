from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from app.services import calendar_feed

SINGAPORE = ZoneInfo("Asia/Singapore")
FEED = "https://calendar.example.com/feeds/ben.ics"


def _local(days: int, hour: int, minute: int = 0) -> datetime:
    day = datetime.now(SINGAPORE) + timedelta(days=days)
    return day.replace(hour=hour, minute=minute, second=0, microsecond=0)


def _feed(start: datetime, end: datetime) -> str:
    stamp = lambda moment: moment.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")  # noqa: E731
    return f"BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//t//EN\r\nBEGIN:VEVENT\r\nUID:a\r\nDTSTAMP:20260101T000000Z\r\nDTSTART:{stamp(start)}\r\nDTEND:{stamp(end)}\r\nSUMMARY:Secret meeting\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"


def test_schedule_shows_each_members_week(family, login, monkeypatch):
    admin, member = family
    monkeypatch.setattr(calendar_feed, "_download", lambda url: _feed(_local(1, 14), _local(1, 15, 30)))
    assert member.put("/api/calendar", json={"url": FEED}).status_code == 200

    task = admin.post("/api/families/me/tasks", json={"title": "Pick up medication", "due_at": _local(2, 17).isoformat(), "assignee_id": member.user_id}).json()
    admin.post("/api/families/me/tasks", json={"title": "Too late", "due_at": _local(9, 17).isoformat(), "assignee_id": member.user_id})
    admin.post("/api/families/me/tasks", json={"title": "Nobody's", "due_at": _local(2, 17).isoformat()})
    done = admin.post("/api/families/me/tasks", json={"title": "Done", "due_at": _local(2, 18).isoformat(), "assignee_id": member.user_id}).json()
    admin.post(f"/api/families/me/tasks/{done['id']}/complete")
    mine = admin.post("/api/families/me/tasks", json={"title": "GP review", "due_at": _local(3, 10).isoformat(), "assignee_id": admin.user_id}).json()

    response = admin.get("/api/families/me/schedule?timezone=Asia/Singapore&days=7")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["days"] == 7 and body["start"] == str(datetime.now(SINGAPORE).date())
    by_member = {entry["member_id"]: entry for entry in body["members"]}
    assert set(by_member) == {admin.user_id, member.user_id}

    ben = by_member[member.user_id]
    assert ben["linked_calendar"] is True and ben["calendar_ok"] is True
    assert [(item["kind"], item["title"]) for item in ben["items"]] == [("busy", None), ("task", "Pick up medication")]
    busy = ben["items"][0]
    assert datetime.fromisoformat(busy["start"]) == _local(1, 14) and datetime.fromisoformat(busy["end"]) == _local(1, 15, 30)
    assert ben["items"][1]["id"] == task["id"]
    # Only busy times leave a linked calendar, never what the events are.
    assert "Secret" not in response.text

    alice = by_member[admin.user_id]
    assert alice["linked_calendar"] is False and alice["calendar_ok"] is True
    assert [(item["kind"], item["title"], item["id"]) for item in alice["items"]] == [("task", "GP review", mine["id"])]

    # A later window shows later things.
    later = admin.get(f"/api/families/me/schedule?timezone=Asia/Singapore&start={(datetime.now(SINGAPORE) + timedelta(days=8)).date()}&days=3").json()
    later_ben = next(entry for entry in later["members"] if entry["member_id"] == member.user_id)
    assert [item["title"] for item in later_ben["items"]] == ["Too late"]

    assert admin.get("/api/families/me/schedule?days=0").status_code == 422
    assert admin.get("/api/families/me/schedule?days=40").status_code == 422
    outsider = login("Olivia")
    assert outsider.get("/api/families/me/schedule").status_code == 404


def test_schedule_reports_an_unreadable_calendar(family, monkeypatch):
    admin, member = family

    def unreachable(url):
        raise calendar_feed.CalendarError("down")

    monkeypatch.setattr(calendar_feed, "_download", lambda url: _feed(_local(1, 9), _local(1, 10)))
    member.put("/api/calendar", json={"url": FEED})
    monkeypatch.setattr(calendar_feed, "_download", unreachable)
    member.post("/api/calendar/sync")
    ben = next(entry for entry in admin.get("/api/families/me/schedule").json()["members"] if entry["member_id"] == member.user_id)
    assert ben["linked_calendar"] is True and ben["calendar_ok"] is False and ben["items"] == []


def test_overview_layout_is_saved_per_person(family):
    admin, member = family
    assert admin.get("/api/auth/me").json()["overview_layout"] is None

    response = admin.patch("/api/auth/me", json={"overview_layout": ["schedule", "plan", "summary"]})
    assert response.status_code == 200 and response.json()["overview_layout"] == ["schedule", "plan", "summary"]
    assert admin.get("/api/auth/me").json()["overview_layout"] == ["schedule", "plan", "summary"]
    assert member.get("/api/auth/me").json()["overview_layout"] is None

    # Other profile changes leave it alone; an empty list is allowed; null goes back to the default.
    assert admin.patch("/api/auth/me", json={"name": "Alice A"}).json()["overview_layout"] == ["schedule", "plan", "summary"]
    assert admin.patch("/api/auth/me", json={"overview_layout": []}).json()["overview_layout"] == []
    assert admin.patch("/api/auth/me", json={"overview_layout": None}).json()["overview_layout"] is None

    for bad in (["plan", "plan"], ["weather"], "plan"):
        assert admin.patch("/api/auth/me", json={"overview_layout": bad}).status_code == 422, bad
