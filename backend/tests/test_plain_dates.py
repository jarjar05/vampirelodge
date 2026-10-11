from datetime import date, time

import pytest

from app.services.plain_dates import parse_date, parse_time

TODAY = date(2026, 10, 11)  # a Sunday


@pytest.mark.parametrize("text, expected", [
    ("today", date(2026, 10, 11)),
    ("Tomorrow", date(2026, 10, 12)),
    ("friday", date(2026, 10, 16)),
    ("next Fri", date(2026, 10, 16)),
    ("sunday", date(2026, 10, 18)),
    ("14 Nov", date(2026, 11, 14)),
    ("14th November", date(2026, 11, 14)),
    ("Nov 14, 2027", date(2027, 11, 14)),
    ("by 3 jan", date(2027, 1, 3)),
    ("14/11", date(2026, 11, 14)),
    ("1/2/27", date(2027, 2, 1)),
    ("14-11-2026", date(2026, 11, 14)),
    ("2026-11-14", date(2026, 11, 14)),
])
def test_dates_people_type(text, expected):
    assert parse_date(text, TODAY) == expected


@pytest.mark.parametrize("text", ["", "soon", "31/2", "32 Nov", "14 Smarch", "the day after", "99"])
def test_dates_that_are_not_understood(text):
    assert parse_date(text, TODAY) is None


@pytest.mark.parametrize("text, expected", [
    ("5pm", time(17, 0)), ("5:30 PM", time(17, 30)), ("5.30pm", time(17, 30)), ("12am", time(0, 0)), ("12pm", time(12, 0)),
    ("17:30", time(17, 30)), ("0930", time(9, 30)), ("9:05", time(9, 5)), ("noon", time(12, 0)), ("midnight", time(0, 0)),
])
def test_times_people_type(text, expected):
    assert parse_time(text) == expected


@pytest.mark.parametrize("text", ["", "25:00", "13pm", "5:75pm", "evening", "5"])
def test_times_that_are_not_understood(text):
    assert parse_time(text) is None
