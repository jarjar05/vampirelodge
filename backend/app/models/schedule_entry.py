import uuid
from datetime import date, datetime, time

from sqlalchemy import Date, ForeignKey, String, Time, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, UTCDateTime


class ScheduleEntry(Base):
    """A time someone is busy, typed in by hand for people who do not link a calendar.

    Either it repeats every week on `weekdays` (Monday is 0, e.g. "0,1,2,3,4"), or it happens once, on `on_date`.
    The times are wall-clock times in `timezone`, the zone the person was in when they added it.
    """

    __tablename__ = "schedule_entries"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # Shown to the family, e.g. "Work" or "School". None shows as "Busy".
    label: Mapped[str | None] = mapped_column(String(60), nullable=True)
    weekdays: Mapped[str | None] = mapped_column(String(20), nullable=True)
    on_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    # At or before the start time means it runs past midnight into the next day.
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="UTC")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, server_default=func.now())

    @property
    def weekday_list(self) -> list[int]:
        return [int(day) for day in self.weekdays.split(",") if day] if self.weekdays else []
