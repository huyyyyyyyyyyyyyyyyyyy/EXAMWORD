from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import achievements, admin, attempts, auth, dashboard, exams, media
from app.config import settings
from app.database import Base, SessionLocal, engine
from app.models import *  # noqa: F401,F403 - register model metadata
from app.services.seed import seed_database


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_database(db)
    yield


app = FastAPI(title="ExamWorld API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in (
    auth.router,
    exams.router,
    dashboard.router,
    attempts.router,
    achievements.router,
    admin.router,
    media.router,
):
    app.include_router(router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
