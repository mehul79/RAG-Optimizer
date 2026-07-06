# ZIP Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to upload a `.zip` archive containing multiple documents; the backend extracts, parses, and indexes all supported files as a single document set.

**Architecture:** The upload route detects `.zip` by extension, extracts it with stdlib `zipfile`, parses each contained file using the existing `parse_document()` function, concatenates the results with a separator, and passes the combined text to the existing `index_document_set()` background task unchanged. The frontend dropzone gains `.zip` in its accept list and shows a ZIP icon with file-count feedback after upload.

**Tech Stack:** Python `zipfile` (stdlib — no new dep), FastAPI `UploadFile`, React/TypeScript, Remixicon (`RiFileZipLine`).

## Global Constraints

- No new Python dependencies — use stdlib `zipfile` only
- No new npm packages — Remixicon already installed (`@remixicon/react`)
- `index_document_set(doc_set_id, text)` signature must not change — both tasks share this
- ZIP size limit: same `settings.max_upload_size_mb` as single files (checked before extraction)
- Skip files that fail parsing — only raise if zero files succeed
- Skip `__MACOSX/`, `.DS_Store`, directories, and any entry whose extension is not in `{".pdf", ".txt", ".md", ".docx"}`

---

### Task 1: Backend — ZIP extraction in the upload route

**Files:**
- Modify: `backend/app/api/routes/documents.py`

**Interfaces:**
- Consumes: `parse_document(content: bytes, filename: str) -> str` (unchanged, from `ingestion.py`)
- Consumes: `index_document_set(doc_set_id: str, text: str) -> None` (unchanged background task)
- Produces: `POST /documents/upload` now also accepts `Content-Type` multipart with a `.zip` file and returns the same `DocumentSetResponse` with `file_count` set to the number of successfully parsed files

- [ ] **Step 1: Add zip extraction helper to `documents.py`**

Replace the contents of `backend/app/api/routes/documents.py` with:

```python
import zipfile
from io import BytesIO
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.config import settings
from app.models.db import DocumentSet
from app.models.schemas import DocumentSetResponse
from app.services.ingestion import index_document_set, parse_document

router = APIRouter(prefix="/documents", tags=["documents"])

_ALLOWED = {".pdf", ".txt", ".md", ".docx"}


def _extract_zip(content: bytes) -> list[tuple[str, bytes]]:
    """Return (filename, file_bytes) for each parseable file inside the zip."""
    results = []
    with zipfile.ZipFile(BytesIO(content)) as zf:
        for name in zf.namelist():
            # skip directories and mac/hidden metadata
            if name.endswith("/") or "__MACOSX" in name or Path(name).name.startswith("."):
                continue
            if Path(name).suffix.lower() in _ALLOWED:
                results.append((Path(name).name, zf.read(name)))
    return results


@router.post("/upload", response_model=DocumentSetResponse, status_code=202)
async def upload_document(
    file: UploadFile,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    suffix = Path(file.filename or "upload").suffix.lower()
    if suffix not in _ALLOWED and suffix != ".zip":
        raise HTTPException(400, f"Unsupported file type. Allowed: {sorted(_ALLOWED | {'.zip'})}")

    content = await file.read()
    if len(content) > settings.max_upload_size_mb * 1024 * 1024:
        raise HTTPException(413, f"File exceeds {settings.max_upload_size_mb} MB limit")

    if suffix == ".zip":
        entries = _extract_zip(content)
        if not entries:
            raise HTTPException(400, "ZIP contains no supported files (.pdf, .txt, .md, .docx)")

        texts: list[str] = []
        for fname, fbytes in entries:
            try:
                texts.append(parse_document(fbytes, fname))
            except Exception:
                pass  # skip files that fail to parse

        if not texts:
            raise HTTPException(400, "ZIP contained no parseable text")

        text = "\n\n---\n\n".join(texts)
        doc_set = DocumentSet(name=file.filename or "upload.zip", file_count=len(texts))
    else:
        text = parse_document(content, file.filename or "upload")
        doc_set = DocumentSet(name=file.filename or "upload", file_count=1)

    db.add(doc_set)
    await db.commit()
    await db.refresh(doc_set)

    background_tasks.add_task(index_document_set, doc_set.id, text)
    return doc_set


@router.get("", response_model=list[DocumentSetResponse])
async def list_documents(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DocumentSet).order_by(DocumentSet.created_at.desc()))
    return result.scalars().all()


@router.get("/{doc_set_id}", response_model=DocumentSetResponse)
async def get_document(doc_set_id: str, db: AsyncSession = Depends(get_db)):
    ds = await db.get(DocumentSet, doc_set_id)
    if not ds:
        raise HTTPException(404, "Document set not found")
    return ds
```

- [ ] **Step 2: Smoke-test the route manually**

Start (or restart) the backend:
```
cd backend
uv run uvicorn app.main:app --reload --port 8000
```

Create a test zip with two files and send it:
```bash
# In a temp dir, create two text files and zip them
echo "Hello from file one" > /tmp/a.txt
echo "Hello from file two" > /tmp/b.txt
cd /tmp && zip test_upload.zip a.txt b.txt

curl -X POST http://localhost:8000/documents/upload \
  -F "file=@/tmp/test_upload.zip" | python -m json.tool
```

Expected response:
```json
{
  "id": "<uuid>",
  "name": "test_upload.zip",
  "file_count": 2,
  "status": "processing",
  "created_at": "..."
}
```

- [ ] **Step 3: Verify `file_count` for single-file upload is still 1**

```bash
echo "Single file test" > /tmp/single.txt
curl -X POST http://localhost:8000/documents/upload \
  -F "file=@/tmp/single.txt" | python -m json.tool
```

Expected: `"file_count": 1`

- [ ] **Step 4: Verify bad-zip rejection**

```bash
# Upload a non-zip file with .zip extension
echo "not a zip" > /tmp/fake.zip
curl -X POST http://localhost:8000/documents/upload \
  -F "file=@/tmp/fake.zip"
```

Expected: HTTP 500 or 400 (zipfile raises `BadZipFile` — this will surface as a 500; acceptable for now, or wrap with `except zipfile.BadZipFile: raise HTTPException(400, "Invalid ZIP file")` if preferred).

Optionally add the guard to `_extract_zip`:
```python
def _extract_zip(content: bytes) -> list[tuple[str, bytes]]:
    try:
        with zipfile.ZipFile(BytesIO(content)) as zf:
            ...
    except zipfile.BadZipFile:
        raise HTTPException(400, "Invalid or corrupt ZIP file")
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/documents.py
git commit -m "feat: accept ZIP upload — extract and index all contained documents"
```

---

### Task 2: Frontend — ZIP support in the document uploader

**Files:**
- Modify: `frontend/components/upload/document-uploader.tsx`

**Interfaces:**
- Consumes: `uploadDocument(file: File): Promise<DocumentSet>` from `lib/api.ts` — unchanged, just sends the file as multipart
- Produces: The dropzone now accepts `.zip` files; after a successful ZIP upload the attachment card shows a zip icon and "N files indexed" in the description

- [ ] **Step 1: Update `document-uploader.tsx`**

Replace the full contents of `frontend/components/upload/document-uploader.tsx` with:

```tsx
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
import { uploadDocument, type DocumentSet } from '@/lib/api'
import {
  Attachment,
  AttachmentMedia,
  AttachmentContent,
  AttachmentTitle,
  AttachmentDescription,
  AttachmentActions,
  AttachmentAction,
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

type UploadState = 'idle' | 'uploading' | 'done' | 'error'

export function DocumentUploader({ onUploaded }: Props) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadedSet, setUploadedSet] = useState<DocumentSet | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    const err = validate(file)
    if (err) { setError(err); return }
    setError(null)
    setSelectedFile(file)
    setUploadState('uploading')
    try {
      const docSet = await uploadDocument(file)
      setUploadedSet(docSet)
      setUploadState('done')
      onUploaded(docSet)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
      setUploadState('error')
    }
  }

  function handleClear() {
    setSelectedFile(null)
    setUploadedSet(null)
    setUploadState('idle')
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  function attachmentDescription() {
    if (uploadState === 'uploading') return 'Uploading…'
    if (uploadState === 'error') return error ?? 'Upload failed'
    if (uploadState === 'done' && uploadedSet) {
      const isZip = selectedFile?.name.endsWith('.zip')
      return isZip
        ? `${uploadedSet.file_count} file${uploadedSet.file_count !== 1 ? 's' : ''} indexed`
        : formatBytes(selectedFile?.size ?? 0)
    }
    return selectedFile ? formatBytes(selectedFile.size) : ''
  }

  if (selectedFile) {
    return (
      <div className="w-full flex flex-col gap-2">
        <Attachment
          state={uploadState === 'uploading' ? 'uploading' : uploadState === 'error' ? 'error' : 'done'}
          className="w-full"
        >
          <AttachmentMedia>
            {uploadState === 'uploading' ? (
              <div className="size-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            ) : (
              <FileIcon name={selectedFile.name} />
            )}
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>{selectedFile.name}</AttachmentTitle>
            <AttachmentDescription>{attachmentDescription()}</AttachmentDescription>
          </AttachmentContent>
          {uploadState !== 'uploading' && (
            <AttachmentActions>
              <AttachmentAction onClick={handleClear} aria-label="Remove file">
                <RiCloseLine className="size-3.5" />
              </AttachmentAction>
            </AttachmentActions>
          )}
        </Attachment>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div
        role="button"
        tabIndex={0}
        className={cn(
          'flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-14 transition-colors cursor-pointer select-none outline-none',
          'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-muted-foreground/50 hover:bg-muted/10',
        )}
        onClick={() => inputRef.current?.click()}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
        onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => {
          e.preventDefault()
          setIsDragging(false)
          const file = e.dataTransfer.files[0]
          if (file) handleFile(file)
        }}
      >
        <div className="p-3 rounded-xl bg-muted/50">
          <RiUploadCloud2Line className="size-7 text-muted-foreground" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">Drop your document or archive here</p>
          <p className="text-xs text-muted-foreground mt-0.5">PDF, DOCX, TXT, MD — or a ZIP of any mix — max 50 MB</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept=".pdf,.txt,.md,.docx,.zip"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
            e.target.value = ''
          }}
        />
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Verify in the browser**

With `npm run dev` running (or pm2 serving it), open `http://localhost:3000`.

1. Click the dropzone → file picker should show `*.pdf,*.txt,*.md,*.docx,*.zip` in the filter
2. Select a `.zip` — it should show the spinner while uploading, then `N files indexed` in the attachment card
3. Select a single `.pdf` — should still show file size as before
4. Try dragging a `.zip` file onto the dropzone — should work identically

- [ ] **Step 3: Commit**

```bash
git add frontend/components/upload/document-uploader.tsx
git commit -m "feat: accept ZIP in dropzone, show file count after indexed"
```
