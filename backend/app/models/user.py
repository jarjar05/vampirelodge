import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, Index, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, validates

from app.database import Base, UTCDateTime


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("email = lower(email)", name="ck_users_email_lowercase"),
        # A named index rather than unique=True, so init_db can add it to a table that already exists.
        Index("ix_users_phone", "phone", unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True)
    # Optional second sign-in identifier, stored in international format, e.g. +6591234567.
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    # A small image stored inline as a data URL; the client resizes it before upload.
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, server_default=func.now())

    @validates("email")
    def normalize_email(self, _key: str, email: str) -> str:
        normalized_email = email.strip().lower()
        if not normalized_email:
            raise ValueError("Email must not be empty")
        return normalized_email