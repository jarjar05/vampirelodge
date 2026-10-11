import base64
import binascii
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
    AssignmentSuggestionResponse,
    DayPlanRequest,
    DayPlanResponse,
    DayPlanStepResponse,
    DocumentTasksRequest,
    DocumentTasksResponse,
    TaskDraftResponse,
    TaskAvailabilityResponse,
    FamilyActivityResponse,
    TaskActivityResponse,
    TaskAssignRequest,
    TaskCreateRequest,
    TaskResponse,
)
from app.services import assignment, day_plan, document_tasks, recurrence
from app.services.llm import LLMUnavailable
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
        recurrence=task.recurrence,
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


@router.get("/tasks", response_model=list[TaskResponse])
def list_tasks(family_access: FamilyMemberContext, database: DatabaseSession) -> list[TaskResponse]:
    # A repeating task whose due time has passed gets its next occurrence here, the first time anyone looks.
    if recurrence.catch_up(database, family_access.family.id):
        database.commit()
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
        recurrence=payload.recurrence,
    )
    database.add(task)
    record_activity(task, user.id, "Created", "Added to the household delegation board")
    if assignee is not None:
        record_activity(task, user.id, "Assigned", f"Assigned to {assignee.name}")
    if payload.recurrence:
        database.flush()
        recurrence.start_series(task)
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
    # A new assignee has not been reminded yet.
    task.overdue_reminded_at = None
    record_activity(task, user.id, action, detail)
    return _save(database, task)


@router.get("/tasks/{task_id}/availability", response_model=TaskAvailabilityResponse)
def read_task_availability(
    task_id: uuid.UUID,
    family_access: FamilyMemberContext,
    database: DatabaseSession,
    timezone_name: Annotated[str | None, Query(alias="timezone", max_length=64)] = None,
) -> TaskAvailabilityResponse:
    """Who is busy when this task is due, from app appointments and linked calendars. No model call is made."""
    task = _get_family_task(database, family_access.family.id, task_id)
    busy = assignment.members_busy_at_task_time(database, task, day_plan.resolve_timezone(timezone_name))
    return TaskAvailabilityResponse(busy_member_ids=sorted(busy, key=str))


@router.post("/tasks/{task_id}/suggestion", response_model=AssignmentSuggestionResponse)
def suggest_task_assignee(
    task_id: uuid.UUID,
    family_access: FamilyMemberContext,
    database: DatabaseSession,
    timezone_name: Annotated[str | None, Query(alias="timezone", max_length=64)] = None,
) -> AssignmentSuggestionResponse:
    """Ask the language model who should take this task. It only suggests; nothing is assigned."""
    task = _get_family_task(database, family_access.family.id, task_id)
    try:
        suggestion = assignment.suggest_assignee(database, task, day_plan.resolve_timezone(timezone_name))
    except LLMUnavailable as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
    return AssignmentSuggestionResponse(member_id=suggestion.member_id, reason=suggestion.reason, note_titles=suggestion.note_titles)


@router.post("/tasks/from-document", response_model=DocumentTasksResponse)
def draft_tasks_from_document(payload: DocumentTasksRequest, family_access: FamilyMemberContext) -> DocumentTasksResponse:
    """Read an uploaded document or pasted text and draft tasks from it. Nothing is created or stored:
    the person reviews each draft and creates the task themselves."""
    try:
        if payload.data_base64:
            try:
                data = base64.b64decode(payload.data_base64, validate=True)
            except (binascii.Error, ValueError) as error:
                raise document_tasks.DocumentError("That file could not be read. Try uploading it again.") from error
            text, images = document_tasks.read_document(payload.filename, payload.content_type, data)
        elif payload.text and payload.text.strip():
            text, images = payload.text.strip()[: document_tasks.MAX_TEXT_CHARS], []
        else:
            raise document_tasks.DocumentError("Upload a file or paste the text of the letter or email.")
        drafts = document_tasks.draft_tasks(text, images, datetime.now(timezone.utc), day_plan.resolve_timezone(payload.timezone))
    except document_tasks.DocumentError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error
    except LLMUnavailable as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
    return DocumentTasksResponse(
        summary=drafts.summary,
        tasks=[
            TaskDraftResponse(title=draft.title, detail=draft.detail, location=draft.location, due_date=draft.due_date, due_time=draft.due_time, priority=draft.priority)
            for draft in drafts.tasks
        ],
    )


@router.post("/day-plan", response_model=DayPlanResponse)
def plan_my_day(payload: DayPlanRequest, family_access: FamilyMemberContext, user: AuthenticatedUser, database: DatabaseSession) -> DayPlanResponse:
    """Summarise the signed-in person's open tasks and suggest an order. Reuses the last plan while nothing has changed."""
    try:
        plan = day_plan.plan_my_day(database, family_access.family.id, user.id, payload.timezone, refresh=payload.refresh)
    except LLMUnavailable as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
    if plan is None:
        return DayPlanResponse(summary=None, steps=[], generated_at=None)
    return DayPlanResponse(
        summary=plan.summary,
        steps=[DayPlanStepResponse(task_id=step.task_id, note=step.note) for step in plan.steps],
        generated_at=plan.generated_at,
    )


@router.post("/tasks/{task_id}/complete", response_model=TaskResponse)
def complete_task(task_id: uuid.UUID, family_access: FamilyMemberContext, user: AuthenticatedUser, database: DatabaseSession) -> TaskResponse:
    task = _get_family_task(database, family_access.family.id, task_id)
    if task.status == "Completed":
        return _task_response(task)
    task.status = "Completed"
    task.completed_at = datetime.now(timezone.utc)
    record_activity(task, user.id, "Completed", "Marked this task complete")
    recurrence.schedule_after(database, task)
    return _save(database, task)


@router.post("/tasks/{task_id}/stop-repeating", response_model=TaskResponse)
def stop_repeating(task_id: uuid.UUID, family_access: FamilyMemberContext, database: DatabaseSession) -> TaskResponse:
    """Stop a repeating task from creating further occurrences. The ones that already exist stay."""
    task = _get_family_task(database, family_access.family.id, task_id)
    recurrence.stop_series(database, task)
    return _save(database, task)


@router.post("/tasks/{task_id}/reopen", response_model=TaskResponse)
def reopen_task(task_id: uuid.UUID, family_access: FamilyMemberContext, user: AuthenticatedUser, database: DatabaseSession) -> TaskResponse:
    task = _get_family_task(database, family_access.family.id, task_id)
    if task.status != "Completed":
        return _task_response(task)
    task.status = "Open"
    task.completed_at = None
    task.overdue_reminded_at = None
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
