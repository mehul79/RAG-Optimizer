'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { RiArrowLeftLine } from '@remixicon/react'
import { Badge } from '@/components/ui/badge'
import { PipelineGrid } from './pipeline-grid'
import { WinnerBadge } from '@/components/dashboard/winner-badge'
import { MetricsChart } from '@/components/dashboard/metrics-chart'
import { useExperimentStream } from '@/lib/sse'
import { getExperiment, type Experiment } from '@/lib/api'
import type { PipelineResult, EvalResult, StreamStatus } from '@/lib/types'

interface Props {
  initialExperiment: Experiment
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'complete')
    return (
      <Badge className="text-[10px] bg-emerald-500/12 text-emerald-400 border border-emerald-500/30 px-1.5">
        Complete
      </Badge>
    )
  if (status === 'failed')
    return <Badge variant="destructive" className="text-[10px] px-1.5">Failed</Badge>
  return (
    <Badge className="text-[10px] bg-primary/12 text-primary border border-primary/30 px-1.5">
      Running
    </Badge>
  )
}

interface LayoutProps {
  experiment: Experiment
  streamStatus: StreamStatus | string
  pipelineResults: Record<string, PipelineResult>
  evalResults: Record<string, EvalResult>
  errors: Record<string, string>
  winner: string | null
  showDashboard: boolean
}

function ExperimentLayout({
  experiment,
  streamStatus,
  pipelineResults,
  evalResults,
  errors,
  winner,
  showDashboard,
}: LayoutProps) {
  const displayStatus =
    streamStatus === 'complete' || experiment.status === 'complete'
      ? 'complete'
      : experiment.status === 'failed'
      ? 'failed'
      : 'running'

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
      {/* Top bar */}
      <div className="flex items-start gap-4">
        <Link
          href="/experiments"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mt-0.5 shrink-0"
        >
          <RiArrowLeftLine className="size-4" />
          Back
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <StatusBadge status={displayStatus} />
            <span className="text-xs text-muted-foreground font-mono">
              {experiment.id.slice(0, 8)}
            </span>
          </div>
          <p className="text-base font-medium text-foreground leading-snug">
            &ldquo;{experiment.query}&rdquo;
          </p>
        </div>
      </div>

      {/* Pipeline grid */}
      <PipelineGrid
        pipelineResults={pipelineResults}
        evalResults={evalResults}
        errors={errors}
        winner={winner}
      />

      {/* Dashboard — shown when complete */}
      {showDashboard && winner && (
        <div className="space-y-4">
          <WinnerBadge winner={winner} evalResults={evalResults} />
          <MetricsChart pipelineResults={pipelineResults} />
        </div>
      )}
    </div>
  )
}

function buildFromRuns(exp: Experiment) {
  const pipelineResults: Record<string, PipelineResult> = {}
  const evalResults: Record<string, EvalResult> = {}
  const errors: Record<string, string> = {}
  for (const run of exp.pipeline_runs) {
    if (run.error) errors[run.pipeline_id] = run.error
    if (run.answer) {
      pipelineResults[run.pipeline_id] = {
        pipeline_id: run.pipeline_id,
        answer: run.answer,
        retrieved_chunks: run.retrieved_chunks ?? [],
        prompt_tokens: run.prompt_tokens ?? 0,
        completion_tokens: run.completion_tokens ?? 0,
        latency_ms: run.latency_ms ?? 0,
        cost_usd: run.cost_usd ?? 0,
      }
    }
    if (run.evaluation) {
      evalResults[run.pipeline_id] = {
        pipeline_id: run.pipeline_id,
        faithfulness: run.evaluation.faithfulness,
        answer_relevancy: run.evaluation.answer_relevancy,
        context_precision: run.evaluation.context_precision,
        overall_score: run.evaluation.overall_score,
        transparency_data: run.evaluation.transparency_data ?? undefined,
      }
    }
  }
  return { pipelineResults, evalResults, errors }
}

function LiveView({ initialExperiment }: Props) {
  const stream = useExperimentStream(initialExperiment.id)
  const [experiment, setExperiment] = useState(initialExperiment)

  // Polling backstop — DB is the source of truth; SSE may miss events
  // across reloads or dropped connections
  useEffect(() => {
    if (experiment.status !== 'running') return
    const timer = setInterval(async () => {
      try {
        setExperiment(await getExperiment(experiment.id))
      } catch {
        // transient error, keep polling
      }
    }, 3000)
    return () => clearInterval(timer)
  }, [experiment.id, experiment.status])

  // Seed with any runs already persisted; live SSE events win
  const { pipelineResults: seedPR, evalResults: seedER, errors: seedErr } = buildFromRuns(experiment)
  const pipelineResults = { ...seedPR, ...stream.pipelineResults }
  const evalResults = { ...seedER, ...stream.evalResults }
  const errors = { ...seedErr, ...stream.errors }
  const winner = stream.winner ?? experiment.winner_pipeline
  const isComplete =
    stream.status === 'complete' || experiment.status === 'complete'

  return (
    <ExperimentLayout
      experiment={experiment}
      streamStatus={stream.status}
      pipelineResults={pipelineResults}
      evalResults={evalResults}
      errors={errors}
      winner={winner}
      showDashboard={isComplete && !!winner}
    />
  )
}

function StaticView({ initialExperiment }: Props) {
  const { pipelineResults, evalResults, errors } = buildFromRuns(initialExperiment)
  return (
    <ExperimentLayout
      experiment={initialExperiment}
      streamStatus="complete"
      pipelineResults={pipelineResults}
      evalResults={evalResults}
      errors={errors}
      winner={initialExperiment.winner_pipeline}
      showDashboard={!!initialExperiment.winner_pipeline}
    />
  )
}

export function ExperimentView({ initialExperiment }: Props) {
  if (initialExperiment.status === 'complete') {
    return <StaticView initialExperiment={initialExperiment} />
  }
  return <LiveView initialExperiment={initialExperiment} />
}
