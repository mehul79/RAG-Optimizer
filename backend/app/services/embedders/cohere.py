import cohere

from app.core.config import settings
from app.services.embedders.base import BaseEmbedder

_client: cohere.AsyncClientV2 | None = None


def _get_client() -> cohere.AsyncClientV2:
    global _client
    if _client is None:
        _client = cohere.AsyncClientV2(api_key=settings.cohere_api_key)
    return _client


class CohereEmbedder(BaseEmbedder):
    vector_dim = 1024

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        results: list[list[float]] = []
        for i in range(0, len(texts), 96):
            response = await _get_client().embed(
                texts=texts[i:i+96],
                model="embed-english-v3.0",
                input_type="search_document",
                embedding_types=["float"],
            )
            results.extend(response.embeddings.float_)
        return results

    async def embed_query(self, text: str) -> list[float]:
        response = await _get_client().embed(
            texts=[text],
            model="embed-english-v3.0",
            input_type="search_query",
            embedding_types=["float"],
        )
        return response.embeddings.float_[0]
