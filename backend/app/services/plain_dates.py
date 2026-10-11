"""Read a date or a time the way people type them in a chat, without any AI."""

import re
from datetime import date, time, timedelta

_WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
_MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]


def _future(day: int, month: int, year: int | None, today: date) -> date | None:
    try:
        if year is not None:
            return date(year + 2000 if year < 100 else year, month, day)
        candidate = date(today.year, month, day)
        # With no year given, a date that has already passed means next year.
        return candidate if candidate >= today else date(today.year + 1, month, day)
    except ValueError:
        return None


def parse_date(text: str, today: date) -> date | None:
    """Understands today, tomorrow, a weekday, 14 Nov, 14 November 2026, 14/11, 14/11/2026 and 2026-11-14."""
    value = re.sub(r"[,.]", " ", text.strip().lower())
    value = re.sub(r"\b(on|next|this|by|due)\b", " ", value)
    value = re.sub(r"(\d)(st|nd|rd|th)\b", r"\1", value)
    value = " ".join(value.split())
    if value in ("today", "tonight", "now"):
        return today
    if value in ("tomorrow", "tmr", "tmrw"):
        return today + timedelta(days=1)

    for index, name in enumerate(_WEEKDAYS):
        if value in (name, name[:3], name[:4]):
            # The next such day; naming today's weekday means a week from now.
            return today + timedelta(days=(index - today.weekday() - 1) % 7 + 1)

    if match := re.fullmatch(r"(\d{4})-(\d{1,2})-(\d{1,2})", value):
        return _future(int(match[3]), int(match[2]), int(match[1]), today)
    if match := re.fullmatch(r"(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?", value):
        return _future(int(match[1]), int(match[2]), int(match[3]) if match[3] else None, today)

    def month_number(word: str) -> int | None:
        return next((index + 1 for index, name in enumerate(_MONTHS) if len(word) >= 3 and name.startswith(word)), None)

    if match := re.fullmatch(r"(\d{1,2}) ([a-z]+)(?: (\d{4}))?", value):
        month = month_number(match[2])
        return _future(int(match[1]), month, int(match[3]) if match[3] else None, today) if month else None
    if match := re.fullmatch(r"([a-z]+) (\d{1,2})(?: (\d{4}))?", value):
        month = month_number(match[1])
        return _future(int(match[2]), month, int(match[3]) if match[3] else None, today) if month else None
    return None


def parse_time(text: str) -> time | None:
    """Understands 5pm, 5:30 pm, 5.30pm, 17:30, 1730, noon and midnight."""
    value = text.strip().lower().replace(".", ":").replace(" ", "")
    if value in ("noon", "midday"):
        return time(12, 0)
    if value == "midnight":
        return time(0, 0)
    if match := re.fullmatch(r"(\d{1,2})(?::(\d{2}))?(am|pm)", value):
        hour, minute = int(match[1]), int(match[2] or 0)
        if not 1 <= hour <= 12 or minute > 59:
            return None
        return time(hour % 12 + (12 if match[3] == "pm" else 0), minute)
    if match := re.fullmatch(r"(\d{1,2}):(\d{2})", value) or re.fullmatch(r"(\d{2})(\d{2})", value):
        hour, minute = int(match[1]), int(match[2])
        return time(hour, minute) if hour <= 23 and minute <= 59 else None
    return None
