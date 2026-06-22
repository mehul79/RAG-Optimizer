'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RiArrowRightLine, RiSparklingLine } from '@remixicon/react'
import { Button, type buttonVariants } from '@/components/ui/button'
import type { VariantProps } from 'class-variance-authority'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { createBatch, listBatches, type QueryBatch } from '@/lib/api'

const DEFAULT_COUNT = 10
const MIN_COUNT = 5
const MAX_COUNT = 20

interface Props {
  documentSetId: string
  variant?: VariantProps<typeof buttonVariants>['variant']
  size?: VariantProps<typeof buttonVariants>['size']
}

export function GenerateBatchDialog({ documentSetId, variant = 'outline', size = 'sm' }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(DEFAULT_COUNT)
  const [isCreating, setIsCreating] = useState(false)
  const [existing, setExisting] = useState<QueryBatch | null>(null)

  // A batch already generated (or generating) for this document means questions
  // exist — offer to resume instead of paying for a fresh generation call.
  useEffect(() => {
    if (!open) return
    listBatches()
      .then(batches => {
        const match = batches.find(
          b =>
            b.document_set_id === documentSetId &&
            (b.status === 'review' || b.status === 'generating'),
        )
        setExisting(match ?? null)
      })
      .catch(() => setExisting(null))
  }, [open, documentSetId])

  // Rough estimate: 1 generation call + 4 pipelines x ~2 calls (generate + single-shot eval)
  const llmCalls = count * (1 + 4 * 2)
  const estMinutesLow = Math.round((count * 20) / 60)
  const estMinutesHigh = Math.round((count * 40) / 60)

  async function handleGenerate() {
    setIsCreating(true)
    try {
      const { batch_id } = await createBatch(documentSetId, count)
      router.push(`/batches/${batch_id}`)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant={variant} size={size}>
          <RiSparklingLine />
          Generate a test set
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate a test set</DialogTitle>
          <DialogDescription>
            An LLM reads sampled excerpts from this document and writes a mix of factual,
            multi-hop, and edge-case questions. You&apos;ll be able to review and edit them
            before anything runs.
          </DialogDescription>
        </DialogHeader>

        <div>
          <label className="text-sm font-medium text-foreground block mb-1.5">
            Number of questions
          </label>
          <input
            type="range"
            min={MIN_COUNT}
            max={MAX_COUNT}
            value={count}
            onChange={e => setCount(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="flex items-center justify-between mt-1">
            <span className="text-[11px] text-muted-foreground font-mono">{MIN_COUNT}</span>
            <span className="text-sm font-mono font-semibold text-foreground">{count}</span>
            <span className="text-[11px] text-muted-foreground font-mono">{MAX_COUNT}</span>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground space-y-0.5">
          <p>
            Once you run it: ~<span className="font-mono text-foreground">{llmCalls}</span> LLM
            calls across 4 pipelines
          </p>
          <p>
            Estimated time to run: ~
            <span className="font-mono text-foreground">
              {estMinutesLow}-{estMinutesHigh} min
            </span>{' '}
            (runs one question at a time)
          </p>
          <p className="text-[11px] text-muted-foreground/70">
            Nothing runs yet — this only generates the questions for review.
          </p>
        </div>

        {existing && (
          <button
            type="button"
            onClick={() => router.push(`/batches/${existing.id}`)}
            className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-left hover:bg-primary/10 transition-colors w-full"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                A test set is already awaiting review
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {existing.question_count || '...'} questions were generated for this document —
                resume without paying for a new generation.
              </p>
            </div>
            <RiArrowRightLine className="size-4 text-primary shrink-0" />
          </button>
        )}

        <DialogFooter>
          <Button
            type="button"
            onClick={handleGenerate}
            disabled={isCreating}
            variant={existing ? 'outline' : 'default'}
            className="w-full"
          >
            {isCreating
              ? 'Generating questions...'
              : existing
                ? `Generate ${count} new questions anyway`
                : `Generate ${count} questions`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
