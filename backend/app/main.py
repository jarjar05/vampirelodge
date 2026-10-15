from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.init_db import initialize_database
from app.routes.auth import router as auth_router
from app.routes.calendar import router as calendar_router
from app.routes.families import router as families_router
from app.routes.health import router as health_router
from app.routes.knowledge import router as knowledge_router
from app.routes.my_schedule import router as my_schedule_router
from app.routes.schedule import router as schedule_router
from app.routes.tasks import router as tasks_router
from app.routes.telegram import router as telegram_router
from app.services import serverless, telegram_runner
from app.services.chroma_service import initialize_collection


_prepared = False


def prepare() -> None:
    """Get everything ready before the first request. Runs once, however the app is started."""
    global _prepared
    if _prepared:
        return
    _prepared = True
    # Creates missing tables and adds columns introduced since the database was made.
    initialize_database()
    if settings.knowledge_search != "database":
        initialize_collection()
    if settings.serverless:
        serverless.connect_telegram()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    prepare()
    # On a computer the bot waits for messages itself. Does nothing unless TELEGRAM_BOT_TOKEN is set.
    if not settings.serverless:
        telegram_runner.start()
    yield
    telegram_runner.stop()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if settings.serverless:
    @app.middleware("http")
    async def send_reminders_on_the_way(request: Request, call_next):  # type: ignore[no-untyped-def]
        # With nothing running in the background, overdue reminders are checked after ordinary requests.
        response = await call_next(request)
        await run_in_threadpool(serverless.remind_if_due)
        return response

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(families_router)
app.include_router(knowledge_router)
app.include_router(tasks_router)
app.include_router(calendar_router)
app.include_router(telegram_router)
app.include_router(schedule_router)
app.include_router(my_schedule_router)
