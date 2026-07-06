from dataclasses import dataclass, field

from app.services.rerankers.base import RankedChunk


@dataclass
class RetrievalResult:
    chunks: list[str]
    scores: list[float]
    embedding_tokens: int = 0


class BasePipeline:
    pipeline_id: str
    vector_dim: int
    top_k: int
    generator_model: str

    # Subclasses assign instances directly as class attributes
    chunker: object
    embedder: object
    reranker: object | None = None

    def chunk(self, text: str) -> list[str]:
        return self.chunker.chunk(text)  # type: ignore[attr-defined]

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return await self.embedder.embed_documents(texts)  # type: ignore[attr-defined]

    async def embed_query(self, text: str) -> list[float]:
        return await self.embedder.embed_query(text)  # type: ignore[attr-defined]

    async def rerank(self, query: str, chunks: list[str], top_k: int) -> list[RankedChunk]:
        if self.reranker is None:
            return [RankedChunk(text=c, score=1.0, original_index=i) for i, c in enumerate(chunks[:top_k])]
        return await self.reranker.rerank(query, chunks, top_k)  # type: ignore[attr-defined]
