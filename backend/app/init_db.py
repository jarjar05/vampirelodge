"""Create database tables for local development and hackathon deployments."""

from sqlalchemy import inspect, text
from sqlalchemy.schema import CreateColumn, CreateTable

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


# Columns that have been removed from the tasks table, and tables that have been removed altogether.
_RETIRED_TASK_COLUMNS = ("category", "recipient")
_RETIRED_TABLES = ("appointments",)


def _retire_removed_fields() -> None:
    """Drop the appointments table, and the task category and "for whom" columns, from a database made before
    they were removed. Task rows themselves are kept."""
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    with engine.begin() as connection:
        for table in _RETIRED_TABLES:
            if table in tables:
                connection.execute(text(f'DROP TABLE "{table}"'))
    if "tasks" not in tables or not set(_RETIRED_TASK_COLUMNS) & {column["name"] for column in inspector.get_columns("tasks")}:
        return

    if engine.dialect.name != "sqlite":
        with engine.begin() as connection:
            for column in _RETIRED_TASK_COLUMNS:
                connection.execute(text(f'ALTER TABLE tasks DROP COLUMN IF EXISTS "{column}"'))
        return

    # SQLite cannot drop a column that a CHECK constraint mentions, so the table is rebuilt the way SQLite's
    # documentation describes: make the new shape, copy the rows across, then swap it in for the old one.
    tasks = Base.metadata.tables["tasks"]
    kept = [column.name for column in tasks.columns]
    create = str(CreateTable(tasks).compile(dialect=engine.dialect)).replace("CREATE TABLE tasks", "CREATE TABLE tasks_rebuilt", 1)
    columns = ", ".join(f'"{name}"' for name in kept)
    raw = engine.raw_connection()
    try:
        cursor = raw.cursor()
        # Off while the table is swapped, so the task history that points at tasks is left alone.
        cursor.execute("PRAGMA foreign_keys=OFF")
        cursor.execute("BEGIN")
        cursor.execute(create)
        cursor.execute(f"INSERT INTO tasks_rebuilt ({columns}) SELECT {columns} FROM tasks")
        cursor.execute("DROP TABLE tasks")
        cursor.execute("ALTER TABLE tasks_rebuilt RENAME TO tasks")
        cursor.execute("COMMIT")
    except Exception:
        cursor.execute("ROLLBACK")
        raise
    finally:
        cursor.execute("PRAGMA foreign_keys=ON")
        raw.close()


def _retire_in_progress_status() -> None:
    """Tasks no longer need accepting, so ones left "In progress" by the old accept step become plain open tasks."""
    with engine.begin() as connection:
        connection.execute(text("UPDATE tasks SET status = 'Open' WHERE status = 'In progress'"))


def _fill_task_assignees() -> None:
    """Tasks from before several people could share one: their lead becomes the first (and only) person on it."""
    with engine.begin() as connection:
        connection.execute(text(
            "INSERT INTO task_assignees (task_id, user_id, position) "
            "SELECT id, assignee_id, 0 FROM tasks "
            "WHERE assignee_id IS NOT NULL AND id NOT IN (SELECT task_id FROM task_assignees)"
        ))


def initialize_database() -> None:
    """Create tables declared by the application's SQLAlchemy models."""
    Base.metadata.create_all(bind=engine)
    _retire_removed_fields()
    _add_missing_columns()
    _retire_in_progress_status()
    _fill_task_assignees()


if __name__ == "__main__":
    initialize_database()
    print("Database tables initialized.")
