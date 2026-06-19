# Problem Statement: RAG Pipeline Optimizer

## The Core Problem

Every production Retrieval-Augmented Generation (RAG) system is built on a stack of unvalidated assumptions. Engineers pick `chunk_size=512` because they read it in a tutorial. They choose OpenAI embeddings because they're familiar. They skip reranking to save cost. None of these decisions are ever tested against the company's actual data.

The consequence: RAG systems that "work" but never reach their potential. A system returning 60% relevant answers when the right configuration could deliver 85% — and the team never knows.

## Why This Is Hard to Fix Today

### Problem 1: No Standardized Evaluation Framework
RAGAS, TruLens, and DeepEval exist but require engineering investment to integrate. Most teams evaluate RAG manually: a PM asks 10 questions and "it seems okay." This doesn't scale.

### Problem 2: The Ground Truth Bottleneck
Proper evaluation requires (question, ideal_answer) pairs — ground truth. Most companies don't have this. The solution is using an LLM-as-Judge (GPT-4o) for reference-free evaluation, but this must be done carefully to avoid:
- **Position bias**: Judges consistently prefer the first response shown
- **Verbosity bias**: Judges prefer longer, more confident-sounding answers
- **Self-enhancement bias**: If the same model generates and judges, it favors its own style

### Problem 3: Configuration Space is Enormous
A RAG pipeline has at least 7 tunable dimensions:
| Dimension | Options |
|-----------|---------|
| Chunk size | 128, 256, 512, 1024, 2048 tokens |
| Chunk overlap | 0%, 10%, 20% |
| Chunking strategy | Fixed, Sentence, Semantic, Recursive |
| Embedding model | BERT, OpenAI small/large, Cohere v3 |
| Retrieval top-k | 3, 5, 10 |
| Reranker | None, Cohere, Cross-encoder |
| Generator LLM | GPT-4o-mini, GPT-4o, Claude Haiku/Sonnet |

Testing all combinations is 5 × 3 × 4 × 4 × 3 × 3 × 3 = **6,480 configurations**. The optimizer needs a smart selection strategy.

### Problem 4: The Evaluation ≠ Optimization Gap
Knowing "Pipeline C scored highest on your data" is step one. The harder step is:
- Exporting the winning pipeline config to production
- Understanding *why* Pipeline C won (large chunks? better embeddings? reranking?)
- Per-query-type routing (factual questions → Pipeline A, analytical → Pipeline C)
- Continuous drift detection: does Pipeline C still win after new documents are added?

### Problem 5: Cost Visibility
Teams don't know that their embedding model costs $0.0001/query while a reranker adds $0.0003, pushing total RAG cost to $0.001/query at scale. At 100K queries/day, that's $100/day vs $30/day with a cheaper equivalent pipeline.

## What This System Solves

The RAG Pipeline Optimizer provides:

1. **Automated Pipeline Comparison**: Run 4 curated pipeline configurations against any document corpus, returning side-by-side quality scores in under 60 seconds.

2. **Reference-Free LLM Evaluation**: Uses GPT-4o as an impartial judge with structured prompts that correct for known LLM evaluation biases.

3. **Four Orthogonal Metrics** (based on RAGAS):
   - **Faithfulness** (0–10): Is the answer hallucination-free and grounded in retrieved context?
   - **Answer Relevance** (0–10): Does the answer fully address the question asked?
   - **Context Precision** (0–10): Were the retrieved chunks actually useful (signal-to-noise of retrieval)?
   - **Cost Efficiency** ($/1K queries): Real cost computation from token counts × current model pricing

4. **Visual Radar Dashboard**: Radar charts, cost breakdown bars, and a ranked recommendation: *"For your HR Policy data, Pipeline C achieves 23% higher faithfulness than the baseline at only 8% higher cost."*

5. **Config Export**: Download the winning pipeline configuration as a ready-to-use JSON spec for your production system.

## The Four Predefined Pipelines

| | Pipeline A (Baseline) | Pipeline B (Standard) | Pipeline C (Advanced) | Pipeline D (Semantic) |
|-|----------------------|----------------------|----------------------|----------------------|
| Chunk Size | 256 tokens | 512 tokens | 1024 tokens | Dynamic |
| Chunk Strategy | Fixed | Fixed + overlap | Fixed + large overlap | Semantic similarity |
| Embedding | MiniLM-L6 (local) | OpenAI ada-002 | Cohere embed-v3 | OpenAI text-3-large |
| Retrieval Top-K | 5 | 5 | 10 → rerank → 3 | 10 → rerank → 3 |
| Reranker | None | None | Cohere Rerank v3 | Cross-encoder local |
| Generator | GPT-4o-mini | GPT-4o-mini | GPT-4o | GPT-4o-mini |
| Est. Cost/Query | $0.0002 | $0.0008 | $0.006 | $0.003 |

## Success Criteria

- Users can upload a document corpus and get comparative pipeline results in < 90 seconds
- Evaluation scores are consistent (same query + same pipeline → ±0.5 score variance)
- Cost estimates are within 10% of actual API billing
- Dashboard clearly communicates which pipeline wins and by how much
- System handles documents up to 50MB (approximately 1M tokens)
