'use client'

import { useEffect, useState } from 'react'
import { RiCheckLine, RiErrorWarningLine, RiLoaderLine, RiFileLine } from '@remixicon/react'
import { getDocument, type DocumentSet } from '@/lib/api'
import { PIPELINE_META, PIPELINE_IDS } from '@/lib/constants'

interface Props {
  docSet: DocumentSet
  onReady: (docSet: DocumentSet) => void
}

export function IndexingStatus({ docSet: initial, onReady }: Props) {
  const [docSet, setDocSet] = useState(initial)

  useEffect(() => {
    if (initial.status !== 'processing') {
      if (initial.status === 'ready') onReady(initial)
      return
    }
    const timer = setInterval(async () => {
      try {
        const updated = await getDocument(initial.id)
        setDocSet(updated)
        if (updated.status === 'ready' || updated.status === 'failed') {
          clearInterval(timer)
          if (updated.status === 'ready') onReady(updated)
        }
      } catch {
        // transient error, keep polling
      }
    }, 2000)
    return () => clearInterval(timer)
  }, [initial.id, initial.status, onReady])

  const isReady = docSet.status === 'ready'
  const isFailed = docSet.status === 'failed'

  return (
    <div className="w-full rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <RiFileLine className="size-4 text-muted-foreground shrink-0" />
        <p className="text-sm font-medium text-foreground truncate flex-1">{docSet.name}</p>
        {docSet.status === 'processing' && (
          <RiLoaderLine className="size-4 text-primary animate-spin shrink-0" />
        )}
        {isReady && <RiCheckLine className="size-4 text-emerald-500 shrink-0" />}
        {isFailed && <RiErrorWarningLine className="size-4 text-destructive shrink-0" />}
      </div>
      <div className="space-y-2.5">
        {PIPELINE_IDS.map(id => {
          const meta = PIPELINE_META[id]
          return (
            <div key={id} className="flex items-center gap-3">
              <span
                className="text-xs font-mono font-bold w-4 shrink-0 text-right"
                style={{ color: meta.color }}
              >
                {id}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${!isReady && !isFailed ? 'animate-pulse' : ''}`}
                  style={{
                    width: isReady || isFailed ? '100%' : '55%',
                    backgroundColor: isFailed ? 'var(--destructive)' : meta.color,
                    opacity: isReady ? 1 : isFailed ? 0.7 : 0.65,
                  }}
                />
              </div>
              <span className="text-[11px] text-muted-foreground w-16 text-right shrink-0 font-mono">
                {isReady ? 'indexed' : isFailed ? 'failed' : 'indexing'}
              </span>
            </div>
          )
        })}
      </div>
      {isFailed && (
        <p className="mt-3 text-xs text-destructive">
          Indexing failed. Please try uploading again.
        </p>
      )}
    </div>
  )
}
