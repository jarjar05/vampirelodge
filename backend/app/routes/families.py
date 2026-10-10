import secrets
import string
import uuid
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
    FamilyMemberUpdateRequest,
    FamilyResponse,
    FamilyUpdateRequest,
    MyFamilyResponse,
)
from app.services.tasks import unassign_member_tasks

router = APIRouter(prefix="/api/families", tags=["families"])
DatabaseSession = Annotated[Session, Depends(get_db)]
INVITE_ALPHABET = string.ascii_uppercase + string.digits


def generate_invite_code() -> str:
    return "".join(secrets.choice(INVITE_ALPHABET) for _ in range(10))


def _my_family_response(family: Family, role: str) -> MyFamilyResponse:
    return MyFamilyResponse(
        id=family.id,
        name=family.name,
        created_at=family.created_at,
        my_role=role,
        invite_code=family.invite_code if role == "ADMIN" else None,
    )


def _member_response(membership: FamilyMembership, user: User) -> FamilyMemberResponse:
    return FamilyMemberResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        avatar_url=user.avatar_url,
        role=membership.role,
        relationship_label=membership.relationship_label,
        availability=membership.availability,
        availability_note=membership.availability_note,
        joined_at=membership.joined_at,
    )


def _require_admin(family_access: FamilyMemberContext) -> None:
    if family_access.membership.role != "ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only a family admin can do this")


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


@router.get("/me", response_model=MyFamilyResponse)
def get_my_family(family_access: FamilyMemberContext) -> MyFamilyResponse:
    return _my_family_response(family_access.family, family_access.membership.role)


@router.patch("/me", response_model=MyFamilyResponse)
def rename_my_family(payload: FamilyUpdateRequest, family_access: FamilyMemberContext, database: DatabaseSession) -> MyFamilyResponse:
    _require_admin(family_access)
    family = family_access.family
    family.name = payload.name
    database.commit()
    database.refresh(family)
    return _my_family_response(family, family_access.membership.role)


@router.get("/me/members", response_model=list[FamilyMemberResponse])
def get_my_family_members(family_access: FamilyMemberContext, database: DatabaseSession) -> list[FamilyMemberResponse]:
    rows = database.execute(
        select(FamilyMembership, User)
        .join(User, User.id == FamilyMembership.user_id)
        .where(FamilyMembership.family_id == family_access.family.id)
        .order_by(FamilyMembership.joined_at, User.name)
    ).all()

    return [_member_response(membership, user) for membership, user in rows]


def _get_membership(database: Session, family_id: uuid.UUID, user_id: uuid.UUID) -> tuple[FamilyMembership, User]:
    row = database.execute(
        select(FamilyMembership, User)
        .join(User, User.id == FamilyMembership.user_id)
        .where(FamilyMembership.family_id == family_id, FamilyMembership.user_id == user_id)
    ).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family member not found")
    return row[0], row[1]


@router.patch("/me/members/{user_id}", response_model=FamilyMemberResponse)
def update_family_member(
    user_id: uuid.UUID,
    payload: FamilyMemberUpdateRequest,
    family_access: FamilyMemberContext,
    user: AuthenticatedUser,
    database: DatabaseSession,
) -> FamilyMemberResponse:
    """Members edit their own details; admins can edit anyone in the family."""
    if user_id != user.id:
        _require_admin(family_access)
    membership, member = _get_membership(database, family_access.family.id, user_id)

    changes = payload.model_dump(exclude_unset=True)
    if "relationship_label" in changes:
        membership.relationship_label = changes["relationship_label"]
    if changes.get("availability") is not None:
        membership.availability = changes["availability"]
    if "availability_note" in changes:
        membership.availability_note = changes["availability_note"]
    database.commit()
    database.refresh(membership)
    return _member_response(membership, member)


@router.delete("/me/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_family_member(
    user_id: uuid.UUID,
    family_access: FamilyMemberContext,
    user: AuthenticatedUser,
    database: DatabaseSession,
) -> None:
    _require_admin(family_access)
    if user_id == user.id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Use leave to remove yourself from the family")
    membership, _member = _get_membership(database, family_access.family.id, user_id)
    unassign_member_tasks(database, family_access.family.id, user_id, actor_id=user.id)
    database.delete(membership)
    database.commit()


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

    unassign_member_tasks(database, family.id, user.id, actor_id=user.id)
    database.delete(membership)
    database.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)