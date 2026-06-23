import json

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


async def _llm_json(prompt: str) -> dict:
    r = await _get_client().chat.completions.create(
        model=settings.ragas_llm_model,
        response_format={"type": "json_object"},
        temperature=0,
        messages=[
            {"role": "system", "content": "You are a RAG evaluation assistant. Return only valid JSON."},
            {"role": "user", "content": prompt},
        ],
    )
    return json.loads(r.choices[0].message.content)


# ── Pure scoring functions (no I/O — unit-testable) ──────────────────────────

def score_faithfulness(claims: list[dict]) -> float:
    supported = sum(1 for c in claims if c.get("supported", False))
    return round(supported / len(claims), 4) if claims else 0.0


def score_relevancy(questions: list[dict]) -> float:
    if not questions:
        return 0.0
    return round(sum(q.get("similarity_to_original", 0.0) for q in questions) / len(questions), 4)


def score_precision(chunks_eval: list[dict]) -> float:
    """Rank-weighted precision — same formula as RAGAS context_precision_without_reference."""
    useful_count = 0
    precision_at_k = []
    for i, chunk in enumerate(chunks_eval):
        if chunk.get("useful", False):
            useful_count += 1
            precision_at_k.append(useful_count / (i + 1))
    return round(sum(precision_at_k) / useful_count, 4) if useful_count > 0 else 0.0


# ── Single-call evaluation ────────────────────────────────────────────────────

async def evaluate_pipeline(query: str, answer: str, contexts: list[str]) -> dict:
    """All three RAGAS-style metrics in ONE judge call instead of three round-trips."""
    ctx_text = "\n\n".join(f"[Chunk {i + 1}]\n{c}" for i, c in enumerate(contexts))
    data = await _llm_json(f"""Query: {query}

Answer: {answer}

Retrieved Chunks (in retrieval rank order — Chunk 1 was ranked highest):
{ctx_text}

Perform three independent evaluations:

1. FAITHFULNESS — Extract every distinct factual claim made in the answer. For each claim, check whether it can be directly inferred from the retrieved chunks above.

2. ANSWER RELEVANCY — Generate 3 questions that this answer most directly responds to. For each, score how closely it aligns with the ORIGINAL query semantically (0.0 = unrelated, 1.0 = same intent). Then write a one-sentence verdict on what the answer covered well and what it missed.

3. CONTEXT PRECISION — For each retrieved chunk, determine whether it contains information useful for answering the query.

Return JSON:
{{
  "claims": [
    {{
      "claim": "exact claim text from the answer",
      "supported": true,
      "evidence": "exact quote from a chunk that supports it, or 'Not found in retrieved context'"
    }}
  ],
  "generated_questions": [
    {{
      "question": "...",
      "similarity_to_original": 0.0,
      "reason": "why this aligns or diverges from the original query"
    }}
  ],
  "verdict": "...",
  "chunks": [
    {{
      "rank": 1,
      "useful": true,
      "reason": "one sentence explaining why this chunk is or is not useful for answering the query"
    }}
  ]
}}""")

    claims = data.get("claims", [])
    questions = data.get("generated_questions", [])
    chunks_eval = data.get("chunks", [])

    faith_score = score_faithfulness(claims)
    rel_score = score_relevancy(questions)
    prec_score = score_precision(chunks_eval)

    return {
        "faithfulness": faith_score,
        "answer_relevancy": rel_score,
        "context_precision": prec_score,
        "overall_score": round((faith_score + rel_score + prec_score) / 3, 4),
        "transparency_data": {
            "faithfulness": {"claims": claims},
            "answer_relevancy": {
                "generated_questions": questions,
                "verdict": data.get("verdict", ""),
            },
            "context_precision": {"chunks": chunks_eval},
        },
    }
