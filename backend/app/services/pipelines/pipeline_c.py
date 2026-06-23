from app.services.chunkers.fixed import FixedChunker
from app.services.embedders.cohere import CohereEmbedder
from app.services.rerankers.cohere import CohereReranker
from app.services.pipelines.base import BasePipeline


class PipelineC(BasePipeline):
    pipeline_id = "C"
    vector_dim = 1024
    top_k = 10        # retrieve 10, rerank → top 3
    generator_model = "deepseek/deepseek-v4-flash"

    chunker = FixedChunker(chunk_size=1024, overlap=100)
    embedder = CohereEmbedder()
    reranker = CohereReranker()
