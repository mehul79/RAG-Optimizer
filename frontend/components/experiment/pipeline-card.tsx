'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { PIPELINE_META, type PipelineId } from '@/lib/constants'
import type { PipelineResult, EvalResult } from '@/lib/types'
import { PipelineDetailDialog } from './pipeline-detail-dialog'

interface Props {
  pipelineId: PipelineId
  result: PipelineResult | null
  evalResult: EvalResult | null
  error: string | null
  winner: string | null
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
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-mono tabular-nums text-foreground">{pct}%</span>
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

export function PipelineCard({ pipelineId, result, evalResult, error, winner }: Props) {
  const meta = PIPELINE_META[pipelineId]
  const isWinner = winner === pipelineId
  const hasResult = result !== null
  const hasEval = evalResult !== null
  const [open, setOpen] = useState(false)

  return (
    <>
      <Card
        className={cn(
          hasResult && 'cursor-pointer hover:bg-muted/20 transition-colors'
        )}
        style={{ boxShadow: `0 0 24px 0 ${meta.chartColor}26, 0 1px 3px 0 rgb(0 0 0 / 0.1)` }}
        onClick={hasResult ? () => setOpen(true) : undefined}
        title={hasResult ? 'Click to expand' : undefined}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="font-heading text-base font-bold text-foreground shrink-0">
                {pipelineId}
              </span>
              <CardTitle className="font-heading text-sm font-semibold tracking-tight">{meta.label}</CardTitle>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {isWinner && <Badge>Winner</Badge>}
              {error ? (
                <Badge variant="destructive">Error</Badge>
              ) : hasResult ? (
                <Badge variant="secondary">Done</Badge>
              ) : (
                <Badge variant="outline">Running</Badge>
              )}
            </div>
          </div>
          <CardDescription className="text-xs">{meta.description}</CardDescription>
        </CardHeader>

        <CardContent className="pb-3 flex flex-col gap-4">
          {/* Answer */}
          {error ? (
            <p className="text-xs text-destructive line-clamp-4">{error}</p>
          ) : hasResult ? (
            <p className="text-sm leading-relaxed text-foreground/80 line-clamp-5">
              {result.answer}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="h-3 w-4/6" />
              <Skeleton className="h-3 w-3/6" />
            </div>
          )}

          {/* RAGAS scores */}
          {hasEval ? (
            <>
              <Separator />
              <div className="flex flex-col gap-2.5">
                <ScoreRow label="Faithfulness" value={evalResult.faithfulness} />
                <ScoreRow label="Answer Relevancy" value={evalResult.answer_relevancy} secondary />
                <ScoreRow label="Context Precision" value={evalResult.context_precision} />
              </div>
            </>
          ) : hasResult ? (
            <>
              <Separator />
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-full rounded" />
                <Skeleton className="h-4 w-full rounded" />
                <Skeleton className="h-4 w-full rounded" />
              </div>
            </>
          ) : null}
        </CardContent>

        {hasResult && (
          <CardFooter>
            <span className="text-xs text-muted-foreground font-mono tabular-nums">
              {result.latency_ms.toLocaleString()}ms · ${result.cost_usd.toFixed(5)} · {(result.prompt_tokens + result.completion_tokens).toLocaleString()} tok
            </span>
          </CardFooter>
        )}
      </Card>

      <PipelineDetailDialog
        pipelineId={pipelineId}
        result={result}
        evalResult={evalResult}
        error={error}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
