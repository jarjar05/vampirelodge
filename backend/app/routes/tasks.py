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
    QuickSuggestionResponse,
    TaskConflictsResponse,
    TaskDraftResponse,
    TaskAvailabilityResponse,
    FamilyActivityResponse,
    TaskActivityResponse,
    TaskAssignRequest,
    TaskCreateRequest,
    TaskResponse,
    TaskUpdateRequest,
)
from app.services import assignment, day_plan, document_tasks, recurrence, telegram_bot
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
        priority=task.priority,
        status=task.status,
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
        priority=payload.priority,
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
    response = _save(database, task)
    telegram_bot.notify_assigned(database, task, user)
    return response


def _same_moment(first: datetime | None, second: datetime | None) -> bool:
    if first is None or second is None:
        return first is second
    return first.astimezone(timezone.utc) == second.astimezone(timezone.utc)


@router.patch("/tasks/{task_id}", response_model=TaskResponse)
def update_task(
    task_id: uuid.UUID,
    payload: TaskUpdateRequest,
    family_access: FamilyMemberContext,
    user: AuthenticatedUser,
    database: DatabaseSession,
) -> TaskResponse:
    """Change a task's name, details, place, due time or priority. Anyone in the family can."""
    task = _get_family_task(database, family_access.family.id, task_id)
    sent = payload.model_fields_set
    changed: list[str] = []

    if "title" in sent and payload.title is not None and payload.title != task.title:
        task.title = payload.title
        changed.append("name")
    if "due_at" in sent and not _same_moment(payload.due_at, task.due_at):
        if payload.due_at is None and task.recurrence:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="A repeating task needs a due date. Stop it repeating first.")
        task.due_at = payload.due_at
        # The new time has not been reminded about yet.
        task.overdue_reminded_at = None
        changed.append("due date")
    if "location" in sent:
        location = (payload.location or "").strip() or None
        if location != task.location:
            task.location = location
            changed.append("location")
    if "detail" in sent and payload.detail is not None and payload.detail.strip() != task.detail:
        task.detail = payload.detail.strip()
        changed.append("details")
    if "priority" in sent and payload.priority is not None and payload.priority != task.priority:
        task.priority = payload.priority
        changed.append("priority")
    if "recurrence" in sent and payload.recurrence != task.recurrence:
        if payload.recurrence is not None and task.due_at is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="A repeating task needs a due date")
        recurrence.set_recurrence(database, task, payload.recurrence)
        changed.append("repeat")

    if not changed:
        return _task_response(task)
    listed = changed[0] if len(changed) == 1 else f"{', '.join(changed[:-1])} and {changed[-1]}"
    record_activity(task, user.id, "Updated", f"Changed the {listed}")
    response = _save(database, task)
    telegram_bot.notify_updated(database, task, user, listed)
    return response


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: uuid.UUID, family_access: FamilyMemberContext, database: DatabaseSession) -> None:
    """Remove a task and its history. Deleting a repeating task also stops it repeating; earlier occurrences are kept."""
    task = _get_family_task(database, family_access.family.id, task_id)
    if task.recurrence:
        # Otherwise the series would simply produce the next occurrence in its place.
        recurrence.stop_series(database, task)
    database.delete(task)
    database.commit()


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
    response = _save(database, task)
    telegram_bot.notify_assigned(database, task, user)
    return response


@router.get("/tasks/conflicts", response_model=TaskConflictsResponse)
def list_task_conflicts(
    family_access: FamilyMemberContext,
    database: DatabaseSession,
    timezone_name: Annotated[str | None, Query(alias="timezone", max_length=64)] = None,
) -> TaskConflictsResponse:
    """Open tasks whose assignee is busy when the task is due, from linked calendars. No model call."""
    clashes = assignment.assignee_clashes(database, family_access.family.id, day_plan.resolve_timezone(timezone_name))
    return TaskConflictsResponse(task_ids=sorted(clashes, key=str))


@router.get("/tasks/{task_id}/quick-suggestion", response_model=QuickSuggestionResponse)
def quick_suggestion(
    task_id: uuid.UUID,
    family_access: FamilyMemberContext,
    database: DatabaseSession,
    timezone_name: Annotated[str | None, Query(alias="timezone", max_length=64)] = None,
) -> QuickSuggestionResponse:
    """Who should take this task by plain rules: free at that time, best placed by role, fewest open tasks. No model call."""
    task = _get_family_task(database, family_access.family.id, task_id)
    zone = day_plan.resolve_timezone(timezone_name)
    busy = assignment.members_busy_at_task_time(database, task, zone)
    suggestion = assignment.suggest_without_model(database, task, zone)
    return QuickSuggestionResponse(
        member_id=suggestion.member_id if suggestion else None,
        reason=suggestion.reason if suggestion else "",
        busy_member_ids=sorted(busy, key=str),
    )


@router.get("/tasks/{task_id}/availability", response_model=TaskAvailabilityResponse)
def read_task_availability(
    task_id: uuid.UUID,
    family_access: FamilyMemberContext,
    database: DatabaseSession,
    timezone_name: Annotated[str | None, Query(alias="timezone", max_length=64)] = None,
) -> TaskAvailabilityResponse:
    """Who is busy when this task is due, from linked calendars. No model call is made."""
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
            TaskDraftResponse(title=draft.title, detail=draft.detail, location=draft.location, due_date=draft.due_date, due_time=draft.due_time, priority=draft.priority, recurrence=draft.recurrence)
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
