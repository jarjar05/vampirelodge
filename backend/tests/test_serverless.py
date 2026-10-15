"""What the app does differently on Vercel: Postgres addresses, notes searched in the database, Telegram's webhook,
and overdue reminders sent on the back of ordinary requests."""

import pytest

from app.config import _resolve_database_url
from app.services import knowledge, serverless, telegram_api, telegram_bot


def test_supabase_addresses_use_the_installed_postgres_driver():
    assert _resolve_database_url("postgresql://user:pw@host:6543/postgres") == "postgresql+psycopg://user:pw@host:6543/postgres"
    assert _resolve_database_url("postgres://user:pw@host:6543/postgres") == "postgresql+psycopg://user:pw@host:6543/postgres"
    assert _resolve_database_url("postgresql+psycopg://user@host/db") == "postgresql+psycopg://user@host/db"


@pytest.fixture
def notes_in_database(monkeypatch, knowledge_store):
    monkeypatch.setattr(knowledge, "_in_database", lambda: True)
    return knowledge_store


def _note(client, title, content, category="Care"):
    response = client.post("/api/families/me/knowledge", json={"title": title, "content": content, "category": category})
    assert response.status_code == 201, response.text
    return response.json()


def test_notes_are_searched_by_their_words_without_chromadb(family, notes_in_database):
    admin, member = family
    _note(admin, "Grandma's medication", "Amlodipine 5mg every morning with breakfast. Metformin tablets after dinner.")
    _note(admin, "Yoshi the dog", "Walk Yoshi twice a day. Dog food is in the garage.")
    _note(admin, "Important contacts", "Dr Tan at Riverside clinic, phone 6123 4567.")

    results = member.get("/api/families/me/knowledge/search", params={"query": "when does grandma take her tablets?"}).json()
    assert results[0]["title"] == "Grandma's medication"
    assert member.get("/api/families/me/knowledge/search", params={"query": "walking the dog"}).json()[0]["title"] == "Yoshi the dog"
    # Nothing went to ChromaDB.
    assert notes_in_database.rows == {}


def test_database_search_stays_within_the_family_and_category(family, login, notes_in_database):
    admin, _member = family
    _note(admin, "Medication", "Amlodipine every morning.", category="Health")
    _note(admin, "Groceries", "Buy amlodipine refill at the pharmacy.", category="Errands")
    stranger = login("Olive")
    stranger.post("/api/families", json={"name": "Other Family"})
    _note(stranger, "Their medication", "Amlodipine too.")

    titles = [item["title"] for item in admin.get("/api/families/me/knowledge/search", params={"query": "amlodipine"}).json()]
    assert set(titles) == {"Medication", "Groceries"}
    health = admin.get("/api/families/me/knowledge/search", params={"query": "amlodipine", "category": "Health"}).json()
    assert [item["title"] for item in health] == ["Medication"]
    assert admin.get("/api/families/me/knowledge/search", params={"query": "volcano"}).json() == []


def test_deleting_a_note_in_database_mode_needs_no_chromadb(family, notes_in_database):
    admin, _member = family
    note = _note(admin, "Old note", "Something about the fridge.")
    assert admin.delete(f"/api/families/me/knowledge/{note['id']}").status_code == 204
    assert admin.get("/api/families/me/knowledge/search", params={"query": "fridge"}).json() == []


def test_the_webhook_only_takes_deliveries_carrying_the_secret(family, monkeypatch):
    admin, _member = family
    handled = []
    monkeypatch.setattr(telegram_api, "is_configured", lambda: True)
    monkeypatch.setattr(telegram_bot, "handle_update", lambda database, update: handled.append(update))
    update = {"update_id": 1, "message": {"text": "hi"}}

    # Switched off until a secret is set.
    monkeypatch.delenv("TELEGRAM_WEBHOOK_SECRET", raising=False)
    assert admin.post("/api/telegram/webhook", json=update).status_code == 404

    monkeypatch.setenv("TELEGRAM_WEBHOOK_SECRET", "s3cret")
    assert admin.post("/api/telegram/webhook", json=update).status_code == 403
    assert admin.post("/api/telegram/webhook", json=update, headers={"X-Telegram-Bot-Api-Secret-Token": "wrong"}).status_code == 403
    assert handled == []
    response = admin.post("/api/telegram/webhook", json=update, headers={"X-Telegram-Bot-Api-Secret-Token": "s3cret"})
    assert response.status_code == 200 and handled == [update]


def test_a_failing_update_is_still_acknowledged(family, monkeypatch):
    admin, _member = family
    monkeypatch.setattr(telegram_api, "is_configured", lambda: True)
    monkeypatch.setenv("TELEGRAM_WEBHOOK_SECRET", "s3cret")

    def broken(database, update):
        raise RuntimeError("boom")

    monkeypatch.setattr(telegram_bot, "handle_update", broken)
    # Otherwise Telegram would deliver the same message again and again.
    response = admin.post("/api/telegram/webhook", json={"update_id": 2}, headers={"X-Telegram-Bot-Api-Secret-Token": "s3cret"})
    assert response.status_code == 200


def test_the_webhook_is_only_changed_when_it_points_elsewhere(monkeypatch):
    calls = []

    def call(method, payload=None, timeout=None):
        calls.append((method, payload))
        return {"url": "https://carecircle.vercel.app/api/telegram/webhook"} if method == "getWebhookInfo" else True

    monkeypatch.setattr(telegram_api, "_call", call)
    assert telegram_api.ensure_webhook("https://carecircle.vercel.app/api/telegram/webhook", "s") is False
    assert [method for method, _ in calls] == ["getWebhookInfo"]
    assert telegram_api.ensure_webhook("https://new.vercel.app/api/telegram/webhook", "s") is True
    assert calls[-1] == ("setWebhook", {"url": "https://new.vercel.app/api/telegram/webhook", "secret_token": "s", "allowed_updates": ["message", "callback_query"], "drop_pending_updates": False})


def test_reminders_are_checked_at_most_every_few_minutes(monkeypatch):
    checks = []
    clock = [1000.0]
    monkeypatch.setattr(telegram_api, "is_configured", lambda: True)
    monkeypatch.setattr(telegram_bot, "send_overdue_reminders", lambda database: checks.append(clock[0]))
    monkeypatch.setattr(serverless.time, "monotonic", lambda: clock[0])
    monkeypatch.setattr(serverless, "_last_reminder_check", float("-inf"))

    serverless.remind_if_due()
    clock[0] += 60
    serverless.remind_if_due()  # too soon
    clock[0] += serverless.REMINDER_INTERVAL_SECONDS
    serverless.remind_if_due()
    assert checks == [1000.0, 1000.0 + 60 + serverless.REMINDER_INTERVAL_SECONDS]


def test_a_reminder_failure_never_breaks_the_request(monkeypatch):
    monkeypatch.setattr(telegram_api, "is_configured", lambda: True)
    monkeypatch.setattr(serverless, "_last_reminder_check", float("-inf"))

    def broken(database):
        raise RuntimeError("database away")

    monkeypatch.setattr(telegram_bot, "send_overdue_reminders", broken)
    serverless.remind_if_due()  # no exception
