from abc import ABC, abstractmethod


class BaseEmbedder(ABC):
    vector_dim: int

    @abstractmethod
    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        ...

    @abstractmethod
    async def embed_query(self, text: str) -> list[float]:
        ...
