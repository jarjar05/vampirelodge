from collections.abc import Generator
from datetime import datetime, timezone

from sqlalchemy import DateTime, create_engine, event
from sqlalchemy.engine import Dialect, make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool
from sqlalchemy.types import TypeDecorator

from app.config import settings


class Base(DeclarativeBase):
    """Base class for SQLAlchemy models."""


class UTCDateTime(TypeDecorator[datetime]):
    """A timestamp that is always stored in UTC and always read back timezone-aware.

    SQLite has no timezone support and would otherwise return naive datetimes,
    which the API would serialize without an offset and browsers would read as local time.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    def process_result_value(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


_is_sqlite = make_url(settings.database_url).get_backend_name() == "sqlite"

engine = create_engine(
    settings.database_url,
    # Kept connections can go stale, so each is checked before use. As a function every request opens a fresh one,
    # so the check would only cost a round trip.
    pool_pre_ping=not settings.serverless,
    # FastAPI runs sync endpoints in a thread pool, so one request can touch a connection from several threads.
    # Postgres: Supabase's transaction pooler cannot keep prepared statements, so psycopg must not make any.
    connect_args={"check_same_thread": False} if _is_sqlite else {"prepare_threshold": None},
    # As a function, connections are not kept between requests; Supabase's pooler keeps them instead.
    **({"poolclass": NullPool} if settings.serverless else {}),
)

if _is_sqlite:
    @event.listens_for(engine, "connect")
    def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record) -> None:  # type: ignore[no-untyped-def]
        # SQLite ignores ON DELETE CASCADE / SET NULL unless this is switched on per connection.
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
    """Yield a database session and always close it after the request."""
    database = SessionLocal()
    try:
        yield database
    finally:
        database.close()
