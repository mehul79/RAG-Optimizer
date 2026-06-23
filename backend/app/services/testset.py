"""Generate a test set of questions from an indexed corpus and run them as a batch."""

import json
import logging
import random

from openai import AsyncOpenAI
from sqlalchemy import delete, select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.db import Experiment, QueryBatch
from app.services import vector_store as vs
from app.services.orchestrator import run_experiment

logger = logging.getLogger(__name__)

# ponytail: reuses pipeline B's collection (512-token chunks) as the question
# source — no corpus text is stored in Postgres, but chunk payloads live in Qdrant
_SOURCE_PIPELINE = "B"
_MAX_EXCERPTS = 15


def sample_chunks(chunks: list[str], n: int = _MAX_EXCERPTS, seed: int | None = None) -> list[str]:
    """Positionally stratified sample: split into n buckets, one random chunk each."""
    chunks = [c for c in chunks if c.strip()]
    if len(chunks) <= n:
        return chunks
    rng = random.Random(seed)
    bucket = len(chunks) / n
    return [chunks[rng.randrange(int(i * bucket), int((i + 1) * bucket))] for i in range(n)]


async def generate_questions(excerpts: list[str], count: int) -> list[str]:
    """One LLM call: diverse questions grounded in the sampled excerpts."""
    client = AsyncOpenAI(
        api_key=settings.openrouter_api_key, base_url=settings.openrouter_base_url
    )
    excerpt_text = "\n\n".join(f"[Excerpt {i + 1}]\n{c}" for i, c in enumerate(excerpts))
    r = await client.chat.completions.create(
        model=settings.ragas_llm_model,
        response_format={"type": "json_object"},
        temperature=0.7,
        messages=[
            {
                "role": "system",
                "content": "You generate evaluation questions for a RAG system. Return only valid JSON.",
            },
            {
                "role": "user",
                "content": f"""Below are excerpts sampled from across a document corpus.

{excerpt_text}

Generate exactly {count} diverse questions a real user would plausibly ask about this corpus:
- ~50% factual lookup questions answerable from a single excerpt
- ~25% multi-hop questions requiring information from 2+ excerpts
- ~15% edge-case/negative questions about things the excerpts suggest are NOT covered
- ~10% aggregate/comparison questions

Return JSON: {{"questions": ["...", "..."]}}""",
            },
        ],
    )
    data = json.loads(r.choices[0].message.content)
    questions = [q.strip() for q in data.get("questions", []) if isinstance(q, str) and q.strip()]
    if not questions:
        raise ValueError("LLM returned no questions")
    return questions[:count]


async def generate_batch(batch_id: str, doc_set_id: str, count: int) -> None:
    """Background task: sample corpus -> generate questions -> park them for review.

    Nothing runs yet. Creates `pending` child Experiment rows and flips the
    batch to `review` so the user can see/edit the questions before any
    pipeline/LLM cost is spent running them.
    """
    try:
        chunks = await vs.scroll_chunks(f"{doc_set_id}_{_SOURCE_PIPELINE}")
        questions = await generate_questions(sample_chunks(chunks), count)
    except Exception as e:
        logger.error("Batch %s question generation failed: %s", batch_id, e)
        async with AsyncSessionLocal() as session:
            batch = await session.get(QueryBatch, batch_id)
            if batch:
                batch.status = "failed"
            await session.commit()
        return

    async with AsyncSessionLocal() as session:
        batch = await session.get(QueryBatch, batch_id)
        if not batch:
            return
        batch.status = "review"
        batch.question_count = len(questions)
        for q in questions:
            session.add(Experiment(
                document_set_id=doc_set_id, batch_id=batch_id, query=q, status="pending",
            ))
        await session.commit()


async def replace_questions(batch_id: str, doc_set_id: str, questions: list[str]) -> None:
    """Overwrite the pending question set for a batch still in review.

    Nothing has run yet at this stage, so the simplest correct move is to
    drop the old pending rows and recreate them from the edited list.
    """
    async with AsyncSessionLocal() as session:
        await session.execute(
            delete(Experiment).where(
                Experiment.batch_id == batch_id, Experiment.status == "pending"
            )
        )
        for q in questions:
            session.add(Experiment(
                document_set_id=doc_set_id, batch_id=batch_id, query=q, status="pending",
            ))
        batch = await session.get(QueryBatch, batch_id)
        if batch:
            batch.question_count = len(questions)
        await session.commit()


async def start_batch(batch_id: str, doc_set_id: str) -> None:
    """Background task: run every pending child experiment sequentially."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Experiment.id, Experiment.query)
            .where(Experiment.batch_id == batch_id, Experiment.status == "pending")
            .order_by(Experiment.created_at)
        )
        pending = result.all()

    # ponytail: sequential to respect rate limits; bounded concurrency if too slow
    for exp_id, query in pending:
        # Cancellation check between questions — a cancel request flips the
        # batch status in the DB and this loop stops before the next spend
        async with AsyncSessionLocal() as session:
            batch = await session.get(QueryBatch, batch_id)
            if not batch or batch.status == "cancelled":
                logger.info("Batch %s cancelled — stopping before next question", batch_id)
                return
            exp = await session.get(Experiment, exp_id)
            if exp:
                exp.status = "running"
                await session.commit()
        try:
            await run_experiment(exp_id, doc_set_id, query)
        except Exception as e:
            logger.error("Batch %s experiment %s failed: %s", batch_id, exp_id, e)

    async with AsyncSessionLocal() as session:
        batch = await session.get(QueryBatch, batch_id)
        if batch and batch.status != "cancelled":
            batch.status = "complete"
        await session.commit()
