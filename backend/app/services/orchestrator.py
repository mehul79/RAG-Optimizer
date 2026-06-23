import asyncio
import json

from app.core.database import AsyncSessionLocal
from app.core.redis import get_redis
from app.models.db import Evaluation, Experiment, PipelineRun
from app.services import evaluator as eval_svc
from app.services import vector_store as vs
from app.services.cost import generation_cost
from app.services.generator import generate_answer
from app.services.pipelines.pipeline_a import PipelineA
from app.services.pipelines.pipeline_b import PipelineB
from app.services.pipelines.pipeline_c import PipelineC
from app.services.pipelines.pipeline_d import PipelineD

_PIPELINES = [PipelineA(), PipelineB(), PipelineC(), PipelineD()]


async def _run_single_pipeline(pipeline, doc_set_id: str, query: str) -> dict:
    collection = f"{doc_set_id}_{pipeline.pipeline_id}"

    query_vector = await pipeline.embed_query(query)
    chunk_texts = await vs.search(collection, query_vector, pipeline.top_k)

    ranked = await pipeline.rerank(query, chunk_texts, top_k=min(5, len(chunk_texts)))
    top_chunks = [r.text for r in ranked]

    gen = await generate_answer(query, top_chunks, pipeline.generator_model)
    cost = generation_cost(pipeline.generator_model, gen.prompt_tokens, gen.completion_tokens)

    return {
        "pipeline_id": pipeline.pipeline_id,
        "answer": gen.answer,
        "retrieved_chunks": top_chunks,
        "prompt_tokens": gen.prompt_tokens,
        "completion_tokens": gen.completion_tokens,
        "latency_ms": gen.latency_ms,
        "cost_usd": cost,
    }


async def run_experiment(experiment_id: str, doc_set_id: str, query: str) -> None:
    redis = get_redis()
    channel = f"experiment:{experiment_id}"

    async def run_and_notify(pipeline):
        try:
            result = await _run_single_pipeline(pipeline, doc_set_id, query)
            await redis.publish(channel, json.dumps({"type": "pipeline_complete", **result}))
            return result
        except Exception as e:
            err = {"type": "pipeline_error", "pipeline_id": pipeline.pipeline_id, "error": str(e)}
            await redis.publish(channel, json.dumps(err))
            return {"pipeline_id": pipeline.pipeline_id, "error": str(e)}

    # Run all 4 pipelines concurrently
    all_results = await asyncio.gather(*[run_and_notify(p) for p in _PIPELINES])
    results = [r for r in all_results if "error" not in r]

    # Persist pipeline runs — failed ones too, so errors survive a reload
    run_ids: dict[str, str] = {}
    async with AsyncSessionLocal() as session:
        for r in all_results:
            run = PipelineRun(
                experiment_id=experiment_id,
                pipeline_id=r["pipeline_id"],
                answer=r.get("answer"),
                retrieved_chunks=r.get("retrieved_chunks"),
                prompt_tokens=r.get("prompt_tokens"),
                completion_tokens=r.get("completion_tokens"),
                latency_ms=r.get("latency_ms"),
                cost_usd=r.get("cost_usd"),
                error=r.get("error"),
            )
            session.add(run)
            await session.flush()
            run_ids[r["pipeline_id"]] = str(run.id)
        await session.commit()

    # RAGAS evaluation (one per pipeline, sequential to respect rate limits)
    eval_scores: dict[str, dict] = {}
    for r in results:
        try:
            scores = await eval_svc.evaluate_pipeline(query, r["answer"], r["retrieved_chunks"] or [])
            eval_scores[r["pipeline_id"]] = scores
            await redis.publish(channel, json.dumps({
                "type": "eval_complete",
                "pipeline_id": r["pipeline_id"],
                **scores,
            }))
        except Exception as e:
            await redis.publish(channel, json.dumps({
                "type": "eval_error",
                "pipeline_id": r["pipeline_id"],
                "error": str(e),
            }))

    # Persist evaluations + determine winner
    winner: str | None = None
    best_score = -1.0
    async with AsyncSessionLocal() as session:
        for pipeline_id, scores in eval_scores.items():
            run_id = run_ids.get(pipeline_id)
            if not run_id:
                continue
            ev = Evaluation(
                pipeline_run_id=run_id,
                faithfulness=scores["faithfulness"],
                answer_relevancy=scores["answer_relevancy"],
                context_precision=scores["context_precision"],
                overall_score=scores["overall_score"],
                transparency_data=scores.get("transparency_data"),
            )
            session.add(ev)
            if scores["overall_score"] > best_score:
                best_score = scores["overall_score"]
                winner = pipeline_id

        exp = await session.get(Experiment, experiment_id)
        if exp:
            exp.status = "complete"
            exp.winner_pipeline = winner
        await session.commit()

    await redis.publish(channel, json.dumps({
        "type": "experiment_done",
        "experiment_id": experiment_id,
        "winner_pipeline": winner,
    }))
    await redis.aclose()
