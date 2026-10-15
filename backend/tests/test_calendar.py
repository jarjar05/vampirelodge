from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest

from app.database import SessionLocal
from app.models import User
from app.services import calendar_feed, llm

SINGAPORE = ZoneInfo("Asia/Singapore")
FEED_URL = "https://calendar.example.com/feeds/secret-token-123.ics"


def _stamp(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _event(uid: str, start: datetime, end: datetime, summary: str, extra: str = "") -> str:
    return f"BEGIN:VEVENT\r\nUID:{uid}\r\nDTSTAMP:20260101T000000Z\r\nDTSTART:{_stamp(start)}\r\nDTEND:{_stamp(end)}\r\nSUMMARY:{summary}\r\n{extra}END:VEVENT\r\n"


def _feed(*events: str) -> str:
    return "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//EN\r\n" + "".join(events) + "END:VCALENDAR\r\n"


def _tomorrow_at(hour: int, minute: int = 0) -> datetime:
    """A clock time tomorrow in Singapore."""
    tomorrow = datetime.now(SINGAPORE) + timedelta(days=1)
    return tomorrow.replace(hour=hour, minute=minute, second=0, microsecond=0)


@pytest.fixture
def feeds(monkeypatch):
    """Serve calendar feeds from memory instead of the network. Maps a link to its text, or to an error to raise."""
    served = SimpleNamespace(content={}, downloads=[])

    def download(url: str) -> str:
        served.downloads.append(url)
        result = served.content.get(url)
        if result is None:
            raise calendar_feed.CalendarError("The calendar could not be reached. Try again in a moment.")
        return result

    monkeypatch.setattr(calendar_feed, "_download", download)
    return served


@pytest.fixture
def fake_model(monkeypatch):
    calls = SimpleNamespace(requests=[], answer=None)

    def generate_json(**kwargs):
        calls.requests.append(kwargs)
        return calls.answer(kwargs) if callable(calls.answer) else calls.answer

    monkeypatch.setattr(llm, "generate_json", generate_json)
    return calls


def test_only_real_busy_times_are_read_from_a_feed():
    start = _tomorrow_at(14)
    daily = _tomorrow_at(8) - timedelta(days=10)
    text = _feed(
        _event("meeting", start, start + timedelta(hours=1, minutes=30), "Secret board meeting"),
        _event("standup", daily, daily + timedelta(minutes=15), "Daily standup", "RRULE:FREQ=DAILY\r\n"),
        _event("free", _tomorrow_at(10), _tomorrow_at(11), "Marked as free", "TRANSP:TRANSPARENT\r\n"),
        _event("cancelled", _tomorrow_at(16), _tomorrow_at(17), "Cancelled", "STATUS:CANCELLED\r\n"),
        f"BEGIN:VEVENT\r\nUID:allday\r\nDTSTAMP:20260101T000000Z\r\nDTSTART;VALUE=DATE:{start:%Y%m%d}\r\nDTEND;VALUE=DATE:{start + timedelta(days=1):%Y%m%d}\r\nSUMMARY:Public holiday\r\nEND:VEVENT\r\n",
        f"BEGIN:VEVENT\r\nUID:floating\r\nDTSTAMP:20260101T000000Z\r\nDTSTART:{_tomorrow_at(20):%Y%m%dT%H%M%S}\r\nDTEND:{_tomorrow_at(21):%Y%m%dT%H%M%S}\r\nSUMMARY:No time zone\r\nEND:VEVENT\r\n",
    )
    day_start = _tomorrow_at(0)
    blocks = calendar_feed._blocks(calendar_feed._parse(text), day_start, day_start + timedelta(days=1), SINGAPORE)
    lines = calendar_feed.describe(blocks, SINGAPORE)

    assert lines == [
        f"{day_start:%A %d %B}, all-day entry",
        f"{day_start:%A %d %B}, 08:00 to 08:15",
        f"{day_start:%A %d %B}, 14:00 to 15:30",
        f"{day_start:%A %d %B}, 20:00 to 21:00",
    ]
    assert "Secret" not in " ".join(lines)


@pytest.mark.parametrize("raw, expected", [
    ("  webcal://p01-caldav.icloud.com/published/2/abc  ", "https://p01-caldav.icloud.com/published/2/abc"),
    ("WEBCAL://example.com/a.ics", "https://example.com/a.ics"),
    (FEED_URL, FEED_URL),
])
def test_calendar_links_are_normalised(raw, expected):
    assert calendar_feed.normalize_url(raw) == expected


@pytest.mark.parametrize("raw", ["", "not a link", "http://example.com/a.ics", "file:///etc/passwd", "ftp://example.com/a.ics", "https://user:pw@example.com/a.ics", "https://"])
def test_unusable_calendar_links_are_refused(raw):
    with pytest.raises(calendar_feed.CalendarError):
        calendar_feed.normalize_url(raw)


@pytest.mark.parametrize("url", ["https://127.0.0.1/a.ics", "https://localhost/a.ics", "https://10.0.0.5/a.ics", "https://192.168.1.1/a.ics", "https://169.254.169.254/latest", "https://[::1]/a.ics"])
def test_links_to_private_addresses_are_never_downloaded(url):
    with pytest.raises(calendar_feed.CalendarError, match="not a public web address"):
        calendar_feed._download(url)


def test_linking_checks_the_feed_and_never_returns_the_link(login, feeds):
    client = login("Alice")
    assert client.get("/api/calendar").json() == {"connected": False, "synced_at": None, "event_count": None, "error": None}

    # A link that cannot be read is not saved.
    response = client.put("/api/calendar", json={"url": FEED_URL})
    assert response.status_code == 400 and "could not be reached" in response.json()["detail"]
    feeds.content[FEED_URL] = "<html>Sign in to continue</html>"
    response = client.put("/api/calendar", json={"url": FEED_URL})
    assert response.status_code == 400 and "did not return a calendar" in response.json()["detail"]
    assert client.put("/api/calendar", json={"url": "http://example.com/a.ics"}).status_code == 400
    assert client.get("/api/calendar").json()["connected"] is False

    feeds.content[FEED_URL] = _feed(_event("a", _tomorrow_at(14), _tomorrow_at(15), "Dentist"))
    response = client.put("/api/calendar", json={"url": FEED_URL.replace("https://", "webcal://")})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["connected"] is True and body["event_count"] == 1 and body["error"] is None

    with SessionLocal() as database:
        assert database.get(User, __import__("uuid").UUID(client.user_id)).calendar_url == FEED_URL
    for path in ("/api/calendar", "/api/auth/me"):
        text = client.get(path).text
        assert "secret-token" not in text and "Dentist" not in text

    # Reads are reused until asked to sync, when a new event shows up.
    downloads = len(feeds.downloads)
    assert client.get("/api/calendar").json()["event_count"] == 1
    assert len(feeds.downloads) == downloads
    feeds.content[FEED_URL] = _feed(_event("a", _tomorrow_at(14), _tomorrow_at(15), "Dentist"), _event("b", _tomorrow_at(18), _tomorrow_at(19), "Dinner"))
    assert client.post("/api/calendar/sync").json()["event_count"] == 2

    # A feed that stops working is reported, not hidden.
    del feeds.content[FEED_URL]
    broken = client.post("/api/calendar/sync").json()
    assert broken["connected"] is True and broken["event_count"] is None and "could not be reached" in broken["error"]

    assert client.delete("/api/calendar").status_code == 204
    assert client.get("/api/calendar").json()["connected"] is False


def test_calendar_endpoints_need_a_signed_in_user():
    from fastapi.testclient import TestClient

    from app.main import app

    anonymous = TestClient(app)
    assert anonymous.get("/api/calendar").status_code == 401
    assert anonymous.put("/api/calendar", json={"url": FEED_URL}).status_code == 401


def test_my_busy_times_reach_my_plan_and_a_calendar_change_refreshes_it(family, feeds, fake_model):
    admin, member = family
    admin.post("/api/families/me/tasks", json={"title": "Pick up medication", "assignee_id": admin.user_id})
    fake_model.answer = lambda request: {
        "summary": "One thing to do.",
        "steps": [{"task_id": request["schema"]["properties"]["steps"]["items"]["properties"]["task_id"]["enum"][0], "note": "Only task."}],
    }
    plan = lambda: admin.post("/api/families/me/day-plan", json={"timezone": "Asia/Singapore"})  # noqa: E731

    assert plan().status_code == 200
    assert "my_calendar_busy_times" not in fake_model.requests[0]["prompt"]

    # Someone else linking a calendar does not touch my plan.
    other_url = "https://calendar.example.com/feeds/ben.ics"
    feeds.content[other_url] = _feed(_event("x", _tomorrow_at(9), _tomorrow_at(10), "Ben private"))
    assert member.put("/api/calendar", json={"url": other_url}).status_code == 200
    plan()
    assert len(fake_model.requests) == 1

    feeds.content[FEED_URL] = _feed(_event("a", _tomorrow_at(14), _tomorrow_at(15), "Secret board meeting"))
    assert admin.put("/api/calendar", json={"url": FEED_URL}).status_code == 200
    plan()
    assert len(fake_model.requests) == 2
    prompt = fake_model.requests[1]["prompt"]
    assert f"<my_calendar_busy_times>\n{_tomorrow_at(14):%A %d %B}, 14:00 to 15:00\n</my_calendar_busy_times>" in prompt
    assert "Secret" not in prompt and "secret-token" not in prompt and "09:00 to 10:00" not in prompt

    plan()
    assert len(fake_model.requests) == 2

    # An unreadable calendar does not stop the plan.
    del feeds.content[FEED_URL]
    admin.post("/api/calendar/sync")
    assert plan().status_code == 200
    assert "(nothing in the next 30 days)" in fake_model.requests[-1]["prompt"]


def test_my_plan_sees_busy_times_a_month_ahead_but_no_further(family, feeds, fake_model):
    admin, _member = family
    admin.post("/api/families/me/tasks", json={"title": "Pick up medication", "assignee_id": admin.user_id})
    in_three_weeks = _tomorrow_at(11) + timedelta(days=20)
    in_six_weeks = _tomorrow_at(13) + timedelta(days=41)
    feeds.content[FEED_URL] = _feed(
        _event("soon", in_three_weeks, in_three_weeks + timedelta(hours=1), "Three weeks out"),
        _event("later", in_six_weeks, in_six_weeks + timedelta(hours=1), "Six weeks out"),
    )
    assert admin.put("/api/calendar", json={"url": FEED_URL}).json()["event_count"] == 1
    fake_model.answer = lambda request: {
        "summary": "One thing to do.",
        "steps": [{"task_id": request["schema"]["properties"]["steps"]["items"]["properties"]["task_id"]["enum"][0], "note": "Only task."}],
    }

    assert admin.post("/api/families/me/day-plan", json={"timezone": "Asia/Singapore"}).status_code == 200
    prompt = fake_model.requests[0]["prompt"]
    assert f"{in_three_weeks:%A %d %B}, 11:00 to 12:00" in prompt
    assert "13:00 to 14:00" not in prompt


def test_the_whole_due_day_reaches_the_assignment_prompt(family, feeds, fake_model):
    admin, member = family
    due = _tomorrow_at(15)
    feeds.content[FEED_URL] = _feed(
        _event("clash", due - timedelta(minutes=30), due + timedelta(hours=1), "Secret board meeting"),
        _event("morning", _tomorrow_at(9), _tomorrow_at(10), "Earlier that day"),
        _event("far", due + timedelta(days=3), due + timedelta(days=3, hours=1), "Another day"),
    )
    assert member.put("/api/calendar", json={"url": FEED_URL}).status_code == 200
    task = admin.post("/api/families/me/tasks", json={"title": "School pickup", "due_at": due.isoformat()}).json()
    fake_model.answer = {"member_ids": [admin.user_id], "reason": "Ben is busy then."}

    response = admin.post(f"/api/families/me/tasks/{task['id']}/suggestion?timezone=Asia/Singapore")
    assert response.status_code == 200, response.text
    prompt = fake_model.requests[0]["prompt"]
    assert f'"due": "{due:%A %d %B %Y}, 15:00"' in prompt
    assert f'"{due:%A %d %B}, 14:30 to 16:00"' in prompt and f'"{due:%A %d %B}, 09:00 to 10:00"' in prompt
    # Only members with a linked calendar get the field, and only that day's times.
    assert prompt.count('"calendar_busy_on_task_day"') == 1
    assert prompt.count('"busy_at_task_time": true') == 1 and prompt.count('"busy_at_task_time": false') == 1
    # The busy member cannot be the answer at all.
    assert fake_model.requests[0]["schema"]["properties"]["member_ids"]["items"]["enum"] == [admin.user_id]
    fake_model.answer = {"member_ids": [member.user_id], "reason": "Ignoring the clash."}
    assert admin.post(f"/api/families/me/tasks/{task['id']}/suggestion?timezone=Asia/Singapore").status_code == 503
    assert "Secret" not in prompt and "secret-token" not in prompt
    assert f"{due + timedelta(days=3):%A %d %B}" not in prompt


def _busy(client, task, zone="Asia/Singapore"):
    response = client.get(f"/api/families/me/tasks/{task['id']}/availability?timezone={zone}")
    assert response.status_code == 200, response.text
    return response.json()["busy_member_ids"]


def test_availability_flags_only_people_busy_at_the_task_time(family, feeds, fake_model):
    admin, member = family
    due = _tomorrow_at(15)
    task = admin.post("/api/families/me/tasks", json={"title": "School pickup", "due_at": due.isoformat()}).json()
    undated = admin.post("/api/families/me/tasks", json={"title": "Sort the medicine cabinet"}).json()
    assert _busy(admin, task) == []

    # Busy earlier the same day, or all day, is not a clash.
    feeds.content[FEED_URL] = _feed(
        _event("morning", _tomorrow_at(9), _tomorrow_at(10), "Earlier"),
        f"BEGIN:VEVENT\r\nUID:allday\r\nDTSTAMP:20260101T000000Z\r\nDTSTART;VALUE=DATE:{due:%Y%m%d}\r\nDTEND;VALUE=DATE:{due + timedelta(days=1):%Y%m%d}\r\nSUMMARY:Holiday\r\nEND:VEVENT\r\n",
    )
    assert member.put("/api/calendar", json={"url": FEED_URL}).status_code == 200
    assert _busy(admin, task) == []

    # Ending 40 minutes before the task is within the hour either side.
    feeds.content[FEED_URL] = _feed(_event("before", due - timedelta(hours=2), due - timedelta(minutes=40), "Just before"))
    member.post("/api/calendar/sync")
    assert _busy(admin, task) == [member.user_id]
    assert _busy(admin, undated) == []

    # When everyone is busy, anyone may be suggested.
    feeds.content["https://calendar.example.com/feeds/alice.ics"] = _feed(_event("alice", due + timedelta(minutes=30), due + timedelta(hours=1), "Dentist"))
    assert admin.put("/api/calendar", json={"url": "https://calendar.example.com/feeds/alice.ics"}).status_code == 200
    assert sorted(_busy(member, task)) == sorted([admin.user_id, member.user_id])
    fake_model.answer = {"member_ids": [admin.user_id], "reason": "Fine."}
    admin.post(f"/api/families/me/tasks/{task['id']}/suggestion?timezone=Asia/Singapore")
    prompt = fake_model.requests[0]["prompt"]
    assert prompt.count('"busy_at_task_time": true') == 2 and "Dentist" not in prompt
    assert sorted(fake_model.requests[0]["schema"]["properties"]["member_ids"]["items"]["enum"]) == sorted([admin.user_id, member.user_id])
    admin.delete("/api/calendar")
    assert _busy(admin, task) == [member.user_id]

    # No model call is made for availability, and other families cannot ask.
    assert len(fake_model.requests) == 1


def test_availability_is_family_scoped(family, login):
    admin, _member = family
    task = admin.post("/api/families/me/tasks", json={"title": "School pickup", "due_at": _tomorrow_at(15).isoformat()}).json()
    outsider = login("Olivia")
    outsider.post("/api/families", json={"name": "Other Family"})
    assert outsider.get(f"/api/families/me/tasks/{task['id']}/availability").status_code == 404


def test_sample_calendar_links_cannot_be_set_through_the_api_or_escape_their_folder(login, tmp_path, monkeypatch):
    client = login("Alice")
    assert client.put("/api/calendar", json={"url": "demo://marcus"}).status_code == 400

    monkeypatch.setattr(calendar_feed, "DEMO_CALENDAR_DIR", tmp_path)
    (tmp_path / "marcus.ics").write_text(_feed(_event("a", _tomorrow_at(9), _tomorrow_at(10), "Work")), encoding="utf-8")
    assert "BEGIN:VCALENDAR" in calendar_feed._download("demo://marcus")
    for name in ("../marcus", "marcus.ics", "", "a/b", "missing"):
        with pytest.raises(calendar_feed.CalendarError):
            calendar_feed._download(f"demo://{name}")
    monkeypatch.setattr(calendar_feed, "settings", SimpleNamespace(environment="production"))
    with pytest.raises(calendar_feed.CalendarError):
        calendar_feed._download("demo://marcus")
