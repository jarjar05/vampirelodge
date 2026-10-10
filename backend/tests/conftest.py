import os
import tempfile
from collections.abc import Callable, Iterator
from pathlib import Path

# Point the app at a throwaway SQLite database before it is imported.
_TEST_DIR = Path(tempfile.mkdtemp(prefix="family-care-tests-"))
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DIR / 'test.db'}"
os.environ["CHROMA_PERSIST_DIR"] = str(_TEST_DIR / "chroma")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.config import settings  # noqa: E402
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402
from app.services.auth import create_session  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_database() -> Iterator[None]:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
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
