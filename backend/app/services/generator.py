import time
from dataclasses import dataclass

from openai import AsyncOpenAI

from app.core.config import settings

_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            api_key=settings.openrouter_api_key,
            base_url=settings.openrouter_base_url,
        )
    return _client


@dataclass
class GenerationResult:
    answer: str
    prompt_tokens: int
    completion_tokens: int
    latency_ms: int


async def generate_answer(query: str, chunks: list[str], model: str) -> GenerationResult:
    context = "\n\n".join(f"[{i + 1}] {c}" for i, c in enumerate(chunks))

    t0 = time.monotonic()
    response = await _get_client().chat.completions.create(
        model=model,
        messages=[
            {
                "role": "system",
                "content": "Answer the question using only the provided context. Be concise and accurate.",
            },
            {
                "role": "user",
                "content": f"Context:\n{context}\n\nQuestion: {query}",
            },
        ],
        temperature=0,
    )
    latency_ms = int((time.monotonic() - t0) * 1000)

    return GenerationResult(
        answer=response.choices[0].message.content or "",
        prompt_tokens=response.usage.prompt_tokens,
        completion_tokens=response.usage.completion_tokens,
        latency_ms=latency_ms,
    )
