import uuid

from qdrant_client import AsyncQdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams

from app.core.config import settings

_client: AsyncQdrantClient | None = None


def _get_client() -> AsyncQdrantClient:
    global _client
    if _client is None:
        _client = AsyncQdrantClient(url=settings.qdrant_url)
    return _client


async def ensure_collection(name: str, vector_dim: int) -> None:
    client = _get_client()
    existing = await client.get_collections()
    names = {c.name for c in existing.collections}
    if name not in names:
        await client.create_collection(
            collection_name=name,
            vectors_config=VectorParams(size=vector_dim, distance=Distance.COSINE),
        )


async def upsert_chunks(collection: str, chunks: list[str], vectors: list[list[float]]) -> None:
    points = [
        PointStruct(
            id=str(uuid.uuid4()),
            vector=vectors[i],
            payload={"text": chunks[i], "chunk_index": i},
        )
        for i in range(len(chunks))
    ]
    await _get_client().upsert(collection_name=collection, points=points)


async def search(collection: str, vector: list[float], top_k: int) -> list[str]:
    result = await _get_client().query_points(
        collection_name=collection,
        query=vector,
        limit=top_k,
        with_payload=True,
    )
    return [hit.payload.get("text", "") for hit in result.points]


async def scroll_chunks(collection: str) -> list[str]:
    """All chunk texts in original document order."""
    client = _get_client()
    points: list = []
    offset = None
    while True:
        batch, offset = await client.scroll(
            collection_name=collection,
            limit=256,
            offset=offset,
            with_payload=True,
            with_vectors=False,
        )
        points.extend(batch)
        if offset is None:
            break
    points.sort(key=lambda p: p.payload.get("chunk_index", 0))
    return [p.payload.get("text", "") for p in points]


async def delete_collection(name: str) -> None:
    client = _get_client()
    existing = await client.get_collections()
    names = {c.name for c in existing.collections}
    if name in names:
        await client.delete_collection(name)
