import asyncio
import logging
from io import BytesIO
from pathlib import Path

import pymupdf
import pymupdf4llm

from app.core.database import AsyncSessionLocal
from app.models.db import DocumentSet, PipelineIndex
from app.services import vector_store as vs
from app.services.pipelines.pipeline_a import PipelineA
from app.services.pipelines.pipeline_b import PipelineB
from app.services.pipelines.pipeline_c import PipelineC
from app.services.pipelines.pipeline_d import PipelineD

logger = logging.getLogger(__name__)

_PIPELINES = [PipelineA(), PipelineB(), PipelineC(), PipelineD()]


def parse_document(content: bytes, filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix == ".pdf":
        doc = pymupdf.open(stream=content, filetype="pdf")
        return pymupdf4llm.to_markdown(doc)
    elif suffix in (".txt", ".md"):
        return content.decode("utf-8", errors="ignore")
    elif suffix == ".docx":
        import docx
        doc = docx.Document(BytesIO(content))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    raise ValueError(f"Unsupported file type: {suffix}")


async def _index_one_pipeline(pipeline, doc_set_id: str, text: str) -> bool:
    """Chunk + embed + index a single pipeline. Own DB session — runs concurrently
    with the other 3 pipelines, and AsyncSession isn't safe to share across tasks."""
    collection = f"{doc_set_id}_{pipeline.pipeline_id}"

    async with AsyncSessionLocal() as session:
        idx = PipelineIndex(
            document_set_id=doc_set_id,
            pipeline_id=pipeline.pipeline_id,
            qdrant_collection=collection,
            status="indexing",
        )
        session.add(idx)
        await session.commit()
        idx_id = idx.id

    try:
        # chunk() is sync and CPU-bound (semantic chunker runs local sentence
        # embeddings) — offload so it doesn't block the event loop
        chunks = await asyncio.get_running_loop().run_in_executor(None, pipeline.chunk, text)
        await vs.ensure_collection(collection, pipeline.vector_dim)
        vectors = await pipeline.embed_documents(chunks)
        await vs.upsert_chunks(collection, chunks, vectors)
        chunk_count, status, success = len(chunks), "ready", True
    except Exception as e:
        logger.error(
            "Pipeline %s indexing failed for %s: %s", pipeline.pipeline_id, doc_set_id, e, exc_info=True
        )
        chunk_count, status, success = None, "failed", False

    async with AsyncSessionLocal() as session:
        idx = await session.get(PipelineIndex, idx_id)
        if idx:
            idx.chunk_count = chunk_count
            idx.status = status
        await session.commit()

    return success


async def index_document_set(doc_set_id: str, text: str) -> None:
    """Background task: chunk + embed + index into Qdrant for all 4 pipelines,
    concurrently — each pipeline's cost is dominated by network latency to its
    own embedding provider, so running them in parallel is ~4x faster than
    the previous sequential loop."""
    results = await asyncio.gather(
        *[_index_one_pipeline(pipeline, doc_set_id, text) for pipeline in _PIPELINES]
    )

    async with AsyncSessionLocal() as session:
        ds = await session.get(DocumentSet, doc_set_id)
        if ds:
            ds.status = "failed" if not all(results) else "ready"
        await session.commit()
