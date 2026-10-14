from sqlalchemy import create_engine, inspect, text


def test_invite_code_is_shown_to_admins_only(family):
    admin, member = family
    assert admin.get("/api/families/me").json()["my_role"] == "ADMIN"
    assert len(admin.get("/api/families/me").json()["invite_code"]) == 10
    assert member.get("/api/families/me").json() == {
        **member.get("/api/families/me").json(),
        "my_role": "MEMBER",
        "invite_code": None,
    }


def test_only_admins_rename_the_family(family):
    admin, member = family
    assert member.patch("/api/families/me", json={"name": "Hijacked"}).status_code == 403
    assert admin.patch("/api/families/me", json={"name": "  Rivera Family "}).json()["name"] == "Rivera Family"


def test_members_edit_their_own_details(family):
    admin, member = family
    response = member.patch(
        f"/api/families/me/members/{member.user_id}",
        json={"relationship_label": "Son", "availability": "Away today", "availability_note": "Back Friday"},
    )
    assert response.status_code == 200, response.text
    assert member.patch(f"/api/families/me/members/{admin.user_id}", json={"availability": "On duty"}).status_code == 403
    assert member.patch(f"/api/families/me/members/{member.user_id}", json={"availability": "Asleep"}).status_code == 422

    members = {item["name"]: item for item in admin.get("/api/families/me/members").json()}
    assert members["Ben"]["relationship_label"] == "Son"
    assert members["Ben"]["availability"] == "Away today"
    assert members["Ben"]["availability_note"] == "Back Friday"
    assert members["Alice"]["availability"] == "Available"


def test_removing_a_member_unassigns_their_tasks(family):
    admin, member = family
    task = admin.post("/api/families/me/tasks", json={"title": "Call clinic", "assignee_id": member.user_id}).json()

    assert member.delete(f"/api/families/me/members/{admin.user_id}").status_code == 403
    assert admin.delete(f"/api/families/me/members/{admin.user_id}").status_code == 409
    assert admin.delete(f"/api/families/me/members/{member.user_id}").status_code == 204

    assert [item["name"] for item in admin.get("/api/families/me/members").json()] == ["Alice"]
    assert admin.get("/api/families/me/tasks").json()[0]["assignee_id"] is None
    assert member.get("/api/families/me/tasks").status_code == 404
    assert task["assignee_id"] == member.user_id


def test_init_db_adds_columns_missing_from_an_existing_table(tmp_path, monkeypatch):
    import app.init_db as init_db

    old_engine = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    with old_engine.begin() as connection:
        # The family_memberships table as it existed before member details were added.
        connection.execute(text(
            "CREATE TABLE family_memberships (id CHAR(32) PRIMARY KEY, family_id CHAR(32) NOT NULL, "
            "user_id CHAR(32) NOT NULL, role VARCHAR(16) NOT NULL, joined_at DATETIME)"
        ))
        connection.execute(text("INSERT INTO family_memberships (id, family_id, user_id, role) VALUES ('a', 'b', 'c', 'ADMIN')"))

    monkeypatch.setattr(init_db, "engine", old_engine)
    init_db.initialize_database()

    columns = {column["name"] for column in inspect(old_engine).get_columns("family_memberships")}
    assert {"relationship_label", "availability", "availability_note"} <= columns
    with old_engine.connect() as connection:
        assert connection.execute(text("SELECT availability FROM family_memberships")).scalar() == "Available"
    assert "tasks" in inspect(old_engine).get_table_names()


def test_init_db_adds_indexes_missing_from_an_existing_table(tmp_path, monkeypatch):
    import app.init_db as init_db

    old_engine = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    with old_engine.begin() as connection:
        # The users table as it existed before phone numbers were added.
        connection.execute(text(
            "CREATE TABLE users (id CHAR(32) PRIMARY KEY, email VARCHAR(320) NOT NULL UNIQUE, name VARCHAR(150) NOT NULL, "
            "password_hash VARCHAR(255) NOT NULL, created_at DATETIME)"
        ))
        connection.execute(text("INSERT INTO users (id, email, name, password_hash) VALUES ('a', 'a@example.com', 'A', 'x'), ('b', 'b@example.com', 'B', 'x')"))

    monkeypatch.setattr(init_db, "engine", old_engine)
    init_db.initialize_database()
    init_db.initialize_database()  # safe to run again

    indexes = {index["name"]: index for index in inspect(old_engine).get_indexes("users")}
    assert indexes["ix_users_phone"]["unique"]
    with old_engine.begin() as connection:
        connection.execute(text("UPDATE users SET phone = '+6591234567' WHERE id = 'a'"))
        try:
            connection.execute(text("UPDATE users SET phone = '+6591234567' WHERE id = 'b'"))
            raise AssertionError("duplicate phone was accepted")
        except Exception as error:
            assert "UNIQUE" in str(error)
