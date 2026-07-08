from typing import TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer

_model: "SentenceTransformer | None" = None


def _get_model() -> "SentenceTransformer":
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer

        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


class SemanticChunker:
    def __init__(self, threshold: float = 0.5, min_chunk_chars: int = 100):
        self.threshold = threshold
        self.min_chunk_chars = min_chunk_chars

    def chunk(self, text: str) -> list[str]:
        sentences = [s.strip() for s in text.replace("\n", " ").split(". ") if s.strip()]
        if len(sentences) <= 1:
            return [text]

        model = _get_model()
        embeddings = model.encode(sentences, normalize_embeddings=True)

        chunks: list[str] = []
        current: list[str] = [sentences[0]]

        for i in range(1, len(sentences)):
            sim = float(np.dot(embeddings[i - 1], embeddings[i]))
            if sim < self.threshold and len(" ".join(current)) >= self.min_chunk_chars:
                chunks.append(" ".join(current))
                current = [sentences[i]]
            else:
                current.append(sentences[i])

        if current:
            chunks.append(" ".join(current))

        return chunks
