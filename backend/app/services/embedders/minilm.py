from sentence_transformers import SentenceTransformer

from app.services.embedders.base import BaseEmbedder

_model: SentenceTransformer | None = None


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


class MiniLMEmbedder(BaseEmbedder):
    vector_dim = 384

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return _get_model().encode(texts, normalize_embeddings=True).tolist()

    async def embed_query(self, text: str) -> list[float]:
        return _get_model().encode(text, normalize_embeddings=True).tolist()
