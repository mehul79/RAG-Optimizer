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
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { PIPELINE_META, PIPELINE_IDS } from '@/lib/constants'
import type { PipelineResult } from '@/lib/types'

interface Props {
  pipelineResults: Record<string, PipelineResult>
}

const tooltipStyle = {
  contentStyle: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    fontSize: 11,
    color: 'var(--card-foreground)',
  },
  itemStyle: { color: 'var(--card-foreground)' },
  labelStyle: { color: 'var(--muted-foreground)' },
  cursor: { fill: 'var(--muted)', opacity: 0.4 },
}

function HBar({
  data,
  tickFormatter,
  valueFormatter,
  label,
}: {
  data: { name: string; value: number; color: string }[]
  tickFormatter: (v: number) => string
  valueFormatter: (v: number) => string
  label: string
}) {
  const max = Math.max(...data.map(d => d.value), 0.00001)
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 48, top: 4, bottom: 4 }}>
        <XAxis
          type="number"
          domain={[0, max * 1.2]}
          tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
          tickFormatter={tickFormatter}
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
          {...tooltipStyle}
          formatter={(v) => [valueFormatter(Number(v)), label]}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {data.map(d => (
            <Cell key={d.name} fill={d.color} fillOpacity={0.82} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function MetricsChart({ pipelineResults }: Props) {
  const base = PIPELINE_IDS.map(id => ({
    name: id,
    color: PIPELINE_META[id].chartColor,
    result: pipelineResults[id],
  }))

  const costData = base.map(d => ({ name: d.name, value: d.result?.cost_usd ?? 0, color: d.color }))
  const latencyData = base.map(d => ({ name: d.name, value: d.result?.latency_ms ?? 0, color: d.color }))
  const tokenData = base.map(d => ({
    name: d.name,
    value: d.result ? d.result.prompt_tokens + d.result.completion_tokens : 0,
    color: d.color,
  }))

  return (
    <Card>
      <CardHeader className="pb-0">
        <Tabs defaultValue="cost">
          <TabsList>
            <TabsTrigger value="cost">Cost</TabsTrigger>
            <TabsTrigger value="latency">Latency</TabsTrigger>
            <TabsTrigger value="tokens">Tokens</TabsTrigger>
          </TabsList>
          <CardContent className="pt-4 px-0">
            <TabsContent value="cost">
              <HBar
                data={costData}
                tickFormatter={v => `$${v.toFixed(5)}`}
                valueFormatter={v => `$${v.toFixed(5)}`}
                label="Cost (USD)"
              />
            </TabsContent>
            <TabsContent value="latency">
              <HBar
                data={latencyData}
                tickFormatter={v => `${(v / 1000).toFixed(1)}s`}
                valueFormatter={v => `${v.toLocaleString()}ms`}
                label="Latency"
              />
            </TabsContent>
            <TabsContent value="tokens">
              <HBar
                data={tokenData}
                tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                valueFormatter={v => `${v.toLocaleString()} tok`}
                label="Total Tokens"
              />
            </TabsContent>
          </CardContent>
        </Tabs>
      </CardHeader>
    </Card>
  )
}
