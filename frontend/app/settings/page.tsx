'use client'

import { useEffect, useState } from 'react'
import { RiEyeLine, RiEyeOffLine, RiCheckLine, RiCloseLine, RiLoader4Line, RiKey2Line } from '@remixicon/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { getSettings, validateKey, saveSettings } from '@/lib/api'

type KeyStatus = 'idle' | 'validating' | 'valid' | 'invalid'

interface KeyState {
  value: string
  show: boolean
  status: KeyStatus
  error: string
}

const INIT: KeyState = { value: '', show: false, status: 'idle', error: '' }

export default function SettingsPage() {
  const [or, setOr] = useState<KeyState>(INIT)
  const [co, setCo] = useState<KeyState>(INIT)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getSettings()
      .then(s => {
        if (s.openrouter_key_preview) setOr(prev => ({ ...prev, value: s.openrouter_key_preview }))
        if (s.cohere_key_preview) setCo(prev => ({ ...prev, value: s.cohere_key_preview }))
      })
      .catch(() => {})
  }, [])

  function change(set: typeof setOr) {
    return (v: string) => set(prev => ({ ...prev, value: v, status: 'idle', error: '' }))
  }

  function toggleShow(set: typeof setOr) {
    return () => set(prev => ({ ...prev, show: !prev.show }))
  }

  async function validate(provider: 'openrouter' | 'cohere', state: KeyState, set: typeof setOr) {
    if (!state.value.trim()) return
    set(prev => ({ ...prev, status: 'validating', error: '' }))
    try {
      const res = await validateKey(provider, state.value.trim())
      set(prev => ({ ...prev, status: res.valid ? 'valid' : 'invalid', error: res.error ?? '' }))
    } catch (e: unknown) {
      set(prev => ({ ...prev, status: 'invalid', error: e instanceof Error ? e.message : 'Unknown error' }))
    }
  }

  async function save() {
    setSaving(true)
    try {
      await saveSettings(or.value.trim(), co.value.trim())
      toast.success('Keys saved — pipelines will use new credentials')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save keys')
    } finally {
      setSaving(false)
    }
  }

  const canSave = or.status === 'valid' && co.status === 'valid'

  return (
    <main className="mx-auto max-w-xl px-6 py-16 flex flex-col gap-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1.5">Configure API keys for LLM generation and embeddings.</p>
      </div>

      <KeyCard
        title="OpenRouter API Key"
        description="Powers LLM generation (all pipelines) and OpenAI embeddings (B & D) via openrouter.ai"
        placeholder="sk-or-..."
        state={or}
        onChange={change(setOr)}
        onToggleShow={toggleShow(setOr)}
        onValidate={() => validate('openrouter', or, setOr)}
      />

      <KeyCard
        title="Cohere API Key"
        description="Powers Pipeline C embeddings and reranking via the Cohere SDK"
        placeholder="your-cohere-key"
        state={co}
        onChange={change(setCo)}
        onToggleShow={toggleShow(setCo)}
        onValidate={() => validate('cohere', co, setCo)}
      />

      <div className="flex justify-end">
        <Button onClick={save} disabled={!canSave || saving} className="gap-2">
          {saving && <RiLoader4Line className="size-4 animate-spin" />}
          Save Keys
        </Button>
      </div>
    </main>
  )
}

interface KeyCardProps {
  title: string
  description: string
  placeholder: string
  state: KeyState
  onChange: (v: string) => void
  onToggleShow: () => void
  onValidate: () => void
}

function KeyCard({ title, description, placeholder, state, onChange, onToggleShow, onValidate }: KeyCardProps) {
  return (
    <div className="rounded-xl border bg-card p-6 flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 items-center justify-center rounded-lg bg-muted">
          <RiKey2Line className="size-4 text-muted-foreground" />
        </span>
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={state.show ? 'text' : 'password'}
            value={state.value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-lg border border-input bg-transparent px-3 py-2 pr-10 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0 transition-shadow"
          />
          <button
            type="button"
            onClick={onToggleShow}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            tabIndex={-1}
          >
            {state.show ? <RiEyeOffLine className="size-4" /> : <RiEyeLine className="size-4" />}
          </button>
        </div>
        <Button
          variant="outline"
          onClick={onValidate}
          disabled={!state.value.trim() || state.status === 'validating'}
          className="shrink-0 gap-1.5"
        >
          {state.status === 'validating' && <RiLoader4Line className="size-3.5 animate-spin" />}
          Validate
        </Button>
      </div>

      {state.status === 'valid' && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-500">
          <RiCheckLine className="size-3.5" />
          Key is valid
        </div>
      )}
      {state.status === 'invalid' && (
        <div className="flex items-start gap-1.5 text-xs text-destructive">
          <RiCloseLine className="size-3.5 mt-px shrink-0" />
          <span>{state.error || 'Invalid key — check and try again'}</span>
        </div>
      )}
    </div>
  )
}
