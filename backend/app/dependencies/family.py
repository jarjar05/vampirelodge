from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import AuthenticatedUser
from app.models import Family, FamilyMembership


@dataclass(frozen=True)
class FamilyAccess:
    family: Family
    membership: FamilyMembership


def require_family_member(user: AuthenticatedUser, database: Annotated[Session, Depends(get_db)]) -> FamilyAccess:
    membership = database.scalar(
        select(FamilyMembership).where(FamilyMembership.user_id == user.id)
    )
    if membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="You do not belong to a family")

    family = database.get(Family, membership.family_id)
    if family is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family not found")
    return FamilyAccess(family=family, membership=membership)


FamilyMemberContext = Annotated[FamilyAccess, Depends(require_family_member)]