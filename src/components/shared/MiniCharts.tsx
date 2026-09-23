'use client'

import { useMemo } from 'react'
import { formatNumber } from '@/lib/utils'

interface SeriesPoint {
  label: string
  value: number
  color?: string
}

/** Compact SVG bar chart — no chart library. */
export function SimpleBarChart({
  data,
  height = 160,
  barColor = '#0d6efd',
}: {
  data: SeriesPoint[]
  height?: number
  barColor?: string
}) {
  const max = Math.max(...data.map((d) => d.value), 1)
  const gap = 6
  const barW = data.length ? Math.max(10, Math.min(36, (520 - gap * data.length) / data.length)) : 20
  const width = Math.max(280, data.length * (barW + gap) + 24)
  const chartH = height - 28

  return (
    <div className="w-100 overflow-auto">
      <svg width={width} height={height} role="img" aria-label="Bar chart">
        {data.map((d, i) => {
          const h = (d.value / max) * (chartH - 8)
          const x = 12 + i * (barW + gap)
          const y = chartH - h
          return (
            <g key={`${d.label}-${i}`}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(h, 1)}
                rx={3}
                fill={d.color || barColor}
                opacity={0.9}
              />
              <text
                x={x + barW / 2}
                y={height - 8}
                textAnchor="middle"
                fontSize={9}
                fill="#6c757d"
              >
                {d.label}
              </text>
              <title>{`${d.label}: ${formatNumber(d.value, 0)} m`}</title>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/** Compact SVG line chart. */
export function SimpleLineChart({
  data,
  height = 160,
  stroke = '#198754',
}: {
  data: SeriesPoint[]
  height?: number
  stroke?: string
}) {
  const max = Math.max(...data.map((d) => d.value), 1)
  const padX = 16
  const padY = 12
  const width = Math.max(320, data.length * 28)
  const chartH = height - 28
  const chartW = width - padX * 2

  const points = useMemo(() => {
    if (!data.length) return ''
    return data
      .map((d, i) => {
        const x = padX + (data.length === 1 ? chartW / 2 : (i / (data.length - 1)) * chartW)
        const y = padY + (1 - d.value / max) * (chartH - padY)
        return `${x},${y}`
      })
      .join(' ')
  }, [data, max, chartH, chartW])

  return (
    <div className="w-100 overflow-auto">
      <svg width={width} height={height} role="img" aria-label="Line chart">
        <polyline
          fill="none"
          stroke={stroke}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points}
        />
        {data.map((d, i) => {
          const x = padX + (data.length === 1 ? chartW / 2 : (i / (data.length - 1)) * chartW)
          const y = padY + (1 - d.value / max) * (chartH - padY)
          return (
            <g key={`${d.label}-${i}`}>
              <circle cx={x} cy={y} r={3.5} fill={stroke} />
              <text x={x} y={height - 6} textAnchor="middle" fontSize={9} fill="#6c757d">
                {d.label}
              </text>
              <title>{`${d.label}: ${formatNumber(d.value, 0)} m`}</title>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/** Horizontal bars for loom / model ranking. */
export function SimpleHBarList({
  data,
  maxBars = 10,
}: {
  data: SeriesPoint[]
  maxBars?: number
}) {
  const slice = data.slice(0, maxBars)
  const max = Math.max(...slice.map((d) => d.value), 1)
  return (
    <div className="d-flex flex-column gap-2">
      {slice.map((d) => (
        <div key={d.label}>
          <div className="d-flex justify-content-between small mb-1">
            <span className="fw-semibold text-truncate">{d.label}</span>
            <span className="font-monospace text-secondary">{formatNumber(d.value, 0)} m</span>
          </div>
          <div className="progress" style={{ height: 8 }}>
            <div
              className="progress-bar"
              role="progressbar"
              style={{
                width: `${(d.value / max) * 100}%`,
                backgroundColor: d.color || '#0d6efd',
              }}
              aria-valuenow={d.value}
              aria-valuemin={0}
              aria-valuemax={max}
            />
          </div>
        </div>
      ))}
      {slice.length === 0 && <p className="text-secondary small mb-0">No data</p>}
    </div>
  )
}
