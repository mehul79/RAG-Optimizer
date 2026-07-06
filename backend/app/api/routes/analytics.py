from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models.db import Evaluation, Experiment, PipelineRun
from app.models.schemas import AnalyticsSummaryResponse, PipelineStats

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/summary", response_model=AnalyticsSummaryResponse)
async def get_summary(db: AsyncSession = Depends(get_db)):
    total = await db.scalar(select(func.count()).select_from(Experiment))

    rows = await db.execute(
        select(
            PipelineRun.pipeline_id,
            func.avg(Evaluation.faithfulness).label("avg_faithfulness"),
            func.avg(Evaluation.answer_relevancy).label("avg_answer_relevancy"),
            func.avg(Evaluation.context_precision).label("avg_context_precision"),
            func.avg(Evaluation.overall_score).label("avg_overall_score"),
            func.avg(PipelineRun.latency_ms).label("avg_latency_ms"),
            func.sum(PipelineRun.cost_usd).label("total_cost_usd"),
        )
        .join(Evaluation, Evaluation.pipeline_run_id == PipelineRun.id, isouter=True)
        .group_by(PipelineRun.pipeline_id)
        .order_by(PipelineRun.pipeline_id)
    )

    wins = await db.execute(
        select(Experiment.winner_pipeline, func.count().label("cnt"))
        .where(Experiment.winner_pipeline.isnot(None))
        .group_by(Experiment.winner_pipeline)
    )
    win_map = {row.winner_pipeline: row.cnt for row in wins}

    stats = [
        PipelineStats(
            pipeline_id=row.pipeline_id,
            avg_faithfulness=row.avg_faithfulness,
            avg_answer_relevancy=row.avg_answer_relevancy,
            avg_context_precision=row.avg_context_precision,
            avg_overall_score=row.avg_overall_score,
            avg_latency_ms=row.avg_latency_ms,
            total_cost_usd=row.total_cost_usd,
            win_count=win_map.get(row.pipeline_id, 0),
        )
        for row in rows
    ]

    return AnalyticsSummaryResponse(total_experiments=total or 0, pipeline_stats=stats)
