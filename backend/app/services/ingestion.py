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


async def index_document_set(doc_set_id: str, text: str) -> None:
    """Background task: chunk + embed + index into Qdrant for all 4 pipelines."""
    async with AsyncSessionLocal() as session:
        any_failed = False
        for pipeline in _PIPELINES:
            collection = f"{doc_set_id}_{pipeline.pipeline_id}"
            idx = PipelineIndex(
                document_set_id=doc_set_id,
                pipeline_id=pipeline.pipeline_id,
                qdrant_collection=collection,
                status="indexing",
            )
            session.add(idx)
            await session.flush()

            try:
                chunks = pipeline.chunk(text)
                await vs.ensure_collection(collection, pipeline.vector_dim)
                vectors = await pipeline.embed_documents(chunks)
                await vs.upsert_chunks(collection, chunks, vectors)
                idx.chunk_count = len(chunks)
                idx.status = "ready"
            except Exception as e:
                logger.error("Pipeline %s indexing failed for %s: %s", pipeline.pipeline_id, doc_set_id, e)
                idx.status = "failed"
                any_failed = True

        ds = await session.get(DocumentSet, doc_set_id)
        if ds:
            ds.status = "failed" if any_failed else "ready"
        await session.commit()
