'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { RiLoaderLine, RiPlayLine } from '@remixicon/react'

interface Props {
  onRun: (query: string) => Promise<void>
  disabled?: boolean
}

export function QueryForm({ onRun, disabled }: Props) {
  const [query, setQuery] = useState('')
  const [isRunning, setIsRunning] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q || isRunning || disabled) return
    setIsRunning(true)
    try {
      await onRun(q)
      // stay disabled — the page is navigating away on success
    } catch (err) {
      setIsRunning(false)
      throw err
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-3">
      <div>
        <label className="text-sm font-medium text-foreground block mb-1.5">
          Ask a question about your document
        </label>
        <Textarea
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="What is the parental leave policy?"
          className="resize-none min-h-[88px]"
          disabled={isRunning || disabled}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              handleSubmit(e as unknown as React.FormEvent)
            }
          }}
        />
        <p className="text-[11px] text-muted-foreground mt-1">Cmd+Enter to run</p>
      </div>
      <Button
        type="submit"
        disabled={!query.trim() || isRunning || disabled}
        aria-busy={isRunning}
        className="w-full"
      >
        {isRunning ? (
          <RiLoaderLine className="size-4 mr-2 animate-spin" />
        ) : (
          <RiPlayLine className="size-4 mr-2" />
        )}
        {isRunning ? 'Starting experiment...' : 'Run across 4 pipelines'}
      </Button>
    </form>
  )
}
