"""Save the app's data as a demo snapshot, and put it back before a demo, so every demo starts the same way.

    python -m app.demo_snapshot save       keep a copy of the data as it is now
    python -m app.demo_snapshot restore    replace the data with that copy

Restoring moves every date forward by the time since the snapshot was saved, so a task that was due "tomorrow"
when it was saved is due tomorrow again on the day of the demo. Restore only while the app is stopped
(`npm run demo` does this for you).
"""

import json
import shutil
import socket
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.config import BACKEND_DIR, settings

SNAPSHOT_DIR = BACKEND_DIR / "data" / "demo-snapshot"
# Every stored moment, by table. Shifted together, so the data keeps its shape relative to today.
TIME_COLUMNS = {
    "tasks": ("due_at", "created_at", "completed_at", "overdue_reminded_at"),
    "task_activity": ("created_at",),
    "knowledge_documents": ("created_at",),
    "families": ("created_at",),
    "family_memberships": ("joined_at",),
    "users": ("created_at",),
}
STORED_FORMAT = "%Y-%m-%d %H:%M:%S.%f"


def _database_file() -> Path:
    prefix = "sqlite:///"
    if not settings.database_url.startswith(prefix):
        sys.exit("Demo snapshots only work with the SQLite database.")
    return Path(settings.database_url[len(prefix):])


def _copy_tree(source: Path, target: Path) -> None:
    if target.exists():
        shutil.rmtree(target)
    if source.exists():
        shutil.copytree(source, target)


def save() -> None:
    database = _database_file()
    if not database.exists():
        sys.exit(f"There is no database at {database} to save.")
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    # SQLite's own backup, so the copy is consistent even if the app is running.
    with sqlite3.connect(database) as source, sqlite3.connect(SNAPSHOT_DIR / "app.db") as target:
        source.backup(target)
    _copy_tree(settings.chroma_persist_directory, SNAPSHOT_DIR / "chroma")
    (SNAPSHOT_DIR / "snapshot.json").write_text(json.dumps({"saved_at": datetime.now(timezone.utc).isoformat()}))
    print(f"Demo snapshot saved in {SNAPSHOT_DIR}.")


def _app_is_running() -> bool:
    with socket.socket() as probe:
        probe.settimeout(0.3)
        return probe.connect_ex(("127.0.0.1", 8000)) == 0


def _shift_dates(database: Path, delta: timedelta) -> None:
    with sqlite3.connect(database) as connection:
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        for table, columns in TIME_COLUMNS.items():
            if table not in tables:
                continue
            existing = {row[1] for row in connection.execute(f'PRAGMA table_info("{table}")')}
            for column in (name for name in columns if name in existing):
                rows = connection.execute(f'SELECT rowid, "{column}" FROM "{table}" WHERE "{column}" IS NOT NULL').fetchall()
                for rowid, value in rows:
                    moment = datetime.fromisoformat(str(value))
                    connection.execute(f'UPDATE "{table}" SET "{column}" = ? WHERE rowid = ?', ((moment + delta).strftime(STORED_FORMAT), rowid))


def restore(check_running: bool = True) -> None:
    meta = SNAPSHOT_DIR / "snapshot.json"
    if not meta.exists():
        sys.exit("There is no demo snapshot yet. Save one first with: python -m app.demo_snapshot save")
    if check_running and _app_is_running():
        sys.exit("The app is running. Stop it first: restoring underneath it would corrupt the data.")
    saved_at = datetime.fromisoformat(json.loads(meta.read_text())["saved_at"])
    database = _database_file()
    database.parent.mkdir(parents=True, exist_ok=True)
    # Whole days only, so times of day stay exactly as they were.
    delta = timedelta(days=(datetime.now(timezone.utc).date() - saved_at.date()).days)

    staged = database.with_name(database.name + ".restoring")
    shutil.copyfile(SNAPSHOT_DIR / "app.db", staged)
    _shift_dates(staged, delta)
    for leftover in (database.with_name(database.name + suffix) for suffix in ("-wal", "-shm", "-journal")):
        leftover.unlink(missing_ok=True)
    staged.replace(database)
    _copy_tree(SNAPSHOT_DIR / "chroma", settings.chroma_persist_directory)
    print(f"Demo data restored from the snapshot of {saved_at:%d %b %Y}, with dates moved forward {delta.days} day(s).")


if __name__ == "__main__":
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    if command == "save":
        save()
    elif command == "restore":
        restore()
    else:
        sys.exit(__doc__)
