def _create_task(client, **overrides):
    response = client.post("/api/families/me/tasks", json={"title": "Pick up medication", **overrides})
    assert response.status_code == 201, response.text
    return response.json()


def test_requires_sign_in():
    from fastapi.testclient import TestClient

    from app.main import app

    assert TestClient(app).get("/api/families/me/tasks").status_code == 401


def test_task_lifecycle_records_activity(family):
    admin, member = family
    task = _create_task(admin, detail="Oak Pharmacy", due_at="2030-01-01T09:00:00Z")
    assert task["status"] == "Open"
    assert task["assignee_id"] is None
    assert [item["action"] for item in task["activity"]] == ["Created"]

    task = admin.post(f"/api/families/me/tasks/{task['id']}/assign", json={"assignee_id": member.user_id}).json()
    assert task["assignee_id"] == member.user_id

    # Being assigned is enough: there is no separate step to accept or decline.
    assert task["status"] == "Open"
    for removed in ("accept", "decline"):
        assert member.post(f"/api/families/me/tasks/{task['id']}/{removed}").status_code == 404

    task = admin.post(f"/api/families/me/tasks/{task['id']}/complete").json()
    assert task["status"] == "Completed"
    assert task["completed_at"] is not None

    task = admin.post(f"/api/families/me/tasks/{task['id']}/reopen").json()
    assert task["status"] == "Open"
    assert task["completed_at"] is None

    actions = [item["action"] for item in task["activity"]]
    assert actions == ["Created", "Assigned", "Completed", "Reopened"]
    assert task["activity"][1]["actor_name"] == "Alice"


def test_reassigning_and_unassigning(family):
    admin, member = family
    task = _create_task(admin, assignee_id=member.user_id)

    task = admin.post(f"/api/families/me/tasks/{task['id']}/assign", json={"assignee_id": admin.user_id}).json()
    assert task["status"] == "Open" and task["assignee_id"] == admin.user_id
    assert task["activity"][-1]["action"] == "Reassigned"

    # Anyone in the family, including the assignee, can hand a task back.
    task = admin.post(f"/api/families/me/tasks/{task['id']}/assign", json={"assignee_id": None}).json()
    assert task["assignee_id"] is None and task["status"] == "Open"

    # Reassigning a finished task does not reopen it.
    admin.post(f"/api/families/me/tasks/{task['id']}/complete")
    task = admin.post(f"/api/families/me/tasks/{task['id']}/assign", json={"assignee_id": member.user_id}).json()
    assert task["status"] == "Completed"


def test_tasks_left_in_progress_by_the_old_accept_step_become_open(family):
    from sqlalchemy import text

    from app.database import engine
    from app.init_db import initialize_database

    admin, member = family
    task = _create_task(admin, assignee_id=member.user_id)
    done = _create_task(admin, title="Done already")
    admin.post(f"/api/families/me/tasks/{done['id']}/complete")
    with engine.begin() as connection:
        connection.execute(text("UPDATE tasks SET status = 'In progress' WHERE title = 'Pick up medication'"))

    initialize_database()
    statuses = {item["id"]: item["status"] for item in admin.get("/api/families/me/tasks").json()}
    assert statuses == {task["id"]: "Open", done["id"]: "Completed"}


def test_cannot_assign_to_someone_outside_the_family(family, login):
    admin, _member = family
    outsider = login("Olivia")
    task = _create_task(admin)
    response = admin.post(f"/api/families/me/tasks/{task['id']}/assign", json={"assignee_id": outsider.user_id})
    assert response.status_code == 422
    assert admin.post("/api/families/me/tasks", json={"title": "x", "assignee_id": outsider.user_id}).status_code == 422


def test_other_families_cannot_see_or_change_tasks(family, login):
    admin, _member = family
    task = _create_task(admin)

    outsider = login("Olivia")
    outsider.post("/api/families", json={"name": "Other Family"})
    assert outsider.get("/api/families/me/tasks").json() == []
    assert outsider.get("/api/families/me/activity").json() == []
    for action in ("complete", "reopen"):
        assert outsider.post(f"/api/families/me/tasks/{task['id']}/{action}").status_code == 404
    response = outsider.post(f"/api/families/me/tasks/{task['id']}/assign", json={"assignee_id": outsider.user_id})
    assert response.status_code == 404

    assert admin.get("/api/families/me/tasks").json()[0]["status"] == "Open"


def test_user_without_a_family_gets_404(login):
    assert login("Nina").get("/api/families/me/tasks").status_code == 404


def test_family_activity_feed_is_newest_first(family):
    admin, _member = family
    task = _create_task(admin, title="Buy groceries")
    admin.post(f"/api/families/me/tasks/{task['id']}/complete")

    feed = admin.get("/api/families/me/activity").json()
    assert [item["action"] for item in feed] == ["Completed", "Created"]
    assert feed[0]["task_title"] == "Buy groceries"
    assert feed[0]["actor_name"] == "Alice"


def test_timestamps_keep_their_instant_and_carry_an_offset(family):
    from datetime import datetime, timezone

    admin, _member = family
    task = _create_task(admin, due_at="2030-01-01T17:30:00+08:00")
    listed = admin.get("/api/families/me/tasks").json()[0]

    for value in (task["due_at"], listed["due_at"], listed["created_at"], listed["activity"][0]["created_at"]):
        assert datetime.fromisoformat(value).tzinfo is not None, value
    assert datetime.fromisoformat(listed["due_at"]) == datetime(2030, 1, 1, 9, 30, tzinfo=timezone.utc)


def test_deleting_a_user_cascades_through_foreign_keys(family):
    from sqlalchemy import select

    from app.database import SessionLocal
    from app.models import FamilyMembership, User, UserSession

    admin, member = family
    task = _create_task(admin, assignee_id=member.user_id)
    with SessionLocal() as database:
        database.delete(database.scalar(select(User).where(User.name == "Ben")))
        database.commit()
        assert database.scalar(select(FamilyMembership).where(FamilyMembership.role == "MEMBER")) is None
        assert len(database.scalars(select(UserSession)).all()) == 1

    listed = admin.get("/api/families/me/tasks").json()[0]
    assert listed["id"] == task["id"]
    assert listed["assignee_id"] is None


def test_creator_chooses_one_of_three_priorities(family):
    admin, _member = family
    assert _create_task(admin)["priority"] == "Normal"
    for priority in ("High", "Normal", "Low"):
        assert _create_task(admin, priority=priority)["priority"] == priority
    for priority in ("Urgent", "Medium", ""):
        assert admin.post("/api/families/me/tasks", json={"title": "x", "priority": priority}).status_code == 422, priority
