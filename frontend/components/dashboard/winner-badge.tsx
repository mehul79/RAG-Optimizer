import { cn } from '@/lib/utils'
import { RiTrophyLine } from '@remixicon/react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { PIPELINE_META, type PipelineId } from '@/lib/constants'
import type { EvalResult } from '@/lib/types'

interface Props {
  winner: string
  evalResults: Record<string, EvalResult>
}

function ScoreRow({
  label,
  value,
  secondary = false,
}: {
  label: string
  value: number | null
  secondary?: boolean
}) {
  if (value === null) return null
  const pct = Math.round(value * 100)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm font-mono tabular-nums font-medium">{pct}%</span>
      </div>
      <Progress
        value={pct}
        className={cn(
          'h-1.5',
          secondary && '[&>[data-slot=progress-indicator]]:bg-accent-2'
        )}
      />
    </div>
  )
}

export function WinnerBadge({ winner, evalResults }: Props) {
  const meta = PIPELINE_META[winner as PipelineId]
  const scores = evalResults[winner]

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <RiTrophyLine className="size-4 text-primary shrink-0" />
          <CardTitle className="text-sm">
            Pipeline {winner} &mdash; {meta.label}
          </CardTitle>
          <span className="ml-auto text-xs text-muted-foreground">Best overall</span>
        </div>
        <CardDescription className="text-xs">{meta.description}</CardDescription>
      </CardHeader>

      {scores && (
        <CardContent className="flex flex-col gap-3 pt-0">
          <Separator />
          <ScoreRow label="Overall Score" value={scores.overall_score} />
          <ScoreRow label="Faithfulness" value={scores.faithfulness} />
          <ScoreRow label="Answer Relevancy" value={scores.answer_relevancy} secondary />
          <ScoreRow label="Context Precision" value={scores.context_precision} />
        </CardContent>
      )}
    </Card>
  )
}
