from fastapi.testclient import TestClient

from app.main import app

ACCOUNT = {"name": "  Sarah Rivera ", "email": " Sarah@Example.com ", "password": "correct horse battery"}


def test_register_creates_an_account_and_signs_in():
    client = TestClient(app)
    response = client.post("/api/auth/register", json=ACCOUNT)
    assert response.status_code == 201, response.text
    assert response.json()["name"] == "Sarah Rivera"
    assert response.json()["email"] == "sarah@example.com"
    assert "password" not in response.text

    # The session cookie from sign-up is enough to use the app.
    assert client.get("/api/auth/me").json()["email"] == "sarah@example.com"
    assert client.get("/api/families/me").status_code == 404
    assert client.post("/api/families", json={"name": "Rivera Family"}).status_code == 201


def test_registered_user_can_sign_in_later_with_their_password():
    TestClient(app).post("/api/auth/register", json=ACCOUNT)

    client = TestClient(app)
    assert client.post("/api/auth/login", json={"email": "sarah@example.com", "password": "wrong password!"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "SARAH@example.com", "password": ACCOUNT["password"]}).status_code == 200
    assert client.get("/api/auth/me").status_code == 200


def test_register_rejects_a_duplicate_email():
    assert TestClient(app).post("/api/auth/register", json=ACCOUNT).status_code == 201
    duplicate = TestClient(app).post("/api/auth/register", json={**ACCOUNT, "email": "sarah@example.com", "name": "Someone Else"})
    assert duplicate.status_code == 409
    assert "session" not in duplicate.headers.get("set-cookie", "")


def test_register_validates_input():
    client = TestClient(app)
    for change in ({"password": "too short"}, {"email": "not-an-email"}, {"name": "   "}):
        assert client.post("/api/auth/register", json={**ACCOUNT, **change}).status_code == 422, change
    assert client.get("/api/auth/me").status_code == 401


PICTURE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="


def test_profile_name_and_picture_can_be_changed(family):
    admin, member = family
    updated = member.patch("/api/auth/me", json={"name": "  Benjamin ", "avatar_url": PICTURE})
    assert updated.status_code == 200, updated.text
    assert updated.json()["name"] == "Benjamin"
    assert member.get("/api/auth/me").json()["avatar_url"] == PICTURE

    # Other family members see the new name and picture.
    members = {item["id"]: item for item in admin.get("/api/families/me/members").json()}
    assert members[member.user_id]["name"] == "Benjamin"
    assert members[member.user_id]["avatar_url"] == PICTURE
    assert members[admin.user_id]["avatar_url"] is None

    # A name-only update keeps the picture; an explicit null removes it.
    assert member.patch("/api/auth/me", json={"name": "Ben"}).json()["avatar_url"] == PICTURE
    assert member.patch("/api/auth/me", json={"avatar_url": None}).json()["avatar_url"] is None
    assert member.get("/api/auth/me").json()["name"] == "Ben"


def test_profile_rejects_bad_input(login):
    client = login("Nina")
    for body in (
        {"avatar_url": "https://example.com/tracker.png"},
        {"avatar_url": "data:image/svg+xml;base64,PHN2Zz4="},
        {"avatar_url": "data:image/png;base64," + "A" * 300_000},
        {"name": "   "},
    ):
        assert client.patch("/api/auth/me", json=body).status_code == 422, str(body)[:60]
    assert client.get("/api/auth/me").json() == {**client.get("/api/auth/me").json(), "name": "Nina", "avatar_url": None}
    assert TestClient(app).patch("/api/auth/me", json={"name": "x"}).status_code == 401


def test_sign_in_with_phone_or_email():
    TestClient(app).post("/api/auth/register", json={**ACCOUNT, "phone": "+65 9123-4567"})

    by_phone = TestClient(app)
    response = by_phone.post("/api/auth/login", json={"phone": "+6591234567", "password": ACCOUNT["password"]})
    assert response.status_code == 200, response.text
    assert response.json()["phone"] == "+6591234567"
    assert by_phone.get("/api/auth/me").json()["email"] == "sarah@example.com"

    client = TestClient(app)
    assert client.post("/api/auth/login", json={"phone": "+65 9123 4567", "password": ACCOUNT["password"]}).status_code == 200
    assert client.post("/api/auth/login", json={"email": "sarah@example.com", "password": ACCOUNT["password"]}).status_code == 200
    assert client.post("/api/auth/login", json={"phone": "+6591234567", "password": "wrong password!"}).status_code == 401
    assert client.post("/api/auth/login", json={"phone": "+6500000000", "password": ACCOUNT["password"]}).status_code == 401
    # Exactly one identifier is required.
    assert client.post("/api/auth/login", json={"password": ACCOUNT["password"]}).status_code == 422
    both = {"email": "sarah@example.com", "phone": "+6591234567", "password": ACCOUNT["password"]}
    assert client.post("/api/auth/login", json=both).status_code == 422


def test_accounts_without_a_phone_cannot_be_matched_by_an_empty_one():
    TestClient(app).post("/api/auth/register", json=ACCOUNT)
    assert TestClient(app).post("/api/auth/login", json={"phone": "", "password": ACCOUNT["password"]}).status_code == 401


def test_register_validates_and_deduplicates_phone():
    client = TestClient(app)
    assert client.post("/api/auth/register", json={**ACCOUNT, "phone": "91234567"}).status_code == 422
    assert client.post("/api/auth/register", json={**ACCOUNT, "phone": "+6591234567"}).status_code == 201
    second = {**ACCOUNT, "email": "other@example.com", "phone": "+65 9123 4567"}
    response = TestClient(app).post("/api/auth/register", json=second)
    assert response.status_code == 409
    assert "phone" in response.json()["detail"]
    # A blank phone is simply no phone, and several accounts may have none.
    assert TestClient(app).post("/api/auth/register", json={**second, "phone": "  "}).status_code == 201
    assert TestClient(app).post("/api/auth/register", json={**second, "email": "third@example.com", "phone": None}).status_code == 201


def test_change_email_and_phone_requires_current_password(login_with_password):
    client = login_with_password("Ben", "original password 1")

    wrong = client.patch("/api/auth/me/sign-in-details", json={"current_password": "nope", "email": "new@example.com", "phone": "+6591234567"})
    assert wrong.status_code == 403
    assert client.get("/api/auth/me").json()["email"] == "ben@example.com"
    assert client.get("/api/auth/me").json()["phone"] is None
    assert client.patch("/api/auth/me/sign-in-details", json={"email": "new@example.com"}).status_code == 422


def test_change_sign_in_details(login_with_password):
    client = login_with_password("Ben", "original password 1")
    other = login_with_password("Alice", "another password 22")
    client.patch("/api/auth/me/sign-in-details", json={"current_password": "original password 1", "phone": "+6591234567"})

    updated = client.patch(
        "/api/auth/me/sign-in-details",
        json={"current_password": "original password 1", "email": " Benjamin@Example.com "},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["email"] == "benjamin@example.com"
    assert updated.json()["phone"] == "+6591234567"  # untouched when left out

    # Another account's email or phone cannot be taken; your own can be re-sent unchanged.
    for body in ({"email": "Benjamin@example.com"}, {"phone": "+65 9123 4567"}):
        response = other.patch("/api/auth/me/sign-in-details", json={"current_password": "another password 22", **body})
        assert response.status_code == 409, body
    same = client.patch("/api/auth/me/sign-in-details", json={"current_password": "original password 1", "email": "benjamin@example.com", "phone": "+6591234567"})
    assert same.status_code == 200
    assert client.patch("/api/auth/me/sign-in-details", json={"current_password": "original password 1", "email": "bad"}).status_code == 422

    fresh = TestClient(app)
    assert fresh.post("/api/auth/login", json={"email": "ben@example.com", "password": "original password 1"}).status_code == 401
    assert fresh.post("/api/auth/login", json={"email": "benjamin@example.com", "password": "original password 1"}).status_code == 200

    removed = client.patch("/api/auth/me/sign-in-details", json={"current_password": "original password 1", "phone": None})
    assert removed.json()["phone"] is None
    assert fresh.post("/api/auth/login", json={"phone": "+6591234567", "password": "original password 1"}).status_code == 401


def test_change_password_signs_out_other_devices(login_with_password):
    client = login_with_password("Ben", "original password 1")
    other_device = TestClient(app)
    assert other_device.post("/api/auth/login", json={"email": "ben@example.com", "password": "original password 1"}).status_code == 200

    wrong = client.post("/api/auth/change-password", json={"current_password": "not it", "new_password": "a brand new password"})
    assert wrong.status_code == 403
    short = client.post("/api/auth/change-password", json={"current_password": "original password 1", "new_password": "short"})
    assert short.status_code == 422
    assert other_device.get("/api/auth/me").status_code == 200

    changed = client.post("/api/auth/change-password", json={"current_password": "original password 1", "new_password": "a brand new password"})
    assert changed.status_code == 204, changed.text
    assert client.get("/api/auth/me").status_code == 200  # this device stays signed in
    assert other_device.get("/api/auth/me").status_code == 401

    fresh = TestClient(app)
    assert fresh.post("/api/auth/login", json={"email": "ben@example.com", "password": "original password 1"}).status_code == 401
    assert fresh.post("/api/auth/login", json={"email": "ben@example.com", "password": "a brand new password"}).status_code == 200
