from app.services.chunkers.semantic import SemanticChunker
from app.services.embedders.openai import OpenAIEmbedder
from app.services.rerankers.cross_encoder import CrossEncoderReranker
from app.services.pipelines.base import BasePipeline


class PipelineD(BasePipeline):
    pipeline_id = "D"
    vector_dim = 3072
    top_k = 10        # retrieve 10, rerank → top 3
    generator_model = "deepseek/deepseek-v4-flash"

    chunker = SemanticChunker(threshold=0.5)
    embedder = OpenAIEmbedder(model="text-embedding-3-large")
    reranker = CrossEncoderReranker()
