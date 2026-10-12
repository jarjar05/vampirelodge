import uuid
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, ForeignKey, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, UTCDateTime
from app.models.user import User

TASK_CATEGORIES = ("Appointment", "Medication", "Check-in")
TASK_PRIORITIES = ("High", "Normal", "Low")
# "In progress" belonged to the old accept step. It is no longer set, but stays valid for rows that predate its removal.
TASK_STATUSES = ("Open", "In progress", "Completed")
# "Accepted" and "Declined" are no longer recorded; they remain so that older history still reads correctly.
TASK_ACTIONS = ("Created", "Assigned", "Accepted", "Declined", "Reassigned", "Updated", "Completed", "Reopened")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint("category IN ('Appointment', 'Medication', 'Check-in')", name="ck_tasks_category"),
        CheckConstraint("priority IN ('High', 'Normal', 'Low')", name="ck_tasks_priority"),
        CheckConstraint("status IN ('Open', 'In progress', 'Completed')", name="ck_tasks_status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    detail: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    location: Mapped[str | None] = mapped_column(String(120), nullable=True)
    due_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    category: Mapped[str] = mapped_column(String(16), nullable=False, default="Check-in")
    priority: Mapped[str] = mapped_column(String(8), nullable=False, default="Normal")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="Open")
    recipient: Mapped[str] = mapped_column(String(80), nullable=False, default="Shared household")
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    # How often the task repeats: "daily", "weekly", "biweekly" or "monthly". None for a one-off task.
    recurrence: Mapped[str | None] = mapped_column(String(12), nullable=True)
    # Shared by every occurrence of a repeating task; equal to the id of the first one.
    series_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True, index=True)
    # When the assignee was reminded that this task is overdue. Cleared when the task is reassigned or reopened,
    # so the reminder is sent once per person per time the task falls due.
    overdue_reminded_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)

    activity: Mapped[list["TaskActivity"]] = relationship(
        back_populates="task",
        order_by="TaskActivity.created_at",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class TaskActivity(Base):
    __tablename__ = "task_activity"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action: Mapped[str] = mapped_column(String(16), nullable=False)
    detail: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    # Set in Python so entries written in one transaction keep their order.
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=_utc_now)

    task: Mapped[Task] = relationship(back_populates="activity")
    actor: Mapped[User | None] = relationship(lazy="joined")
