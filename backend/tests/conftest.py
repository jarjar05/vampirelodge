import os
import tempfile
from collections.abc import Callable, Iterator
from pathlib import Path

# Point the app at a throwaway SQLite database before it is imported.
_TEST_DIR = Path(tempfile.mkdtemp(prefix="family-care-tests-"))
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DIR / 'test.db'}"
os.environ["CHROMA_PERSIST_DIR"] = str(_TEST_DIR / "chroma")
# Tests never talk to the real bot, even when backend/.env holds a token.
os.environ["TELEGRAM_BOT_TOKEN"] = ""

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.config import settings  # noqa: E402
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402
from app.services import calendar_feed, day_plan  # noqa: E402
from app.services.auth import create_session  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_database() -> Iterator[None]:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    day_plan.clear_cache()
    calendar_feed.clear_cache()
    yield


@pytest.fixture
def login() -> Callable[[str], TestClient]:
    """Create a user and return a client signed in as them."""

    def _login(name: str) -> TestClient:
        with SessionLocal() as database:
            # The hash is never verified here; sessions are created directly.
            user = User(email=f"{name.lower()}@example.com", name=name, password_hash="unused")
            database.add(user)
            database.commit()
            token = create_session(database, user)
            user_id = str(user.id)
        client = TestClient(app)
        client.cookies.set(settings.session_cookie_name, token)
        client.user_id = user_id  # type: ignore[attr-defined]
        return client

    return _login


@pytest.fixture
def family(login: Callable[[str], TestClient]) -> tuple[TestClient, TestClient]:
    """An admin and a member who share one family."""
    admin = login("Alice")
    member = login("Ben")
    invite_code = admin.post("/api/families", json={"name": "Test Family"}).json()["invite_code"]
    assert member.post("/api/families/join", json={"invite_code": invite_code}).status_code == 201
    return admin, member


@pytest.fixture
def login_with_password() -> Callable[[str, str], TestClient]:
    """Register a real account (with a working password) and return its signed-in client."""

    def _login(name: str, password: str) -> TestClient:
        client = TestClient(app)
        response = client.post("/api/auth/register", json={"name": name, "email": f"{name.lower()}@example.com", "password": password})
        assert response.status_code == 201, response.text
        return client

    return _login


class FakeCollection:
    """A tiny stand-in for a ChromaDB collection: stores chunks and ranks by shared words."""

    def __init__(self) -> None:
        self.rows: dict[str, tuple[str, dict]] = {}

    def upsert(self, ids, documents, metadatas) -> None:
        for chunk_id, document, metadata in zip(ids, documents, metadatas):
            self.rows[chunk_id] = (document, metadata)

    @staticmethod
    def _matches(metadata: dict, where: dict) -> bool:
        if "$and" in where:
            return all(FakeCollection._matches(metadata, clause) for clause in where["$and"])
        return all(metadata.get(key) == value for key, value in where.items())

    def query(self, query_texts, n_results, where, include):
        words = set(query_texts[0].lower().split())
        scored = sorted(
            (
                (-len(words & set(document.lower().split())), chunk_id, document, metadata)
                for chunk_id, (document, metadata) in self.rows.items()
                if self._matches(metadata, where)
            ),
        )[:n_results]
        return {
            "ids": [[row[1] for row in scored]],
            "documents": [[row[2] for row in scored]],
            "metadatas": [[row[3] for row in scored]],
            "distances": [[float(row[0]) for row in scored]],
        }

    def delete(self, where) -> None:
        self.rows = {chunk_id: row for chunk_id, row in self.rows.items() if not self._matches(row[1], where)}


@pytest.fixture(autouse=True)
def knowledge_store(monkeypatch: pytest.MonkeyPatch) -> FakeCollection:
    """Every test gets an empty in-memory knowledge store instead of the real ChromaDB one."""
    from app.services import chroma_service

    collection = FakeCollection()
    monkeypatch.setattr(chroma_service, "_collection", collection)
    return collection
