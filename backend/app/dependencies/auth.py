from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User
from app.services.auth import get_user_for_session

DatabaseSession = Annotated[Session, Depends(get_db)]


def get_current_user(request: Request, database: DatabaseSession) -> User:
    user = get_user_for_session(database, request.cookies.get(settings.session_cookie_name))
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user


AuthenticatedUser = Annotated[User, Depends(get_current_user)]