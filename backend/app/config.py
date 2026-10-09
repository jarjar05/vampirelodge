import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")


@dataclass(frozen=True)
class Settings:
    app_name: str
    environment: str
    frontend_origin: str
    database_url: str
    session_cookie_name: str
    session_lifetime_seconds: int
    session_cookie_secure: bool
    chroma_persist_directory: Path


@lru_cache
def get_settings() -> Settings:
    chroma_path = Path(os.getenv("CHROMA_PERSIST_DIR", "data/chroma"))
    if not chroma_path.is_absolute():
        chroma_path = BACKEND_DIR / chroma_path

    return Settings(
        app_name=os.getenv("APP_NAME", "Family Care Coordinator API"),
        environment=os.getenv("ENVIRONMENT", "development"),
        frontend_origin=os.getenv("FRONTEND_ORIGIN", "http://localhost:5173"),
        database_url=os.getenv("DATABASE_URL", "postgresql+psycopg://localhost/family_care"),
        session_cookie_name=os.getenv("SESSION_COOKIE_NAME", "family_session"),
        session_lifetime_seconds=int(os.getenv("SESSION_LIFETIME_SECONDS", "2592000")),
        session_cookie_secure=os.getenv("SESSION_COOKIE_SECURE", "false").lower() == "true",
        chroma_persist_directory=chroma_path,
    )


settings = get_settings()