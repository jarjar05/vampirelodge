import json
import re
import uuid
from datetime import datetime
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

MIN_PASSWORD_LENGTH = 12
MAX_AVATAR_URL_LENGTH = 300_000
_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
# International format: a plus sign, country code, then the number; 7 to 15 digits in total.
_PHONE_PATTERN = re.compile(r"^\+[1-9][0-9]{6,14}$")
_PHONE_SEPARATORS = re.compile(r"[\s().-]")
_AVATAR_PATTERN = re.compile(r"^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$")


def normalize_email(email: str) -> str:
    normalized_email = email.strip().lower()
    if not _EMAIL_PATTERN.fullmatch(normalized_email):
        raise ValueError("Enter a valid email address")
    return normalized_email


def normalize_phone(phone: str) -> str:
    """Strip spacing and punctuation so "+65 9123-4567" and "+6591234567" are the same number."""
    normalized_phone = _PHONE_SEPARATORS.sub("", phone)
    if not _PHONE_PATTERN.fullmatch(normalized_phone):
        raise ValueError("Enter the phone number with its country code, for example +65 9123 4567")
    return normalized_phone


def _normalize_name(name: str) -> str:
    value = name.strip()
    if not value:
        raise ValueError("Name must not be empty")
    return value


class LoginRequest(BaseModel):
    """Sign in with either the account's email or its phone number."""

    email: str | None = Field(default=None, max_length=320)
    phone: str | None = Field(default=None, max_length=32)
    password: str = Field(min_length=1, max_length=1024)

    @model_validator(mode="after")
    def exactly_one_identifier(self) -> Self:
        if (self.email is None) == (self.phone is None):
            raise ValueError("Sign in with either an email or a phone number")
        # Sign-in is lenient: a malformed identifier simply matches no account.
        if self.email is not None:
            self.email = self.email.strip().lower()
        if self.phone is not None:
            self.phone = _PHONE_SEPARATORS.sub("", self.phone)
        return self


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    email: str = Field(min_length=3, max_length=320)
    phone: str | None = Field(default=None, max_length=32)
    password: str = Field(min_length=MIN_PASSWORD_LENGTH, max_length=1024)

    _name = field_validator("name")(_normalize_name)
    _email = field_validator("email")(normalize_email)

    @field_validator("phone")
    @classmethod
    def check_phone(cls, phone: str | None) -> str | None:
        return normalize_phone(phone) if phone and phone.strip() else None


# The cards that can appear on the Overview. Keep in step with overviewCards in src/lib/overview-layout.ts.
OverviewCard = Literal["summary", "plan", "schedule", "family", "activity"]


class ProfileUpdateRequest(BaseModel):
    """Fields left out are unchanged. Send `avatar_url: null` to remove the picture, and `overview_layout: null`
    to go back to the default Overview."""

    name: str | None = Field(default=None, min_length=1, max_length=150)
    avatar_url: str | None = Field(default=None, max_length=MAX_AVATAR_URL_LENGTH)
    # The cards to show, in order. An empty list is allowed: an Overview with only the greeting.
    overview_layout: list[OverviewCard] | None = Field(default=None, max_length=12)

    @field_validator("overview_layout")
    @classmethod
    def no_repeats(cls, layout: list[str] | None) -> list[str] | None:
        if layout is not None and len(set(layout)) != len(layout):
            raise ValueError("Each card can appear once")
        return layout

    @field_validator("name")
    @classmethod
    def check_name(cls, name: str | None) -> str | None:
        return None if name is None else _normalize_name(name)

    @field_validator("avatar_url")
    @classmethod
    def check_avatar(cls, avatar_url: str | None) -> str | None:
        if avatar_url is not None and not _AVATAR_PATTERN.fullmatch(avatar_url):
            raise ValueError("Profile picture must be a JPEG, PNG, or WebP image")
        return avatar_url


class SignInDetailsUpdateRequest(BaseModel):
    """Change the email or phone used to sign in. Fields left out are unchanged; `phone: null` removes it."""

    current_password: str = Field(min_length=1, max_length=1024)
    email: str | None = Field(default=None, max_length=320)
    phone: str | None = Field(default=None, max_length=32)

    @field_validator("email")
    @classmethod
    def check_email(cls, email: str | None) -> str | None:
        return None if email is None else normalize_email(email)

    @field_validator("phone")
    @classmethod
    def check_phone(cls, phone: str | None) -> str | None:
        return normalize_phone(phone) if phone and phone.strip() else None


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=1024)
    new_password: str = Field(min_length=MIN_PASSWORD_LENGTH, max_length=1024)


class ForgotPasswordRequest(BaseModel):
    email: str = Field(max_length=320)

    _email = field_validator("email")(normalize_email)


class ResetPasswordRequest(BaseModel):
    email: str = Field(max_length=320)
    code: str = Field(min_length=1, max_length=12)
    new_password: str = Field(min_length=MIN_PASSWORD_LENGTH, max_length=1024)

    _email = field_validator("email")(normalize_email)


class AuthUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    phone: str | None
    name: str
    avatar_url: str | None
    created_at: datetime
    # None means the person has not customised their Overview.
    overview_layout: list[str] | None = None

    @field_validator("overview_layout", mode="before")
    @classmethod
    def read_layout(cls, value: object) -> list[str] | None:
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
            except ValueError:
                return None
            return [item for item in parsed if isinstance(item, str)] if isinstance(parsed, list) else None
        return value  # type: ignore[return-value]
