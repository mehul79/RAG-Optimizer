'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { RiDeleteBinLine, RiUploadCloud2Line } from '@remixicon/react'
import { DocumentUploader } from '@/components/upload/document-uploader'
import { IndexingStatus } from '@/components/upload/indexing-status'
import { QueryForm } from '@/components/experiment/query-form'
import { GenerateBatchDialog } from '@/components/batch/generate-batch-dialog'
import { deleteDocument, getDocument, runExperiment, type DocumentSet } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

function HomeContent() {
  const router = useRouter()
  const docId = useSearchParams().get('doc')
  const [docSet, setDocSet] = useState<DocumentSet | null>(null)
  const [isReady, setIsReady] = useState(false)

  // Bare "/" is always a fresh uploader — in-progress work lives on the
  // history page. Only an explicit ?doc=<id> resumes a document set.
  useEffect(() => {
    if (!docId) {
      setDocSet(null)
      setIsReady(false)
      return
    }
    getDocument(docId)
      .then(ds => {
        if (ds.status === 'failed') return
        setDocSet(ds)
        setIsReady(ds.status === 'ready')
      })
      .catch(() => {}) // backend down or doc deleted — stay on uploader
  }, [docId])

  const handleUploaded = useCallback(
    (ds: DocumentSet) => {
      setDocSet(ds)
      router.replace(`/?doc=${ds.id}`)
    },
    [router],
  )

  const handleReady = useCallback((ds: DocumentSet) => {
    setIsReady(true)
    setDocSet(ds)
  }, [])

  async function handleRun(query: string) {
    if (!docSet) return
    const { experiment_id } = await runExperiment(docSet.id, query)
    router.push(`/experiments/${experiment_id}`)
  }

  return (
    <main className="h-[calc(100vh-57px)] overflow-hidden mx-auto max-w-xl px-6 py-16 flex flex-col justify-center gap-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground tracking-tight">
          Compare RAG pipelines
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
          Upload a document, ask a question — see how 4 different retrieval configurations
          compare on faithfulness, relevancy, and cost.
        </p>
      </div>

      {!docSet ? (
        <DocumentUploader onUploaded={handleUploaded} />
      ) : (
        <IndexingStatus docSet={docSet} onReady={handleReady} />
      )}

      {isReady && docSet && (
        <div className="space-y-2.5">
          <QueryForm onRun={handleRun} />
          <div className="flex items-center gap-2 justify-center">
            <span className="text-xs text-muted-foreground/70">or</span>
            <GenerateBatchDialog documentSetId={docSet.id} variant="ghost" size="sm" />
          </div>
        </div>
      )}

      {docSet && (
        <div className="flex items-center justify-between gap-3 pt-4 border-t border-border/60">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => router.replace('/')}
          >
            <RiUploadCloud2Line />
            Upload a different document
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="destructive" size="sm">
                <RiDeleteBinLine />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this document?</AlertDialogTitle>
                <AlertDialogDescription>
                  This document has already been indexed. Deleting it will remove its index and
                  all of its experiments from history. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-white hover:bg-destructive/90"
                  onClick={async () => {
                    await deleteDocument(docSet.id).catch(() => {})
                    router.replace('/')
                  }}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </main>
  )
}

export default function Home() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  )
}
