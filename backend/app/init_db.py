"""Create database tables for local development and hackathon deployments."""

import app.models  # noqa: F401 - importing registers models on Base.metadata
from app.database import Base, engine


def initialize_database() -> None:
    """Create tables declared by the application's SQLAlchemy models."""
    Base.metadata.create_all(bind=engine)


if __name__ == "__main__":
    initialize_database()
    print("Database tables initialized.")