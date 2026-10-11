import uuid
from datetime import date, datetime, time

from sqlalchemy import BigInteger, Date, ForeignKey, String, Time, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, UTCDateTime


class TelegramDraft(Base):
    """A task the bot drafted from a Telegram message, waiting for the person to confirm it.

    The buttons under a bot message can only carry a short id, so the draft itself is kept here.
    """

    __tablename__ = "telegram_drafts"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    detail: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    location: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # Local date and clock time as the message gave them; either may be missing.
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    due_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    priority: Mapped[str] = mapped_column(String(8), nullable=False, default="Normal")
    # While the bot is asking for the details one question at a time, the question it is waiting on:
    # "title", "date", "time" or "location". None once the draft is complete.
    step: Mapped[str | None] = mapped_column(String(12), nullable=True)
    # The chat the questions are being asked in.
    chat_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    # Set once the person confirms: the task that was created, and who the assistant suggested for it.
    task_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True)
    suggested_member_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, server_default=func.now())
