"""Schedules typed in by hand, for people who do not link a calendar."""

from datetime import date, datetime, timedelta, timezone


def _monday(weeks_ahead: int = 1) -> date:
    today = datetime.now(timezone.utc).date()
    return today - timedelta(days=today.weekday()) + timedelta(weeks=weeks_ahead)


def test_a_weekly_time_shows_on_the_shared_calendar(family):
    admin, member = family
    response = member.post("/api/me/schedule", json={
        "label": "Work", "weekdays": [0, 2], "start_time": "09:00", "end_time": "17:30", "timezone": "Asia/Singapore",
    })
    assert response.status_code == 201, response.text
    entry = response.json()
    assert entry["weekdays"] == [0, 2] and entry["label"] == "Work"

    # Alice sees Ben busy on Monday and Wednesday of that week, labelled, in his time zone.
    monday = _monday()
    week = admin.get(f"/api/families/me/schedule?start={monday}&days=7&timezone=Asia/Singapore").json()
    ben = next(item for item in week["members"] if item["member_id"] == member.user_id)
    assert ben["manual_schedule"] is True and ben["linked_calendar"] is False
    busy = [item for item in ben["items"] if item["kind"] == "busy"]
    assert len(busy) == 2 and all(item["title"] == "Work" for item in busy)
    assert busy[0]["start"].startswith(f"{monday}T01:00")  # 9 AM in Singapore is 1 AM UTC


def test_a_one_off_time_and_one_that_runs_past_midnight(family):
    admin, member = family
    day = _monday() + timedelta(days=3)
    member.post("/api/me/schedule", json={"on_date": str(day), "start_time": "22:00", "end_time": "06:00"})
    week = admin.get(f"/api/families/me/schedule?start={_monday()}&days=7").json()
    ben = next(item for item in week["members"] if item["member_id"] == member.user_id)
    [busy] = [item for item in ben["items"] if item["kind"] == "busy"]
    # No label shows as plain "Busy", and the night shift ends the next morning.
    assert busy["title"] is None
    assert busy["start"].startswith(f"{day}T22:00") and busy["end"].startswith(f"{day + timedelta(days=1)}T06:00")


def test_entries_must_be_weekly_or_one_off_and_belong_to_their_owner(family):
    admin, member = family
    both = {"weekdays": [1], "on_date": str(_monday()), "start_time": "09:00", "end_time": "10:00"}
    assert member.post("/api/me/schedule", json=both).status_code == 422
    neither = {"start_time": "09:00", "end_time": "10:00"}
    assert member.post("/api/me/schedule", json=neither).status_code == 422
    assert member.post("/api/me/schedule", json={"weekdays": [7], "start_time": "09:00", "end_time": "10:00"}).status_code == 422

    entry = member.post("/api/me/schedule", json={"weekdays": [1], "start_time": "09:00", "end_time": "10:00"}).json()
    # Someone else cannot change or remove it.
    assert admin.delete(f"/api/me/schedule/{entry['id']}").status_code == 404
    assert admin.get("/api/me/schedule").json() == []
    changed = member.put(f"/api/me/schedule/{entry['id']}", json={"label": "Gym", "weekdays": [1, 3], "start_time": "18:00", "end_time": "19:00"})
    assert changed.json()["label"] == "Gym" and changed.json()["weekdays"] == [1, 3]
    assert member.delete(f"/api/me/schedule/{entry['id']}").status_code == 204
    assert member.get("/api/me/schedule").json() == []


def test_typed_in_times_count_as_busy_for_suggestions(family):
    admin, member = family
    due = datetime.now(timezone.utc).replace(microsecond=0) + timedelta(days=2)
    member.post("/api/me/schedule", json={"on_date": str(due.date()), "start_time": (due - timedelta(minutes=30)).strftime("%H:%M"), "end_time": (due + timedelta(minutes=30)).strftime("%H:%M")})
    task = admin.post("/api/families/me/tasks", json={"title": "Sort out the post", "due_at": due.isoformat()}).json()
    busy = admin.get(f"/api/families/me/tasks/{task['id']}/quick-suggestion").json()["busy_member_ids"]
    assert member.user_id in busy
