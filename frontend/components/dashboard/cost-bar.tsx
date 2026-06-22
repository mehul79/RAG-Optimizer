'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PIPELINE_META, PIPELINE_IDS } from '@/lib/constants'
import type { PipelineResult } from '@/lib/types'

interface Props {
  pipelineResults: Record<string, PipelineResult>
}

export function CostBarChart({ pipelineResults }: Props) {
  const data = PIPELINE_IDS.map(id => ({
    name: id,
    cost: pipelineResults[id]?.cost_usd ?? 0,
    color: PIPELINE_META[id].chartColor,
  }))

  const maxCost = Math.max(...data.map(d => d.cost), 0.00001)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Cost per Pipeline (USD)</CardTitle>
      </CardHeader>
      <CardContent>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ left: 8, right: 48, top: 4, bottom: 4 }}
        >
          <XAxis
            type="number"
            domain={[0, maxCost * 1.2]}
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
            tickFormatter={v => `$${v.toFixed(5)}`}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'monospace' }}
            width={20}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
            formatter={(v) => [`$${Number(v).toFixed(5)}`, 'Cost']}
            contentStyle={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              fontSize: 11,
              color: 'var(--card-foreground)',
            }}
            itemStyle={{ color: 'var(--card-foreground)' }}
            labelStyle={{ color: 'var(--muted-foreground)' }}
          />
          <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
            {data.map(d => (
              <Cell key={d.name} fill={d.color} fillOpacity={0.82} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
