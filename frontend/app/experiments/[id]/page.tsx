import { getExperiment } from '@/lib/api'
import { ExperimentView } from '@/components/experiment/experiment-view'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function ExperimentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let experiment = null
  try {
    experiment = await getExperiment(id)
  } catch {
    // backend down or experiment not found
  }

  if (!experiment) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <p className="text-sm text-muted-foreground">
          Experiment not found or backend is unavailable.
        </p>
        <Link href="/" className="text-sm text-primary hover:underline">
          Back to home
        </Link>
      </div>
    )
  }

  return <ExperimentView initialExperiment={experiment} />
}
