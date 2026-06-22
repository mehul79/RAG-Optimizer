'use client'

import { useEffect, useRef, useState } from 'react'
import type { PipelineResult, EvalResult, StreamStatus, StreamState } from './types'

export type { PipelineResult, EvalResult, StreamStatus, StreamState }

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export function useExperimentStream(experimentId: string | null): StreamState {
  const [state, setState] = useState<StreamState>({
    status: 'idle',
    pipelineResults: {},
    evalResults: {},
    errors: {},
    winner: null,
  })
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!experimentId) return
    setState(s => ({ ...s, status: 'connecting' }))

    const es = new EventSource(`${BASE}/experiments/${experimentId}/stream`)
    esRef.current = es

    es.onopen = () => setState(s => ({ ...s, status: 'streaming' }))

    es.onmessage = (e: MessageEvent<string>) => {
      try {
        const data = JSON.parse(e.data)

        if (data.type === 'pipeline_complete') {
          setState(s => ({
            ...s,
            status: 'streaming',
            pipelineResults: { ...s.pipelineResults, [data.pipeline_id]: data as PipelineResult },
          }))
        } else if (data.type === 'pipeline_error') {
          setState(s => ({
            ...s,
            errors: { ...s.errors, [data.pipeline_id]: data.error },
          }))
        } else if (data.type === 'eval_complete') {
          setState(s => ({
            ...s,
            evalResults: { ...s.evalResults, [data.pipeline_id]: data as EvalResult },
          }))
        } else if (data.type === 'eval_error') {
          setState(s => ({
            ...s,
            errors: { ...s.errors, [`eval_${data.pipeline_id}`]: data.error },
          }))
        } else if (data.type === 'experiment_done') {
          setState(s => ({ ...s, status: 'complete', winner: data.winner_pipeline }))
          es.close()
        }
      } catch {
        // non-JSON message, ignore
      }
    }

    es.onerror = () => {
      // EventSource auto-reconnects; keep it alive and let the polling
      // fallback in the experiment view catch anything missed meanwhile
      setState(s => (s.status === 'complete' ? s : { ...s, status: 'connecting' }))
    }

    return () => {
      es.close()
      esRef.current = null
    }
  }, [experimentId])

  return state
}
