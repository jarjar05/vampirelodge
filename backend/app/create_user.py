"""Provision a user from the terminal, as an alternative to signing up in the app."""

from getpass import getpass

from sqlalchemy import select

from app.database import SessionLocal
from app.models import User
from app.schemas.auth import MIN_PASSWORD_LENGTH
from app.utils.passwords import hash_password


def main() -> None:
    email = input("Email: ").strip().lower()
    name = input("Name: ").strip()
    password = getpass("Password: ")
    confirmation = getpass("Confirm password: ")

    if not email or not name:
        raise SystemExit("Email and name are required.")
    if password != confirmation:
        raise SystemExit("Passwords do not match.")
    if len(password) < MIN_PASSWORD_LENGTH:
        raise SystemExit(f"Use a password with at least {MIN_PASSWORD_LENGTH} characters.")

    with SessionLocal.begin() as database:
        if database.scalar(select(User.id).where(User.email == email)) is not None:
            raise SystemExit("A user with that email already exists.")
        database.add(User(email=email, name=name, password_hash=hash_password(password)))

    print("User created. You can now sign in.")


if __name__ == "__main__":
    main()