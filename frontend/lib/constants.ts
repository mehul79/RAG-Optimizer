export const PIPELINE_META = {
  A: {
    label: 'Baseline',
    description: 'MiniLM · 256 tok · no rerank',
    color: 'oklch(0.55 0.01 260)',
    colorDim: 'oklch(0.55 0.01 260 / 0.14)',
    chartColor: '#6366f1',
    config: {
      embedding: 'MiniLM (local)',
      chunkSize: '256 tokens',
      reranking: 'None',
      overlap: '32 tokens',
    },
  },
  B: {
    label: 'Standard',
    description: 'ada-002 · 512 tok · no rerank',
    color: 'oklch(0.60 0.18 240)',
    colorDim: 'oklch(0.60 0.18 240 / 0.14)',
    chartColor: '#0ea5e9',
    config: {
      embedding: 'OpenAI ada-002',
      chunkSize: '512 tokens',
      reranking: 'None',
      overlap: '64 tokens',
    },
  },
  C: {
    label: 'Advanced',
    description: 'Cohere · 1024 tok · Cohere rerank',
    color: 'oklch(0.58 0.22 290)',
    colorDim: 'oklch(0.58 0.22 290 / 0.14)',
    chartColor: '#f97316',
    config: {
      embedding: 'Cohere embed-v3',
      chunkSize: '1024 tokens',
      reranking: 'Cohere Rerank',
      overlap: '128 tokens',
    },
  },
  D: {
    label: 'Semantic',
    description: 'text-3-large · semantic · CrossEncoder',
    color: 'oklch(0.62 0.16 160)',
    colorDim: 'oklch(0.62 0.16 160 / 0.14)',
    chartColor: '#10b981',
    config: {
      embedding: 'text-embedding-3-large',
      chunkSize: 'Semantic (auto)',
      reranking: 'CrossEncoder',
      overlap: 'N/A',
    },
  },
} as const

export type PipelineId = keyof typeof PIPELINE_META
export const PIPELINE_IDS: PipelineId[] = ['A', 'B', 'C', 'D']
