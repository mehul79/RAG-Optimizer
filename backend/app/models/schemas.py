from datetime import datetime

from pydantic import BaseModel


# ── Document Sets ─────────────────────────────────────────────────────────────

class DocumentSetResponse(BaseModel):
    id: str
    name: str
    file_count: int
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Experiments ───────────────────────────────────────────────────────────────

class ExperimentCreate(BaseModel):
    document_set_id: str
    query: str


class EvaluationResponse(BaseModel):
    faithfulness: float | None
    answer_relevancy: float | None
    context_precision: float | None
    overall_score: float | None
    transparency_data: dict | None = None

    model_config = {"from_attributes": True}


class PipelineRunResponse(BaseModel):
    id: str
    pipeline_id: str
    answer: str | None
    retrieved_chunks: list | None
    prompt_tokens: int | None
    completion_tokens: int | None
    latency_ms: int | None
    cost_usd: float | None
    evaluation: EvaluationResponse | None

    model_config = {"from_attributes": True}


class ExperimentResponse(BaseModel):
    id: str
    document_set_id: str
    query: str
    status: str
    winner_pipeline: str | None
    created_at: datetime
    pipeline_runs: list[PipelineRunResponse] = []

    model_config = {"from_attributes": True}


class ExperimentCreatedResponse(BaseModel):
    experiment_id: str
    status: str


# ── Settings ──────────────────────────────────────────────────────────────

class SettingsStatusResponse(BaseModel):
    openrouter_key_set: bool
    openrouter_key_preview: str
    cohere_key_set: bool
    cohere_key_preview: str


class ValidateKeyRequest(BaseModel):
    provider: str  # "openrouter" | "cohere"
    api_key: str


class ValidateKeyResponse(BaseModel):
    valid: bool
    error: str | None = None


class SaveSettingsRequest(BaseModel):
    openrouter_api_key: str
    cohere_api_key: str


# ── Analytics ─────────────────────────────────────────────────────────────────

class PipelineStats(BaseModel):
    pipeline_id: str
    avg_faithfulness: float | None
    avg_answer_relevancy: float | None
    avg_context_precision: float | None
    avg_overall_score: float | None
    avg_latency_ms: float | None
    total_cost_usd: float | None
    win_count: int


class AnalyticsSummaryResponse(BaseModel):
    total_experiments: int
    pipeline_stats: list[PipelineStats]
