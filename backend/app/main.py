import app.compat  # must be first — patches RAGAS import before any ragas import  # noqa: F401

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal, engine
from app.models.db import AppSetting, Base


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # Load saved API key overrides from DB into live settings
    async with AsyncSessionLocal() as session:
        rows = (await session.execute(select(AppSetting))).scalars().all()
        for row in rows:
            if hasattr(settings, row.key):
                setattr(settings, row.key, row.value)
    yield


app = FastAPI(
    title="RAG Pipeline Optimizer",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.api.routes import analytics, documents, experiments, settings as settings_router  # noqa: E402

app.include_router(documents.router)
app.include_router(experiments.router)
app.include_router(analytics.router)
app.include_router(settings_router.router)


@app.get("/health")
async def health():
    return {"status": "ok", "environment": settings.environment}
