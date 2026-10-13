'use client'

import { useMemo, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { formatNumber } from '@/lib/utils'

interface SeriesPoint {
  label: string
  value: number
  color?: string
}

type ChartTip = { x: number; y: number; label: string; value: string } | null

function ChartHoverChip({ tip }: { tip: ChartTip }) {
  if (!tip || typeof document === 'undefined') return null
  return createPortal(
    <div
      className="sara-chart-hover-chip"
      style={{
        left: tip.x,
        top: tip.y,
      }}
      role="tooltip"
    >
      <span className="sara-chart-hover-chip__label">{tip.label}</span>
      <span className="sara-chart-hover-chip__value">{tip.value}</span>
    </div>,
    document.body
  )
}

function formatPoint(value: number, suffix: string) {
  const n = formatNumber(value, 0)
  return suffix ? `${n}${suffix}` : n
}

function tipFromMouse(
  e: MouseEvent,
  label: string,
  value: number,
  valueSuffix: string
): ChartTip {
  return {
    x: e.clientX,
    y: e.clientY - 12,
    label,
    value: formatPoint(value, valueSuffix),
  }
}

/** Compact SVG bar chart — no chart library. */
export function SimpleBarChart({
  data,
  height = 160,
  barColor = '#0d6efd',
  valueSuffix = ' m',
}: {
  data: SeriesPoint[]
  height?: number
  barColor?: string
  /** e.g. ` m`, `%`, or `` for unitless */
  valueSuffix?: string
}) {
  const [tip, setTip] = useState<ChartTip>(null)
  const max = Math.max(...data.map((d) => d.value), 1)
  const gap = 6
  const barW = data.length ? Math.max(10, Math.min(36, (520 - gap * data.length) / data.length)) : 20
  const width = Math.max(280, data.length * (barW + gap) + 24)
  const chartH = height - 28

  return (
    <div className="w-100 overflow-auto" onMouseLeave={() => setTip(null)}>
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
                style={{ cursor: 'pointer' }}
                onMouseEnter={(e) => setTip(tipFromMouse(e, d.label, d.value, valueSuffix))}
                onMouseMove={(e) => setTip(tipFromMouse(e, d.label, d.value, valueSuffix))}
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
            </g>
          )
        })}
      </svg>
      <ChartHoverChip tip={tip} />
    </div>
  )
}

/** Compact SVG line chart. */
export function SimpleLineChart({
  data,
  height = 160,
  stroke = '#198754',
  valueSuffix = ' m',
}: {
  data: SeriesPoint[]
  height?: number
  stroke?: string
  valueSuffix?: string
}) {
  const [tip, setTip] = useState<ChartTip>(null)
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
    <div className="w-100 overflow-auto" onMouseLeave={() => setTip(null)}>
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
              <circle
                cx={x}
                cy={y}
                r={7}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onMouseEnter={(e) => setTip(tipFromMouse(e, d.label, d.value, valueSuffix))}
                onMouseMove={(e) => setTip(tipFromMouse(e, d.label, d.value, valueSuffix))}
              />
              <circle
                cx={x}
                cy={y}
                r={4.5}
                fill={stroke}
                stroke="#fff"
                strokeWidth={1.5}
                style={{ pointerEvents: 'none' }}
              />
              <text x={x} y={height - 6} textAnchor="middle" fontSize={9} fill="#6c757d">
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>
      <ChartHoverChip tip={tip} />
    </div>
  )
}

/** Horizontal bars for loom / model ranking. */
export function SimpleHBarList({
  data,
  maxBars = 10,
  valueSuffix = ' m',
}: {
  data: SeriesPoint[]
  maxBars?: number
  /** Shown after the number, e.g. ` m` or `%`. */
  valueSuffix?: string
}) {
  const slice = data.slice(0, maxBars)
  const max = Math.max(...slice.map((d) => d.value), 1)
  return (
    <div className="d-flex flex-column gap-2">
      {slice.map((d) => (
        <div key={d.label}>
          <div className="d-flex justify-content-between small mb-1">
            <span className="fw-semibold text-truncate">{d.label}</span>
            <span className="font-monospace text-secondary">
              {formatNumber(d.value, 0)}
              {valueSuffix}
            </span>
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
