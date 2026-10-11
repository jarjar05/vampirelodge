"""Create database tables for local development and hackathon deployments."""

from sqlalchemy import inspect, text
from sqlalchemy.schema import CreateColumn

import app.models  # noqa: F401 - importing registers models on Base.metadata
from app.database import Base, engine


def _add_missing_columns() -> None:
    """Add columns that were introduced after a table was first created.

    create_all only creates missing tables. This covers the simple cases of a
    new nullable or defaulted column and a new index; anything else still needs a migration.
    """
    inspector = inspect(engine)
    with engine.begin() as connection:
        for table in Base.metadata.sorted_tables:
            existing = {column["name"] for column in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name not in existing:
                    definition = CreateColumn(column).compile(dialect=engine.dialect)
                    connection.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN {definition}'))
            # create_all also skips new indexes on tables that already exist.
            existing_indexes = {index["name"] for index in inspector.get_indexes(table.name)}
            for index in table.indexes:
                if index.name not in existing_indexes:
                    index.create(bind=connection)


def _retire_in_progress_status() -> None:
    """Tasks no longer need accepting, so ones left "In progress" by the old accept step become plain open tasks."""
    with engine.begin() as connection:
        connection.execute(text("UPDATE tasks SET status = 'Open' WHERE status = 'In progress'"))


def initialize_database() -> None:
    """Create tables declared by the application's SQLAlchemy models."""
    Base.metadata.create_all(bind=engine)
    _add_missing_columns()
    _retire_in_progress_status()


if __name__ == "__main__":
    initialize_database()
    print("Database tables initialized.")
