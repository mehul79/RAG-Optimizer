import Link from 'next/link'
import { RiArrowRightLine, RiFileLine, RiSparklingLine } from '@remixicon/react'
import { listBatches, listDocuments, listExperiments } from '@/lib/api'
import { PIPELINE_META, type PipelineId } from '@/lib/constants'
import { Badge } from '@/components/ui/badge'
import { DeleteButton } from '@/components/experiment/delete-button'

export const dynamic = 'force-dynamic'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const DOC_STATUS_STYLE: Record<string, string> = {
  processing: 'bg-primary/12 text-primary border border-primary/30',
  ready: 'bg-emerald-500/12 text-emerald-400 border border-emerald-500/30',
  failed: 'bg-destructive/12 text-destructive border border-destructive/30',
}

const DOC_STATUS_LABEL: Record<string, string> = {
  processing: 'indexing',
  ready: 'ready',
  failed: 'failed',
}

const BATCH_STATUS_STYLE: Record<string, string> = {
  generating: 'bg-primary/12 text-primary border border-primary/30',
  review: 'bg-amber-500/12 text-amber-500 border border-amber-500/30',
  running: 'bg-primary/12 text-primary border border-primary/30',
  complete: 'bg-emerald-500/12 text-emerald-400 border border-emerald-500/30',
  failed: 'bg-destructive/12 text-destructive border border-destructive/30',
}

export default async function ExperimentsPage() {
  let experiments: Awaited<ReturnType<typeof listExperiments>> = []
  let documents: Awaited<ReturnType<typeof listDocuments>> = []
  let batches: Awaited<ReturnType<typeof listBatches>> = []
  try {
    ;[experiments, documents, batches] = await Promise.all([
      listExperiments(),
      listDocuments(),
      listBatches(),
    ])
  } catch {
    // backend offline — show empty state
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-xl font-semibold text-foreground">
          Experiment History
        </h1>
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          New experiment
        </Link>
      </div>

      {documents.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-medium text-muted-foreground mb-3">Documents</h2>
          <div className="space-y-2">
            {documents.map(doc => (
              <div
                key={doc.id}
                className="flex items-center rounded-xl border border-border bg-card hover:bg-muted/25 transition-colors group"
              >
                <Link
                  href={`/?doc=${doc.id}`}
                  className="flex flex-1 items-center gap-4 px-4 py-3 min-w-0"
                >
                  <RiFileLine className="size-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{doc.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                      {formatDate(doc.created_at)} · {doc.file_count}{' '}
                      {doc.file_count === 1 ? 'file' : 'files'}
                    </p>
                  </div>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md shrink-0 ${DOC_STATUS_STYLE[doc.status]}`}
                  >
                    {DOC_STATUS_LABEL[doc.status]}
                  </span>
                  <RiArrowRightLine className="size-4 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors shrink-0" />
                </Link>
                <div className="pr-3 shrink-0">
                  <DeleteButton documentId={doc.id} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {batches.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-medium text-muted-foreground mb-3">Test sets</h2>
          <div className="space-y-2">
            {batches.map(batch => (
              <div
                key={batch.id}
                className="flex items-center rounded-xl border border-border bg-card hover:bg-muted/25 transition-colors group"
              >
                <Link
                  href={`/batches/${batch.id}`}
                  className="flex flex-1 items-center gap-4 px-4 py-3 min-w-0"
                >
                  <RiSparklingLine className="size-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">
                      Test set · {batch.question_count || '...'} questions
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                      {formatDate(batch.created_at)}
                      {batch.status === 'running' || batch.status === 'complete'
                        ? ` · ${batch.completed_count}/${batch.question_count} done`
                        : ''}
                    </p>
                  </div>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md shrink-0 ${BATCH_STATUS_STYLE[batch.status]}`}
                  >
                    {batch.status}
                  </span>
                  <RiArrowRightLine className="size-4 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors shrink-0" />
                </Link>
                <div className="pr-3 shrink-0">
                  <DeleteButton batchId={batch.id} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(documents.length > 0 || batches.length > 0) && (
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Experiments</h2>
      )}

      {experiments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
          <p className="text-sm text-muted-foreground">No experiments yet.</p>
          <Link href="/" className="text-sm text-primary hover:underline">
            Run your first experiment
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {experiments.map(exp => {
            const winnerMeta = exp.winner_pipeline
              ? PIPELINE_META[exp.winner_pipeline as PipelineId]
              : null
            return (
              <div
                key={exp.id}
                className="flex items-center rounded-xl border border-border bg-card hover:bg-muted/25 transition-colors group"
              >
                <Link
                  href={`/experiments/${exp.id}`}
                  className="flex flex-1 items-center gap-4 px-4 py-3.5 min-w-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{exp.query}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                      {formatDate(exp.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {winnerMeta ? (
                      <span
                        className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md"
                        style={{
                          color: winnerMeta.color,
                          backgroundColor: winnerMeta.colorDim,
                        }}
                      >
                        {exp.winner_pipeline} won
                      </span>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] px-1.5">
                        {exp.status}
                      </Badge>
                    )}
                    <RiArrowRightLine className="size-4 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                  </div>
                </Link>
                <div className="pr-3 shrink-0">
                  <DeleteButton experimentId={exp.id} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
