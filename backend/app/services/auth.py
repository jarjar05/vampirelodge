import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import User, UserSession


def create_session(database: Session, user: User) -> str:
    """Create a random opaque token and persist only its SHA-256 digest."""
    token = secrets.token_urlsafe(48)
    token_digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=settings.session_lifetime_seconds)
    database.add(UserSession(user_id=user.id, token_hash=token_digest, expires_at=expires_at))
    database.commit()
    return token


def get_user_for_session(database: Session, token: str | None) -> User | None:
    if not token:
        return None

    token_digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
    now = datetime.now(timezone.utc)
    user_session = database.scalar(
        select(UserSession).where(
            UserSession.token_hash == token_digest,
            UserSession.expires_at > now,
        )
    )
    if user_session is None:
        return None
    return database.get(User, user_session.user_id)


def revoke_other_sessions(database: Session, user: User, current_token: str | None) -> None:
    """Sign the user out everywhere except the session making this request. Does not commit."""
    statement = delete(UserSession).where(UserSession.user_id == user.id)
    if current_token:
        current_digest = hashlib.sha256(current_token.encode("utf-8")).hexdigest()
        statement = statement.where(UserSession.token_hash != current_digest)
    database.execute(statement)


def revoke_session(database: Session, token: str | None) -> None:
    if not token:
        return

    token_digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
    user_session = database.scalar(select(UserSession).where(UserSession.token_hash == token_digest))
    if user_session is not None:
        database.delete(user_session)
        database.commit()

