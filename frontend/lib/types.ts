export interface PipelineResult {
  pipeline_id: string
  answer: string
  retrieved_chunks: string[]
  prompt_tokens: number
  completion_tokens: number
  latency_ms: number
  cost_usd: number
}

export interface FaithfulnessClaim {
  claim: string
  supported: boolean
  evidence: string
}

export interface RelevancyQuestion {
  question: string
  similarity_to_original: number
  reason: string
}

export interface ContextChunk {
  rank: number
  useful: boolean
  reason: string
}

export interface TransparencyData {
  faithfulness: { claims: FaithfulnessClaim[] }
  answer_relevancy: { generated_questions: RelevancyQuestion[]; verdict: string }
  context_precision: { chunks: ContextChunk[] }
}

export interface EvalResult {
  pipeline_id: string
  faithfulness: number | null
  answer_relevancy: number | null
  context_precision: number | null
  overall_score: number | null
  transparency_data?: TransparencyData
}

export type StreamStatus = 'connecting' | 'streaming' | 'complete' | 'error' | 'idle'

export interface StreamState {
  status: StreamStatus
  pipelineResults: Record<string, PipelineResult>
  evalResults: Record<string, EvalResult>
  errors: Record<string, string>
  winner: string | null
}
