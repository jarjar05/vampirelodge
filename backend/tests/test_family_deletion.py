import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from app.database import SessionLocal
from app.models import Family, FamilyMembership, KnowledgeDocument, Task, TaskActivity, TelegramDraft, User
from app.utils.passwords import hash_password


def _delete(client, name):
    return client.request("DELETE", "/api/families/me", json={"confirm_name": name})


def _count(model, **filters):
    with SessionLocal() as database:
        return database.scalar(select(func.count()).select_from(model).filter_by(**filters))


def test_deleting_a_family_wipes_its_data_and_keeps_peoples_accounts(family, login, knowledge_store):
    admin, member = family
    family_id = uuid.UUID(admin.get("/api/families/me").json()["id"])
    soon = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    task = admin.post("/api/families/me/tasks", json={"title": "Pick up medication", "assignee_id": member.user_id, "due_at": soon, "recurrence": "weekly"}).json()
    admin.post(f"/api/families/me/tasks/{task['id']}/complete")
    admin.post("/api/families/me/knowledge", json={"title": "Who does what", "category": "care_note", "content": "Ben collects medication."})
    with SessionLocal() as database:
        # A sample member, as the demo seeder makes them, and a draft the bot is holding.
        sample = User(email="sample.1@demo.invalid", name="Sample Person", password_hash=hash_password("x" * 20))
        database.add(sample)
        database.flush()
        database.add(FamilyMembership(family_id=family_id, user_id=sample.id, role="MEMBER"))
        database.add(TelegramDraft(user_id=uuid.UUID(admin.user_id), family_id=family_id, title="Draft"))
        database.commit()

    # A second family that must be left exactly as it is.
    other = login("Olivia")
    other.post("/api/families", json={"name": "Other Family"})
    other.post("/api/families/me/tasks", json={"title": "Theirs"})
    other.post("/api/families/me/knowledge", json={"title": "Private", "category": "care_note", "content": "Olivia's note."})
    chunks_before = len(knowledge_store.rows)
    assert chunks_before == 2

    # Only an admin can delete, and only by giving the family's name.
    assert _delete(member, "Test Family").status_code == 403
    assert _delete(admin, "Wrong Name").status_code == 400
    assert _delete(admin, "").status_code == 400
    assert _count(Task, family_id=family_id) == 2

    assert _delete(admin, "  test family ").status_code == 204

    for model in (Task, TaskActivity, KnowledgeDocument, FamilyMembership, TelegramDraft):
        assert _count(model, family_id=family_id) == 0, model.__name__
    assert _count(Family, id=family_id) == 0
    assert _count(User, email="sample.1@demo.invalid") == 0
    assert len(knowledge_store.rows) == 1

    # Both people still have accounts, are signed in, and belong to no family.
    for client in (admin, member):
        assert client.get("/api/auth/me").status_code == 200
        assert client.get("/api/families/me").status_code == 404
        assert client.get("/api/families/me/tasks").status_code == 404
    assert admin.post("/api/families", json={"name": "Fresh Start"}).status_code == 201
    assert admin.get("/api/families/me/tasks").json() == []

    # The other family is untouched.
    assert [item["title"] for item in other.get("/api/families/me/tasks").json()] == ["Theirs"]
    assert [item["title"] for item in other.get("/api/families/me/knowledge").json()] == ["Private"]


def test_deletion_survives_the_search_store_being_down(family, monkeypatch):
    from app.services import chroma_service

    admin, _member = family
    admin.post("/api/families/me/knowledge", json={"title": "Note", "category": "care_note", "content": "Something."})

    def fail(*_args, **_kwargs):
        raise chroma_service.ChromaServiceError("down")

    monkeypatch.setattr(chroma_service, "delete_document_chunks", fail)
    assert _delete(admin, "Test Family").status_code == 204
    assert _count(KnowledgeDocument) == 0 and _count(Family) == 0
