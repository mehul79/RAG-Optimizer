'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RiDeleteBinLine } from '@remixicon/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { deleteBatch, deleteDocument, deleteExperiment } from '@/lib/api'

const COPY = {
  experiment: {
    title: 'Delete experiment?',
    description:
      'This will permanently delete the experiment and all its pipeline results. This cannot be undone.',
    error: 'Failed to delete experiment',
    remove: deleteExperiment,
  },
  document: {
    title: 'Delete document?',
    description:
      'This will permanently delete the document, its index, and all experiments run against it. This cannot be undone.',
    error: 'Failed to delete document',
    remove: deleteDocument,
  },
  batch: {
    title: 'Delete test set?',
    description:
      'This will permanently delete the test set and every experiment it ran. This cannot be undone.',
    error: 'Failed to delete test set',
    remove: deleteBatch,
  },
}

export function DeleteButton({
  experimentId,
  documentId,
  batchId,
}: {
  experimentId?: string
  documentId?: string
  batchId?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const kind = batchId ? 'batch' : documentId ? 'document' : 'experiment'
  const id = batchId ?? documentId ?? experimentId
  const copy = COPY[kind]

  function handleConfirm() {
    if (!id) return
    startTransition(async () => {
      try {
        await copy.remove(id)
        router.refresh()
      } catch {
        toast.error(copy.error)
      }
    })
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={pending}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
          aria-label={copy.title}
        >
          <RiDeleteBinLine className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className="bg-destructive/10 text-destructive hover:bg-destructive/20"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
