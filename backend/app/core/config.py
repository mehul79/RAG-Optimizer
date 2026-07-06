from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database
    database_url: str = "postgresql+asyncpg://user:pass@localhost/ragopt"
    redis_url: str = "redis://localhost:6379"
    qdrant_url: str = "http://localhost:6333"

    # OpenRouter (generation + OpenAI embeddings)
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    llm_model: str = "openai/gpt-4o-mini"

    # Cohere (Pipeline C embed + rerank via Cohere SDK)
    cohere_api_key: str = ""

    # App
    environment: str = "development"
    log_level: str = "INFO"
    max_upload_size_mb: int = 50

    # RAGAS
    ragas_llm_model: str = "openai/gpt-4o-mini"


settings = Settings()
