from app.database import SessionLocal
from app.models import User
from app.seed_demo import seed


def test_seed_demo_fills_and_resets_a_family(login):
    client = login("Sarah")
    with SessionLocal() as database:
        user = database.get_one(User, __import__("uuid").UUID(client.user_id))
        assert seed(database, user).startswith("Added 3 demo members, 8 tasks")
        assert "nothing added" in seed(database, user)

    tasks = client.get("/api/families/me/tasks").json()
    assert len(tasks) == 8
    assert sum(task["assignee_id"] == client.user_id for task in tasks) == 4
    assert len(client.get("/api/families/me/members").json()) == 4
    assert len(client.get("/api/families/me/appointments").json()) == 2

    with SessionLocal() as database:
        user = database.get_one(User, __import__("uuid").UUID(client.user_id))
        seed(database, user, reset=True)
    assert len(client.get("/api/families/me/tasks").json()) == 8
    assert len(client.get("/api/families/me/members").json()) == 4
