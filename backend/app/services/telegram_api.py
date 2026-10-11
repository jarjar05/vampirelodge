"""The only module that talks to Telegram. Everything else calls these functions, so tests can replace them."""

import os
from typing import Any

import httpx

API_ROOT = "https://api.telegram.org"
# How long Telegram holds a getUpdates request open waiting for new messages.
LONG_POLL_SECONDS = 25
REQUEST_TIMEOUT_SECONDS = 15.0
MAX_MESSAGE_CHARS = 4000


class TelegramError(Exception):
    """A call to Telegram failed. `status` is Telegram's error code, or None when it could not be reached."""

    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


_bot_username: str | None = None


def is_configured() -> bool:
    """True when a bot token is available. app.config loads backend/.env into the environment."""
    return bool(os.getenv("TELEGRAM_BOT_TOKEN"))


def _call(method: str, payload: dict[str, Any] | None = None, timeout: float = REQUEST_TIMEOUT_SECONDS) -> Any:
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not token:
        raise TelegramError("Telegram is not set up. Add TELEGRAM_BOT_TOKEN to backend/.env.")
    try:
        # The token is part of the address, so the address is never logged or put in an error message.
        response = httpx.post(f"{API_ROOT}/bot{token}/{method}", json=payload or {}, timeout=timeout)
    except httpx.HTTPError as error:
        raise TelegramError(f"Could not reach Telegram ({type(error).__name__}).") from None
    try:
        body = response.json()
    except ValueError:
        raise TelegramError("Telegram sent an answer that could not be read.", response.status_code) from None
    if not body.get("ok"):
        raise TelegramError(str(body.get("description") or "Telegram refused the request."), body.get("error_code") or response.status_code)
    return body.get("result")


def bot_username() -> str:
    """The bot's @name without the @, asked from Telegram once and remembered."""
    global _bot_username
    if _bot_username is None:
        _bot_username = str(_call("getMe")["username"])
    return _bot_username


def get_updates(offset: int | None) -> list[dict[str, Any]]:
    payload: dict[str, Any] = {"timeout": LONG_POLL_SECONDS, "allowed_updates": ["message", "callback_query"]}
    if offset is not None:
        payload["offset"] = offset
    return _call("getUpdates", payload, timeout=LONG_POLL_SECONDS + 10)


def _keyboard(buttons: list[tuple[str, str]] | None) -> dict[str, Any]:
    """One row of buttons under a message, each given as (label, data sent back when it is pressed)."""
    if buttons is None:
        return {}
    return {"reply_markup": {"inline_keyboard": [[{"text": label, "callback_data": data} for label, data in buttons]] if buttons else []}}


def send_message(chat_id: int, text: str, buttons: list[tuple[str, str]] | None = None, reply_to: int | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"chat_id": chat_id, "text": text[:MAX_MESSAGE_CHARS], **_keyboard(buttons)}
    if reply_to is not None:
        payload["reply_parameters"] = {"message_id": reply_to, "allow_sending_without_reply": True}
    return _call("sendMessage", payload)


def edit_message(chat_id: int, message_id: int, text: str, buttons: list[tuple[str, str]] | None = None) -> None:
    """Replace a message the bot sent. Passing no buttons removes the ones it had."""
    _call("editMessageText", {"chat_id": chat_id, "message_id": message_id, "text": text[:MAX_MESSAGE_CHARS], **_keyboard(buttons or [])})


def answer_callback(callback_id: str, text: str | None = None) -> None:
    """Stop the spinner on a pressed button, optionally showing a short notice to the person who pressed it."""
    _call("answerCallbackQuery", {"callback_query_id": callback_id, **({"text": text[:190]} if text else {})})
