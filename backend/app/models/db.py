import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class DocumentSet(Base):
    __tablename__ = "document_sets"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String, nullable=False)
    file_count: Mapped[int] = mapped_column(Integer, default=1)
    total_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String, default="processing")  # processing | ready | failed
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    pipeline_indexes: Mapped[list["PipelineIndex"]] = relationship(back_populates="document_set", cascade="all, delete-orphan")
    experiments: Mapped[list["Experiment"]] = relationship(back_populates="document_set")


class PipelineIndex(Base):
    __tablename__ = "pipeline_indexes"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    document_set_id: Mapped[str] = mapped_column(ForeignKey("document_sets.id", ondelete="CASCADE"))
    pipeline_id: Mapped[str] = mapped_column(String, nullable=False)  # A | B | C | D
    chunk_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    qdrant_collection: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, default="pending")  # pending | indexing | ready | failed
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    document_set: Mapped["DocumentSet"] = relationship(back_populates="pipeline_indexes")


class Experiment(Base):
    __tablename__ = "experiments"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    document_set_id: Mapped[str] = mapped_column(ForeignKey("document_sets.id"))
    query: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String, default="running")  # running | complete | failed
    winner_pipeline: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    document_set: Mapped["DocumentSet"] = relationship(back_populates="experiments")
    pipeline_runs: Mapped[list["PipelineRun"]] = relationship(back_populates="experiment", cascade="all, delete-orphan")


class PipelineRun(Base):
    __tablename__ = "pipeline_runs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    experiment_id: Mapped[str] = mapped_column(ForeignKey("experiments.id", ondelete="CASCADE"))
    pipeline_id: Mapped[str] = mapped_column(String, nullable=False)
    retrieved_chunks: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    prompt_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    completion_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    embedding_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cost_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    experiment: Mapped["Experiment"] = relationship(back_populates="pipeline_runs")
    evaluation: Mapped["Evaluation | None"] = relationship(back_populates="pipeline_run", uselist=False, cascade="all, delete-orphan")


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[str] = mapped_column(String, nullable=False)


class Evaluation(Base):
    __tablename__ = "evaluations"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    pipeline_run_id: Mapped[str] = mapped_column(ForeignKey("pipeline_runs.id", ondelete="CASCADE"))
    faithfulness: Mapped[float | None] = mapped_column(Float, nullable=True)
    answer_relevancy: Mapped[float | None] = mapped_column(Float, nullable=True)
    context_precision: Mapped[float | None] = mapped_column(Float, nullable=True)
    overall_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    transparency_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    evaluated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    pipeline_run: Mapped["PipelineRun"] = relationship(back_populates="evaluation")
