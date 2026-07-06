# Development Plan: RAG Pipeline Optimizer

## Phases Overview

| Phase | Focus | Est. Duration | Deliverable |
|-------|-------|--------------|-------------|
| 0 | Project Setup | 1 day | uv backend + Next.js frontend bootstrapped, Docker running |
| 1 | Data Layer | 2 days | PostgreSQL + Qdrant + Redis wired up, Alembic migrations |
| 2 | Document Ingestion | 3 days | Upload API, 4-pipeline chunking + embedding + indexing |
| 3 | Query & Retrieval | 3 days | Parallel pipeline execution, SSE stream |
| 4 | Evaluation Engine | 2 days | GPT-4o judge, cost calculator, DB writes |
| 5 | Frontend | 4 days | Upload UI, live results stream, radar dashboard |
| 6 | Docker + Deploy | 2 days | Multi-service compose, Render deployment |

Total: ~17 days for full MVP

---

## Phase 0: Project Setup

### Backend (uv)
- [ ] `uv init backend --python 3.12`
- [ ] Add core dependencies to `pyproject.toml`:
  ```
  fastapi, uvicorn[standard], sqlalchemy[asyncio], asyncpg, alembic,
  redis[hiredis], qdrant-client, pydantic-settings, python-multipart,
  httpx, openai, cohere, sentence-transformers, pymupdf, python-docx,
  tiktoken, ruff (dev), pytest-asyncio (dev), mypy (dev)
  ```
- [ ] `uv sync` — generates `uv.lock`
- [ ] Create `app/core/config.py` with `pydantic-settings` reading `.env`
- [ ] Create `app/main.py` with FastAPI app + CORS + lifespan

### Frontend (Next.js)
- [ ] `npx create-next-app@latest frontend --typescript --tailwind --app`
- [ ] Add: `shadcn/ui`, `recharts`, `@tanstack/react-query`, `axios`, `react-hook-form`, `lucide-react`
- [ ] Configure `next.config.ts` to proxy `/api` to backend
- [ ] Set up `src/lib/api.ts` base client

### Infrastructure
- [ ] `docker-compose.yml` with: postgres:16, qdrant:latest, redis:7-alpine
- [ ] `.env.example` with all required vars
- [ ] `Makefile` with: `dev`, `test`, `build`, `migrate` targets

---

## Phase 1: Data Layer

### PostgreSQL + SQLAlchemy
- [ ] `app/core/database.py` — async engine, sessionmaker
- [ ] `app/models/db.py` — ORM models: DocumentSet, PipelineIndex, Experiment, PipelineRun, Evaluation
- [ ] Alembic init + first migration
- [ ] `app/api/deps.py` — `get_db()` dependency

### Qdrant Setup
- [ ] `app/services/vector_store.py` — Qdrant async client wrapper
  - `create_collection(name, vector_size)`
  - `upsert_chunks(collection, chunks, vectors)`
  - `search(collection, query_vector, top_k)`
  - `delete_collection(name)`
- [ ] Test: create collection, insert 10 chunks, retrieve

### Redis Setup
- [ ] `app/core/redis.py` — aioredis connection pool
- [ ] SSE event channel pattern: `experiment:{id}:events`
- [ ] Test: publish + subscribe round trip

---

## Phase 2: Document Ingestion

### File Parsing
- [ ] `app/services/ingestion.py` — `DocumentParser` class
  - Support: PDF (PyMuPDF), DOCX (python-docx), TXT
  - Output: `List[RawDocument]` with page/section metadata

### Chunking Strategies
- [ ] `app/services/chunkers/fixed.py` — char-based fixed size with overlap (tiktoken-aware)
- [ ] `app/services/chunkers/semantic.py` — embed sentences, split where cosine drops below threshold

### Pipeline Indexing
- [ ] `app/services/pipelines/base.py` — `BasePipeline(ABC)` with `chunk()`, `embed()`, `index()`
- [ ] `app/services/pipelines/pipeline_a.py` — MiniLM-L6, 256 tokens, no overlap
- [ ] `app/services/pipelines/pipeline_b.py` — OpenAI text-3-small, 512 tokens, 50 overlap
- [ ] `app/services/pipelines/pipeline_c.py` — Cohere embed-v3, 1024 tokens, 100 overlap
- [ ] `app/services/pipelines/pipeline_d.py` — OpenAI text-3-large, semantic chunking

### Upload API
- [ ] `POST /api/v1/documents/upload` — multipart form, accepts PDF/DOCX/TXT up to 50MB
  - Creates `DocumentSet` row (status: processing)
  - Launches background task: parse → 4× index jobs in parallel
  - Returns: `{document_set_id, status: "processing"}`
- [ ] `GET /api/v1/documents` — list document sets with status
- [ ] `GET /api/v1/documents/{id}` — single doc set with indexing progress per pipeline
- [ ] Frontend: file dropzone with progress indicator, polling until status = "ready"

---

## Phase 3: Query & Retrieval

### Pipeline Retrieval
- [ ] Add `retrieve(query, doc_set_id, top_k)` to each pipeline class
  - Embed query with pipeline's embedding model
  - Search Qdrant collection
  - Apply reranker if applicable (Pipeline C: Cohere, Pipeline D: cross-encoder)
  - Return: `RetrievalResult(chunks, scores, tokens_used, latency_ms)`

### Generator
- [ ] `app/services/generator.py` — `generate_answer(query, chunks, model)` 
  - Builds system + user prompt with retrieved context
  - Calls OpenAI API
  - Returns: `GenerationResult(answer, prompt_tokens, completion_tokens, latency_ms)`

### Orchestrator
- [ ] `app/services/orchestrator.py` — `run_experiment(experiment_id, query, doc_set_id)`
  - `asyncio.gather()` over 4 pipeline coroutines
  - After each completes: write PipelineRun to DB, publish SSE event
  - On all complete: trigger evaluator

### Experiment API
- [ ] `POST /api/v1/experiments/run` — `{document_set_id, query}` → starts experiment, returns `experiment_id`
- [ ] `GET /api/v1/experiments/{id}/stream` — SSE endpoint, subscribes to Redis channel
- [ ] `GET /api/v1/experiments/{id}` — full results including evaluations
- [ ] `GET /api/v1/experiments` — paginated list of past experiments

---

## Phase 4: Evaluation Engine

### RAGAS Evaluator
- [ ] Add `ragas`, `datasets` to `pyproject.toml` via `uv add ragas datasets`
- [ ] `app/services/evaluator.py` — `RagasEvaluator`
  - Receives: `{query, pipeline_runs: [4 × {pipeline_id, answer, chunks}]}`
  - Runs `ragas.evaluate()` independently per pipeline (no shared prompt, no position bias)
  - Metrics: `faithfulness`, `answer_relevancy`, `context_precision` (all reference-free)
  - Configure RAGAS to use `gpt-4o-mini` as the underlying LLM for cost control
  - Writes `Evaluation` rows to PostgreSQL (scores stored as 0–1 floats, ×10 for display)

```python
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy, context_precision
from ragas.llms import LangchainLLMWrapper
from langchain_openai import ChatOpenAI
from datasets import Dataset

ragas_llm = LangchainLLMWrapper(ChatOpenAI(model="gpt-4o-mini"))

async def evaluate_pipeline(query, answer, chunk_texts):
    dataset = Dataset.from_dict({
        "question": [query],
        "answer":   [answer],
        "contexts": [chunk_texts],
    })
    result = evaluate(dataset, metrics=[faithfulness, answer_relevancy, context_precision], llm=ragas_llm)
    return result  # dict with float scores 0–1
```

### Cost Calculator
- [ ] `app/services/cost.py` — `CostCalculator.compute(pipeline_run) -> float`
  - Token counts from API responses
  - Pricing table as config (updatable without code changes)
  - Separate: embedding cost, generation cost, reranking cost
  - `cost_per_1k_queries` projection

### Analytics API
- [ ] `GET /api/v1/analytics/summary` — best pipeline per metric across all experiments
- [ ] `GET /api/v1/analytics/pipelines` — per-pipeline average scores over time
- [ ] `GET /api/v1/analytics/cost` — cost breakdown by pipeline component

---

## Phase 5: Frontend

### Upload Flow
- [ ] `app/page.tsx` — hero + DocumentUploader component
- [ ] `components/upload/DocumentUploader.tsx` — drag-drop, file validation, upload mutation, polling
- [ ] `components/upload/IndexingProgress.tsx` — 4× pipeline indexing status bars

### Experiment Run Flow
- [ ] `app/experiments/page.tsx` — experiment history list
- [ ] Query input component with document set selector
- [ ] `lib/sse.ts` — `useExperimentStream(experimentId)` React hook over EventSource
- [ ] `components/pipeline/PipelineCard.tsx` — shows answer, chunks, latency (appears as each completes)
- [ ] `components/pipeline/PipelineStream.tsx` — 4-column live result grid with loading skeletons

### Results Dashboard
- [ ] `app/experiments/[id]/page.tsx` — full results view
- [ ] `components/dashboard/RadarChart.tsx` — Recharts radar: faithfulness, relevance, precision per pipeline
- [ ] `components/dashboard/CostBar.tsx` — horizontal grouped bar: cost breakdown per pipeline
- [ ] `components/dashboard/WinnerBadge.tsx` — highlighted recommendation card with reasoning
- [ ] `components/dashboard/ChunksViewer.tsx` — expandable retrieved chunks per pipeline

---

## Phase 6: Docker & Deployment

### Docker
- [ ] `backend.Dockerfile` — multi-stage: uv build → slim runtime
- [ ] `frontend.Dockerfile` — multi-stage: npm build → nginx serve
- [ ] `docker-compose.yml` — local dev with volumes + hot reload
- [ ] `docker-compose.prod.yml` — no volumes, restart policies, resource limits
- [ ] Health checks for all services
- [ ] `.env.example` updated with all required vars

### Render Deployment
- [ ] `render.yaml` — blueprint for all 5 services
- [ ] PostgreSQL managed DB on Render
- [ ] Redis managed on Render (or Upstash free tier)
- [ ] Qdrant Cloud free tier (1GB)
- [ ] Backend web service: `uv run uvicorn app.main:app`
- [ ] Frontend static site or web service

### Observability
- [ ] Request logging middleware (correlation IDs)
- [ ] Pipeline run timing logs (structured JSON)
- [ ] Sentry error tracking (optional, free tier)

---

## Key Technical Decisions

### Why Qdrant over Chroma/Pinecone?
Qdrant supports multiple named collections with different vector sizes natively — critical since Pipeline A uses 384-dim MiniLM vectors and Pipeline D uses 3072-dim OpenAI vectors. Chroma has collection isolation issues; Pinecone is expensive at scale.

### Why SSE over WebSocket?
SSE is simpler for unidirectional server→client streaming, works natively with Next.js and the browser EventSource API, and doesn't require a stateful WebSocket server (which complicates horizontal scaling).

### Why asyncio over Celery for pipeline parallelism?
The 4 pipelines run as coroutines within a single async FastAPI request handler. For MVP scale (< 100 concurrent users), this is sufficient and avoids Celery's broker complexity. For production scale, replace the orchestrator's `asyncio.gather()` with Celery tasks.

### Local vs. Hosted Embedding for Pipeline A
Pipeline A uses sentence-transformers MiniLM-L6 (local, 80MB model). This:
- Eliminates API cost for the baseline comparison
- Shows users what "free" looks like vs. paid APIs
- Avoids cold-start latency on first request (model loaded at startup)
