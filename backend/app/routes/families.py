import secrets
import string
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import AuthenticatedUser
from app.dependencies.family import FamilyMemberContext
from app.models import Family, FamilyMembership, User
from app.schemas.family import (
    FamilyCreateRequest,
    FamilyCreatedResponse,
    FamilyJoinRequest,
    FamilyJoinResponse,
    FamilyMemberResponse,
    FamilyResponse,
)

router = APIRouter(prefix="/api/families", tags=["families"])
DatabaseSession = Annotated[Session, Depends(get_db)]
INVITE_ALPHABET = string.ascii_uppercase + string.digits


def generate_invite_code() -> str:
    return "".join(secrets.choice(INVITE_ALPHABET) for _ in range(10))


@router.post("", response_model=FamilyCreatedResponse, status_code=status.HTTP_201_CREATED)
def create_family(payload: FamilyCreateRequest, user: AuthenticatedUser, database: DatabaseSession) -> Family:
    existing_membership = database.scalar(
        select(FamilyMembership.id).where(FamilyMembership.user_id == user.id)
    )
    if existing_membership is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You already belong to a family")

    family = Family(name=payload.name, invite_code=generate_invite_code())
    database.add(family)
    database.flush()
    database.add(FamilyMembership(family_id=family.id, user_id=user.id, role="ADMIN"))
    try:
        database.commit()
    except IntegrityError as error:
        database.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Family membership could not be created") from error

    database.refresh(family)
    return family


@router.get("/me", response_model=FamilyResponse)
def get_my_family(family_access: FamilyMemberContext) -> Family:
    return family_access.family


@router.get("/me/members", response_model=list[FamilyMemberResponse])
def get_my_family_members(family_access: FamilyMemberContext, database: DatabaseSession) -> list[FamilyMemberResponse]:
    rows = database.execute(
        select(FamilyMembership, User)
        .join(User, User.id == FamilyMembership.user_id)
        .where(FamilyMembership.family_id == family_access.family.id)
        .order_by(FamilyMembership.joined_at, User.name)
    ).all()

    return [
        FamilyMemberResponse(
            id=user.id,
            name=user.name,
            email=user.email,
            role=membership.role,
            joined_at=membership.joined_at,
        )
        for membership, user in rows
    ]


@router.post("/join", response_model=FamilyJoinResponse, status_code=status.HTTP_201_CREATED)
def join_family(payload: FamilyJoinRequest, user: AuthenticatedUser, database: DatabaseSession) -> FamilyJoinResponse:
    family = database.scalar(select(Family).where(Family.invite_code == payload.invite_code))
    if family is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid invite code")

    existing_membership = database.scalar(
        select(FamilyMembership).where(FamilyMembership.user_id == user.id)
    )
    if existing_membership is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You already belong to a family")

    membership = FamilyMembership(family_id=family.id, user_id=user.id, role="MEMBER")
    database.add(membership)
    try:
        database.commit()
    except IntegrityError as error:
        database.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You already belong to a family") from error

    database.refresh(membership)
    return FamilyJoinResponse(
        family=FamilyResponse.model_validate(family),
        role=membership.role,
        joined_at=membership.joined_at,
    )


@router.post("/leave", status_code=status.HTTP_204_NO_CONTENT)
def leave_family(family_access: FamilyMemberContext, user: AuthenticatedUser, database: DatabaseSession) -> Response:
    family = database.scalar(
        select(Family).where(Family.id == family_access.family.id).with_for_update()
    )
    membership = database.scalar(
        select(FamilyMembership).where(
            FamilyMembership.family_id == family_access.family.id,
            FamilyMembership.user_id == user.id,
        )
    )
    if family is None or membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family membership not found")

    if membership.role == "ADMIN":
        admin_count = database.scalar(
            select(func.count()).select_from(FamilyMembership).where(
                FamilyMembership.family_id == family.id,
                FamilyMembership.role == "ADMIN",
            )
        )
        if admin_count is not None and admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The final family admin cannot leave. Assign another admin first.",
            )

    database.delete(membership)
    database.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)