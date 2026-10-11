"""Runs the Telegram bot inside the API process: waits for messages, and checks for overdue tasks once a minute.

Long polling is used, so no public web address is needed. Only one copy of the server should run the bot at a time.
"""

import logging
import threading
import time

from app.database import SessionLocal
from app.services import telegram_api, telegram_bot
from app.services.telegram_api import TelegramError

logger = logging.getLogger("uvicorn.error")
REMINDER_INTERVAL_SECONDS = 60
RETRY_SECONDS = 5

_stop = threading.Event()
_thread: threading.Thread | None = None


def _run() -> None:
    offset: int | None = None
    last_reminder_check = 0.0
    while not _stop.is_set():
        try:
            if time.monotonic() - last_reminder_check >= REMINDER_INTERVAL_SECONDS:
                last_reminder_check = time.monotonic()
                with SessionLocal() as database:
                    telegram_bot.send_overdue_reminders(database)

            for update in telegram_api.get_updates(offset):
                offset = update["update_id"] + 1
                try:
                    with SessionLocal() as database:
                        telegram_bot.handle_update(database, update)
                except Exception:  # noqa: BLE001 - one bad message must not stop the bot
                    logger.exception("Telegram bot could not handle an update")
        except TelegramError as error:
            # 409 means another copy of the bot is polling, which happens briefly while the server reloads.
            logger.warning("Telegram bot: %s", error)
            _stop.wait(RETRY_SECONDS)
        except Exception:  # noqa: BLE001 - keep the bot alive through database or other transient errors
            logger.exception("Telegram bot loop failed")
            _stop.wait(RETRY_SECONDS)


def start() -> None:
    """Start the bot if a token is configured. Does nothing otherwise, so the app runs fine without Telegram."""
    global _thread
    if not telegram_api.is_configured() or (_thread and _thread.is_alive()):
        return
    _stop.clear()
    _thread = threading.Thread(target=_run, name="telegram-bot", daemon=True)
    _thread.start()
    logger.info("Telegram bot started")


def stop() -> None:
    _stop.set()
