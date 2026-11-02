'use client'

import { useCallback, useState, type MouseEvent } from 'react'
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

/** Width of the chart's box, so the chart always fits it (no sideways scrolling). */
function useBoxWidth(fallback = 520) {
  const [width, setWidth] = useState(fallback)
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const update = () => setWidth(Math.max(240, Math.floor(el.clientWidth)))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/** Show every n-th label so labels never overlap (about 48 px each); first and last always shown. */
function labelStep(count: number, width: number) {
  const fit = Math.max(2, Math.floor(width / 48))
  return Math.max(1, Math.ceil(count / fit))
}
const showLabel = (i: number, count: number, step: number) => i === count - 1 || (i % step === 0 && count - 1 - i >= step / 2)

/** Compact SVG bar chart — no chart library. Fits its box; labels thin out when crowded. */
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
  const [boxRef, width] = useBoxWidth()
  const max = Math.max(...data.map((d) => d.value), 1)
  const padX = 8
  const slot = data.length ? (width - padX * 2) / data.length : width
  const barW = Math.max(3, Math.min(36, slot * 0.7))
  const chartH = height - 24
  const step = labelStep(data.length, width)

  return (
    <div ref={boxRef} className="w-100" onMouseLeave={() => setTip(null)}>
      <svg width={width} height={height} role="img" aria-label="Bar chart" style={{ display: 'block' }}>
        <line x1={padX} x2={width - padX} y1={chartH} y2={chartH} stroke="#dee2e6" />
        {data.map((d, i) => {
          const h = (d.value / max) * (chartH - 8)
          const cx = padX + slot * i + slot / 2
          return (
            <g key={`${d.label}-${i}`}>
              <rect
                x={cx - barW / 2}
                y={chartH - h}
                width={barW}
                height={Math.max(h, 1)}
                rx={Math.min(3, barW / 3)}
                fill={d.color || barColor}
                opacity={0.9}
                style={{ cursor: 'pointer' }}
                onMouseEnter={(e) => setTip(tipFromMouse(e, d.label, d.value, valueSuffix))}
                onMouseMove={(e) => setTip(tipFromMouse(e, d.label, d.value, valueSuffix))}
              />
              {showLabel(i, data.length, step) && (
                <text x={cx} y={height - 6} textAnchor="middle" fontSize={12} fontWeight={600} fill="#1e293b">
                  {d.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <ChartHoverChip tip={tip} />
    </div>
  )
}

/** Compact SVG line chart. Fits its box; labels thin out when crowded. */
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
  const [boxRef, width] = useBoxWidth()
  const max = Math.max(...data.map((d) => d.value), 1)
  const padX = 24
  const padY = 10
  const chartH = height - 22
  const chartW = width - padX * 2
  const step = labelStep(data.length, width)
  const xy = (i: number, v: number) => ({
    x: padX + (data.length === 1 ? chartW / 2 : (i / (data.length - 1)) * chartW),
    y: padY + (1 - v / max) * (chartH - padY),
  })
  const points = data.map((d, i) => xy(i, d.value)).map((p) => `${p.x},${p.y}`).join(' ')
  const dot = data.length > 40 ? 2.5 : 4

  return (
    <div ref={boxRef} className="w-100" onMouseLeave={() => setTip(null)}>
      <svg width={width} height={height} role="img" aria-label="Line chart" style={{ display: 'block' }}>
        <polyline fill="none" stroke={stroke} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" points={points} />
        {data.map((d, i) => {
          const { x, y } = xy(i, d.value)
          return (
            <g key={`${d.label}-${i}`}>
              <circle
                cx={x}
                cy={y}
                r={Math.max(7, dot + 3)}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onMouseEnter={(e) => setTip(tipFromMouse(e, d.label, d.value, valueSuffix))}
                onMouseMove={(e) => setTip(tipFromMouse(e, d.label, d.value, valueSuffix))}
              />
              <circle cx={x} cy={y} r={dot} fill={stroke} stroke="#fff" strokeWidth={1.5} style={{ pointerEvents: 'none' }} />
              {showLabel(i, data.length, step) && (
                <text x={x} y={height - 6} textAnchor="middle" fontSize={12} fontWeight={600} fill="#1e293b">
                  {d.label}
                </text>
              )}
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
            <span className="font-monospace fw-semibold text-dark">
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
      {slice.length === 0 && <p className="text-dark small mb-0">No data</p>}
    </div>
  )
}
