# RAG Pipeline Optimizer

Stop guessing which RAG configuration is best for your data. Upload your documents, run a query, and see side-by-side how 4 different chunking/embedding/reranking strategies perform — scored by an AI judge on accuracy, relevance, and cost.

## The Problem

Every RAG system is built on unvalidated assumptions. Is `chunk_size=512` better than `1024` for your HR policies? Is Cohere's embedder worth the cost over a free local model? Without systematic evaluation, teams are guessing.

## What It Does

1. **Upload** your document corpus (PDF, DOCX, TXT — up to 50MB)
2. **Ask** a question
3. **Watch** 4 pipelines run in parallel and stream results in real-time
4. **See** a radar chart + cost breakdown ranked by an GPT-4o evaluation judge
5. **Get** a recommendation: *"Pipeline C is 23% more accurate at 8% higher cost"*

## The 4 Pipelines

| Pipeline | Embedder | Chunk Size | Reranker | Est. Cost/Query |
|----------|----------|-----------|----------|----------------|
| A — Baseline | MiniLM-L6 (free, local) | 256 tokens | None | ~$0.0002 |
| B — Standard | OpenAI text-3-small | 512 + overlap | None | ~$0.0008 |
| C — Advanced | Cohere embed-v3 | 1024 + overlap | Cohere Rerank v3 | ~$0.006 |
| D — Semantic | OpenAI text-3-large | Semantic split | Cross-encoder | ~$0.003 |

## Evaluation Metrics

Each pipeline is scored independently using **RAGAS** (industry-standard RAG evaluation framework):
- **Faithfulness** — Is the answer grounded in the retrieved chunks? (NLI-style claim extraction)
- **Answer Relevancy** — Does it fully address the question?
- **Context Precision** — Were the retrieved chunks actually useful?
- **Cost per 1K queries** — Computed from real token counts × current pricing

No single LLM judge comparing all 4 pipelines — each is evaluated in isolation, eliminating position bias by design.

## Quick Start

### Prerequisites
- Docker + Docker Compose
- Node.js 20+
- Python 3.12+
- [uv](https://docs.astral.sh/uv/getting-started/installation/)

### 1. Clone and configure

```bash
git clone <repo>
cd rag_pipeline_optimizer
cp backend/.env.example backend/.env
# Edit backend/.env — add OPENAI_API_KEY and COHERE_API_KEY
```

### 2. Start infrastructure

```bash
docker-compose up -d
# Starts PostgreSQL, Qdrant, Redis
```

### 3. Run backend

```bash
cd backend
uv sync
uv run python -m uvicorn app.main:app --host 127.0.0.1 --port 8082 --reload
```

No Alembic — tables are created automatically via `Base.metadata.create_all` on backend startup.

### 4. Run frontend

```bash
cd frontend
npm install
npm run dev
# Open http://localhost:3031
```

## Architecture

```
Next.js (3031) → FastAPI (8082) → 4 async pipelines → LLM judge
                                        ↓                    ↓
                                   Qdrant (6333)       PostgreSQL (5432)
                                   Redis (6379)
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full technical breakdown.


