# RAG Pipeline Optimizer — Claude Code Guide

## What This Project Does

Compares 4 RAG pipeline configurations (different chunking, embedding, and reranking strategies) against a user-uploaded document corpus, evaluates each using GPT-4o as a judge, and visualizes which pipeline performs best on accuracy, relevance, and cost.

## Tech Stack

- **Backend**: Python 3.12, FastAPI, uv (package manager)
- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Vector DB**: Qdrant (local via Docker)
- **Relational DB**: PostgreSQL 16 (local via Docker)
- **Cache/Pub-Sub**: Redis 7
- **Embeddings**: sentence-transformers (local), OpenAI, Cohere
- **LLM Judge**: GPT-4o (via OpenAI SDK)
- **Containerization**: Docker + docker-compose

## Key Commands

### Backend
```bash
# Install deps (from /backend)
uv sync

# Run dev server (from /backend)
uv run uvicorn app.main:app --reload --port 8000

# Add a dependency
uv add <package>

# Run tests
uv run pytest tests/ -v

# Format code
uv run ruff format .

# Type check
uv run mypy app/
```

### Frontend
```bash
# Install deps (from /frontend)
npm install

# Run dev server
npm run dev  # starts on :3000

# Build for production
npm run build

# Lint
npm run lint
```

### Infrastructure
```bash
# Start Qdrant + PostgreSQL + Redis
docker-compose up -d

# Run DB migrations
uv run alembic upgrade head

# Stop infra
docker-compose down
```

## Project Structure

```
backend/app/
  main.py              FastAPI app factory + lifespan
  core/config.py       All env-var config via pydantic-settings
  core/database.py     Async SQLAlchemy engine + session
  api/routes/          HTTP endpoints (one file per domain)
  models/db.py         SQLAlchemy ORM models
  models/schemas.py    Pydantic request/response schemas
  services/
    ingestion.py       Upload → parse → chunk → embed → index
    orchestrator.py    Run 4 pipelines concurrently
    evaluator.py       GPT-4o judge
    cost.py            Token counting + pricing
    vector_store.py    Qdrant wrapper
    pipelines/         One file per pipeline (A–D)
```

## Environment Variables

Required in `backend/.env`:
```
DATABASE_URL=postgresql+asyncpg://user:pass@localhost/ragopt
REDIS_URL=redis://localhost:6379
QDRANT_URL=http://localhost:6333
OPENAI_API_KEY=sk-...
COHERE_API_KEY=...
```

Required in `frontend/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Coding Conventions

### Backend
- All I/O in services must be `async` — never block the event loop
- Pydantic v2 models for all API boundaries
- Database sessions via dependency injection (`get_db()` in `deps.py`)
- Pipeline classes inherit from `BasePipeline` in `services/pipelines/base.py`
- Cost tracking: always pull token counts from API response objects, not estimates

### Frontend
- App Router only — no `pages/` directory
- Server Components for data fetching where possible
- `lib/api.ts` for all backend calls — no raw fetch calls in components
- SSE stream via `lib/sse.ts` `useExperimentStream()` hook

## Architecture Notes

- **4 Qdrant collections per document set** (named `{docset_id}_A` through `_D`)
- **SSE for real-time results**: backend publishes to Redis, SSE endpoint subscribes
- **Evaluation is post-all-pipelines**: evaluator runs only after all 4 pipeline runs complete
- **Anti-position-bias**: evaluator shuffles pipeline order before sending to GPT-4o judge
- **Async ingestion**: document upload returns immediately; indexing runs as a background task

## Files to Know First

1. `ARCHITECTURE.md` — system diagram, component descriptions, data flow
2. `PROBLEM_STATEMENT.md` — why this is hard, what the 4 pipelines are, success criteria
3. `backend/app/core/config.py` — all configuration
4. `backend/app/services/orchestrator.py` — the core async pipeline runner
5. `backend/app/services/evaluator.py` — GPT-4o judge prompt + output parsing
