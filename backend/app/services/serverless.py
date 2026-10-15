"""What the app does differently when it runs as a function on Vercel.

A function only runs while it answers a request, so nothing can wait for Telegram messages or check the clock in the
background. Instead Telegram delivers messages to the webhook, and overdue reminders are checked on the back of
ordinary requests. The app is checked every few seconds by anyone who has it open, so reminders go out whenever
someone in the family is using it.
"""

import logging
import os
import time

from app.config import settings
from app.database import SessionLocal
from app.routes.telegram import WEBHOOK_PATH
from app.services import telegram_api, telegram_bot

logger = logging.getLogger("uvicorn.error")
REMINDER_INTERVAL_SECONDS = 180

_last_reminder_check = float("-inf")


def connect_telegram() -> None:
    """Point Telegram at this site's webhook. Needs the bot token, TELEGRAM_WEBHOOK_SECRET and the site's address."""
    secret = os.getenv("TELEGRAM_WEBHOOK_SECRET", "")
    if not telegram_api.is_configured() or not secret or not settings.public_url:
        if telegram_api.is_configured():
            logger.warning("Telegram webhook not set: TELEGRAM_WEBHOOK_SECRET or the site's address is missing")
        return
    try:
        telegram_api.set_webhook(f"{settings.public_url}{WEBHOOK_PATH}", secret)
        logger.info("Telegram delivers messages to %s%s", settings.public_url, WEBHOOK_PATH)
    except telegram_api.TelegramError as error:
        logger.warning("Telegram webhook not set: %s", error)


def remind_if_due() -> None:
    """Send overdue reminders, at most once every few minutes for each running copy of the function."""
    global _last_reminder_check
    now = time.monotonic()
    if now - _last_reminder_check < REMINDER_INTERVAL_SECONDS or not telegram_api.is_configured():
        return
    _last_reminder_check = now
    try:
        with SessionLocal() as database:
            telegram_bot.send_overdue_reminders(database)
    except Exception:  # noqa: BLE001 - a reminder problem must never break the request it rides on
        logger.exception("Overdue reminders could not be sent")
