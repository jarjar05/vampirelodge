"""Read a person's busy times from a calendar feed link (the .ics link Apple, Google and Outlook can publish).

Only when someone is busy is taken from the feed. Event titles, places and notes are never kept or passed on.
"""

import ipaddress
import re
import socket
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone, tzinfo
from urllib.parse import urljoin, urlsplit

import httpx
import icalendar
import recurring_ical_events

from app.config import BACKEND_DIR, settings

CACHE_TTL = timedelta(minutes=15)
# A feed that failed is retried sooner, but not on every request.
FAILURE_TTL = timedelta(minutes=5)
FETCH_TIMEOUT_SECONDS = 8.0
MAX_FEED_BYTES = 5_000_000
MAX_REDIRECTS = 3
MAX_URL_LENGTH = 2000
# Sample calendars for local testing: a link of the form demo://name reads backend/data/demo_calendars/name.ics.
# Such a link cannot be saved through the API, which only accepts https; it is set by scripts, in development only.
DEMO_PREFIX = "demo://"
DEMO_CALENDAR_DIR = BACKEND_DIR / "data" / "demo_calendars"
# How far ahead a linked calendar is read for the day plan and for the count shown in profile settings.
LOOKAHEAD = timedelta(days=30)
# The soonest busy times are kept when a calendar has more than this in the period asked for.
MAX_BLOCKS = 150


class CalendarError(Exception):
    """The feed link cannot be used. The message is safe to show to the person."""


@dataclass(frozen=True)
class BusyBlock:
    start: datetime
    end: datetime
    all_day: bool
    # What it is, only for times people typed in themselves to share; a linked calendar's events stay private.
    label: str | None = None


@dataclass(frozen=True)
class _Entry:
    url: str
    fetched_at: datetime
    calendar: icalendar.Calendar | None
    error: str | None


# The last download for each person, kept in memory only.
_cache: dict[uuid.UUID, _Entry] = {}


def clear_cache() -> None:
    _cache.clear()


def forget(user_id: uuid.UUID) -> None:
    _cache.pop(user_id, None)


def normalize_url(raw: str) -> str:
    """Accept the link as calendars hand it out (often webcal://) and return the https address to download."""
    url = raw.strip()
    if not url or len(url) > MAX_URL_LENGTH:
        raise CalendarError("Paste the calendar link you copied from your calendar app.")
    if url.lower().startswith("webcal://"):
        url = "https://" + url[len("webcal://"):]
    parts = urlsplit(url)
    if parts.scheme.lower() != "https" or not parts.hostname:
        raise CalendarError("The calendar link must start with webcal:// or https://.")
    if parts.username or parts.password:
        raise CalendarError("Calendar links that contain a username or password are not supported.")
    return url


def _check_host(url: str) -> None:
    """Refuse links that point at this machine or a private network, so the server cannot be used to probe them."""
    parts = urlsplit(url)
    try:
        addresses = {info[4][0] for info in socket.getaddrinfo(parts.hostname, parts.port or 443, proto=socket.IPPROTO_TCP)}
    except (socket.gaierror, UnicodeError) as error:
        raise CalendarError("That calendar link could not be found. Check that it was copied in full.") from error
    if not addresses or any(not ipaddress.ip_address(address.split("%")[0]).is_global for address in addresses):
        raise CalendarError("That calendar link is not a public web address.")


def _read_demo(url: str) -> str:
    name = url[len(DEMO_PREFIX):]
    if settings.environment != "development" or not re.fullmatch(r"[a-z0-9-]{1,64}", name):
        raise CalendarError("Sample calendars are only available in development.")
    try:
        return (DEMO_CALENDAR_DIR / f"{name}.ics").read_text(encoding="utf-8")
    except OSError as error:
        raise CalendarError("That sample calendar file is missing.") from error


def _download(url: str) -> str:
    if url.startswith(DEMO_PREFIX):
        return _read_demo(url)
    try:
        with httpx.Client(timeout=FETCH_TIMEOUT_SECONDS, follow_redirects=False) as client:
            for _ in range(MAX_REDIRECTS + 1):
                _check_host(url)
                with client.stream("GET", url, headers={"Accept": "text/calendar, */*;q=0.5"}) as response:
                    if response.is_redirect and response.headers.get("location"):
                        # Each hop is checked again, so a public link cannot redirect to a private address.
                        url = normalize_url(urljoin(url, response.headers["location"]))
                        continue
                    if response.status_code != 200:
                        raise CalendarError("The calendar did not allow the link to be read. Check that the calendar is shared publicly.")
                    body = b""
                    for chunk in response.iter_bytes():
                        body += chunk
                        if len(body) > MAX_FEED_BYTES:
                            raise CalendarError("That calendar is too large to read.")
                    return body.decode("utf-8", errors="replace")
            raise CalendarError("The calendar link redirected too many times.")
    except httpx.HTTPError as error:
        raise CalendarError("The calendar could not be reached. Try again in a moment.") from error


def _parse(text: str) -> icalendar.Calendar:
    try:
        calendar = icalendar.Calendar.from_ical(text)
    except Exception as error:  # noqa: BLE001 - the parser raises several unrelated error types
        raise CalendarError("That link did not return a calendar. Copy the calendar's sharing link, not the page address.") from error
    if not isinstance(calendar, icalendar.Calendar):
        raise CalendarError("That link did not return a calendar. Copy the calendar's sharing link, not the page address.")
    return calendar


def _load(user_id: uuid.UUID, url: str, force: bool = False) -> _Entry:
    now = datetime.now(timezone.utc)
    cached = _cache.get(user_id)
    if cached and cached.url == url and not force:
        if now - cached.fetched_at < (FAILURE_TTL if cached.error else CACHE_TTL):
            return cached
    try:
        entry = _Entry(url=url, fetched_at=now, calendar=_parse(_download(url)), error=None)
    except CalendarError as error:
        entry = _Entry(url=url, fetched_at=now, calendar=None, error=str(error))
    _cache[user_id] = entry
    return entry


def _as_moment(value: date | datetime, zone: tzinfo) -> datetime:
    if isinstance(value, datetime):
        # A time with no zone is "floating": it means that clock time wherever the person is.
        return value if value.tzinfo else value.replace(tzinfo=zone)
    return datetime.combine(value, time.min, tzinfo=zone)


def _blocks(calendar: icalendar.Calendar, start: datetime, end: datetime, zone: tzinfo) -> list[BusyBlock]:
    blocks: set[BusyBlock] = set()
    try:
        events = recurring_ical_events.of(calendar).between(start, end)
    except Exception:  # noqa: BLE001 - a malformed repeat rule should not break the whole feed
        return []
    for event in events:
        # Cancelled events and ones marked "free" do not make the person busy.
        if str(event.get("STATUS", "")).upper() == "CANCELLED" or str(event.get("TRANSP", "")).upper() == "TRANSPARENT":
            continue
        try:
            event_start, event_end = event.start, event.end
        except Exception:  # noqa: BLE001 - an event without usable times is skipped
            continue
        all_day = not isinstance(event_start, datetime)
        block = BusyBlock(start=_as_moment(event_start, zone), end=_as_moment(event_end, zone), all_day=all_day)
        if block.end > start and block.start < end:
            blocks.add(block)
    return sorted(blocks, key=lambda block: (block.start, block.end))[:MAX_BLOCKS]


def busy_blocks(user_id: uuid.UUID, url: str | None, start: datetime, end: datetime, zone: tzinfo) -> list[BusyBlock]:
    """Busy times between start and end. Returns nothing when there is no link or the feed cannot be read."""
    if not url:
        return []
    entry = _load(user_id, url)
    return _blocks(entry.calendar, start, end, zone) if entry.calendar else []


def busy_for_people(urls: dict[uuid.UUID, str | None], start: datetime, end: datetime, zone: tzinfo) -> dict[uuid.UUID, list[BusyBlock]]:
    """Busy times for several people at once. Feeds are downloaded side by side so one slow calendar does not hold up the rest."""
    linked = {user_id: url for user_id, url in urls.items() if url}
    if not linked:
        return {}
    with ThreadPoolExecutor(max_workers=min(4, len(linked))) as pool:
        results = pool.map(lambda item: (item[0], busy_blocks(item[0], item[1], start, end, zone)), linked.items())
        return dict(results)


@dataclass(frozen=True)
class FeedStatus:
    synced_at: datetime
    # Busy times in the next 30 days, or None when the feed could not be read.
    event_count: int | None
    error: str | None


def check(user_id: uuid.UUID, url: str, force: bool = False) -> FeedStatus:
    entry = _load(user_id, url, force=force)
    if entry.calendar is None:
        return FeedStatus(synced_at=entry.fetched_at, event_count=None, error=entry.error)
    now = datetime.now(timezone.utc)
    return FeedStatus(synced_at=entry.fetched_at, event_count=len(_blocks(entry.calendar, now, now + LOOKAHEAD, timezone.utc)), error=None)


def describe(blocks: list[BusyBlock], zone: tzinfo) -> list[str]:
    """Busy times as short local-time phrases for a prompt, e.g. "Monday 12 October, 14:00 to 15:30"."""
    lines = []
    for block in blocks:
        start, end = block.start.astimezone(zone), block.end.astimezone(zone)
        if block.all_day:
            last_day = (end - timedelta(seconds=1)).date()
            span = f"{start:%A %d %B}" if last_day <= start.date() else f"{start:%A %d %B} to {last_day:%A %d %B}"
            lines.append(f"{span}, all-day entry")
        elif start.date() == end.date():
            lines.append(f"{start:%A %d %B, %H:%M} to {end:%H:%M}")
        else:
            lines.append(f"{start:%A %d %B, %H:%M} to {end:%A %d %B, %H:%M}")
        if block.label:
            lines[-1] += f" ({block.label})"
    return lines
