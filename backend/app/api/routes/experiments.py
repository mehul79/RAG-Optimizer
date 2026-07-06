import asyncio
import json

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_db
from app.core.redis import get_redis
from app.models.db import DocumentSet, Experiment, PipelineRun
from app.models.schemas import ExperimentCreate, ExperimentCreatedResponse, ExperimentResponse
from app.services.orchestrator import run_experiment

router = APIRouter(prefix="/experiments", tags=["experiments"])


@router.post("/run", response_model=ExperimentCreatedResponse, status_code=202)
async def create_experiment(
    body: ExperimentCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    ds = await db.get(DocumentSet, body.document_set_id)
    if not ds:
        raise HTTPException(404, "Document set not found")
    if ds.status != "ready":
        raise HTTPException(409, f"Document set is not ready (status={ds.status})")

    exp = Experiment(document_set_id=body.document_set_id, query=body.query)
    db.add(exp)
    await db.commit()
    await db.refresh(exp)

    background_tasks.add_task(run_experiment, exp.id, body.document_set_id, body.query)

    return {"experiment_id": exp.id, "status": "running"}


@router.get("/{experiment_id}", response_model=ExperimentResponse)
async def get_experiment(experiment_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Experiment)
        .where(Experiment.id == experiment_id)
        .options(
            selectinload(Experiment.pipeline_runs).selectinload(PipelineRun.evaluation)
        )
    )
    exp = result.scalar_one_or_none()
    if not exp:
        raise HTTPException(404, "Experiment not found")
    return exp


@router.get("", response_model=list[ExperimentResponse])
async def list_experiments(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Experiment)
        .order_by(Experiment.created_at.desc())
        .options(selectinload(Experiment.pipeline_runs).selectinload(PipelineRun.evaluation))
    )
    return result.scalars().all()


@router.delete("/{experiment_id}", status_code=204)
async def delete_experiment(experiment_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Experiment)
        .where(Experiment.id == experiment_id)
        .options(
            selectinload(Experiment.pipeline_runs).selectinload(PipelineRun.evaluation)
        )
    )
    experiment = result.scalar_one_or_none()
    if not experiment:
        raise HTTPException(404, "Experiment not found")
    await db.delete(experiment)
    await db.commit()


@router.get("/{experiment_id}/stream")
async def stream_experiment(experiment_id: str):
    """SSE stream — subscribe to Redis pub/sub for live pipeline events."""
    redis = get_redis()
    pubsub = redis.pubsub()
    await pubsub.subscribe(f"experiment:{experiment_id}")

    async def event_generator():
        try:
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                data = message["data"]
                yield f"data: {data}\n\n"
                # Close stream once experiment is done
                try:
                    if json.loads(data).get("type") == "experiment_done":
                        break
                except (json.JSONDecodeError, AttributeError):
                    pass
        except asyncio.CancelledError:
            pass
        finally:
            await pubsub.unsubscribe(f"experiment:{experiment_id}")
            await redis.aclose()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
