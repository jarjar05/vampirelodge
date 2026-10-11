from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import AuthenticatedUser
from app.services import calendar_feed

router = APIRouter(prefix="/api/calendar", tags=["calendar"])
DatabaseSession = Annotated[Session, Depends(get_db)]


class CalendarLinkRequest(BaseModel):
    url: str = Field(min_length=1, max_length=calendar_feed.MAX_URL_LENGTH)


class CalendarStatusResponse(BaseModel):
    """The link itself is never sent back: anyone holding it can read the calendar."""

    connected: bool
    synced_at: datetime | None = None
    # Busy times found in the next 30 days; None when the calendar could not be read.
    event_count: int | None = None
    error: str | None = None


def _status(user, force: bool = False) -> CalendarStatusResponse:
    if not user.calendar_url:
        return CalendarStatusResponse(connected=False)
    feed = calendar_feed.check(user.id, user.calendar_url, force=force)
    return CalendarStatusResponse(connected=True, synced_at=feed.synced_at, event_count=feed.event_count, error=feed.error)


@router.get("", response_model=CalendarStatusResponse)
def read_calendar_status(user: AuthenticatedUser) -> CalendarStatusResponse:
    return _status(user)


@router.put("", response_model=CalendarStatusResponse)
def link_calendar(payload: CalendarLinkRequest, user: AuthenticatedUser, database: DatabaseSession) -> CalendarStatusResponse:
    """Save the signed-in person's calendar link, after checking that it can be read."""
    try:
        url = calendar_feed.normalize_url(payload.url)
    except calendar_feed.CalendarError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error
    feed = calendar_feed.check(user.id, url, force=True)
    if feed.error:
        # Nothing is saved, and a previously linked calendar keeps working.
        calendar_feed.forget(user.id)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=feed.error)
    user.calendar_url = url
    database.commit()
    return CalendarStatusResponse(connected=True, synced_at=feed.synced_at, event_count=feed.event_count)


@router.post("/sync", response_model=CalendarStatusResponse)
def sync_calendar(user: AuthenticatedUser) -> CalendarStatusResponse:
    """Read the calendar again now instead of waiting for the next automatic refresh."""
    return _status(user, force=True)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def unlink_calendar(user: AuthenticatedUser, database: DatabaseSession) -> None:
    user.calendar_url = None
    database.commit()
    calendar_feed.forget(user.id)
