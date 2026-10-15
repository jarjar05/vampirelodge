"""Tasks shared by several people, and suggestions that read what the task is."""

from datetime import datetime, timedelta, timezone


def _members(admin, login, *people):
    """Join each (name, role, note) to the admin's family and return their clients by name."""
    invite = admin.get("/api/families/me").json()["invite_code"]
    clients = {}
    for name, role, note in people:
        client = login(name)
        assert client.post("/api/families/join", json={"invite_code": invite}).status_code == 201
        client.patch(f"/api/families/me/members/{client.user_id}", json={"relationship_label": role, "availability_note": note})
        clients[name] = client
    return clients


def _task(client, **fields):
    response = client.post("/api/families/me/tasks", json={"title": "Something to do", **fields})
    assert response.status_code == 201, response.text
    return response.json()


def test_a_task_can_be_given_to_several_people(family):
    admin, member = family
    task = _task(admin, title="Clear out the garage", assignee_ids=[member.user_id, admin.user_id])
    assert task["assignee_ids"] == [member.user_id, admin.user_id]
    # The first is the lead, so anything that needs one person still has one.
    assert task["assignee_id"] == member.user_id
    assert task["activity"][-1]["detail"] == "Assigned to Ben and Alice"

    # Narrowing it to one person, and then to nobody.
    response = admin.post(f"/api/families/me/tasks/{task['id']}/assign", json={"assignee_ids": [admin.user_id]})
    assert response.json()["assignee_ids"] == [admin.user_id] and response.json()["assignee_id"] == admin.user_id
    response = admin.post(f"/api/families/me/tasks/{task['id']}/assign", json={"assignee_ids": []})
    assert response.json()["assignee_ids"] == [] and response.json()["assignee_id"] is None
    # The older single-person form still works.
    response = admin.post(f"/api/families/me/tasks/{task['id']}/assign", json={"assignee_id": member.user_id})
    assert response.json()["assignee_ids"] == [member.user_id]


def test_only_family_members_can_share_a_task(family, login):
    admin, member = family
    outsider = login("Olive")
    response = admin.post("/api/families/me/tasks", json={"title": "Shared", "assignee_ids": [member.user_id, outsider.user_id]})
    assert response.status_code == 422


def test_a_shared_task_counts_for_everyone_on_it(family):
    admin, member = family
    due = (datetime.now(timezone.utc) + timedelta(hours=3)).isoformat()
    task = _task(admin, title="Visit Grandma", due_at=due, assignee_ids=[admin.user_id, member.user_id])
    # It is in both people's weeks on the calendar.
    schedule = admin.get("/api/families/me/schedule").json()["members"]
    for entry in schedule:
        assert any(item["kind"] == "task" and item["id"] == task["id"] for item in entry["items"]), entry["member_id"]


def test_a_departing_member_leaves_shared_tasks_with_the_others(family, login):
    admin, member = family
    clients = _members(admin, login, ("Chloe", "Daughter", "Free after school"))
    chloe = clients["Chloe"]
    shared = _task(admin, title="Tidy the study", assignee_ids=[chloe.user_id, member.user_id])
    only_chloe = _task(admin, title="Chloe's own", assignee_ids=[chloe.user_id])
    assert admin.delete(f"/api/families/me/members/{chloe.user_id}").status_code in (200, 204)
    tasks = {task["id"]: task for task in admin.get("/api/families/me/tasks").json()}
    assert tasks[shared["id"]]["assignee_ids"] == [member.user_id]
    assert tasks[only_chloe["id"]]["assignee_ids"] == []


def test_schoolwork_is_suggested_to_the_students(family, login):
    admin, member = family
    member.patch(f"/api/families/me/members/{member.user_id}", json={"relationship_label": "Son"})
    clients = _members(
        admin, login,
        ("Chloe", "Daughter", "Free after school"),
        ("Max", "Grandson", ""),
        ("Mei", "Grandmother", "Home most days"),
    )
    homework = _task(admin, title="Do homework", detail="Maths worksheet for Monday")
    suggestion = admin.get(f"/api/families/me/tasks/{homework['id']}/quick-suggestion").json()
    # Both children, each doing their own; never the grandmother or the working-age adults.
    assert sorted(suggestion["member_ids"]) == sorted([clients["Chloe"].user_id, clients["Max"].user_id])
    assert "schoolwork" in suggestion["reason"]


def test_what_a_task_involves_shapes_the_suggestion(family, login):
    admin, member = family
    member.patch(f"/api/families/me/members/{member.user_id}", json={"relationship_label": "Son"})
    clients = _members(admin, login, ("Siti", "Helper", "Weekdays 8 AM to 6 PM"))
    # Care at home suits the helper first.
    medication = _task(admin, title="Set out the evening medication")
    assert admin.get(f"/api/families/me/tasks/{medication['id']}/quick-suggestion").json()["member_ids"] == [clients["Siti"].user_id]
    # Someone who does not drive is not asked to.
    member.patch(f"/api/families/me/members/{member.user_id}", json={"availability_note": "Does not drive"})
    lift = _task(admin, title="Drive Grandma to the clinic")
    assert admin.get(f"/api/families/me/tasks/{lift['id']}/quick-suggestion").json()["member_ids"] == [admin.user_id]


def test_the_model_can_suggest_several_people(family, login, monkeypatch):
    from app.services import llm

    admin, member = family
    clients = _members(admin, login, ("Chloe", "Daughter", "Free after school"))
    requests = []

    def generate_json(**kwargs):
        requests.append(kwargs)
        return {"member_ids": [clients["Chloe"].user_id, member.user_id, clients["Chloe"].user_id], "reason": "Chloe and Ben can do it together."}

    monkeypatch.setattr(llm, "generate_json", generate_json)
    task = _task(admin, title="Revise for the spelling test")
    body = admin.post(f"/api/families/me/tasks/{task['id']}/suggestion").json()
    # Repeats are dropped and the order is kept; the first is also given on its own.
    assert body["member_ids"] == [clients["Chloe"].user_id, member.user_id]
    assert body["member_id"] == clients["Chloe"].user_id
    assert "homework" in requests[0]["system"].lower() and "more than one" in requests[0]["system"]
