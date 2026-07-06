from app.services.chunkers.fixed import FixedChunker
from app.services.embedders.openai import OpenAIEmbedder
from app.services.pipelines.base import BasePipeline


class PipelineB(BasePipeline):
    pipeline_id = "B"
    vector_dim = 1536
    top_k = 5
    generator_model = "openai/gpt-4o-mini"

    chunker = FixedChunker(chunk_size=512, overlap=50)
    embedder = OpenAIEmbedder(model="text-embedding-ada-002")
    reranker = None
