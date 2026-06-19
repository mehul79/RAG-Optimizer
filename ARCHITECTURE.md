# Architecture: RAG Pipeline Optimizer

## System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                     Next.js Frontend (Port 3000)                  │
│  ┌──────────┐  ┌─────────────┐  ┌───────────────┐  ┌─────────┐  │
│  │  Upload  │  │   Query     │  │   Dashboard   │  │ History │  │
│  │  + Docs  │  │  Interface  │  │  Radar+Bars   │  │   List  │  │
│  └──────────┘  └─────────────┘  └───────────────┘  └─────────┘  │
└───────────────────────┬─────────────────────────────────────────┘
                        │ REST + SSE (Server-Sent Events)
┌───────────────────────▼─────────────────────────────────────────┐
│                  FastAPI Backend (Port 8000)                      │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    API Router                            │    │
│  │  POST /documents/upload    GET  /documents               │    │
│  │  POST /experiments/run     GET  /experiments/{id}        │    │
│  │  GET  /experiments/{id}/stream  (SSE)                    │    │
│  │  GET  /analytics/summary   GET  /analytics/cost          │    │
│  └──────────────────────────┬──────────────────────────────┘    │
│                             │                                     │
│  ┌──────────────────────────▼──────────────────────────────┐    │
│  │              Pipeline Orchestrator                        │    │
│  │         asyncio.gather() — true parallel execution       │    │
│  │         SSE progress events emitted per pipeline         │    │
│  └──┬──────────────┬──────────────┬──────────────┬─────────┘    │
│     │              │              │              │               │
│  ┌──▼──┐      ┌────▼───┐    ┌────▼───┐    ┌────▼────┐         │
│  │  P-A│      │  P-B   │    │  P-C   │    │  P-D    │         │
│  │Basln│      │Standrd │    │Advnced │    │Semantic │         │
│  └──┬──┘      └────┬───┘    └────┬───┘    └────┬────┘         │
│     └──────────────┴──────┬───────┴─────────────┘              │
│                           │                                      │
│  ┌────────────────────────▼────────────────────────────────┐    │
│  │               Evaluator Agent                            │    │
│  │     GPT-4o as LLM Judge (structured JSON output)        │    │
│  │     Scores: faithfulness, relevance, precision, cost     │    │
│  │     Anti-bias: randomized pipeline order in prompt       │    │
│  └────────────────────────┬────────────────────────────────┘    │
└───────────────────────────┼──────────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────────┐
│                       Data Layer                                   │
│  ┌─────────────┐    ┌──────────────┐    ┌───────────────────┐   │
│  │  Qdrant     │    │  PostgreSQL  │    │  Redis            │   │
│  │  4 colltns  │    │  experiments │    │  SSE event queue  │   │
│  │  per docset │    │  evaluations │    │  pipeline cache   │   │
│  └─────────────┘    └──────────────┘    └───────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

## Component Breakdown

### 1. Document Ingestion Service (`backend/app/services/ingestion.py`)

Handles upload → parse → chunk × 4 → embed × 4 → index × 4

```
Upload → PyMuPDF/docx2txt → Raw Text
       → ChunkerA (256, fixed)     → MiniLM embed   → Qdrant collection_A
       → ChunkerB (512, overlap)   → OpenAI embed    → Qdrant collection_B
       → ChunkerC (1024, overlap)  → Cohere embed    → Qdrant collection_C
       → ChunkerD (semantic)       → OpenAI-3-large  → Qdrant collection_D
```

Each collection is named `{docset_id}_{pipeline_id}`. Chunking runs in parallel using asyncio; embedding uses async API clients.

### 2. Pipeline Orchestrator (`backend/app/services/orchestrator.py`)

Receives: `(query, document_set_id, experiment_id)`

Spawns 4 concurrent coroutines, one per pipeline. Each coroutine:
1. Retrieve top-K chunks from its Qdrant collection
2. Apply reranker if configured
3. Build prompt with retrieved context
4. Call LLM for generation
5. Record tokens used, latency, cost
6. Push SSE event: `{pipeline: "C", status: "complete", answer: "..."}`

### 3. Evaluator Agent (`backend/app/services/evaluator.py`)

After all 4 pipelines complete, calls GPT-4o with a structured evaluation prompt. The prompt presents all 4 answers in **randomized order** (to avoid position bias) and requests JSON output:

```json
{
  "evaluations": [
    {
      "pipeline_id": "C",
      "faithfulness": 8.5,
      "answer_relevance": 9.0,
      "context_precision": 7.5,
      "reasoning": "Answer is grounded in chunks 2 and 4..."
    }
  ]
}
```

### 4. Cost Calculator (`backend/app/services/cost.py`)

Tracks actual token usage via API responses and applies pricing:

| Model | Input $/1M | Output $/1M | Embed $/1M tokens |
|-------|-----------|------------|-------------------|
| GPT-4o | $2.50 | $10.00 | — |
| GPT-4o-mini | $0.15 | $0.60 | — |
| OpenAI text-3-small | — | — | $0.02 |
| OpenAI text-3-large | — | — | $0.13 |
| Cohere embed-v3 | — | — | $0.10 |
| Cohere Rerank v3 | — | — | $2.00/1K searches |
| MiniLM-L6 (local) | $0 | $0 | $0 |

### 5. Real-Time SSE Stream (`backend/app/api/routes/experiments.py`)

```
GET /api/v1/experiments/{id}/stream → text/event-stream

Events:
  data: {"type": "pipeline_start", "pipeline": "A"}
  data: {"type": "pipeline_complete", "pipeline": "A", "answer": "...", "latency_ms": 1823}
  data: {"type": "evaluation_complete", "scores": {...}}
  data: {"type": "experiment_done", "winner": "C", "summary": "..."}
```

Frontend consumes this with the EventSource API to update the UI progressively.

## Technology Choices

### Backend
| Technology | Why |
|-----------|-----|
| **FastAPI** | Native async, automatic OpenAPI docs, Pydantic v2 validation |
| **uv** | 10–100× faster than pip for dependency resolution |
| **Qdrant** | Best-in-class performance, Docker-native, supports named collections cleanly |
| **PostgreSQL** | Relational data for experiments/evaluations, JSONB for flexible metadata |
| **Redis** | Pub/sub for SSE event propagation across workers |
| **asyncio + httpx** | True concurrent pipeline execution without thread overhead |
| **Pydantic v2** | Schema validation for all pipeline configs and evaluation outputs |

### Frontend
| Technology | Why |
|-----------|-----|
| **Next.js 14 (App Router)** | File-based routing, server components for initial data, TypeScript native |
| **Tailwind CSS + shadcn/ui** | Rapid UI without custom CSS; accessible components out of the box |
| **TanStack Query** | Intelligent caching, background refetch for experiment polling |
| **Recharts** | Radar chart + bar chart support with good React integration |
| **EventSource API** | Native SSE consumption for real-time pipeline results |

### Infrastructure
| Technology | Why |
|-----------|-----|
| **Docker Compose** | Orchestrates Qdrant + PostgreSQL + Redis + backend + frontend locally |
| **Render** | Free tier for backend; no Kubernetes complexity for MVP |

## Directory Structure

```
rag_pipeline_optimizer/
├── backend/
│   ├── pyproject.toml              # uv project config
│   ├── uv.lock
│   ├── app/
│   │   ├── main.py                 # FastAPI app factory
│   │   ├── core/
│   │   │   ├── config.py           # Settings via pydantic-settings
│   │   │   ├── database.py         # SQLAlchemy async engine
│   │   │   └── redis.py            # Redis connection pool
│   │   ├── api/
│   │   │   ├── deps.py             # FastAPI dependencies
│   │   │   └── routes/
│   │   │       ├── documents.py    # Upload + listing
│   │   │       ├── experiments.py  # Run + SSE stream + results
│   │   │       └── analytics.py    # Aggregated stats
│   │   ├── models/
│   │   │   ├── db.py               # SQLAlchemy ORM models
│   │   │   └── schemas.py          # Pydantic request/response schemas
│   │   ├── services/
│   │   │   ├── ingestion.py        # Document parse → chunk → embed → index
│   │   │   ├── pipelines/
│   │   │   │   ├── base.py         # Abstract pipeline class
│   │   │   │   ├── pipeline_a.py   # Baseline (MiniLM, 256, no rerank)
│   │   │   │   ├── pipeline_b.py   # Standard (OpenAI, 512)
│   │   │   │   ├── pipeline_c.py   # Advanced (Cohere, 1024, rerank)
│   │   │   │   └── pipeline_d.py   # Semantic (OpenAI-3-large, semantic chunk)
│   │   │   ├── orchestrator.py     # asyncio.gather over 4 pipelines
│   │   │   ├── evaluator.py        # GPT-4o judge agent
│   │   │   ├── cost.py             # Token counting + pricing
│   │   │   └── vector_store.py     # Qdrant client wrapper
│   │   └── migrations/             # Alembic migrations
│   └── tests/
│       ├── conftest.py
│       ├── test_pipelines.py
│       └── test_evaluator.py
├── frontend/
│   ├── package.json
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx            # Landing / upload
│   │   │   ├── experiments/
│   │   │   │   ├── page.tsx        # Experiments list
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx    # Live results + dashboard
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   │   ├── upload/
│   │   │   │   └── DocumentUploader.tsx
│   │   │   ├── pipeline/
│   │   │   │   ├── PipelineCard.tsx
│   │   │   │   └── PipelineStream.tsx
│   │   │   └── dashboard/
│   │   │       ├── RadarChart.tsx
│   │   │       ├── CostBar.tsx
│   │   │       └── WinnerBadge.tsx
│   │   └── lib/
│   │       ├── api.ts              # API client (fetch wrappers)
│   │       └── sse.ts              # SSE EventSource hook
├── docker/
│   ├── docker-compose.yml
│   ├── docker-compose.prod.yml
│   ├── backend.Dockerfile
│   └── frontend.Dockerfile
├── .claude/
│   └── settings.json
├── CLAUDE.md
├── ARCHITECTURE.md
├── PROBLEM_STATEMENT.md
├── DEVELOPMENT_PLAN.md
└── README.md
```

## Database Schema

```sql
-- Uploaded document sets
CREATE TABLE document_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    file_count INTEGER DEFAULT 0,
    total_tokens INTEGER,
    status TEXT DEFAULT 'processing',  -- processing | ready | failed
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Per-pipeline indexing status (4 rows per document_set)
CREATE TABLE pipeline_indexes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_set_id UUID REFERENCES document_sets(id),
    pipeline_id TEXT NOT NULL,          -- 'A' | 'B' | 'C' | 'D'
    chunk_count INTEGER,
    qdrant_collection TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Experiment = one query run against one document set
CREATE TABLE experiments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_set_id UUID REFERENCES document_sets(id),
    query TEXT NOT NULL,
    status TEXT DEFAULT 'running',      -- running | complete | failed
    winner_pipeline TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- One row per pipeline per experiment
CREATE TABLE pipeline_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID REFERENCES experiments(id),
    pipeline_id TEXT NOT NULL,
    retrieved_chunks JSONB,             -- [{content, score, metadata}]
    answer TEXT,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    embedding_tokens INTEGER,
    latency_ms INTEGER,
    cost_usd NUMERIC(10, 6),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Evaluation scores per pipeline run
CREATE TABLE evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_run_id UUID REFERENCES pipeline_runs(id),
    faithfulness NUMERIC(4,2),
    answer_relevance NUMERIC(4,2),
    context_precision NUMERIC(4,2),
    overall_score NUMERIC(4,2),         -- weighted average
    reasoning TEXT,
    evaluated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Data Flow: End-to-End Request

```
1. User uploads HR_Policies.pdf
2. Backend: parse → extract text (PyMuPDF)
3. Backend: 4× parallel chunk+embed+index jobs → Qdrant
4. Frontend polls document_set status until "ready"
5. User types: "What is the parental leave policy?"
6. POST /experiments/run → experiment_id returned immediately
7. Frontend opens EventSource to /experiments/{id}/stream
8. Orchestrator spawns 4 async pipeline coroutines
9. Each coroutine: query Qdrant → (optional rerank) → LLM call
10. As each completes: publish SSE event → frontend card updates
11. After all 4 complete: Evaluator calls GPT-4o judge
12. Scores written to DB → SSE "experiment_done" event
13. Frontend shows radar chart + ranked table + winner badge
```
