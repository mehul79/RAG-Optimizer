import asyncio
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


async def _eval_faithfulness(query: str, answer: str, contexts: list[str]) -> tuple[float, dict]:
    ctx_text = "\n\n".join(f"[Chunk {i + 1}]\n{c}" for i, c in enumerate(contexts))
    data = await _llm_json(f"""Query: {query}

Answer: {answer}

Retrieved Context:
{ctx_text}

Extract every distinct factual claim made in the answer. For each claim, check whether it can be directly inferred from the retrieved context above.

Return JSON:
{{
  "claims": [
    {{
      "claim": "exact claim text from the answer",
      "supported": true,
      "evidence": "exact quote from a chunk that supports it, or 'Not found in retrieved context'"
    }}
  ]
}}""")
    claims = data.get("claims", [])
    supported = sum(1 for c in claims if c.get("supported", False))
    score = supported / len(claims) if claims else 0.0
    return round(score, 4), {"claims": claims}


async def _eval_answer_relevancy(query: str, answer: str) -> tuple[float, dict]:
    data = await _llm_json(f"""Original Query: {query}

Generated Answer: {answer}

1. Generate 3 questions that this answer most directly responds to.
2. For each generated question, score how closely it aligns with the ORIGINAL query semantically (0.0 = unrelated, 1.0 = same intent).
3. Write a one-sentence verdict explaining what the answer covered well and what it missed.

Return JSON:
{{
  "generated_questions": [
    {{
      "question": "...",
      "similarity_to_original": 0.0,
      "reason": "why this aligns or diverges from the original query"
    }}
  ],
  "verdict": "..."
}}""")
    questions = data.get("generated_questions", [])
    score = (
        sum(q.get("similarity_to_original", 0.0) for q in questions) / len(questions)
        if questions else 0.0
    )
    return round(score, 4), {
        "generated_questions": questions,
        "verdict": data.get("verdict", ""),
    }


async def _eval_context_precision(query: str, contexts: list[str]) -> tuple[float, dict]:
    chunks_text = "\n\n".join(f"[Chunk {i + 1}]\n{c}" for i, c in enumerate(contexts))
    data = await _llm_json(f"""Query: {query}

Retrieved Chunks (in retrieval rank order — Chunk 1 was ranked highest):
{chunks_text}

For each chunk, determine whether it contains information useful for answering the query.

Return JSON:
{{
  "chunks": [
    {{
      "rank": 1,
      "useful": true,
      "reason": "one sentence explaining why this chunk is or is not useful for answering the query"
    }}
  ]
}}""")
    chunks_eval = data.get("chunks", [])

    # Weighted precision: same formula as RAGAS context_precision_without_reference
    useful_count = 0
    precision_at_k = []
    for i, chunk in enumerate(chunks_eval):
        if chunk.get("useful", False):
            useful_count += 1
            precision_at_k.append(useful_count / (i + 1))
    score = sum(precision_at_k) / useful_count if useful_count > 0 else 0.0

    return round(score, 4), {"chunks": chunks_eval}


async def evaluate_pipeline(query: str, answer: str, contexts: list[str]) -> dict:
    (faith_score, faith_data), (rel_score, rel_data), (prec_score, prec_data) = await asyncio.gather(
        _eval_faithfulness(query, answer, contexts),
        _eval_answer_relevancy(query, answer),
        _eval_context_precision(query, contexts),
    )

    return {
        "faithfulness": faith_score,
        "answer_relevancy": rel_score,
        "context_precision": prec_score,
        "overall_score": round((faith_score + rel_score + prec_score) / 3, 4),
        "transparency_data": {
            "faithfulness": faith_data,
            "answer_relevancy": rel_data,
            "context_precision": prec_data,
        },
    }
