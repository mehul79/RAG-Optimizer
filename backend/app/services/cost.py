from dataclasses import dataclass

# USD per 1M input tokens, USD per 1M output tokens
_LLM_PRICES: dict[str, tuple[float, float]] = {
    "openai/gpt-4o-mini": (0.15, 0.60),
    "openai/gpt-4o": (2.50, 10.00),
    "meta-llama/llama-3.3-70b-instruct": (0.0, 0.0),  # free tier
}

# USD per 1M embedding tokens
_EMBED_PRICES: dict[str, float] = {
    "text-embedding-ada-002": 0.10,
    "text-embedding-3-large": 0.13,
    "text-embedding-3-small": 0.02,
    "embed-english-v3.0": 0.10,
    "all-MiniLM-L6-v2": 0.0,
}

# USD per 1K rerank searches
_COHERE_RERANK_PER_1K = 2.00


@dataclass
class CostBreakdown:
    generation_usd: float = 0.0
    embedding_usd: float = 0.0
    rerank_usd: float = 0.0

    @property
    def total_usd(self) -> float:
        return self.generation_usd + self.embedding_usd + self.rerank_usd


def generation_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    in_price, out_price = _LLM_PRICES.get(model, (0.0, 0.0))
    return (prompt_tokens * in_price + completion_tokens * out_price) / 1_000_000


def embedding_cost(model: str, token_count: int) -> float:
    price = _EMBED_PRICES.get(model, 0.0)
    return token_count * price / 1_000_000


def rerank_cost(n_searches: int = 1) -> float:
    return n_searches * _COHERE_RERANK_PER_1K / 1000
