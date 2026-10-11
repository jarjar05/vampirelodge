import uuid
from datetime import date, datetime, time, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.database import SessionLocal
from app.models import Task, TelegramDraft, User
from app.services import assignment, document_tasks, llm, telegram_api, telegram_bot

ALICE_TG, BEN_TG, STRANGER_TG = 1001, 1002, 1999
GROUP_CHAT = -500


@pytest.fixture
def telegram(monkeypatch):
    """Stand in for Telegram: records what the bot sends instead of sending it."""
    sent = SimpleNamespace(messages=[], edits=[], notices=[], fail_with=None)

    def send_message(chat_id, text, buttons=None, reply_to=None):
        if sent.fail_with:
            raise sent.fail_with
        sent.messages.append(SimpleNamespace(chat_id=chat_id, text=text, buttons=buttons or [], reply_to=reply_to))
        return {"message_id": 100 + len(sent.messages)}

    monkeypatch.setattr(telegram_api, "is_configured", lambda: True)
    monkeypatch.setattr(telegram_api, "bot_username", lambda: "FamilyCareBot")
    monkeypatch.setattr(telegram_api, "send_message", send_message)
    monkeypatch.setattr(telegram_api, "edit_message", lambda chat_id, message_id, text, buttons=None: sent.edits.append(SimpleNamespace(chat_id=chat_id, message_id=message_id, text=text, buttons=buttons or [])))
    monkeypatch.setattr(telegram_api, "answer_callback", lambda callback_id, text=None: sent.notices.append(text))
    return sent


@pytest.fixture
def drafting(monkeypatch):
    """Replace the two model calls: drafting tasks from text, and suggesting who should take one."""
    model = SimpleNamespace(texts=[], drafts=[], suggest=None)

    def draft_tasks(text, images, now, zone):
        model.texts.append(text)
        if isinstance(model.drafts, Exception):
            raise model.drafts
        return document_tasks.DocumentDrafts(summary="A message.", tasks=list(model.drafts))

    def suggest_assignee(database, task, zone=timezone.utc):
        if model.suggest is None:
            raise llm.LLMUnavailable("not set up")
        return assignment.AssignmentSuggestion(member_id=uuid.UUID(model.suggest), reason="Free then, with the fewest tasks.", note_titles=[])

    monkeypatch.setattr(document_tasks, "draft_tasks", draft_tasks)
    monkeypatch.setattr(assignment, "suggest_assignee", suggest_assignee)
    return model


def _draft(**overrides):
    fields = {"title": "Buy school uniform", "detail": "PayNow only.", "location": "School Hall", "due_date": date(2031, 11, 14), "due_time": time(9, 0), "priority": "Normal"}
    return document_tasks.TaskDraft(**{**fields, **overrides})


def _update(database_free=None, **message):
    return {"update_id": 1, "message": message}


def _private(sender_id, text, **extra):
    return {"update_id": 1, "message": {"message_id": 7, "from": {"id": sender_id, "username": f"user{sender_id}"}, "chat": {"id": sender_id, "type": "private"}, "text": text, **extra}}


def _group(sender_id, text, **extra):
    return {"update_id": 1, "message": {"message_id": 8, "from": {"id": sender_id}, "chat": {"id": GROUP_CHAT, "type": "supergroup"}, "text": text, **extra}}


def _press(sender_id, data, chat_id=None):
    return {"update_id": 2, "callback_query": {"id": "cb1", "from": {"id": sender_id}, "data": data, "message": {"message_id": 55, "chat": {"id": chat_id or sender_id}}}}


def _handle(update):
    with SessionLocal() as database:
        telegram_bot.handle_update(database, update)


def _link(client, telegram_id):
    """Link a signed-in client's account the way a person would: get the link, then press Start in Telegram."""
    url = client.post("/api/telegram/link", json={"timezone": "Asia/Singapore"}).json()["url"]
    _handle(_private(telegram_id, f"/start {url.split('start=')[1]}"))


def _user(client):
    with SessionLocal() as database:
        return database.get(User, uuid.UUID(client.user_id))


def test_linking_through_the_one_time_link(login, telegram):
    client = login("Alice")
    assert client.get("/api/telegram").json() == {"configured": True, "linked": False, "telegram_username": None}

    response = client.post("/api/telegram/link", json={"timezone": "Asia/Singapore"})
    assert response.status_code == 200, response.text
    url = response.json()["url"]
    assert url.startswith("https://t.me/FamilyCareBot?start=")
    code = url.split("start=")[1]

    # A wrong code links nobody.
    _handle(_private(ALICE_TG, "/start not-the-code"))
    assert "expired or was already used" in telegram.messages[-1].text
    assert client.get("/api/telegram").json()["linked"] is False

    _handle(_private(ALICE_TG, f"/start {code}"))
    assert telegram.messages[-1].text.startswith("You're linked, Alice.")
    assert client.get("/api/telegram").json() == {"configured": True, "linked": True, "telegram_username": f"user{ALICE_TG}"}
    assert _user(client).timezone == "Asia/Singapore"

    # The code works once, and is never exposed by the account endpoints.
    _handle(_private(STRANGER_TG, f"/start {code}"))
    assert "expired or was already used" in telegram.messages[-1].text
    assert _user(client).telegram_id == ALICE_TG
    assert code not in client.get("/api/auth/me").text and str(ALICE_TG) not in client.get("/api/auth/me").text

    assert client.delete("/api/telegram").status_code == 204
    assert client.get("/api/telegram").json()["linked"] is False


def test_an_expired_link_and_a_reused_telegram_account(login, telegram):
    alice, ben = login("Alice"), login("Ben")
    code = alice.post("/api/telegram/link", json={}).json()["url"].split("start=")[1]
    with SessionLocal() as database:
        user = database.get(User, uuid.UUID(alice.user_id))
        user.telegram_link_expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        database.commit()
    _handle(_private(ALICE_TG, f"/start {code}"))
    assert alice.get("/api/telegram").json()["linked"] is False

    # One Telegram account belongs to one app account: linking it again moves it.
    _link(alice, ALICE_TG)
    _link(ben, ALICE_TG)
    assert alice.get("/api/telegram").json()["linked"] is False and ben.get("/api/telegram").json()["linked"] is True


def test_linking_needs_a_configured_bot_and_a_signed_in_user(login, monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import app

    client = login("Alice")
    assert client.get("/api/telegram").json()["configured"] is False
    response = client.post("/api/telegram/link", json={})
    assert response.status_code == 503 and "TELEGRAM_BOT_TOKEN" in response.json()["detail"]
    assert TestClient(app).get("/api/telegram").status_code == 401


def _overdue_task(client, assignee_id, hours_ago=1.0, **fields):
    due = datetime.now(timezone.utc) - timedelta(hours=hours_ago)
    return client.post("/api/families/me/tasks", json={"title": "Pick up medication", "location": "Oak Pharmacy", "due_at": due.isoformat(), "assignee_id": assignee_id, **fields}).json()


def _remind():
    with SessionLocal() as database:
        return telegram_bot.send_overdue_reminders(database)


def test_overdue_reminder_goes_once_to_the_linked_assignee(family, telegram):
    admin, member = family
    _link(member, BEN_TG)
    telegram.messages.clear()
    task = _overdue_task(admin, member.user_id)
    _overdue_task(admin, admin.user_id, title="Alice is not linked")
    _overdue_task(admin, member.user_id, hours_ago=-2, title="Not due yet")
    _overdue_task(admin, member.user_id, hours_ago=30, title="Overdue for more than a day")
    done = _overdue_task(admin, member.user_id, title="Already done")
    admin.post(f"/api/families/me/tasks/{done['id']}/complete")
    admin.post("/api/families/me/tasks", json={"title": "No due date", "assignee_id": member.user_id})

    assert _remind() == 1
    reminder = telegram.messages[0]
    assert reminder.chat_id == BEN_TG
    assert reminder.text.startswith("⏰ Overdue: Pick up medication\nIt was due ") and "Where: Oak Pharmacy" in reminder.text
    assert reminder.buttons == [("✅ Done", f"t:done:{uuid.UUID(task['id']).hex}")]
    # Nothing more on the next check.
    assert _remind() == 0 and len(telegram.messages) == 1

    # Handing the task to someone else, or reopening it, lets it be reminded again.
    admin.post(f"/api/families/me/tasks/{task['id']}/assign", json={"assignee_id": admin.user_id})
    admin.post(f"/api/families/me/tasks/{task['id']}/assign", json={"assignee_id": member.user_id})
    assert _remind() == 1
    admin.post(f"/api/families/me/tasks/{task['id']}/complete")
    admin.post(f"/api/families/me/tasks/{task['id']}/reopen")
    assert _remind() == 1


def test_reminder_failures(family, telegram):
    admin, member = family
    _link(member, BEN_TG)
    _overdue_task(admin, member.user_id)

    # Telegram being unreachable leaves the reminder to be tried again.
    telegram.fail_with = telegram_api.TelegramError("down")
    assert _remind() == 0
    # Someone who blocked the bot is not retried every minute.
    telegram.fail_with = telegram_api.TelegramError("Forbidden: bot was blocked by the user", 403)
    assert _remind() == 0
    telegram.fail_with = None
    assert _remind() == 0


def test_done_button_completes_only_the_assignees_own_task(family, telegram):
    admin, member = family
    _link(member, BEN_TG)
    _link(admin, ALICE_TG)
    task = _overdue_task(admin, member.user_id)
    data = f"t:done:{uuid.UUID(task['id']).hex}"

    _handle(_press(ALICE_TG, data))
    assert telegram.notices[-1] == "This task is no longer assigned to you."
    _handle(_press(STRANGER_TG, data))
    assert telegram.notices[-1] == "Link your account in the app first."
    assert admin.get("/api/families/me/tasks").json()[0]["status"] == "Open"

    _handle(_press(BEN_TG, data))
    assert telegram.notices[-1] == "Marked complete."
    assert telegram.edits[-1].text == "✅ Completed: Pick up medication" and telegram.edits[-1].buttons == []
    listed = admin.get("/api/families/me/tasks").json()[0]
    assert listed["status"] == "Completed" and listed["activity"][-1]["actor_name"] == "Ben"

    _handle(_press(BEN_TG, data))
    assert telegram.notices[-1] == "Already completed."
    for bad in ("t:done:not-an-id", "x:y:z", ""):
        _handle(_press(BEN_TG, bad))
        assert telegram.notices[-1] == "That button no longer works."


def test_a_forwarded_message_becomes_a_draft_then_a_task_with_a_suggested_assignee(family, telegram, drafting):
    admin, member = family
    _link(admin, ALICE_TG)
    telegram.messages.clear()
    drafting.drafts = [_draft()]
    drafting.suggest = member.user_id

    _handle(_private(ALICE_TG, "Uniform sale on 14 Nov, 9am, School Hall", forward_origin={"type": "user"}))
    assert drafting.texts == ["Uniform sale on 14 Nov, 9am, School Hall"]
    offer = telegram.messages[0]
    assert offer.text == "Add this task?\n\nBuy school uniform\nWhen: Fri 14 Nov 2031, 9:00 AM\nWhere: School Hall\nPayNow only."
    add, ignore = offer.buttons
    assert add[0] == "✅ Add task" and ignore[0] == "✖ Ignore"
    # Nothing exists until the person confirms.
    assert admin.get("/api/families/me/tasks").json() == []

    _handle(_press(ALICE_TG, add[1]))
    task = admin.get("/api/families/me/tasks").json()[0]
    assert task["title"] == "Buy school uniform" and task["location"] == "School Hall" and task["assignee_id"] is None
    # 9:00 AM in the person's time zone (Singapore, saved when they linked) is 01:00 UTC.
    assert task["due_at"].startswith("2031-11-14T01:00:00")
    edit = telegram.edits[-1]
    assert "✅ Added: Buy school uniform" in edit.text and "Suggested: Ben" in edit.text and "Free then" in edit.text
    assert [label for label, _data in edit.buttons] == ["Assign to Ben", "Leave unassigned"]

    # Pressing Add twice does not create a second task.
    _handle(_press(ALICE_TG, add[1]))
    assert len(admin.get("/api/families/me/tasks").json()) == 1

    _handle(_press(ALICE_TG, edit.buttons[0][1]))
    assert admin.get("/api/families/me/tasks").json()[0]["assignee_id"] == member.user_id
    assert telegram.edits[-1].text.endswith("Assigned to Ben.") and telegram.edits[-1].buttons == []
    with SessionLocal() as database:
        assert database.query(TelegramDraft).count() == 0


def test_ignoring_a_draft_and_leaving_a_task_unassigned(family, telegram, drafting):
    admin, member = family
    _link(admin, ALICE_TG)
    telegram.messages.clear()
    drafting.drafts = [_draft(), _draft(title="Return the consent form", due_date=None, due_time=None, location=None, priority="High")]
    drafting.suggest = member.user_id

    _handle(_private(ALICE_TG, "Two things to do"))
    first, second = telegram.messages
    assert "When: No date given" in second.text and "Priority: High" in second.text

    _handle(_press(ALICE_TG, first.buttons[1][1]))
    assert telegram.edits[-1].text == "Ignored: Buy school uniform"
    _handle(_press(ALICE_TG, first.buttons[0][1]))
    assert telegram.notices[-1] == "This draft has expired."

    _handle(_press(ALICE_TG, second.buttons[0][1]))
    _handle(_press(ALICE_TG, telegram.edits[-1].buttons[1][1]))
    task = admin.get("/api/families/me/tasks").json()[0]
    assert task["title"] == "Return the consent form" and task["assignee_id"] is None and task["due_at"] is None and task["priority"] == "High"

    # When the model cannot suggest anyone, the plain rule does: the person with the fewest open tasks.
    drafting.suggest = None
    admin.post("/api/families/me/tasks", json={"title": "Alice is busier", "assignee_id": admin.user_id})
    drafting.drafts = [_draft(title="Third")]
    _handle(_private(ALICE_TG, "Another"))
    _handle(_press(ALICE_TG, telegram.messages[-1].buttons[0][1]))
    assert "Suggested: Ben" in telegram.edits[-1].text and "Has the fewest open tasks." in telegram.edits[-1].text
    assert telegram.edits[-1].buttons[0][0] == "Assign to Ben"


def test_in_a_group_the_bot_only_acts_when_mentioned(family, telegram, drafting):
    admin, member = family
    _link(admin, ALICE_TG)
    _link(member, BEN_TG)
    telegram.messages.clear()
    drafting.drafts = [_draft()]

    # Ordinary group chatter is ignored without being read by the model.
    _handle(_group(ALICE_TG, "Dinner at 7 tonight?"))
    _handle(_group(ALICE_TG, "email me at someone@familycarebot.example"))
    assert telegram.messages == [] and drafting.texts == []

    _handle(_group(ALICE_TG, "@familycarebot uniform sale on 14 Nov"))
    assert drafting.texts[-1] == "uniform sale on 14 Nov"
    assert telegram.messages[-1].chat_id == GROUP_CHAT and telegram.messages[-1].reply_to == 8

    # Mentioning the bot in a reply means "read the message I replied to".
    _handle(_group(ALICE_TG, "@FamilyCareBot", reply_to_message={"text": "School: bring $20 for the trip by Friday"}))
    assert drafting.texts[-1] == "School: bring $20 for the trip by Friday"
    _handle(_group(ALICE_TG, "@FamilyCareBot for Chloe", reply_to_message={"caption": "Trip form attached"}))
    assert drafting.texts[-1] == "Trip form attached\n\nNote from the person who asked: for Chloe"

    # Only the person who asked can confirm a draft posted in the group.
    add = telegram.messages[0].buttons[0][1]
    _handle(_press(BEN_TG, add, chat_id=GROUP_CHAT))
    assert telegram.notices[-1] == "Only the person who asked can confirm this."
    assert admin.get("/api/families/me/tasks").json() == []

    # Someone who has not linked an account is told how, and nothing is read.
    read_so_far = len(drafting.texts)
    _handle(_group(STRANGER_TG, "@FamilyCareBot add this"))
    assert telegram.messages[-1].text == telegram_bot.NOT_LINKED_TEXT and len(drafting.texts) == read_so_far


def test_messages_the_bot_cannot_use(family, login, telegram, drafting):
    admin, _member = family
    _link(admin, ALICE_TG)
    loner = login("Olivia")
    _link(loner, STRANGER_TG)
    telegram.messages.clear()

    _handle(_private(ALICE_TG, "/start"))
    _handle(_private(ALICE_TG, "/help"))
    assert telegram.messages[-1].text == telegram_bot.HELP_TEXT and telegram.messages[-2].text == telegram_bot.HELP_TEXT

    _handle(_private(ALICE_TG, "", photo=[{"file_id": "x"}]))
    assert "only read text for now" in telegram.messages[-1].text

    _handle(_private(ALICE_TG, "Nice weather today"))
    assert "did not find anything" in telegram.messages[-1].text

    drafting.drafts = [_draft()]
    _handle(_private(STRANGER_TG, "Buy uniform"))
    assert "not in a family space yet" in telegram.messages[-1].text

    # Updates with nothing to act on are ignored.
    before = len(telegram.messages)
    for update in ({"update_id": 9}, {"update_id": 9, "message": {"chat": {"id": 1, "type": "private"}}}, {"update_id": 9, "message": {"from": {"id": 5, "is_bot": True}, "chat": {"id": 1, "type": "private"}, "text": "hi"}}):
        _handle(update)
    assert len(telegram.messages) == before


def test_the_bot_token_never_appears_in_errors(monkeypatch):
    import httpx

    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "123456:SECRET-TOKEN")

    def fail(url, **_kwargs):
        raise httpx.ConnectError(f"failed to reach {url}")

    monkeypatch.setattr(httpx, "post", fail)
    with pytest.raises(telegram_api.TelegramError) as raised:
        telegram_api._call("getMe")
    assert "SECRET-TOKEN" not in str(raised.value) and raised.value.__cause__ is None

    monkeypatch.setattr(httpx, "post", lambda url, **_kwargs: httpx.Response(401, json={"ok": False, "error_code": 401, "description": "Unauthorized"}))
    with pytest.raises(telegram_api.TelegramError) as raised:
        telegram_api._call("getMe")
    assert raised.value.status == 401 and "SECRET-TOKEN" not in str(raised.value)


def _tap(sender_id, sent_message, label, chat_id=None):
    """Press the button with this label under a message the bot sent."""
    data = next(data for text, data in sent_message.buttons if text == label)
    keyboard = {"inline_keyboard": [[{"text": text, "callback_data": value} for text, value in sent_message.buttons]]}
    _handle({"update_id": 3, "callback_query": {"id": "cb", "from": {"id": sender_id}, "data": data, "message": {"message_id": 60, "chat": {"id": chat_id or sender_id}, "text": sent_message.text, "reply_markup": keyboard}}})


def test_when_the_model_is_down_the_bot_asks_for_each_detail(family, telegram, drafting):
    admin, member = family
    _link(admin, ALICE_TG)
    telegram.messages.clear()
    drafting.drafts = llm.LLMUnavailable("The AI service is busy.")

    _handle(_private(ALICE_TG, "Collect Grandma's eye drops"))
    ask = telegram.messages[-1]
    assert ask.text == "I can't read messages by myself right now, so I'll ask instead.\n\nWhat should the task be called?"
    assert [label for label, _data in ask.buttons] == ["Use the message as the name"]

    _tap(ALICE_TG, ask, "Use the message as the name")
    assert telegram.edits[-1].text.endswith("→ Use the message as the name") and telegram.edits[-1].buttons == []
    when = telegram.messages[-1]
    assert when.text.startswith("When is it due?") and [label for label, _data in when.buttons] == ["Today", "Tomorrow", "No date"]

    # A date the bot cannot read is asked for again; nothing moves on.
    _handle(_private(ALICE_TG, "sometime soonish"))
    assert telegram.messages[-1].text.startswith("I didn't catch that date.")
    _handle(_private(ALICE_TG, "14 Nov 2031"))
    what_time = telegram.messages[-1]
    assert what_time.text.startswith("What time?")
    _handle(_private(ALICE_TG, "half past"))
    assert telegram.messages[-1].text.startswith("I didn't catch that time.")
    _handle(_private(ALICE_TG, "5:30pm"))
    where = telegram.messages[-1]
    assert where.text.startswith("Where?") and where.buttons[0][0] == "No location"
    # The model was only tried once, for the first message; the answers never went to it.
    assert drafting.texts == ["Collect Grandma's eye drops"]

    _handle(_private(ALICE_TG, "Guardian, Tampines Mall"))
    confirm = telegram.messages[-1]
    assert confirm.text == "Add this task?\n\nCollect Grandma's eye drops\nWhen: Fri 14 Nov 2031, 5:30 PM\nWhere: Guardian, Tampines Mall"
    assert admin.get("/api/families/me/tasks").json() == []

    _tap(ALICE_TG, confirm, "✅ Add task")
    task = admin.get("/api/families/me/tasks").json()[0]
    assert task["title"] == "Collect Grandma's eye drops" and task["location"] == "Guardian, Tampines Mall" and task["detail"] == ""
    assert task["due_at"].startswith("2031-11-14T09:30:00")  # 5:30 PM in Singapore
    # With the model down, the suggestion comes from the plain rule.
    assert "Suggested:" in telegram.edits[-1].text and "fewest open tasks" in telegram.edits[-1].text


def test_new_command_buttons_and_cancel(family, telegram, drafting):
    admin, _member = family
    _link(admin, ALICE_TG)
    telegram.messages.clear()

    _handle(_private(ALICE_TG, "/cancel"))
    assert telegram.messages[-1].text == "There is nothing to cancel."

    _handle(_private(ALICE_TG, "/new"))
    assert telegram.messages[-1].text == "What should the task be called?" and telegram.messages[-1].buttons == []
    _handle(_private(ALICE_TG, "Water the plants"))
    _tap(ALICE_TG, telegram.messages[-1], "No date")
    # With no date there is no time to ask for.
    assert telegram.messages[-1].text.startswith("Where?")
    # An old button for a question already answered does nothing.
    answered = len(telegram.messages)
    _tap(ALICE_TG, telegram.messages[-2], "Today")
    assert telegram.notices[-1] == "That question has already been answered." and len(telegram.messages) == answered
    _tap(ALICE_TG, telegram.messages[-1], "No location")
    assert telegram.messages[-1].text == "Add this task?\n\nWater the plants\nWhen: No date given"
    assert drafting.texts == []

    # Starting again replaces a half-finished draft, and /cancel drops it.
    _handle(_private(ALICE_TG, "/new"))
    _handle(_private(ALICE_TG, "Half done"))
    _tap(ALICE_TG, telegram.messages[-1], "Tomorrow")
    _tap(ALICE_TG, telegram.messages[-1], "6 PM")
    assert telegram.messages[-1].text.startswith("Where?")
    _handle(_private(ALICE_TG, "/cancel"))
    assert telegram.messages[-1].text == "Cancelled."
    drafting.drafts = []
    _handle(_private(ALICE_TG, "Kitchen"))
    assert "did not find anything" in telegram.messages[-1].text

    _handle(_private(STRANGER_TG, "/new"))
    assert telegram.messages[-1].text == telegram_bot.NOT_LINKED_TEXT


def test_in_a_group_the_questions_are_answered_by_replying(family, telegram, drafting):
    admin, member = family
    _link(admin, ALICE_TG)
    _link(member, BEN_TG)
    telegram.messages.clear()
    bot_message = {"from": {"id": 42, "is_bot": True, "username": "FamilyCareBot"}, "text": "question"}

    _handle(_group(ALICE_TG, "/new@FamilyCareBot"))
    assert telegram.messages[-1].text == "What should the task be called? Reply to this message with your answer."

    # Chatter in the group, and someone else replying, are not taken as the answer.
    _handle(_group(ALICE_TG, "Anyone seen my keys?"))
    _handle(_group(BEN_TG, "Buy milk", reply_to_message=bot_message))
    assert len(telegram.messages) == 1

    _handle(_group(ALICE_TG, "Buy milk", reply_to_message=bot_message))
    assert telegram.messages[-1].text.startswith("When is it due?") and telegram.messages[-1].chat_id == GROUP_CHAT
    _tap(BEN_TG, telegram.messages[-1], "Today", chat_id=GROUP_CHAT)
    assert telegram.notices[-1] == "Only the person who asked can answer this."
    _tap(ALICE_TG, telegram.messages[-1], "No date", chat_id=GROUP_CHAT)
    _tap(ALICE_TG, telegram.messages[-1], "No location", chat_id=GROUP_CHAT)
    assert telegram.messages[-1].text.startswith("Add this task?\n\nBuy milk")
