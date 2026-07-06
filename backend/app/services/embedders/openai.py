from openai import AsyncOpenAI

from app.core.config import settings
from app.services.embedders.base import BaseEmbedder

_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            api_key=settings.openrouter_api_key,
            base_url=settings.openrouter_base_url,
        )
    return _client


class OpenAIEmbedder(BaseEmbedder):
    def __init__(self, model: str = "text-embedding-ada-002"):
        self.model = model
        self.vector_dim = 3072 if "large" in model else 1536

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        results: list[list[float]] = []
        for i in range(0, len(texts), 512):
            response = await _get_client().embeddings.create(model=self.model, input=texts[i:i+512])
            results.extend(item.embedding for item in response.data)
        return results

    async def embed_query(self, text: str) -> list[float]:
        response = await _get_client().embeddings.create(model=self.model, input=[text])
        return response.data[0].embedding
