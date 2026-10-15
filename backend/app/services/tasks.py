import uuid

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import FamilyMembership, Task, TaskActivity, TaskAssignee, User


def get_family_member(database: Session, family_id: uuid.UUID, user_id: uuid.UUID) -> User | None:
    """Return the user only when they belong to the given family."""
    return database.scalar(
        select(User)
        .join(FamilyMembership, FamilyMembership.user_id == User.id)
        .where(FamilyMembership.family_id == family_id, User.id == user_id)
    )


def record_activity(task: Task, actor_id: uuid.UUID | None, action: str, detail: str) -> None:
    task.activity.append(TaskActivity(family_id=task.family_id, actor_id=actor_id, action=action, detail=detail))


def join_names(names: list[str]) -> str:
    """"Annie", "Annie and Jerry", or "Annie, Jerry and Chloe"."""
    if len(names) <= 1:
        return "".join(names)
    return f"{', '.join(names[:-1])} and {names[-1]}"


def set_assignees(task: Task, user_ids: list[uuid.UUID]) -> None:
    """Give the task to these people, in this order; an empty list leaves it unassigned. The first is the lead."""
    ordered = list(dict.fromkeys(user_ids))
    task.assignees = [TaskAssignee(user_id=user_id, position=index) for index, user_id in enumerate(ordered)]
    task.assignee_id = ordered[0] if ordered else None


def tasks_for_member(family_id: uuid.UUID, user_id: uuid.UUID):
    """A query for the family's tasks that this person is on, alone or shared."""
    return select(Task).where(
        Task.family_id == family_id,
        or_(Task.assignee_id == user_id, Task.id.in_(select(TaskAssignee.task_id).where(TaskAssignee.user_id == user_id))),
    )


def unassign_member_tasks(database: Session, family_id: uuid.UUID, user_id: uuid.UUID, actor_id: uuid.UUID) -> None:
    """Take a departing member off their tasks. A task they shared stays with the others; one that was only
    theirs returns to the unassigned queue. Does not commit."""
    for task in database.scalars(tasks_for_member(family_id, user_id)).all():
        remaining = [assignee for assignee in task.assignee_ids if assignee != user_id]
        set_assignees(task, remaining)
        if task.status != "Completed" and not remaining:
            task.status = "Open"
            record_activity(task, actor_id, "Assigned", "Returned to the unassigned queue because the assignee left the family")
