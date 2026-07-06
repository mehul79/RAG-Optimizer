from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class RankedChunk:
    text: str
    score: float
    original_index: int


class BaseReranker(ABC):
    @abstractmethod
    async def rerank(self, query: str, chunks: list[str], top_k: int) -> list[RankedChunk]:
        ...
