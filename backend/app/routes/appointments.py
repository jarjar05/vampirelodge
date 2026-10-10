import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.family import FamilyMemberContext
from app.models import Appointment, Task
from app.schemas.appointment import AppointmentCreateRequest, AppointmentResponse
from app.services.tasks import get_family_member

router = APIRouter(prefix="/api/families/me/appointments", tags=["appointments"])
DatabaseSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=list[AppointmentResponse])
def list_appointments(family_access: FamilyMemberContext, database: DatabaseSession) -> list[Appointment]:
    return list(database.scalars(
        select(Appointment)
        .where(Appointment.family_id == family_access.family.id)
        .order_by(Appointment.starts_at, Appointment.id)
    ).all())


@router.post("", response_model=AppointmentResponse, status_code=status.HTTP_201_CREATED)
def create_appointment(payload: AppointmentCreateRequest, family_access: FamilyMemberContext, database: DatabaseSession) -> Appointment:
    family_id = family_access.family.id
    if payload.attendee_id is not None and get_family_member(database, family_id, payload.attendee_id) is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Attendee is not a member of your family")
    if payload.related_task_id is not None:
        related_task = database.scalar(
            select(Task.id).where(Task.id == payload.related_task_id, Task.family_id == family_id)
        )
        if related_task is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Related task was not found in your family")

    appointment = Appointment(
        family_id=family_id,
        title=payload.title,
        place=payload.place,
        starts_at=payload.starts_at,
        attendee_id=payload.attendee_id,
        related_task_id=payload.related_task_id,
    )
    database.add(appointment)
    database.commit()
    database.refresh(appointment)
    return appointment


@router.delete("/{appointment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_appointment(appointment_id: uuid.UUID, family_access: FamilyMemberContext, database: DatabaseSession) -> None:
    appointment = database.scalar(
        select(Appointment).where(
            Appointment.id == appointment_id,
            Appointment.family_id == family_access.family.id,
        )
    )
    if appointment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
    database.delete(appointment)
    database.commit()
