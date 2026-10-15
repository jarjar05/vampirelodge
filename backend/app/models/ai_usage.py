from sqlalchemy import Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AIUsageMonth(Base):
    """What the AI cost in one calendar month (UTC), across every family, for the spending limit."""

    __tablename__ = "ai_usage_months"

    month: Mapped[str] = mapped_column(String(7), primary_key=True)  # "2026-10"
    requests: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
