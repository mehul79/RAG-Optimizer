from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_db
from app.models.db import DocumentSet, Experiment, PipelineRun, QueryBatch
from app.models.schemas import (
    ExperimentResponse,
    PipelineRollup,
    QueryBatchCreate,
    QueryBatchCreatedResponse,
    QueryBatchQuestionsUpdate,
    QueryBatchResponse,
)
from app.services.testset import generate_batch, replace_questions, start_batch

router = APIRouter(prefix="/batches", tags=["batches"])


@router.post("", response_model=QueryBatchCreatedResponse, status_code=202)
async def create_batch(
    body: QueryBatchCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    ds = await db.get(DocumentSet, body.document_set_id)
    if not ds:
        raise HTTPException(404, "Document set not found")
    if ds.status != "ready":
        raise HTTPException(409, f"Document set is not ready (status={ds.status})")

    count = max(5, min(20, body.count))
    batch = QueryBatch(document_set_id=body.document_set_id)
    db.add(batch)
    await db.commit()
    await db.refresh(batch)

    background_tasks.add_task(generate_batch, batch.id, body.document_set_id, count)
    return {"batch_id": batch.id, "status": "generating"}


@router.patch("/{batch_id}/questions", response_model=QueryBatchCreatedResponse)
async def update_questions(
    batch_id: str,
    body: QueryBatchQuestionsUpdate,
    db: AsyncSession = Depends(get_db),
):
    batch = await db.get(QueryBatch, batch_id)
    if not batch:
        raise HTTPException(404, "Batch not found")
    if batch.status != "review":
        raise HTTPException(409, f"Batch is not awaiting review (status={batch.status})")

    questions = [q.strip() for q in body.questions if q.strip()]
    if not questions:
        raise HTTPException(400, "At least one question is required")

    await replace_questions(batch_id, batch.document_set_id, questions)
    return {"batch_id": batch_id, "status": "review"}


@router.post("/{batch_id}/start", response_model=QueryBatchCreatedResponse, status_code=202)
async def start(
    batch_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    batch = await db.get(QueryBatch, batch_id)
    if not batch:
        raise HTTPException(404, "Batch not found")
    if batch.status != "review":
        raise HTTPException(409, f"Batch is not awaiting review (status={batch.status})")

    batch.status = "running"
    await db.commit()

    background_tasks.add_task(start_batch, batch_id, batch.document_set_id)
    return {"batch_id": batch_id, "status": "running"}


@router.post("/{batch_id}/cancel", response_model=QueryBatchCreatedResponse)
async def cancel_batch(batch_id: str, db: AsyncSession = Depends(get_db)):
    batch = await db.get(QueryBatch, batch_id)
    if not batch:
        raise HTTPException(404, "Batch not found")
    if batch.status != "running":
        raise HTTPException(409, f"Batch is not running (status={batch.status})")
    # The runner checks this flag between questions; the current question
    # finishes (its calls are already in flight) and nothing further runs
    batch.status = "cancelled"
    await db.commit()
    return {"batch_id": batch_id, "status": "cancelled"}


@router.delete("/{batch_id}", status_code=204)
async def delete_batch(batch_id: str, db: AsyncSession = Depends(get_db)):
    batch = await db.get(QueryBatch, batch_id)
    if not batch:
        raise HTTPException(404, "Batch not found")
    # Cascade: experiments → pipeline_runs → evaluations (DB-level ON DELETE CASCADE)
    await db.execute(delete(Experiment).where(Experiment.batch_id == batch_id))
    await db.delete(batch)
    await db.commit()


def _rollup(experiments: list[Experiment]) -> list[PipelineRollup]:
    by_pipeline: dict[str, list[PipelineRun]] = {}
    wins: dict[str, int] = {}
    for exp in experiments:
        if exp.winner_pipeline:
            wins[exp.winner_pipeline] = wins.get(exp.winner_pipeline, 0) + 1
        for run in exp.pipeline_runs:
            by_pipeline.setdefault(run.pipeline_id, []).append(run)

    def avg(values: list[float | None]) -> float | None:
        vals = [v for v in values if v is not None]
        return round(sum(vals) / len(vals), 4) if vals else None

    return [
        PipelineRollup(
            pipeline_id=pid,
            win_count=wins.get(pid, 0),
            avg_faithfulness=avg([r.evaluation.faithfulness if r.evaluation else None for r in runs]),
            avg_answer_relevancy=avg([r.evaluation.answer_relevancy if r.evaluation else None for r in runs]),
            avg_context_precision=avg([r.evaluation.context_precision if r.evaluation else None for r in runs]),
            avg_overall_score=avg([r.evaluation.overall_score if r.evaluation else None for r in runs]),
            total_cost_usd=round(sum(r.cost_usd or 0 for r in runs), 6),
        )
        for pid, runs in sorted(by_pipeline.items())
    ]


@router.get("/{batch_id}", response_model=QueryBatchResponse)
async def get_batch(batch_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(QueryBatch)
        .where(QueryBatch.id == batch_id)
        .options(
            selectinload(QueryBatch.experiments)
            .selectinload(Experiment.pipeline_runs)
            .selectinload(PipelineRun.evaluation)
        )
    )
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(404, "Batch not found")

    experiments = sorted(batch.experiments, key=lambda e: e.created_at)
    return QueryBatchResponse(
        id=batch.id,
        document_set_id=batch.document_set_id,
        status=batch.status,
        question_count=batch.question_count,
        completed_count=sum(1 for e in experiments if e.status == "complete"),
        created_at=batch.created_at,
        rollup=_rollup(experiments),
        experiments=[ExperimentResponse.model_validate(e) for e in experiments],
    )


@router.get("", response_model=list[QueryBatchResponse])
async def list_batches(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(QueryBatch)
        .order_by(QueryBatch.created_at.desc())
        .options(
            selectinload(QueryBatch.experiments)
            .selectinload(Experiment.pipeline_runs)
            .selectinload(PipelineRun.evaluation)
        )
    )
    batches = result.scalars().all()
    return [
        QueryBatchResponse(
            id=b.id,
            document_set_id=b.document_set_id,
            status=b.status,
            question_count=b.question_count,
            completed_count=sum(1 for e in b.experiments if e.status == "complete"),
            created_at=b.created_at,
            rollup=_rollup(list(b.experiments)),
            experiments=[],
        )
        for b in batches
    ]
