import cohere

from app.core.config import settings
from app.services.rerankers.base import BaseReranker, RankedChunk

_client: cohere.AsyncClientV2 | None = None


def _get_client() -> cohere.AsyncClientV2:
    global _client
    if _client is None:
        _client = cohere.AsyncClientV2(api_key=settings.cohere_api_key)
    return _client


class CohereReranker(BaseReranker):
    def __init__(self, model: str = "rerank-v3.5"):
        self.model = model

    async def rerank(self, query: str, chunks: list[str], top_k: int) -> list[RankedChunk]:
        response = await _get_client().rerank(
            query=query,
            documents=chunks,
            model=self.model,
            top_n=top_k,
        )
        return [
            RankedChunk(text=chunks[r.index], score=r.relevance_score, original_index=r.index)
            for r in response.results
        ]
