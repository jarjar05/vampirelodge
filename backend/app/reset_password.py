"""Set a new password for an account from the terminal, for someone who forgot theirs and has no Telegram linked.

    python -m app.reset_password you@example.com
"""

import sys
from getpass import getpass

from sqlalchemy import select

from app.database import SessionLocal
from app.models import User
from app.schemas.auth import MIN_PASSWORD_LENGTH
from app.services.password_reset import set_password


def main() -> None:
    email = (sys.argv[1] if len(sys.argv) > 1 else input("Email: ")).strip().lower()
    with SessionLocal() as database:
        user = database.scalar(select(User).where(User.email == email))
        if user is None:
            raise SystemExit(f"No account found for {email}.")
        password = getpass(f"New password for {user.name}: ")
        if password != getpass("Confirm new password: "):
            raise SystemExit("Passwords do not match.")
        if len(password) < MIN_PASSWORD_LENGTH:
            raise SystemExit(f"Use a password with at least {MIN_PASSWORD_LENGTH} characters.")
        set_password(database, user, password)
        database.commit()
    print("Password changed. They have been signed out everywhere and can now sign in with the new password.")


if __name__ == "__main__":
    main()
