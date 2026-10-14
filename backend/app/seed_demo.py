"""Fill a family with demo members and tasks for local testing.

    python -m app.seed_demo [--email you@example.com] [--reset]

Demo members get @demo.invalid emails and random passwords, so they cannot sign in.
"""

import argparse
import secrets
import string
import sys
from datetime import datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.init_db import initialize_database
from app.models import Family, FamilyMembership, Task, User
from app.services.tasks import record_activity
from app.utils.passwords import hash_password

DEMO_EMAIL_DOMAIN = "@demo.invalid"
DEMO_MEMBERS = [
    ("David Rivera", "Son", "Away today", None),
    ("Jason Rivera", "Grandson", "Available", None),
    ("Linda Chen", "Caregiver", "On duty", None),
]
# (title, detail, location, days from today, hour, minute, assignee, priority, status)
# The assignee "me" is the signed-in user the demo is created for.
DEMO_TASKS = [
    ("Pay medical bill", "Riverside Family Practice · invoice due today", "Riverside Family Practice", 0, 16, 0, None, "High", "Open"),
    ("Pick up medication", "Oak Pharmacy · blood pressure tablets", "Oak Pharmacy", 0, 17, 30, "me", "High", "Open"),
    ("Prepare GP appointment notes", "Bring medication list and recent blood pressure readings", None, 1, 9, 45, "me", "Normal", "Open"),
    ("Bring Mum to SGH", "Leave home by 8:15 AM for the specialist appointment", "Singapore General Hospital", 4, 8, 15, "David Rivera", "High", "Open"),
    ("Buy groceries", "Use Mum’s list on the kitchen counter", "Mum’s home and nearby grocery store", 0, 18, 0, "Jason Rivera", "Normal", "Open"),
    ("Set out evening medication", "Prepare the labelled pill organiser for tonight", None, 0, 19, 0, "Linda Chen", "High", "Open"),
    ("Call clinic to confirm appointment", "Ask whether Mum should fast before the blood test", None, 3, 9, 0, "me", "Normal", "Open"),
    ("Call Mum after lunch", "See how she is feeling and ask about groceries", None, -1, 13, 15, "me", "Low", "Completed"),
]


def _local_time(days_from_today: int, hour: int, minute: int) -> datetime:
    day = datetime.now().astimezone() + timedelta(days=days_from_today)
    return day.replace(hour=hour, minute=minute, second=0, microsecond=0)


def _find_user(database: Session, email: str | None) -> User:
    if email:
        user = database.scalar(select(User).where(User.email == email.strip().lower()))
        if user is None:
            sys.exit(f"No account found for {email}. Create one with: python -m app.create_user")
        return user
    users = database.scalars(select(User).where(~User.email.endswith(DEMO_EMAIL_DOMAIN))).all()
    if len(users) != 1:
        sys.exit(f"Found {len(users)} accounts; pass --email to choose one.")
    return users[0]


def _ensure_family(database: Session, user: User) -> Family:
    membership = database.scalar(select(FamilyMembership).where(FamilyMembership.user_id == user.id))
    if membership is not None:
        return database.get_one(Family, membership.family_id)
    invite_code = "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(10))
    family = Family(name="Rivera Family", invite_code=invite_code)
    database.add(family)
    database.flush()
    database.add(FamilyMembership(family_id=family.id, user_id=user.id, role="ADMIN"))
    return family


def _reset(database: Session, family: Family) -> None:
    for task in database.scalars(select(Task).where(Task.family_id == family.id)).all():
        database.delete(task)
    demo_users = database.scalars(
        select(User)
        .join(FamilyMembership, FamilyMembership.user_id == User.id)
        .where(FamilyMembership.family_id == family.id, User.email.endswith(DEMO_EMAIL_DOMAIN))
    ).all()
    for demo_user in demo_users:
        database.execute(delete(FamilyMembership).where(FamilyMembership.user_id == demo_user.id))
        database.delete(demo_user)
    database.flush()


def seed(database: Session, user: User, reset: bool = False) -> str:
    family = _ensure_family(database, user)
    if reset:
        _reset(database, family)
    existing_tasks = database.scalar(select(func.count()).select_from(Task).where(Task.family_id == family.id))
    if existing_tasks:
        database.commit()
        return f"{family.name} already has {existing_tasks} tasks; nothing added. Use --reset to replace them."

    people: dict[str, User] = {"me": user}
    for name, relationship_label, availability, note in DEMO_MEMBERS:
        email = f"{name.split()[0].lower()}.{secrets.token_hex(4)}{DEMO_EMAIL_DOMAIN}"
        member = User(email=email, name=name, password_hash=hash_password(secrets.token_urlsafe(32)))
        database.add(member)
        database.flush()
        database.add(FamilyMembership(
            family_id=family.id,
            user_id=member.id,
            role="MEMBER",
            relationship_label=relationship_label,
            availability=availability,
            availability_note=note,
        ))
        people[name] = member

    tasks: dict[str, Task] = {}
    for title, detail, location, days, hour, minute, assignee_key, priority, status in DEMO_TASKS:
        assignee = people[assignee_key] if assignee_key else None
        task = Task(
            family_id=family.id,
            title=title,
            detail=detail,
            location=location,
            due_at=_local_time(days, hour, minute),
            assignee_id=assignee.id if assignee else None,
            priority=priority,
            status=status,
            created_by_id=user.id,
            completed_at=_local_time(days, hour, minute) if status == "Completed" else None,
        )
        database.add(task)
        record_activity(task, user.id, "Created", "Added to the household delegation board")
        if assignee is not None:
            record_activity(task, user.id, "Assigned", f"Assigned to {assignee.name}")
            if status == "Completed":
                record_activity(task, assignee.id, "Completed", "Marked this task complete")
        tasks[title] = task
    database.flush()


    database.commit()
    return f"Added {len(DEMO_MEMBERS)} demo members and {len(DEMO_TASKS)} tasks to {family.name}."


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--email", help="Account to seed for. Optional when only one account exists.")
    parser.add_argument("--reset", action="store_true", help="Delete the family's tasks and demo members first.")
    arguments = parser.parse_args()

    initialize_database()
    with SessionLocal() as database:
        print(seed(database, _find_user(database, arguments.email), reset=arguments.reset))


if __name__ == "__main__":
    main()
