from app.services.chunkers.fixed import FixedChunker
from app.services.embedders.minilm import MiniLMEmbedder
from app.services.pipelines.base import BasePipeline


class PipelineA(BasePipeline):
    pipeline_id = "A"
    vector_dim = 384
    top_k = 5
    generator_model = "deepseek/deepseek-v4-flash"

    chunker = FixedChunker(chunk_size=256, overlap=0)
    embedder = MiniLMEmbedder()
    reranker = None
