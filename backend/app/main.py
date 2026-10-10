from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routes.appointments import router as appointments_router
from app.routes.auth import router as auth_router
from app.routes.families import router as families_router
from app.routes.health import router as health_router
from app.routes.knowledge import router as knowledge_router
from app.routes.tasks import router as tasks_router
from app.services.chroma_service import initialize_collection


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    initialize_collection()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(families_router)
app.include_router(knowledge_router)
app.include_router(tasks_router)
app.include_router(appointments_router)