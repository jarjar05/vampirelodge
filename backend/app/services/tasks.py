import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import FamilyMembership, Task, TaskActivity, User


def get_family_member(database: Session, family_id: uuid.UUID, user_id: uuid.UUID) -> User | None:
    """Return the user only when they belong to the given family."""
    return database.scalar(
        select(User)
        .join(FamilyMembership, FamilyMembership.user_id == User.id)
        .where(FamilyMembership.family_id == family_id, User.id == user_id)
    )


def record_activity(task: Task, actor_id: uuid.UUID | None, action: str, detail: str) -> None:
    task.activity.append(TaskActivity(family_id=task.family_id, actor_id=actor_id, action=action, detail=detail))


def unassign_member_tasks(database: Session, family_id: uuid.UUID, user_id: uuid.UUID, actor_id: uuid.UUID) -> None:
    """Return a departing member's tasks to the unassigned queue. Does not commit."""
    tasks = database.scalars(
        select(Task).where(Task.family_id == family_id, Task.assignee_id == user_id)
    ).all()
    for task in tasks:
        task.assignee_id = None
        if task.status != "Completed":
            task.status = "Open"
            record_activity(task, actor_id, "Assigned", "Returned to the unassigned queue because the assignee left the family")
