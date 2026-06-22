'use client'

import { useRef, useState } from 'react'
import {
  RiUploadCloud2Line,
  RiFilePdf2Line,
  RiFileTextLine,
  RiFileZipLine,
  RiCloseLine,
} from '@remixicon/react'
import { cn } from '@/lib/utils'
import { uploadDocument, deleteDocument, type DocumentSet } from '@/lib/api'
import {
  Attachment,
  AttachmentMedia,
  AttachmentContent,
  AttachmentTitle,
  AttachmentDescription,
  AttachmentActions,
  AttachmentAction,
  AttachmentTrigger,
  AttachmentGroup,
} from '@/components/ui/attachment'

interface Props {
  onUploaded: (docSet: DocumentSet) => void
}

const ALLOWED_EXT = ['.pdf', '.txt', '.md', '.docx', '.zip']
const MAX_BYTES = 50 * 1024 * 1024

function validate(file: File): string | null {
  const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '')
  if (!ALLOWED_EXT.includes(ext)) return `Unsupported type. Use: ${ALLOWED_EXT.join(', ')}`
  if (file.size > MAX_BYTES) return 'File too large. Max 50 MB.'
  return null
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return <RiFilePdf2Line className="size-5 text-red-400" />
  if (ext === 'zip') return <RiFileZipLine className="size-5 text-yellow-500" />
  return <RiFileTextLine className="size-5 text-muted-foreground" />
}

type UploadState = 'pending' | 'uploading' | 'done' | 'error'

interface UploadItem {
  id: string
  file: File
  state: UploadState
  docSet: DocumentSet | null
  error: string | null
}

function describe(item: UploadItem) {
  if (item.state === 'pending') return formatBytes(item.file.size)
  if (item.state === 'uploading') return 'Uploading…'
  if (item.state === 'error') return item.error ?? 'Upload failed'
  const isZip = item.file.name.endsWith('.zip')
  if (isZip && item.docSet) {
    return `${item.docSet.file_count} file${item.docSet.file_count !== 1 ? 's' : ''} indexed`
  }
  return formatBytes(item.file.size)
}

export function DocumentUploader({ onUploaded }: Props) {
  const [isDragging, setIsDragging] = useState(false)
  const [items, setItems] = useState<UploadItem[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  function patchItem(id: string, patch: Partial<UploadItem>) {
    setItems(prev => prev.map(it => (it.id === id ? { ...it, ...patch } : it)))
  }

  function handleFiles(files: FileList | File[]) {
    const list = Array.from(files)
    for (const file of list) {
      const err = validate(file)
      const id = crypto.randomUUID()
      setItems(prev => [...prev, { id, file, state: err ? 'error' : 'pending', docSet: null, error: err }])
    }
  }

  function startUpload(item: UploadItem) {
    patchItem(item.id, { state: 'uploading' })
    uploadDocument(item.file)
      .then(docSet => patchItem(item.id, { state: 'done', docSet }))
      .catch(e => patchItem(item.id, { state: 'error', error: e instanceof Error ? e.message : 'Upload failed' }))
  }

  function handleUploadAll() {
    items.filter(it => it.state === 'pending').forEach(startUpload)
  }

  const pendingCount = items.filter(it => it.state === 'pending').length
  const isUploading = items.some(it => it.state === 'uploading')

  function handleRemove(item: UploadItem) {
    setItems(prev => prev.filter(it => it.id !== item.id))
    if (item.state === 'done' && item.docSet) {
      deleteDocument(item.docSet.id).catch(() => {})
    }
  }

  return (
    <div className="w-full flex flex-col gap-3">
      <div
        role="button"
        aria-disabled={isUploading}
        tabIndex={isUploading ? -1 : 0}
        className={cn(
          'flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed transition-colors select-none outline-none',
          'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          items.length ? 'p-6' : 'p-14',
          isUploading
            ? 'opacity-50 cursor-not-allowed pointer-events-none'
            : 'cursor-pointer',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-muted-foreground/50 hover:bg-muted/10',
        )}
        onClick={() => { if (!isUploading) inputRef.current?.click() }}
        onKeyDown={e => { if (!isUploading && (e.key === 'Enter' || e.key === ' ')) inputRef.current?.click() }}
        onDragOver={e => { e.preventDefault(); if (!isUploading) setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => {
          e.preventDefault()
          setIsDragging(false)
          if (!isUploading && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files)
        }}
      >
        <div className="p-3 rounded-xl bg-muted/50">
          <RiUploadCloud2Line className="size-7 text-muted-foreground" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">
            {isUploading ? 'Uploading…' : 'Drop documents or archives here'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">PDF, DOCX, TXT, MD, ZIP — select multiple — max 50 MB each</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          disabled={isUploading}
          className="sr-only"
          accept=".pdf,.txt,.md,.docx,.zip"
          onChange={e => {
            if (e.target.files?.length) handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {items.length > 0 && (
        <AttachmentGroup
          role="group"
          aria-label="Uploaded documents"
          className={
            items.length > 3
              ? 'grid grid-cols-2 sm:grid-cols-3 gap-3 overflow-hidden'
              : undefined
          }
        >
          {items.map(item => (
            <Attachment
              key={item.id}
              state={item.state === 'pending' ? 'idle' : item.state}
              className={items.length > 3 ? 'w-full' : 'w-56'}
            >
              <AttachmentMedia>
                {item.state === 'uploading' ? (
                  <div className="size-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                ) : (
                  <FileIcon name={item.file.name} />
                )}
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle>{item.file.name}</AttachmentTitle>
                <AttachmentDescription>{describe(item)}</AttachmentDescription>
              </AttachmentContent>
              {item.state === 'done' && item.docSet && (
                <AttachmentTrigger
                  aria-label={`Use ${item.file.name} for querying`}
                  onClick={() => item.docSet && onUploaded(item.docSet)}
                />
              )}
              {item.state !== 'uploading' && (
                <AttachmentActions>
                  <AttachmentAction
                    aria-label={`Remove ${item.file.name}`}
                    onClick={() => handleRemove(item)}
                  >
                    <RiCloseLine className="size-3.5" />
                  </AttachmentAction>
                </AttachmentActions>
              )}
            </Attachment>
          ))}
        </AttachmentGroup>
      )}

      {pendingCount > 0 && (
        <button
          type="button"
          onClick={handleUploadAll}
          className="self-start rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Upload {pendingCount} document{pendingCount !== 1 ? 's' : ''}
        </button>
      )}
    </div>
  )
}
