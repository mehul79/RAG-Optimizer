'use client'

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { PIPELINE_META, PIPELINE_IDS, type PipelineId } from '@/lib/constants'
import type { EvalResult } from '@/lib/types'

interface Props {
  evalResults: Record<string, EvalResult>
}

const METRICS: { key: keyof EvalResult; label: string }[] = [
  { key: 'faithfulness', label: 'Faithfulness' },
  { key: 'answer_relevancy', label: 'Answer Rel.' },
  { key: 'context_precision', label: 'Ctx Precision' },
]

export function RadarChartView({ evalResults }: Props) {
  const data = METRICS.map(({ key, label }) => {
    const point: Record<string, string | number> = { metric: label }
    PIPELINE_IDS.forEach(id => {
      const r = evalResults[id]
      if (r) {
        const v = r[key]
        point[id] = typeof v === 'number' ? Math.round(v * 100) : 0
      }
    })
    return point
  })

  return (
    <div className="rounded-xl border bg-card p-5">
      <p className="text-sm font-medium mb-4 text-foreground">RAGAS Scores</p>
      <ResponsiveContainer width="100%" height={240}>
        <RadarChart data={data} margin={{ top: 0, right: 16, bottom: 0, left: 16 }}>
          <PolarGrid stroke="oklch(0.4 0 0 / 0.35)" />
          <PolarAngleAxis
            dataKey="metric"
            tick={{ fontSize: 11, fill: 'oklch(0.65 0 0)' }}
          />
          {PIPELINE_IDS.map(id => {
            const meta = PIPELINE_META[id as PipelineId]
            return (
              <Radar
                key={id}
                name={`${id}: ${meta.label}`}
                dataKey={id}
                stroke={meta.color}
                fill={meta.color}
                fillOpacity={0.14}
                dot={false}
                strokeWidth={1.5}
              />
            )
          })}
          <Legend
            iconSize={8}
            wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}
