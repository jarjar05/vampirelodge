"""What the Telegram bot does: links accounts, reminds people about overdue tasks, and drafts tasks from messages.

The bot never reads a whole group chat. It acts only on a message sent or forwarded to it directly,
or on a group message that mentions it by name. A draft becomes a task only when the person confirms it.
"""

import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import FamilyMembership, Task, TelegramDraft, User
from app.services import assignment, document_tasks, llm, plain_dates, recurrence, telegram_api
from app.services.day_plan import resolve_timezone
from app.services.tasks import get_family_member, record_activity
from app.services.telegram_api import TelegramError

LINK_CODE_LIFETIME = timedelta(minutes=15)
# A task that fell due longer ago than this is not chased, so linking Telegram does not release a flood of old reminders.
REMINDER_WINDOW = timedelta(hours=24)
DRAFT_LIFETIME = timedelta(days=2)
MAX_DRAFTS_PER_MESSAGE = 3
MAX_MESSAGE_CHARS = 6000

HELP_TEXT = (
    "I help your family keep track of care tasks.\n\n"
    "• Forward me a message, or type one, and I will draft a task from it for you to confirm.\n"
    "• Send /new and I will ask for the details one at a time. /cancel stops.\n"
    "• In a group, mention me in a message, or reply to a message and mention me.\n"
    "• I will remind you here when one of your tasks is overdue.\n\n"
    "To connect me to your account, open the app, go to Profile settings, and choose Link Telegram."
)
NOT_LINKED_TEXT = "I don't know who you are yet. Open the app, go to Profile settings, and choose Link Telegram. Then try again."


# ── Linking ────────────────────────────────────────────────────────────────────

def start_linking(database: Session, user: User, timezone_name: str | None) -> tuple[str, datetime]:
    """Give the person a one-time link that opens the bot and ties their Telegram account to this one."""
    user.telegram_link_code = secrets.token_urlsafe(24)
    user.telegram_link_expires_at = datetime.now(timezone.utc) + LINK_CODE_LIFETIME
    if timezone_name and resolve_timezone(timezone_name).key == timezone_name:
        user.timezone = timezone_name
    database.commit()
    return f"https://t.me/{telegram_api.bot_username()}?start={user.telegram_link_code}", user.telegram_link_expires_at


def unlink(database: Session, user: User) -> None:
    user.telegram_id = None
    user.telegram_username = None
    user.telegram_link_code = None
    user.telegram_link_expires_at = None
    database.execute(delete(TelegramDraft).where(TelegramDraft.user_id == user.id))
    database.commit()


def _finish_linking(database: Session, code: str, sender: dict[str, Any], chat_id: int) -> None:
    now = datetime.now(timezone.utc)
    user = database.scalar(select(User).where(User.telegram_link_code == code)) if code else None
    if user is None or user.telegram_link_expires_at is None or user.telegram_link_expires_at < now:
        telegram_api.send_message(chat_id, "That link has expired or was already used. Open Profile settings in the app and choose Link Telegram again.")
        return
    # A Telegram account can be tied to one app account at a time.
    for other in database.scalars(select(User).where(User.telegram_id == sender["id"], User.id != user.id)).all():
        other.telegram_id = None
        other.telegram_username = None
    database.flush()
    user.telegram_id = sender["id"]
    user.telegram_username = sender.get("username")
    user.telegram_link_code = None
    user.telegram_link_expires_at = None
    database.commit()
    telegram_api.send_message(chat_id, f"You're linked, {user.name.split()[0]}. I will remind you here when a task of yours is overdue.\n\n{HELP_TEXT}")


# ── Helpers ────────────────────────────────────────────────────────────────────

def _when(moment: datetime | None, user: User) -> str:
    if moment is None:
        return "no due date"
    local = moment.astimezone(resolve_timezone(user.timezone))
    return f"{local:%a %d %b}, {local.strftime('%I:%M %p').lstrip('0')}"


def _family_id(database: Session, user: User) -> uuid.UUID | None:
    return database.scalar(select(FamilyMembership.family_id).where(FamilyMembership.user_id == user.id))


def _linked_user(database: Session, telegram_id: int) -> User | None:
    return database.scalar(select(User).where(User.telegram_id == telegram_id))


def _draft_summary(draft: TelegramDraft) -> str:
    when = "No date given"
    if draft.due_date:
        when = f"{draft.due_date:%a %d %b %Y}" + (f", {draft.due_time.strftime('%I:%M %p').lstrip('0')}" if draft.due_time else "")
    lines = [draft.title, f"When: {when}"]
    if draft.location:
        lines.append(f"Where: {draft.location}")
    if draft.detail:
        lines.append(draft.detail)
    if draft.priority != "Normal":
        lines.append(f"Priority: {draft.priority}")
    return "\n".join(lines)


# ── Overdue reminders ──────────────────────────────────────────────────────────

def send_overdue_reminders(database: Session, now: datetime | None = None) -> int:
    """Message each linked assignee once when a task of theirs has just fallen overdue. Returns how many were sent."""
    now = now or datetime.now(timezone.utc)
    rows = database.execute(
        select(Task, User)
        .join(User, User.id == Task.assignee_id)
        .where(
            Task.status != "Completed",
            Task.due_at.is_not(None),
            Task.due_at < now,
            Task.due_at >= now - REMINDER_WINDOW,
            Task.overdue_reminded_at.is_(None),
            User.telegram_id.is_not(None),
        )
        .order_by(Task.due_at)
    ).all()
    sent = 0
    for task, user in rows:
        lines = [f"⏰ Overdue: {task.title}", f"It was due {_when(task.due_at, user)}."]
        if task.location:
            lines.append(f"Where: {task.location}")
        lines.append("Tap Done once it is finished, or mark it complete in the app.")
        try:
            telegram_api.send_message(user.telegram_id, "\n".join(lines), buttons=[("✅ Done", f"t:done:{task.id.hex}")])
            sent += 1
        except TelegramError as error:
            # 400 and 403 mean this person cannot be reached (for example they blocked the bot), so do not retry every minute.
            if error.status not in (400, 403):
                continue
        task.overdue_reminded_at = now
        database.commit()
    return sent


# ── Drafting tasks from messages ───────────────────────────────────────────────

def _message_text(message: dict[str, Any]) -> str:
    return (message.get("text") or message.get("caption") or "").strip()


def _draft_from_message(database: Session, user: User, chat_id: int, reply_to: int, text: str) -> None:
    family_id = _family_id(database, user)
    if family_id is None:
        telegram_api.send_message(chat_id, "You are not in a family space yet. Create or join one in the app first.", reply_to=reply_to)
        return
    try:
        drafts = document_tasks.draft_tasks(text[:MAX_MESSAGE_CHARS], [], datetime.now(timezone.utc), resolve_timezone(user.timezone))
    except llm.LLMUnavailable:
        _start_guided(database, user, family_id, chat_id, reply_to, source=text, because_unavailable=True)
        return
    if not drafts.tasks:
        telegram_api.send_message(chat_id, "I did not find anything in that message that needs doing.", reply_to=reply_to)
        return

    database.execute(delete(TelegramDraft).where(TelegramDraft.created_at < datetime.now(timezone.utc) - DRAFT_LIFETIME))
    for found in drafts.tasks[:MAX_DRAFTS_PER_MESSAGE]:
        draft = TelegramDraft(
            user_id=user.id, family_id=family_id, title=found.title, detail=found.detail, location=found.location,
            due_date=found.due_date, due_time=found.due_time, priority=found.priority,
        )
        database.add(draft)
        database.commit()
        telegram_api.send_message(
            chat_id,
            f"Add this task?\n\n{_draft_summary(draft)}",
            buttons=[("✅ Add task", f"d:add:{draft.id.hex}"), ("✖ Ignore", f"d:no:{draft.id.hex}")],
            reply_to=reply_to,
        )


# ── Asking for the details one at a time ───────────────────────────────────────
# Used when the model cannot be reached, and when someone sends /new.

def _reply_hint(chat_id: int) -> str:
    # In a group Telegram only passes on replies to the bot, so the person has to answer that way.
    return "" if chat_id > 0 else " Reply to this message with your answer."


def _guided_draft(database: Session, user: User, chat_id: int) -> TelegramDraft | None:
    return database.scalar(
        select(TelegramDraft)
        .where(TelegramDraft.user_id == user.id, TelegramDraft.chat_id == chat_id, TelegramDraft.step.is_not(None))
        .order_by(TelegramDraft.created_at.desc())
    )


def _guided_question(draft: TelegramDraft) -> tuple[str, list[tuple[str, str]]]:
    """The question for the step the draft is waiting on, with buttons for the common answers."""
    key, hint = draft.id.hex, _reply_hint(draft.chat_id or 1)
    if draft.step == "title":
        return f"What should the task be called?{hint}", []
    if draft.step == "date":
        return (
            f"When is it due? Pick one, or type a date such as 14 Nov or Friday.{hint}",
            [("Today", f"g:today:{key}"), ("Tomorrow", f"g:tomorrow:{key}"), ("No date", f"g:nodate:{key}")],
        )
    if draft.step == "time":
        return (
            f"What time? Pick one, or type a time such as 5:30pm.{hint}",
            [("9 AM", f"g:t09:{key}"), ("12 PM", f"g:t12:{key}"), ("6 PM", f"g:t18:{key}"), ("No time", f"g:notime:{key}")],
        )
    return f"Where? Type the place.{hint}", [("No location", f"g:noloc:{key}")]


def _send_guided_step(database: Session, draft: TelegramDraft, chat_id: int, reply_to: int | None = None) -> None:
    """Ask the next question, or, once everything is answered, show the finished draft to confirm."""
    if draft.step is None:
        telegram_api.send_message(
            chat_id,
            f"Add this task?\n\n{_draft_summary(draft)}",
            buttons=[("✅ Add task", f"d:add:{draft.id.hex}"), ("✖ Ignore", f"d:no:{draft.id.hex}")],
            reply_to=reply_to,
        )
        return
    question, buttons = _guided_question(draft)
    telegram_api.send_message(chat_id, question, buttons=buttons or None, reply_to=reply_to)


def _start_guided(database: Session, user: User, family_id: uuid.UUID, chat_id: int, reply_to: int | None, source: str = "", because_unavailable: bool = False) -> None:
    database.execute(delete(TelegramDraft).where(TelegramDraft.user_id == user.id, TelegramDraft.chat_id == chat_id, TelegramDraft.step.is_not(None)))
    # The original message is kept as the task's details, so nothing the person sent is lost.
    draft = TelegramDraft(user_id=user.id, family_id=family_id, title="", detail=source.strip()[:500], step="title", chat_id=chat_id)
    database.add(draft)
    database.commit()
    question, _buttons = _guided_question(draft)
    buttons = [("Use the message as the name", f"g:use:{draft.id.hex}")] if source and len(source.strip()) <= 100 else None
    intro = "I can't read messages by myself right now, so I'll ask instead.\n\n" if because_unavailable else ""
    telegram_api.send_message(chat_id, f"{intro}{question}", buttons=buttons, reply_to=reply_to)


def _apply_guided_answer(draft: TelegramDraft, answer: str, user: User) -> str | None:
    """Store the answer and move to the next step. Returns a message to send when the answer could not be understood."""
    today = datetime.now(timezone.utc).astimezone(resolve_timezone(user.timezone)).date()
    skip = answer.strip().lower() in ("skip", "none", "no", "-", "nil", "na", "n/a")
    if draft.step == "title":
        title = answer.strip()
        if not title:
            return "The task needs a name. What should it be called?"
        # A message used as the name does not need repeating as the details.
        if draft.detail.strip() == title:
            draft.detail = ""
        draft.title, draft.step = title[:100], "date"
    elif draft.step == "date":
        if skip:
            draft.due_date, draft.step = None, "location"
        else:
            parsed = plain_dates.parse_date(answer, today)
            if parsed is None:
                return "I didn't catch that date. Try 14 Nov, 14/11, Friday or tomorrow."
            draft.due_date, draft.step = parsed, "time"
    elif draft.step == "time":
        if skip:
            draft.due_time = None
        else:
            parsed_time = plain_dates.parse_time(answer)
            if parsed_time is None:
                return "I didn't catch that time. Try 5pm, 5:30pm or 17:30."
            draft.due_time = parsed_time
        draft.step = "location"
    else:
        draft.location = None if skip else (answer.strip()[:120] or None)
        draft.step = None
    return None


def _answer_guided(database: Session, user: User, draft: TelegramDraft, answer: str, chat_id: int, reply_to: int | None) -> None:
    problem = _apply_guided_answer(draft, answer, user)
    database.commit()
    if problem:
        telegram_api.send_message(chat_id, problem + _reply_hint(chat_id), reply_to=reply_to)
        return
    _send_guided_step(database, draft, chat_id, reply_to)


_GUIDED_BUTTON_ANSWERS = {"today": "today", "tomorrow": "tomorrow", "nodate": "skip", "t09": "9am", "t12": "12pm", "t18": "6pm", "notime": "skip", "noloc": "skip"}
_GUIDED_BUTTON_STEPS = {"use": "title", "today": "date", "tomorrow": "date", "nodate": "date", "t09": "time", "t12": "time", "t18": "time", "notime": "time", "noloc": "location"}


def _handle_guided_button(database: Session, user: User, choice: str, draft_hex: str, callback: dict[str, Any]) -> str:
    """Returns the notice for the person who pressed. Sends the next question itself."""
    draft = database.get(TelegramDraft, uuid.UUID(draft_hex))
    message = callback.get("message") or {}
    chat_id, message_id = (message.get("chat") or {}).get("id"), message.get("message_id")
    if draft is None or draft.step != _GUIDED_BUTTON_STEPS.get(choice):
        return "That question has already been answered."
    if draft.user_id != user.id:
        return "Only the person who asked can answer this."
    answer = draft.detail if choice == "use" else _GUIDED_BUTTON_ANSWERS[choice]
    label = next((button["text"] for row in (message.get("reply_markup") or {}).get("inline_keyboard", []) for button in row if button.get("callback_data") == callback.get("data")), "")
    _apply_guided_answer(draft, answer, user)
    database.commit()
    if chat_id is not None and message_id is not None:
        # Take the buttons off the answered question and note what was chosen.
        telegram_api.edit_message(chat_id, message_id, f"{message.get('text', '').strip()}\n→ {label or answer}".strip(), [])
        _send_guided_step(database, draft, chat_id)
    return "Got it."


def _handle_message(database: Session, message: dict[str, Any]) -> None:
    sender = message.get("from") or {}
    chat = message.get("chat") or {}
    if sender.get("is_bot") or "id" not in sender or "id" not in chat:
        return
    chat_id, message_id = chat["id"], message.get("message_id", 0)
    is_private = chat.get("type") == "private"
    text = _message_text(message)

    if is_private and text.startswith("/start"):
        code = text.partition(" ")[2].strip()
        if code:
            _finish_linking(database, code, sender, chat_id)
        else:
            telegram_api.send_message(chat_id, HELP_TEXT)
        return
    if text.startswith("/help"):
        telegram_api.send_message(chat_id, HELP_TEXT)
        return

    command = text.split()[0].split("@")[0].lower() if text.startswith("/") else ""
    replied_to = message.get("reply_to_message") or {}
    replying_to_bot = (replied_to.get("from") or {}).get("username", "").lower() == telegram_api.bot_username().lower()
    if command in ("/new", "/cancel") or is_private or replying_to_bot:
        asker = _linked_user(database, sender["id"])
        pending = _guided_draft(database, asker, chat_id) if asker else None
        if command == "/cancel":
            if pending:
                database.delete(pending)
                database.commit()
            telegram_api.send_message(chat_id, "Cancelled." if pending else "There is nothing to cancel.", reply_to=message_id)
            return
        if command == "/new":
            if asker is None:
                telegram_api.send_message(chat_id, NOT_LINKED_TEXT, reply_to=message_id)
                return
            family_id = _family_id(database, asker)
            if family_id is None:
                telegram_api.send_message(chat_id, "You are not in a family space yet. Create or join one in the app first.", reply_to=message_id)
                return
            _start_guided(database, asker, family_id, chat_id, message_id)
            return
        # A message sent while the bot is waiting on a question is the answer to it.
        if pending and text and not command and (is_private or replying_to_bot):
            _answer_guided(database, asker, pending, text, chat_id, message_id)
            return

    if not is_private:
        # In a group the bot only acts when it is mentioned by name. Everything else is ignored unread.
        # The look-behind keeps an email address such as someone@botname.example from counting as a mention.
        mention = re.compile(rf"(?<![\w.+-])@{re.escape(telegram_api.bot_username())}\b", re.IGNORECASE)
        if not mention.search(text):
            return
        text = mention.sub("", text).strip()
        # Mentioning the bot in a reply means "look at the message I am replying to".
        quoted = _message_text(message.get("reply_to_message") or {})
        if quoted:
            text = f"{quoted}\n\nNote from the person who asked: {text}" if text else quoted

    user = _linked_user(database, sender["id"])
    if user is None:
        telegram_api.send_message(chat_id, NOT_LINKED_TEXT, reply_to=message_id)
        return
    if not text:
        hint = "I can only read text for now, not pictures or files." if any(key in message for key in ("photo", "document", "voice", "video")) else "Send or forward me a message and I will draft a task from it."
        telegram_api.send_message(chat_id, hint, reply_to=message_id)
        return
    _draft_from_message(database, user, chat_id, message_id, text)


# ── Buttons ────────────────────────────────────────────────────────────────────

def _complete_from_reminder(database: Session, user: User, task_hex: str) -> tuple[str, str | None]:
    """Returns the notice for the person who pressed, and new text for the message (None leaves it as it is)."""
    task = database.get(Task, uuid.UUID(task_hex))
    if task is None or task.family_id != _family_id(database, user):
        return "That task no longer exists.", "This task no longer exists."
    if task.status == "Completed":
        return "Already completed.", f"✅ Completed: {task.title}"
    if task.assignee_id != user.id:
        return "This task is no longer assigned to you.", f"{task.title} is no longer assigned to you."
    task.status = "Completed"
    task.completed_at = datetime.now(timezone.utc)
    record_activity(task, user.id, "Completed", "Marked this task complete from Telegram")
    recurrence.schedule_after(database, task)
    database.commit()
    return "Marked complete.", f"✅ Completed: {task.title}"


def _due_at(draft: TelegramDraft, user: User) -> datetime | None:
    if draft.due_date is None:
        return None
    clock = draft.due_time or datetime.min.time().replace(hour=9)
    return datetime.combine(draft.due_date, clock, tzinfo=resolve_timezone(user.timezone)).astimezone(timezone.utc)


def _add_draft(database: Session, user: User, draft: TelegramDraft) -> tuple[str, str, list[tuple[str, str]]]:
    task = Task(
        family_id=draft.family_id, title=draft.title, detail=draft.detail, location=draft.location,
        due_at=_due_at(draft, user), priority=draft.priority, created_by_id=user.id,
    )
    database.add(task)
    record_activity(task, user.id, "Created", "Added from a Telegram message")
    database.flush()
    draft.task_id = task.id
    database.commit()

    added = f"✅ Added: {task.title}\nDue: {_when(task.due_at, user)}"
    try:
        suggestion = assignment.suggest_assignee(database, task, resolve_timezone(user.timezone))
    except llm.LLMUnavailable:
        # Without the model, fall back to the plain rule: free at that time, with the fewest open tasks.
        suggestion = assignment.suggest_without_model(database, task, resolve_timezone(user.timezone))
    if suggestion is None:
        database.delete(draft)
        database.commit()
        return "Task added.", f"{added}\n\nNo one is assigned yet. Assign it in the app.", []
    member = get_family_member(database, task.family_id, suggestion.member_id)
    if member is None:
        database.delete(draft)
        database.commit()
        return "Task added.", f"{added}\n\nNo one is assigned yet. Assign it in the app.", []
    draft.suggested_member_id = member.id
    database.commit()
    first_name = member.name.split()[0]
    return (
        "Task added.",
        f"{added}\n\nSuggested: {member.name}\n{suggestion.reason}",
        [(f"Assign to {first_name}", f"d:as:{draft.id.hex}"), ("Leave unassigned", f"d:un:{draft.id.hex}")],
    )


def _handle_draft_button(database: Session, user: User, action: str, draft_hex: str) -> tuple[str, str | None, list[tuple[str, str]]]:
    draft = database.get(TelegramDraft, uuid.UUID(draft_hex))
    if draft is None:
        return "This draft has expired.", "This draft has expired. Send the message again to start over.", []
    if draft.user_id != user.id:
        # Leave the message and its buttons alone for the person it belongs to.
        return "Only the person who asked can confirm this.", None, []

    if action == "no":
        database.delete(draft)
        database.commit()
        return "Ignored.", f"Ignored: {draft.title}", []
    if action == "add":
        if draft.step is not None:
            return "Finish answering the questions first.", None, []
        if draft.task_id is not None:
            return "Already added.", None, []
        return _add_draft(database, user, draft)

    task = database.get(Task, draft.task_id) if draft.task_id else None
    if task is None:
        database.delete(draft)
        database.commit()
        return "That task no longer exists.", "This task no longer exists.", []
    added = f"✅ Added: {task.title}\nDue: {_when(task.due_at, user)}"
    member = get_family_member(database, task.family_id, draft.suggested_member_id) if draft.suggested_member_id else None
    database.delete(draft)
    if action == "as" and member is not None and task.assignee_id is None and task.status != "Completed":
        task.assignee_id = member.id
        task.overdue_reminded_at = None
        record_activity(task, user.id, "Assigned", f"Assigned to {member.name}")
        database.commit()
        return f"Assigned to {member.name.split()[0]}.", f"{added}\nAssigned to {member.name}.", []
    database.commit()
    return "Left unassigned.", f"{added}\nNo one is assigned yet.", []


def _handle_callback(database: Session, callback: dict[str, Any]) -> None:
    callback_id = callback.get("id", "")
    sender = callback.get("from") or {}
    message = callback.get("message") or {}
    chat_id, message_id = (message.get("chat") or {}).get("id"), message.get("message_id")
    parts = str(callback.get("data") or "").split(":")

    user = _linked_user(database, sender.get("id", 0))
    if user is None:
        telegram_api.answer_callback(callback_id, "Link your account in the app first.")
        return
    try:
        if len(parts) == 3 and parts[0] == "t" and parts[1] == "done":
            notice, new_text = _complete_from_reminder(database, user, parts[2])
            buttons: list[tuple[str, str]] = []
        elif len(parts) == 3 and parts[0] == "g" and parts[1] in _GUIDED_BUTTON_STEPS:
            notice, new_text, buttons = _handle_guided_button(database, user, parts[1], parts[2], callback), None, []
        elif len(parts) == 3 and parts[0] == "d" and parts[1] in ("add", "no", "as", "un"):
            notice, new_text, buttons = _handle_draft_button(database, user, parts[1], parts[2])
        else:
            notice, new_text, buttons = "That button no longer works.", None, []
    except ValueError:
        # The button carried something that is not an id.
        notice, new_text, buttons = "That button no longer works.", None, []

    telegram_api.answer_callback(callback_id, notice)
    if new_text is not None and chat_id is not None and message_id is not None:
        telegram_api.edit_message(chat_id, message_id, new_text, buttons)


def handle_update(database: Session, update: dict[str, Any]) -> None:
    """Act on one thing Telegram reported: a message sent to the bot, or a button pressed under one of its messages."""
    if "callback_query" in update:
        _handle_callback(database, update["callback_query"])
    elif "message" in update:
        _handle_message(database, update["message"])
