'use client'

import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { PIPELINE_META, type PipelineId } from '@/lib/constants'
import type { PipelineResult, EvalResult, TransparencyData } from '@/lib/types'

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

function FaithfulnessBreakdown({ data }: { data: TransparencyData['faithfulness'] }) {
  const supported = data.claims.filter(c => c.supported).length
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        {supported}/{data.claims.length} claims supported by retrieved context
      </p>
      <div className="flex flex-col gap-1.5">
        {data.claims.map((c, i) => (
          <div key={i} className="rounded-md bg-muted px-3 py-2 text-xs leading-relaxed">
            <span className={cn('font-mono mr-1.5', c.supported ? 'text-green-600 dark:text-green-400' : 'text-destructive')}>
              {c.supported ? '✓' : '✗'}
            </span>
            <span className="font-medium">{c.claim}</span>
            {c.evidence && (
              <p className="mt-1 text-muted-foreground italic pl-4 border-l border-border">
                {c.evidence}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function RelevancyBreakdown({ data }: { data: TransparencyData['answer_relevancy'] }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5">
        {data.generated_questions.map((q, i) => (
          <div key={i} className="rounded-md bg-muted px-3 py-2 text-xs leading-relaxed">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium">&ldquo;{q.question}&rdquo;</span>
              <span className="font-mono tabular-nums text-muted-foreground shrink-0">
                {Math.round(q.similarity_to_original * 100)}%
              </span>
            </div>
            {q.reason && (
              <p className="mt-1 text-muted-foreground italic">{q.reason}</p>
            )}
          </div>
        ))}
      </div>
      {data.verdict && (
        <p className="text-xs text-muted-foreground px-1 pt-1 border-t border-border">{data.verdict}</p>
      )}
    </div>
  )
}

function ContextPrecisionBreakdown({ data }: { data: TransparencyData['context_precision'] }) {
  const useful = data.chunks.filter(c => c.useful).length
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">{useful}/{data.chunks.length} chunks useful for answering the query</p>
      <div className="flex flex-col gap-1.5">
        {data.chunks.map((c, i) => (
          <div key={i} className="rounded-md bg-muted px-3 py-2 text-xs leading-relaxed">
            <div className="flex items-start gap-2">
              <span className={cn('font-mono shrink-0', c.useful ? 'text-green-600 dark:text-green-400' : 'text-destructive')}>
                #{c.rank} {c.useful ? '✓' : '✗'}
              </span>
              <span className="text-muted-foreground">{c.reason}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

interface Props {
  pipelineId: PipelineId
  result: PipelineResult | null
  evalResult: EvalResult | null
  error: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PipelineDetailDialog({
  pipelineId,
  result,
  evalResult,
  error,
  open,
  onOpenChange,
}: Props) {
  const meta = PIPELINE_META[pipelineId]
  const td = evalResult?.transparency_data

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="font-heading text-2xl font-bold tabular-nums">{pipelineId}</span>
            <span className="font-heading text-base font-semibold tracking-tight">{meta.label}</span>
            {error ? (
              <Badge variant="destructive" className="text-[10px]">Error</Badge>
            ) : result ? (
              <Badge variant="secondary" className="text-[10px]">Done</Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">Running</Badge>
            )}
          </DialogTitle>
          <DialogDescription>{meta.description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 mt-2">
          {/* RAG Config */}
          <Separator />
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3 font-medium">RAG Configuration</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              {Object.entries(meta.config).map(([key, val]) => (
                <div key={key}>
                  <p className="text-xs text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1')}</p>
                  <p className="text-sm font-mono mt-0.5">{val}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Generated Answer */}
          {error ? (
            <>
              <Separator />
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2 font-medium">Error</p>
                <p className="text-sm text-destructive">{error}</p>
              </div>
            </>
          ) : result ? (
            <>
              <Separator />
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2 font-medium">Generated Answer</p>
                <div className="max-h-[260px] overflow-y-auto pr-1">
                  <p className="text-sm leading-relaxed">{result.answer}</p>
                </div>
              </div>

              {/* Retrieved Chunks */}
              {(() => {
                const chunks = result.retrieved_chunks.filter(c => c.trim().length > 0)
                if (!chunks.length) return null
                return (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2 font-medium">
                        Retrieved Chunks ({chunks.length})
                      </p>
                      <div className="max-h-[320px] overflow-y-auto flex flex-col gap-2 pr-1">
                        {chunks.map((chunk, i) => (
                          <div key={i} className="rounded-md bg-muted px-3 py-2 text-xs font-mono leading-relaxed">
                            <span className="text-muted-foreground mr-2">{i + 1}.</span>
                            {chunk}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )
              })()}
            </>
          ) : null}

          {/* RAGAS Scores */}
          {evalResult && (
            <>
              <Separator />
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3 font-medium">Evaluation Scores</p>
                {evalResult.overall_score !== null && (
                  <p className="text-2xl font-mono font-semibold mb-3">
                    {Math.round(evalResult.overall_score * 100)}%
                    <span className="text-sm font-sans font-normal text-muted-foreground ml-1.5">overall</span>
                  </p>
                )}
                <div className="flex flex-col gap-3">
                  <ScoreRow label="Faithfulness" value={evalResult.faithfulness} />
                  <ScoreRow label="Answer Relevancy" value={evalResult.answer_relevancy} secondary />
                  <ScoreRow label="Context Precision" value={evalResult.context_precision} />
                </div>
              </div>
            </>
          )}

          {/* Evaluation Reasoning (transparency) */}
          {td && (
            <>
              <Separator />
              <div className="flex flex-col gap-5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Evaluation Reasoning</p>

                {/* Faithfulness */}
                {td.faithfulness?.claims?.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold">Faithfulness</p>
                      {evalResult?.faithfulness !== null && (
                        <span className="text-xs font-mono text-muted-foreground">
                          {Math.round((evalResult?.faithfulness ?? 0) * 100)}%
                        </span>
                      )}
                    </div>
                    <FaithfulnessBreakdown data={td.faithfulness} />
                  </div>
                )}

                {/* Answer Relevancy */}
                {td.answer_relevancy?.generated_questions?.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold">Answer Relevancy</p>
                      {evalResult?.answer_relevancy !== null && (
                        <span className="text-xs font-mono text-muted-foreground">
                          {Math.round((evalResult?.answer_relevancy ?? 0) * 100)}%
                        </span>
                      )}
                    </div>
                    <RelevancyBreakdown data={td.answer_relevancy} />
                  </div>
                )}

                {/* Context Precision */}
                {td.context_precision?.chunks?.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold">Context Precision</p>
                      {evalResult?.context_precision !== null && (
                        <span className="text-xs font-mono text-muted-foreground">
                          {Math.round((evalResult?.context_precision ?? 0) * 100)}%
                        </span>
                      )}
                    </div>
                    <ContextPrecisionBreakdown data={td.context_precision} />
                  </div>
                )}
              </div>
            </>
          )}

          {/* Usage stats */}
          {result && (
            <>
              <Separator />
              <p className="text-xs text-muted-foreground font-mono tabular-nums">
                {result.latency_ms.toLocaleString()}ms · ${result.cost_usd.toFixed(5)} · {(result.prompt_tokens + result.completion_tokens).toLocaleString()} tok
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
