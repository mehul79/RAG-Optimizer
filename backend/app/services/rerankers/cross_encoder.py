from sentence_transformers import CrossEncoder as _CrossEncoder

from app.services.rerankers.base import BaseReranker, RankedChunk

_model: _CrossEncoder | None = None


def _get_model() -> _CrossEncoder:
    global _model
    if _model is None:
        _model = _CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
    return _model


class CrossEncoderReranker(BaseReranker):
    async def rerank(self, query: str, chunks: list[str], top_k: int) -> list[RankedChunk]:
        pairs = [[query, chunk] for chunk in chunks]
        scores: list[float] = _get_model().predict(pairs).tolist()
        ranked = sorted(
            [RankedChunk(text=chunks[i], score=scores[i], original_index=i) for i in range(len(chunks))],
            key=lambda x: x.score,
            reverse=True,
        )
        return ranked[:top_k]
