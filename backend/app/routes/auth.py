import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.dependencies.auth import AuthenticatedUser
from app.models import User
from app.schemas.auth import (
    AuthUserResponse,
    ForgotPasswordRequest,
    LoginRequest,
    PasswordChangeRequest,
    ProfileUpdateRequest,
    RegisterRequest,
    ResetPasswordRequest,
    SignInDetailsUpdateRequest,
)
from app.services import password_reset
from app.services.auth import create_session, revoke_other_sessions, revoke_session
from app.utils.passwords import hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["authentication"])
DatabaseSession = Annotated[Session, Depends(get_db)]


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        max_age=settings.session_lifetime_seconds,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/",
    )


EMAIL_TAKEN = "An account with that email already exists"
PHONE_TAKEN = "An account with that phone number already exists"


def _conflict(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


def _require_unused(database: Session, *, email: str | None = None, phone: str | None = None, except_user: User | None = None) -> None:
    """Reject an email or phone that already signs in a different account."""
    for column, value, detail in ((User.email, email, EMAIL_TAKEN), (User.phone, phone, PHONE_TAKEN)):
        if value is None:
            continue
        owner_id = database.scalar(select(User.id).where(column == value))
        if owner_id is not None and (except_user is None or owner_id != except_user.id):
            raise _conflict(detail)


def _require_current_password(user: User, password: str) -> None:
    # 403 rather than 401: the session is valid, so the app must not treat this as signed out.
    if not verify_password(password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Current password is incorrect")


@router.post("/register", response_model=AuthUserResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, response: Response, database: DatabaseSession) -> User:
    """Create an account and sign it in. The new user has no family until they create or join one."""
    _require_unused(database, email=payload.email, phone=payload.phone)

    user = User(email=payload.email, phone=payload.phone, name=payload.name, password_hash=hash_password(payload.password))
    database.add(user)
    try:
        database.commit()
    except IntegrityError as error:
        # Two sign-ups for the same email or phone raced; the unique index caught the second.
        database.rollback()
        raise _conflict("An account with that email or phone number already exists") from error
    database.refresh(user)

    set_session_cookie(response, create_session(database, user))
    return user


@router.post("/login", response_model=AuthUserResponse)
def login(credentials: LoginRequest, response: Response, database: DatabaseSession) -> User:
    identifier = User.email == credentials.email if credentials.email is not None else User.phone == credentials.phone
    user = database.scalar(select(User).where(identifier))
    if user is None or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid sign-in details or password")

    token = create_session(database, user)
    set_session_cookie(response, token)
    return user


@router.get("/me", response_model=AuthUserResponse)
def read_current_user(user: AuthenticatedUser) -> User:
    return user


@router.patch("/me", response_model=AuthUserResponse)
def update_profile(payload: ProfileUpdateRequest, user: AuthenticatedUser, database: DatabaseSession) -> User:
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("name") is not None:
        user.name = changes["name"]
    if "avatar_url" in changes:
        user.avatar_url = changes["avatar_url"]
    if "overview_layout" in changes:
        user.overview_layout = None if changes["overview_layout"] is None else json.dumps(changes["overview_layout"])
    database.commit()
    database.refresh(user)
    return user


@router.patch("/me/sign-in-details", response_model=AuthUserResponse)
def update_sign_in_details(payload: SignInDetailsUpdateRequest, user: AuthenticatedUser, database: DatabaseSession) -> User:
    """Change the email or phone number used to sign in. Requires the current password."""
    _require_current_password(user, payload.current_password)
    changes = payload.model_dump(exclude_unset=True)
    new_email = changes.get("email")
    _require_unused(database, email=new_email, phone=changes.get("phone"), except_user=user)

    if new_email is not None:
        user.email = new_email
    if "phone" in changes:
        user.phone = changes["phone"]
    try:
        database.commit()
    except IntegrityError as error:
        database.rollback()
        raise _conflict("An account with that email or phone number already exists") from error
    database.refresh(user)
    return user


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(payload: PasswordChangeRequest, request: Request, user: AuthenticatedUser, database: DatabaseSession) -> None:
    """Set a new password and sign the account out on every other device."""
    _require_current_password(user, payload.current_password)
    user.password_hash = hash_password(payload.new_password)
    revoke_other_sessions(database, user, request.cookies.get(settings.session_cookie_name))
    database.commit()


@router.post("/forgot-password", status_code=status.HTTP_204_NO_CONTENT)
def forgot_password(payload: ForgotPasswordRequest, database: DatabaseSession) -> None:
    """Send a reset code to the account's linked Telegram. Always answers the same way, whether or not the account
    exists or can be reached, so it cannot be used to discover who has an account."""
    password_reset.send_code(database, payload.email)


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(payload: ResetPasswordRequest, database: DatabaseSession) -> None:
    """Set a new password using the code from Telegram. Signs the account out everywhere."""
    if not password_reset.reset_with_code(database, payload.email, payload.code, payload.new_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That code is not right or has expired. Ask for a new one.")


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response, database: DatabaseSession) -> None:
    revoke_session(database, request.cookies.get(settings.session_cookie_name))
    response.delete_cookie(
        key=settings.session_cookie_name,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/",
    )