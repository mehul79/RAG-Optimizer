import app.compat  # must be first — patches RAGAS import before any ragas import  # noqa: F401

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from sqlalchemy import select, text, update

from app.core.config import settings
from app.core.database import AsyncSessionLocal, engine
from app.models.db import AppSetting, Base, DocumentSet, Experiment, QueryBatch


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # ponytail: create_all doesn't alter existing tables; hand-rolled ALTER
        # instead of Alembic — switch to migrations if schema churn picks up
        await conn.execute(
            text("ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS error TEXT")
        )
        await conn.execute(
            text("ALTER TABLE experiments ADD COLUMN IF NOT EXISTS batch_id VARCHAR")
        )
    async with AsyncSessionLocal() as session:
        # Load saved API key overrides from DB into live settings
        rows = (await session.execute(select(AppSetting))).scalars().all()
        for row in rows:
            if hasattr(settings, row.key):
                setattr(settings, row.key, row.value)
        # In-flight work died with the previous process — mark it failed so
        # the frontend doesn't poll a status that will never change
        await session.execute(
            update(DocumentSet).where(DocumentSet.status == "processing").values(status="failed")
        )
        await session.execute(
            update(Experiment).where(Experiment.status == "running").values(status="failed")
        )
        await session.execute(
            update(QueryBatch)
            .where(QueryBatch.status.in_(["generating", "running"]))
            .values(status="failed")
        )
        await session.commit()
    yield


app = FastAPI(
    title="RAG Pipeline Optimizer",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3031",
        "http://127.0.0.1:3031",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.api.routes import analytics, batches, documents, experiments, settings as settings_router  # noqa: E402

app.include_router(documents.router)
app.include_router(experiments.router)
app.include_router(batches.router)
app.include_router(analytics.router)
app.include_router(settings_router.router)


@app.get("/health")
async def health():
    return {"status": "ok", "environment": settings.environment}
