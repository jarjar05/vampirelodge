import hmac
import logging
import os
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import AuthenticatedUser
from app.services import telegram_api, telegram_bot

router = APIRouter(prefix="/api/telegram", tags=["telegram"])
DatabaseSession = Annotated[Session, Depends(get_db)]
logger = logging.getLogger("uvicorn.error")
WEBHOOK_PATH = "/api/telegram/webhook"


class TelegramStatusResponse(BaseModel):
    # False when the server has no bot token; linking is unavailable until one is added.
    configured: bool
    linked: bool
    telegram_username: str | None = None


class TelegramLinkRequest(BaseModel):
    # The browser's time zone, so reminders show local times.
    timezone: str | None = Field(default=None, max_length=64)


class TelegramLinkResponse(BaseModel):
    # Opens the bot in Telegram with a one-time code; pressing Start there completes the link.
    url: str
    expires_at: datetime


@router.get("", response_model=TelegramStatusResponse)
def read_telegram_status(user: AuthenticatedUser) -> TelegramStatusResponse:
    return TelegramStatusResponse(configured=telegram_api.is_configured(), linked=user.telegram_id is not None, telegram_username=user.telegram_username)


@router.post("/link", response_model=TelegramLinkResponse)
def create_telegram_link(payload: TelegramLinkRequest, user: AuthenticatedUser, database: DatabaseSession) -> TelegramLinkResponse:
    if not telegram_api.is_configured():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Telegram is not set up on this server yet.")
    try:
        url, expires_at = telegram_bot.start_linking(database, user, payload.timezone)
    except telegram_api.TelegramError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Telegram could not be reached. {error}") from error
    return TelegramLinkResponse(url=url, expires_at=expires_at)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def unlink_telegram(user: AuthenticatedUser, database: DatabaseSession) -> None:
    telegram_bot.unlink(database, user)


@router.post("/webhook", include_in_schema=False)
def receive_telegram_update(
    database: DatabaseSession,
    update: Annotated[dict[str, Any], Body()],
    secret: Annotated[str | None, Header(alias="X-Telegram-Bot-Api-Secret-Token")] = None,
) -> dict[str, bool]:
    """Where Telegram delivers messages when the app runs as a function (on Vercel) and cannot wait for them itself.
    Only deliveries carrying TELEGRAM_WEBHOOK_SECRET are accepted, so nobody else can pose as Telegram."""
    expected = os.getenv("TELEGRAM_WEBHOOK_SECRET", "")
    if not expected or not telegram_api.is_configured():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    if not secret or not hmac.compare_digest(secret, expected):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    try:
        telegram_bot.handle_update(database, update)
    except Exception:  # noqa: BLE001 - answer Telegram anyway, or it would send the same message again and again
        logger.exception("Telegram bot could not handle an update")
    return {"ok": True}
