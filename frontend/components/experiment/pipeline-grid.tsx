import { PIPELINE_IDS, type PipelineId } from '@/lib/constants'
import { PipelineCard } from './pipeline-card'
import type { PipelineResult, EvalResult } from '@/lib/types'

interface Props {
  pipelineResults: Record<string, PipelineResult>
  evalResults: Record<string, EvalResult>
  errors: Record<string, string>
  winner: string | null
}

export function PipelineGrid({ pipelineResults, evalResults, errors, winner }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {PIPELINE_IDS.map(id => (
        <PipelineCard
          key={id}
          pipelineId={id as PipelineId}
          result={pipelineResults[id] ?? null}
          evalResult={evalResults[id] ?? null}
          error={errors[id] ?? null}
          winner={winner}
        />
      ))}
    </div>
  )
}
