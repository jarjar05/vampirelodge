import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import AuthenticatedUser
from app.dependencies.family import FamilyMemberContext
from app.models import Task, TaskActivity
from app.schemas.task import (
    FamilyActivityResponse,
    TaskActivityResponse,
    TaskAssignRequest,
    TaskCreateRequest,
    TaskResponse,
)
from app.services.tasks import get_family_member, record_activity

router = APIRouter(prefix="/api/families/me", tags=["tasks"])
DatabaseSession = Annotated[Session, Depends(get_db)]
FORMER_MEMBER_NAME = "Former member"


def _activity_response(activity: TaskActivity) -> TaskActivityResponse:
    return TaskActivityResponse(
        id=activity.id,
        action=activity.action,
        actor_id=activity.actor_id,
        actor_name=activity.actor.name if activity.actor else FORMER_MEMBER_NAME,
        detail=activity.detail,
        created_at=activity.created_at,
    )


def _task_response(task: Task) -> TaskResponse:
    return TaskResponse(
        id=task.id,
        title=task.title,
        detail=task.detail,
        location=task.location,
        due_at=task.due_at,
        assignee_id=task.assignee_id,
        category=task.category,
        priority=task.priority,
        status=task.status,
        recipient=task.recipient,
        created_at=task.created_at,
        completed_at=task.completed_at,
        activity=[_activity_response(activity) for activity in task.activity],
    )


def _get_family_task(database: Session, family_id: uuid.UUID, task_id: uuid.UUID) -> Task:
    task = database.scalar(select(Task).where(Task.id == task_id, Task.family_id == family_id))
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task


def _save(database: Session, task: Task) -> TaskResponse:
    database.commit()
    database.refresh(task)
    return _task_response(task)


def _require_assignee(task: Task, user_id: uuid.UUID) -> None:
    if task.assignee_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the assigned family member can respond to this task")
    if task.status == "Completed":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This task is already completed")


@router.get("/tasks", response_model=list[TaskResponse])
def list_tasks(family_access: FamilyMemberContext, database: DatabaseSession) -> list[TaskResponse]:
    tasks = database.scalars(
        select(Task).where(Task.family_id == family_access.family.id).order_by(Task.created_at, Task.id)
    ).all()
    return [_task_response(task) for task in tasks]


@router.post("/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: TaskCreateRequest,
    family_access: FamilyMemberContext,
    user: AuthenticatedUser,
    database: DatabaseSession,
) -> TaskResponse:
    family_id = family_access.family.id
    assignee = None
    if payload.assignee_id is not None:
        assignee = get_family_member(database, family_id, payload.assignee_id)
        if assignee is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Assignee is not a member of your family")

    task = Task(
        family_id=family_id,
        title=payload.title,
        detail=payload.detail.strip(),
        location=payload.location,
        due_at=payload.due_at,
        assignee_id=assignee.id if assignee else None,
        category=payload.category,
        priority=payload.priority,
        recipient=payload.recipient.strip(),
        created_by_id=user.id,
    )
    database.add(task)
    record_activity(task, user.id, "Created", "Added to the household delegation board")
    if assignee is not None:
        record_activity(task, user.id, "Assigned", f"Assigned to {assignee.name}")
    return _save(database, task)


@router.post("/tasks/{task_id}/assign", response_model=TaskResponse)
def assign_task(
    task_id: uuid.UUID,
    payload: TaskAssignRequest,
    family_access: FamilyMemberContext,
    user: AuthenticatedUser,
    database: DatabaseSession,
) -> TaskResponse:
    family_id = family_access.family.id
    task = _get_family_task(database, family_id, task_id)
    if task.assignee_id == payload.assignee_id:
        return _task_response(task)

    if payload.assignee_id is None:
        detail = "Returned to the unassigned queue"
        action = "Assigned"
    else:
        assignee = get_family_member(database, family_id, payload.assignee_id)
        if assignee is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Assignee is not a member of your family")
        detail = f"Assigned to {assignee.name}"
        action = "Reassigned" if task.assignee_id is not None else "Assigned"

    task.assignee_id = payload.assignee_id
    if task.status != "Completed":
        # A new assignee has not accepted yet.
        task.status = "Open"
    record_activity(task, user.id, action, detail)
    return _save(database, task)


@router.post("/tasks/{task_id}/accept", response_model=TaskResponse)
def accept_task(task_id: uuid.UUID, family_access: FamilyMemberContext, user: AuthenticatedUser, database: DatabaseSession) -> TaskResponse:
    task = _get_family_task(database, family_access.family.id, task_id)
    _require_assignee(task, user.id)
    if task.status == "In progress":
        return _task_response(task)
    task.status = "In progress"
    record_activity(task, user.id, "Accepted", "Accepted responsibility for this task")
    return _save(database, task)


@router.post("/tasks/{task_id}/decline", response_model=TaskResponse)
def decline_task(task_id: uuid.UUID, family_access: FamilyMemberContext, user: AuthenticatedUser, database: DatabaseSession) -> TaskResponse:
    task = _get_family_task(database, family_access.family.id, task_id)
    _require_assignee(task, user.id)
    task.assignee_id = None
    task.status = "Open"
    record_activity(task, user.id, "Declined", "Declined the assignment and returned it to the unassigned queue")
    return _save(database, task)


@router.post("/tasks/{task_id}/complete", response_model=TaskResponse)
def complete_task(task_id: uuid.UUID, family_access: FamilyMemberContext, user: AuthenticatedUser, database: DatabaseSession) -> TaskResponse:
    task = _get_family_task(database, family_access.family.id, task_id)
    if task.status == "Completed":
        return _task_response(task)
    task.status = "Completed"
    task.completed_at = datetime.now(timezone.utc)
    record_activity(task, user.id, "Completed", "Marked this task complete")
    return _save(database, task)


@router.post("/tasks/{task_id}/reopen", response_model=TaskResponse)
def reopen_task(task_id: uuid.UUID, family_access: FamilyMemberContext, user: AuthenticatedUser, database: DatabaseSession) -> TaskResponse:
    task = _get_family_task(database, family_access.family.id, task_id)
    if task.status != "Completed":
        return _task_response(task)
    task.status = "Open"
    task.completed_at = None
    record_activity(task, user.id, "Reopened", "Reopened this task")
    return _save(database, task)


@router.get("/activity", response_model=list[FamilyActivityResponse])
def list_family_activity(
    family_access: FamilyMemberContext,
    database: DatabaseSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[FamilyActivityResponse]:
    rows = database.execute(
        select(TaskActivity, Task.title)
        .join(Task, Task.id == TaskActivity.task_id)
        .where(TaskActivity.family_id == family_access.family.id)
        .order_by(TaskActivity.created_at.desc())
        .limit(limit)
    ).all()
    return [
        FamilyActivityResponse(
            **_activity_response(activity).model_dump(),
            task_id=activity.task_id,
            task_title=title,
        )
        for activity, title in rows
    ]
