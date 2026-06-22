import { getBatch } from '@/lib/api'
import { BatchView } from '@/components/batch/batch-view'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function BatchPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let batch = null
  try {
    batch = await getBatch(id)
  } catch {
    // backend down or batch not found
  }

  if (!batch) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <p className="text-sm text-muted-foreground">
          Test set not found or backend is unavailable.
        </p>
        <Link href="/" className="text-sm text-primary hover:underline">
          Back to home
        </Link>
      </div>
    )
  }

  return <BatchView initialBatch={batch} />
}
