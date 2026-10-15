"""A monthly spending limit on the AI, kept by the app itself.

Every model call is costed from the tokens it used, at the prices set in the environment, and added to the month's
total. Once the total reaches AI_MONTHLY_BUDGET_USD, the app stops calling the model until the next month (UTC) and
every AI feature falls back to its plain version, as it does when no key is set. The last call before the limit can
take the total a little over it, by at most one call.

    AI_MONTHLY_BUDGET_USD=10            the limit, in US dollars; leave unset for no limit
    AI_INPUT_PRICE_PER_MILLION=...      the model's price per million input tokens, from OpenAI's pricing page
    AI_OUTPUT_PRICE_PER_MILLION=...     the same for output tokens (which include any reasoning)

With a limit but no prices the cost cannot be worked out, so the AI stays off rather than spend without a limit.
"""

import os
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import update

from app.database import SessionLocal
from app.models import AIUsageMonth


@dataclass(frozen=True)
class Budget:
    limit_usd: float | None
    input_price: float | None
    output_price: float | None


@dataclass(frozen=True)
class MonthUsage:
    month: str
    requests: int
    input_tokens: int
    output_tokens: int
    cost_usd: float


def _number(name: str) -> float | None:
    raw = os.getenv(name, "").strip()
    if not raw:
        return None
    try:
        value = float(raw)
    except ValueError:
        return None
    return value if value >= 0 else None


def budget() -> Budget:
    return Budget(_number("AI_MONTHLY_BUDGET_USD"), _number("AI_INPUT_PRICE_PER_MILLION"), _number("AI_OUTPUT_PRICE_PER_MILLION"))


def current_month(now: datetime | None = None) -> str:
    return (now or datetime.now(timezone.utc)).strftime("%Y-%m")


def cost_of(input_tokens: int, output_tokens: int, limits: Budget | None = None) -> float:
    limits = limits or budget()
    return (input_tokens * (limits.input_price or 0) + output_tokens * (limits.output_price or 0)) / 1_000_000


def usage(month: str | None = None) -> MonthUsage:
    month = month or current_month()
    with SessionLocal() as database:
        row = database.get(AIUsageMonth, month)
        if row is None:
            return MonthUsage(month, 0, 0, 0, 0.0)
        return MonthUsage(month, row.requests, row.input_tokens, row.output_tokens, row.cost_usd)


def refusal() -> str | None:
    """Why the AI may not be called right now, or None when it may. The reason is safe to show to users."""
    limits = budget()
    if limits.limit_usd is None:
        return None
    if limits.input_price is None or limits.output_price is None:
        return "AI features are paused: a spending limit is set, but the model's prices are not. Set AI_INPUT_PRICE_PER_MILLION and AI_OUTPUT_PRICE_PER_MILLION."
    if usage().cost_usd >= limits.limit_usd:
        return "This month's AI spending limit has been reached, so AI features are paused until the 1st. Everything else still works."
    return None


def record(input_tokens: int, output_tokens: int) -> None:
    """Add one call's tokens and cost to this month's total."""
    month = current_month()
    cost = cost_of(input_tokens, output_tokens)
    with SessionLocal() as database:
        if database.get(AIUsageMonth, month) is None:
            database.add(AIUsageMonth(month=month))
            database.flush()
        # Added in the database, so calls finishing at the same time are all counted.
        database.execute(
            update(AIUsageMonth).where(AIUsageMonth.month == month).values(
                requests=AIUsageMonth.requests + 1,
                input_tokens=AIUsageMonth.input_tokens + input_tokens,
                output_tokens=AIUsageMonth.output_tokens + output_tokens,
                cost_usd=AIUsageMonth.cost_usd + cost,
            )
        )
        database.commit()
