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
    llm_model: str


# OpenAI's recommended model for new projects; override with LLM_MODEL (e.g. a lower-cost model).
DEFAULT_LLM_MODEL = "gpt-6-astra"
SQLITE_PREFIX = "sqlite:///"
DEFAULT_DATABASE_URL = "sqlite:///data/app.db"


def _resolve_database_url(database_url: str) -> str:
    """Anchor a relative SQLite file to the backend directory, whatever the working directory is."""
    if not database_url.startswith(SQLITE_PREFIX):
        return database_url
    path = database_url[len(SQLITE_PREFIX):]
    if not path or path == ":memory:" or Path(path).is_absolute():
        return database_url
    absolute_path = (BACKEND_DIR / path).resolve()
    absolute_path.parent.mkdir(parents=True, exist_ok=True)
    return f"{SQLITE_PREFIX}{absolute_path}"


@lru_cache
def get_settings() -> Settings:
    chroma_path = Path(os.getenv("CHROMA_PERSIST_DIR", "data/chroma"))
    if not chroma_path.is_absolute():
        chroma_path = BACKEND_DIR / chroma_path

    return Settings(
        app_name=os.getenv("APP_NAME", "CareCircle API"),
        environment=os.getenv("ENVIRONMENT", "development"),
        frontend_origin=os.getenv("FRONTEND_ORIGIN", "http://localhost:5173"),
        database_url=_resolve_database_url(os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)),
        session_cookie_name=os.getenv("SESSION_COOKIE_NAME", "family_session"),
        session_lifetime_seconds=int(os.getenv("SESSION_LIFETIME_SECONDS", "2592000")),
        session_cookie_secure=os.getenv("SESSION_COOKIE_SECURE", "false").lower() == "true",
        chroma_persist_directory=chroma_path,
        llm_model=os.getenv("LLM_MODEL", DEFAULT_LLM_MODEL),
    )


settings = get_settings()