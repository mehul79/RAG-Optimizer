import type { TransparencyData } from './types'

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export type DocSetStatus = 'processing' | 'ready' | 'failed'

export interface DocumentSet {
  id: string
  name: string
  file_count: number
  status: DocSetStatus
  created_at: string
}

export interface EvaluationResult {
  faithfulness: number | null
  answer_relevancy: number | null
  context_precision: number | null
  overall_score: number | null
  transparency_data?: TransparencyData | null
}

export interface PipelineRun {
  id: string
  pipeline_id: string
  answer: string | null
  retrieved_chunks: string[] | null
  prompt_tokens: number | null
  completion_tokens: number | null
  latency_ms: number | null
  cost_usd: number | null
  error: string | null
  evaluation: EvaluationResult | null
}

export interface Experiment {
  id: string
  document_set_id: string
  query: string
  status: 'pending' | 'running' | 'complete' | 'failed'
  winner_pipeline: string | null
  created_at: string
  pipeline_runs: PipelineRun[]
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(text || `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export async function uploadDocument(file: File): Promise<DocumentSet> {
  const form = new FormData()
  form.append('file', file)
  return handle(await fetch(`${BASE}/documents/upload`, { method: 'POST', body: form }))
}

export async function getDocument(id: string): Promise<DocumentSet> {
  return handle(await fetch(`${BASE}/documents/${id}`, { cache: 'no-store' }))
}

export async function listDocuments(): Promise<DocumentSet[]> {
  return handle(await fetch(`${BASE}/documents`, { cache: 'no-store' }))
}

export async function deleteDocument(id: string): Promise<void> {
  const res = await fetch(`${BASE}/documents/${id}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(text || `HTTP ${res.status}`)
  }
}

export async function runExperiment(
  document_set_id: string,
  query: string,
): Promise<{ experiment_id: string; status: string }> {
  return handle(
    await fetch(`${BASE}/experiments/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_set_id, query }),
    }),
  )
}

export async function getExperiment(id: string): Promise<Experiment> {
  return handle(await fetch(`${BASE}/experiments/${id}`, { cache: 'no-store' }))
}

export async function listExperiments(): Promise<Experiment[]> {
  return handle(await fetch(`${BASE}/experiments`, { cache: 'no-store' }))
}

export async function deleteExperiment(id: string): Promise<void> {
  const res = await fetch(`${BASE}/experiments/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete experiment')
}

// ── Query Batches ─────────────────────────────────────────────────────────────

export type QueryBatchStatus = 'generating' | 'review' | 'running' | 'complete' | 'failed'

export interface PipelineRollup {
  pipeline_id: string
  win_count: number
  avg_faithfulness: number | null
  avg_answer_relevancy: number | null
  avg_context_precision: number | null
  avg_overall_score: number | null
  total_cost_usd: number
}

export interface QueryBatch {
  id: string
  document_set_id: string
  status: QueryBatchStatus
  question_count: number
  completed_count: number
  created_at: string
  rollup: PipelineRollup[]
  experiments: Experiment[]
}

export async function createBatch(
  document_set_id: string,
  count: number,
): Promise<{ batch_id: string; status: string }> {
  return handle(
    await fetch(`${BASE}/batches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_set_id, count }),
    }),
  )
}

export async function getBatch(id: string): Promise<QueryBatch> {
  return handle(await fetch(`${BASE}/batches/${id}`, { cache: 'no-store' }))
}

export async function listBatches(): Promise<QueryBatch[]> {
  return handle(await fetch(`${BASE}/batches`, { cache: 'no-store' }))
}

export async function updateBatchQuestions(id: string, questions: string[]): Promise<void> {
  await handle(
    await fetch(`${BASE}/batches/${id}/questions`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questions }),
    }),
  )
}

export async function startBatch(id: string): Promise<void> {
  await handle(await fetch(`${BASE}/batches/${id}/start`, { method: 'POST' }))
}

export async function deleteBatch(id: string): Promise<void> {
  const res = await fetch(`${BASE}/batches/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete batch')
}

// ── Settings ────────────────────────────────────────────────────────────────

export interface SettingsStatus {
  openrouter_key_set: boolean
  openrouter_key_preview: string
  cohere_key_set: boolean
  cohere_key_preview: string
}

export async function getSettings(): Promise<SettingsStatus> {
  return handle(await fetch(`${BASE}/settings`, { cache: 'no-store' }))
}

export async function validateKey(
  provider: 'openrouter' | 'cohere',
  api_key: string,
): Promise<{ valid: boolean; error?: string }> {
  return handle(
    await fetch(`${BASE}/settings/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, api_key }),
    }),
  )
}

export async function saveSettings(
  openrouter_api_key: string,
  cohere_api_key: string,
): Promise<void> {
  await handle(
    await fetch(`${BASE}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ openrouter_api_key, cohere_api_key }),
    }),
  )
}
