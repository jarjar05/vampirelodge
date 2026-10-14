"""Forgotten passwords. A one-time code is sent to the person's linked Telegram, which is the only way the app
has of reaching someone outside the browser. Someone without Telegram is reset from the terminal instead:

    python -m app.reset_password you@example.com
"""

import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import User, UserSession
from app.services import telegram_api
from app.utils.passwords import hash_password, verify_password

CODE_LIFETIME = timedelta(minutes=15)
# A new code is not sent more often than this, so the endpoint cannot be used to flood someone's Telegram.
RESEND_AFTER = timedelta(seconds=60)
MAX_ATTEMPTS = 5


def send_code(database: Session, email: str) -> None:
    """Send a reset code if the account exists and can be reached. Says nothing either way, so it cannot be
    used to find out which emails have accounts."""
    user = database.scalar(select(User).where(User.email == email))
    if user is None or user.telegram_id is None or not telegram_api.is_configured():
        return
    now = datetime.now(timezone.utc)
    if user.reset_code_expires_at and user.reset_code_expires_at - CODE_LIFETIME > now - RESEND_AFTER:
        return
    code = f"{secrets.randbelow(1_000_000):06d}"
    try:
        telegram_api.send_message(
            user.telegram_id,
            f"Your password reset code is {code}\n\nIt works for 15 minutes. If you did not ask for this, ignore this message: your password has not changed.",
        )
    except telegram_api.TelegramError:
        return
    user.reset_code_hash = hash_password(code)
    user.reset_code_expires_at = now + CODE_LIFETIME
    user.reset_code_attempts = 0
    database.commit()


def set_password(database: Session, user: User, new_password: str) -> None:
    """Set a new password, clear any reset code, and sign the account out everywhere. Does not commit."""
    user.password_hash = hash_password(new_password)
    user.reset_code_hash = None
    user.reset_code_expires_at = None
    user.reset_code_attempts = 0
    database.execute(delete(UserSession).where(UserSession.user_id == user.id))


def reset_with_code(database: Session, email: str, code: str, new_password: str) -> bool:
    """True when the code was right and the password has been changed."""
    user = database.scalar(select(User).where(User.email == email))
    now = datetime.now(timezone.utc)
    if user is None or not user.reset_code_hash or not user.reset_code_expires_at or user.reset_code_expires_at < now:
        return False
    if user.reset_code_attempts >= MAX_ATTEMPTS:
        return False
    if not verify_password(code.strip(), user.reset_code_hash):
        # Counted and saved even though the request fails, so a six-digit code cannot be guessed by trying them all.
        user.reset_code_attempts += 1
        database.commit()
        return False
    set_password(database, user, new_password)
    database.commit()
    return True
