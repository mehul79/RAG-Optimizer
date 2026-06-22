'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  RiAddLine,
  RiArrowLeftLine,
  RiCloseLine,
  RiLoaderLine,
  RiPlayLine,
} from '@remixicon/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PIPELINE_META, type PipelineId } from '@/lib/constants'
import { getBatch, startBatch, updateBatchQuestions, type QueryBatch } from '@/lib/api'

interface Props {
  initialBatch: QueryBatch
}

const STATUS_LABEL: Record<QueryBatch['status'], string> = {
  generating: 'Generating questions',
  review: 'Awaiting review',
  running: 'Running',
  complete: 'Complete',
  failed: 'Failed',
}

function GeneratingView() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <RiLoaderLine className="size-5 text-primary animate-spin" />
      <p className="text-sm text-muted-foreground">
        Reading the document and writing a diverse question set...
      </p>
    </div>
  )
}

function ReviewView({ batch, onStarted }: { batch: QueryBatch; onStarted: () => void }) {
  const [questions, setQuestions] = useState(batch.experiments.map(e => e.query))
  const [isStarting, setIsStarting] = useState(false)

  function updateAt(i: number, text: string) {
    setQuestions(qs => qs.map((q, idx) => (idx === i ? text : q)))
  }

  function removeAt(i: number) {
    setQuestions(qs => qs.filter((_, idx) => idx !== i))
  }

  function addQuestion() {
    setQuestions(qs => [...qs, ''])
  }

  const cleaned = questions.map(q => q.trim()).filter(Boolean)

  async function handleRun() {
    if (cleaned.length === 0) return
    setIsStarting(true)
    try {
      await updateBatchQuestions(batch.id, cleaned)
      await startBatch(batch.id)
      onStarted()
    } finally {
      setIsStarting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-medium text-foreground mb-1">
          Review the generated questions
        </h2>
        <p className="text-xs text-muted-foreground">
          Edit, remove, or add questions. Nothing has run yet — this is free to change.
        </p>
      </div>

      <div className="space-y-2">
        {questions.map((q, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="text-xs font-mono text-muted-foreground pt-2.5 w-5 shrink-0 text-right">
              {i + 1}
            </span>
            <Textarea
              value={q}
              onChange={e => updateAt(i, e.target.value)}
              className="resize-none min-h-[44px] text-sm"
              rows={1}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="mt-1 text-muted-foreground hover:text-destructive shrink-0"
              onClick={() => removeAt(i)}
              aria-label="Remove question"
            >
              <RiCloseLine className="size-4" />
            </Button>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addQuestion}>
        <RiAddLine />
        Add a question
      </Button>

      <div className="pt-2 border-t border-border">
        <Button
          type="button"
          onClick={handleRun}
          disabled={isStarting || cleaned.length === 0}
          className="w-full"
        >
          <RiPlayLine className="size-4 mr-2" />
          {isStarting
            ? 'Starting...'
            : `Run ${cleaned.length} question${cleaned.length === 1 ? '' : 's'} across 4 pipelines`}
        </Button>
      </div>
    </div>
  )
}

function RollupTable({ batch }: { batch: QueryBatch }) {
  if (batch.rollup.length === 0) return null
  const bestScore = Math.max(...batch.rollup.map(r => r.avg_overall_score ?? -1))

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Pipeline</TableHead>
          <TableHead>Wins</TableHead>
          <TableHead>Faithfulness</TableHead>
          <TableHead>Relevancy</TableHead>
          <TableHead>Precision</TableHead>
          <TableHead>Overall</TableHead>
          <TableHead>Cost</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {batch.rollup.map(r => {
          const meta = PIPELINE_META[r.pipeline_id as PipelineId]
          const isBest = r.avg_overall_score === bestScore && bestScore >= 0
          return (
            <TableRow key={r.pipeline_id}>
              <TableCell>
                <span
                  className="text-xs font-mono font-bold px-1.5 py-0.5 rounded-md"
                  style={{ color: meta?.color, backgroundColor: meta?.colorDim }}
                >
                  {r.pipeline_id}
                </span>
              </TableCell>
              <TableCell className="font-mono">{r.win_count}</TableCell>
              <TableCell className="font-mono">{r.avg_faithfulness ?? '—'}</TableCell>
              <TableCell className="font-mono">{r.avg_answer_relevancy ?? '—'}</TableCell>
              <TableCell className="font-mono">{r.avg_context_precision ?? '—'}</TableCell>
              <TableCell className="font-mono font-semibold">
                {r.avg_overall_score ?? '—'}
                {isBest && (
                  <Badge className="ml-2 text-[10px] bg-emerald-500/12 text-emerald-400 border border-emerald-500/30 px-1.5">
                    Best
                  </Badge>
                )}
              </TableCell>
              <TableCell className="font-mono">${r.total_cost_usd.toFixed(4)}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function ExperimentList({ batch }: { batch: QueryBatch }) {
  return (
    <div className="space-y-1.5">
      {batch.experiments.map((exp, i) => (
        <Link
          key={exp.id}
          href={exp.status === 'pending' ? '#' : `/experiments/${exp.id}`}
          className={`flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm transition-colors ${
            exp.status === 'pending'
              ? 'opacity-50 pointer-events-none'
              : 'hover:bg-muted/25'
          }`}
        >
          <span className="text-xs font-mono text-muted-foreground w-5 shrink-0 text-right">
            {i + 1}
          </span>
          <span className="flex-1 min-w-0 truncate text-foreground">{exp.query}</span>
          {exp.status === 'running' && (
            <RiLoaderLine className="size-3.5 text-primary animate-spin shrink-0" />
          )}
          {exp.winner_pipeline && (
            <span
              className="text-[11px] font-mono font-semibold px-1.5 rounded shrink-0"
              style={{
                color: PIPELINE_META[exp.winner_pipeline as PipelineId]?.color,
                backgroundColor: PIPELINE_META[exp.winner_pipeline as PipelineId]?.colorDim,
              }}
            >
              {exp.winner_pipeline} won
            </span>
          )}
          {exp.status !== 'complete' && !exp.winner_pipeline && (
            <Badge variant="secondary" className="text-[10px] px-1.5 shrink-0">
              {exp.status}
            </Badge>
          )}
        </Link>
      ))}
    </div>
  )
}

export function BatchView({ initialBatch }: Props) {
  const [batch, setBatch] = useState(initialBatch)

  useEffect(() => {
    if (batch.status !== 'generating' && batch.status !== 'running') return
    const timer = setInterval(async () => {
      try {
        setBatch(await getBatch(batch.id))
      } catch {
        // transient error, keep polling
      }
    }, 3000)
    return () => clearInterval(timer)
  }, [batch.id, batch.status])

  const progressPct =
    batch.question_count > 0 ? (batch.completed_count / batch.question_count) * 100 : 0

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 space-y-6">
      <div className="flex items-start gap-4">
        <Link
          href="/experiments"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mt-0.5 shrink-0"
        >
          <RiArrowLeftLine className="size-4" />
          Back
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge
              variant={batch.status === 'failed' ? 'destructive' : 'secondary'}
              className="text-[10px] px-1.5"
            >
              {STATUS_LABEL[batch.status]}
            </Badge>
            <span className="text-xs text-muted-foreground font-mono">{batch.id.slice(0, 8)}</span>
          </div>
          <p className="text-base font-medium text-foreground">
            Test set · {batch.question_count || '...'} questions
          </p>
        </div>
      </div>

      {batch.status === 'generating' && <GeneratingView />}

      {batch.status === 'review' && (
        <ReviewView
          batch={batch}
          onStarted={() => setBatch(b => ({ ...b, status: 'running' }))}
        />
      )}

      {(batch.status === 'running' || batch.status === 'complete') && (
        <div className="space-y-6">
          {batch.status === 'running' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {batch.completed_count} / {batch.question_count} complete
                </span>
                <span className="font-mono">{Math.round(progressPct)}%</span>
              </div>
              <Progress value={progressPct} />
            </div>
          )}

          {batch.rollup.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-foreground mb-3">Results by pipeline</h2>
              <RollupTable batch={batch} />
            </div>
          )}

          <div>
            <h2 className="text-sm font-medium text-foreground mb-3">Questions</h2>
            <ExperimentList batch={batch} />
          </div>
        </div>
      )}

      {batch.status === 'failed' && (
        <p className="text-sm text-destructive">
          Test set generation or execution failed. You can generate a new one from the document.
        </p>
      )}
    </div>
  )
}
