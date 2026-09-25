'use client'

import { useState } from 'react'
import {
  TrendingUp,
  BarChart3,
  PieChart,
  Gauge,
  Activity,
  Layers,
  ArrowUpRight,
  Sparkles,
  Zap,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Info,
} from 'lucide-react'
import { formatNumber, cn } from '@/lib/utils'

interface DailyTrendItem {
  day: string
  date: string
  totalMeters: number
  shiftA: number
  shiftB: number
  efficiency: number
  target: number
}

const TREND_DATA: DailyTrendItem[] = [
  { day: 'Day 2', date: '02-Aug', totalMeters: 3840, shiftA: 2090, shiftB: 1750, efficiency: 67.2, target: 4000 },
  { day: 'Day 3', date: '03-Aug', totalMeters: 3920, shiftA: 2140, shiftB: 1780, efficiency: 68.5, target: 4000 },
  { day: 'Day 4', date: '04-Aug', totalMeters: 4050, shiftA: 2210, shiftB: 1840, efficiency: 70.8, target: 4000 },
  { day: 'Day 5', date: '05-Aug', totalMeters: 3990, shiftA: 2180, shiftB: 1810, efficiency: 69.8, target: 4000 },
  { day: 'Day 6', date: '06-Aug', totalMeters: 4110, shiftA: 2240, shiftB: 1870, efficiency: 71.9, target: 4000 },
  { day: 'Day 7', date: '07-Aug', totalMeters: 3780, shiftA: 2050, shiftB: 1730, efficiency: 66.1, target: 4000 },
  { day: 'Day 8', date: '08-Aug', totalMeters: 3980, shiftA: 2160, shiftB: 1820, efficiency: 69.6, target: 4000 },
  { day: 'Day 9 (Today)', date: '09-Aug', totalMeters: 4004, shiftA: 2190, shiftB: 1814, efficiency: 69.8, target: 4000 },
]

interface ModelBreakdown {
  model: string
  looms: string
  loomCount: number
  meters: number
  percentage: number
  efficiency: number
  rpm: number
  color: string
  bgLight: string
  borderColor: string
}

const MODEL_DATA: ModelBreakdown[] = [
  {
    model: 'G6200 Rapier',
    looms: 'Looms 1 - 20',
    loomCount: 20,
    meters: 2401,
    percentage: 60.0,
    efficiency: 73.5,
    rpm: 395,
    color: '#0d6efd',
    bgLight: 'bg-blue-50 dark:bg-blue-950/40',
    borderColor: 'border-blue-200 dark:border-blue-800',
  },
  {
    model: 'G6300 Rapier',
    looms: 'Looms 27 - 34',
    loomCount: 8,
    meters: 901,
    percentage: 22.5,
    efficiency: 61.8,
    rpm: 465,
    color: '#0284c7',
    bgLight: 'bg-sky-50 dark:bg-sky-950/40',
    borderColor: 'border-sky-200 dark:border-sky-800',
  },
  {
    model: 'PU Sulzer Projectile',
    looms: 'Looms 21 - 26',
    loomCount: 6,
    meters: 702,
    percentage: 17.5,
    efficiency: 69.2,
    rpm: 295,
    color: '#6366f1',
    bgLight: 'bg-indigo-50 dark:bg-indigo-950/40',
    borderColor: 'border-indigo-200 dark:border-indigo-800',
  },
]

export function ProductionCharts() {
  const [activeMetric, setActiveMetric] = useState<'meters' | 'efficiency' | 'shifts'>('meters')
  const [hoveredDay, setHoveredDay] = useState<DailyTrendItem | null>(TREND_DATA[TREND_DATA.length - 1])
  const [hoveredModel, setHoveredModel] = useState<ModelBreakdown | null>(null)

  // Chart coordinate bounds
  const minMeters = 3500
  const maxMeters = 4300
  const chartHeight = 180
  const chartWidth = 600

  // Helper coordinate mapper
  const getY = (val: number, min: number, max: number) => {
    return chartHeight - ((val - min) / (max - min)) * (chartHeight - 30) - 15
  }

  const getX = (index: number, total: number) => {
    const padding = 35
    const step = (chartWidth - padding * 2) / (total - 1)
    return padding + index * step
  }

  // Construct SVG Path points
  const points = TREND_DATA.map((d, i) => ({
    x: getX(i, TREND_DATA.length),
    y: activeMetric === 'efficiency' ? getY(d.efficiency, 60, 80) : getY(d.totalMeters, minMeters, maxMeters),
    data: d,
  }))

  const pathD = points.reduce((acc, p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`), '')
  const areaD = `${pathD} L ${points[points.length - 1].x} ${chartHeight} L ${points[0].x} ${chartHeight} Z`

  // Target line Y coordinate
  const targetY = activeMetric === 'efficiency' ? getY(70, 60, 80) : getY(4000, minMeters, maxMeters)

  return (
    <div className="space-y-6">
      {/* SECTION 1: PRIMARY TREND & MODEL BREAKDOWN GRAPHS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT 8 COLS: Interactive Production & Efficiency Trend Graph */}
        <div className="lg:col-span-8 erp-card p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-lg bg-blue-50 text-[#0d6efd] dark:bg-blue-950 dark:text-blue-300">
                  <TrendingUp className="size-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Daily Production & Efficiency Matrix
                </h3>
                <span className="erp-badge-blue text-[10px]">
                  Days 2-9 Rollup
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Verified daily meter production from the 34-loom September 2026 production matrix.
              </p>
            </div>

            {/* View Filter Switcher */}
            <div className="flex items-center rounded-xl bg-slate-100 dark:bg-slate-800/80 p-1 border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setActiveMetric('meters')}
                className={cn(
                  'px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer',
                  activeMetric === 'meters'
                    ? 'bg-white dark:bg-slate-900 text-[#0d6efd] shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                )}
              >
                Meters Produced
              </button>
              <button
                type="button"
                onClick={() => setActiveMetric('efficiency')}
                className={cn(
                  'px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer',
                  activeMetric === 'efficiency'
                    ? 'bg-white dark:bg-slate-900 text-[#0d6efd] shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                )}
              >
                Efficiency %
              </button>
              <button
                type="button"
                onClick={() => setActiveMetric('shifts')}
                className={cn(
                  'px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer',
                  activeMetric === 'shifts'
                    ? 'bg-white dark:bg-slate-900 text-[#0d6efd] shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                )}
              >
                Shift A / B
              </button>
            </div>
          </div>

          {/* Quick Hover Summary Pill */}
          {hoveredDay && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 dark:text-white">{hoveredDay.day} ({hoveredDay.date})</span>
                <span className="text-slate-400">•</span>
                <span className="font-mono font-bold text-[#0d6efd]">
                  {formatNumber(hoveredDay.totalMeters, 0)} meters
                </span>
                <span className="text-slate-400">•</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                  {hoveredDay.efficiency}% Running Eff
                </span>
              </div>
              <div className="flex items-center gap-3 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                <span>Shift A: <strong className="text-slate-800 dark:text-slate-200">{formatNumber(hoveredDay.shiftA, 0)}m</strong></span>
                <span>Shift B: <strong className="text-slate-800 dark:text-slate-200">{formatNumber(hoveredDay.shiftB, 0)}m</strong></span>
                <span className={cn(
                  'font-semibold px-1.5 py-0.2 rounded',
                  hoveredDay.totalMeters >= hoveredDay.target
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                )}>
                  {hoveredDay.totalMeters >= hoveredDay.target ? `+${hoveredDay.totalMeters - hoveredDay.target}m (Target Met)` : `-${hoveredDay.target - hoveredDay.totalMeters}m (Under)`}
                </span>
              </div>
            </div>
          )}

          {/* SVG Vector Chart Area */}
          <div className="relative w-full overflow-x-auto">
            {activeMetric === 'shifts' ? (
              /* Shift Stacked Bar Comparison Chart */
              <div className="h-[210px] w-full flex items-end justify-between gap-2 sm:gap-4 px-2 pt-4 pb-6">
                {TREND_DATA.map((item, idx) => {
                  const maxDayMeters = 4400
                  const heightA = (item.shiftA / maxDayMeters) * 160
                  const heightB = (item.shiftB / maxDayMeters) * 160
                  const isHovered = hoveredDay?.day === item.day

                  return (
                    <div
                      key={item.day}
                      onMouseEnter={() => setHoveredDay(item)}
                      className={cn(
                        'flex-1 flex flex-col items-center gap-1.5 transition-all cursor-pointer rounded-lg p-1',
                        isHovered ? 'bg-blue-50/80 dark:bg-blue-950/40 ring-1 ring-blue-300' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      )}
                    >
                      <span className="text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300">
                        {formatNumber(item.totalMeters, 0)}m
                      </span>
                      
                      <div className="w-full max-w-[28px] sm:max-w-[36px] flex flex-col items-stretch gap-0.5">
                        {/* Shift A Bar (Day) */}
                        <div
                          style={{ height: `${heightA}px` }}
                          className="w-full rounded-t-sm bg-[#0d6efd] relative group"
                          title={`Shift A: ${item.shiftA}m`}
                        />
                        {/* Shift B Bar (Night) */}
                        <div
                          style={{ height: `${heightB}px` }}
                          className="w-full rounded-b-sm bg-sky-400 dark:bg-sky-500 relative group"
                          title={`Shift B: ${item.shiftB}m`}
                        />
                      </div>

                      <span className="text-[10px] font-semibold text-slate-500 whitespace-nowrap">
                        {item.date}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              /* Vector Area & Line Chart */
              <div className="w-full">
                <svg
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  className="w-full h-[200px] overflow-visible"
                >
                  <defs>
                    <linearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0d6efd" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#0d6efd" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="emeraldGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0d6efd" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#0d6efd" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Grid lines */}
                  {[0.2, 0.4, 0.6, 0.8].map((ratio) => {
                    const y = chartHeight * ratio
                    return (
                      <line
                        key={ratio}
                        x1="25"
                        y1={y}
                        x2={chartWidth - 25}
                        y2={y}
                        stroke="currentColor"
                        strokeDasharray="4 4"
                        className="text-slate-200 dark:text-slate-800"
                        strokeWidth="1"
                      />
                    )
                  })}

                  {/* Target Benchmark Line (4,000m or 70%) */}
                  <line
                    x1="25"
                    y1={targetY}
                    x2={chartWidth - 25}
                    y2={targetY}
                    stroke="#f59e0b"
                    strokeDasharray="3 3"
                    strokeWidth="1.5"
                  />
                  <text
                    x={chartWidth - 30}
                    y={targetY - 5}
                    textAnchor="end"
                    className="text-[9px] fill-amber-600 font-mono font-bold"
                  >
                    {activeMetric === 'efficiency' ? 'Target 70.0% Eff' : 'Target 4,000 m'}
                  </text>

                  {/* Gradient Area Fill */}
                  <path
                    d={areaD}
                    fill={activeMetric === 'efficiency' ? 'url(#emeraldGradient)' : 'url(#blueGradient)'}
                  />

                  {/* Primary Trend Line */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={activeMetric === 'efficiency' ? '#0d6efd' : '#0d6efd'}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Data Point Nodes */}
                  {points.map((p, idx) => {
                    const isSelected = hoveredDay?.day === p.data.day
                    return (
                      <g
                        key={p.data.day}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredDay(p.data)}
                      >
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={isSelected ? 6 : 4}
                          className={cn(
                            'transition-all',
                            activeMetric === 'efficiency'
                              ? isSelected ? 'fill-emerald-600 stroke-white stroke-2' : 'fill-emerald-500'
                              : isSelected ? 'fill-[#0d6efd] stroke-white stroke-2' : 'fill-[#0d6efd]'
                          )}
                        />
                        {/* Day label */}
                        <text
                          x={p.x}
                          y={chartHeight - 2}
                          textAnchor="middle"
                          className={cn(
                            'text-[10px] font-sans transition-colors',
                            isSelected
                              ? 'fill-slate-900 dark:fill-white font-bold'
                              : 'fill-slate-400 font-medium'
                          )}
                        >
                          {p.data.date}
                        </text>
                      </g>
                    )
                  })}
                </svg>
              </div>
            )}
          </div>

          {/* Chart Legend */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-[#0d6efd]" />
                <span>Shift A (Day Shift)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-sky-400" />
                <span>Shift B (Night Shift)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 border-b-2 border-amber-500" />
                <span>Standard Daily Target (4,000m)</span>
              </span>
            </div>
            <span className="font-mono text-[11px] text-slate-400">
              Avg Daily Output: <strong>3,959 m / Day</strong>
            </span>
          </div>
        </div>

        {/* RIGHT 4 COLS: Loom Model Breakdown & Output Distribution */}
        <div className="lg:col-span-4 erp-card p-5 sm:p-6 space-y-4 flex flex-col justify-between">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
                  <PieChart className="size-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Loom Model Distribution
                </h3>
              </div>
              <span className="font-mono text-xs font-bold text-slate-600 dark:text-slate-300">
                34 Looms
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Meter production and running efficiency allocated by loom technology.
            </p>
          </div>

          {/* Visual Stacked Progress Strip */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-mono font-semibold">
              <span className="text-[#0d6efd]">G6200 (60.0%)</span>
              <span className="text-sky-600">G6300 (22.5%)</span>
              <span className="text-indigo-600">PU (17.5%)</span>
            </div>
            <div className="h-3 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex shadow-inner">
              <div style={{ width: '60.0%' }} className="h-full bg-[#0d6efd]" title="G6200: 2,401m (60.0%)" />
              <div style={{ width: '22.5%' }} className="h-full bg-sky-500" title="G6300: 901m (22.5%)" />
              <div style={{ width: '17.5%' }} className="h-full bg-indigo-500" title="PU Sulzer: 702m (17.5%)" />
            </div>
          </div>

          {/* Model Cards List */}
          <div className="space-y-2.5">
            {MODEL_DATA.map((model) => (
              <div
                key={model.model}
                onMouseEnter={() => setHoveredModel(model)}
                onMouseLeave={() => setHoveredModel(null)}
                className={cn(
                  'p-3 rounded-xl border transition-all cursor-pointer',
                  model.borderColor,
                  model.bgLight,
                  hoveredModel?.model === model.model ? 'ring-2 ring-[#0d6efd]/20 shadow-xs' : ''
                )}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {model.model}
                    </span>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      {model.looms} • {model.loomCount} Units ({model.rpm} RPM)
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                      {formatNumber(model.meters, 0)} m
                    </span>
                    <span className="block text-[10px] font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                      {model.efficiency}% Eff
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Efficiency Summary Pill */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Zap className="size-4 text-amber-500" />
              <span className="text-slate-600 dark:text-slate-400 font-medium">Floor Manning & Health:</span>
            </div>
            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
              100% (34/34 Active)
            </span>
          </div>

        </div>

      </div>

      {/* SECTION 2: SHIFT PERFORMANCE & REAL-TIME LOOM MATRIX STATUS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Shift A Breakdown */}
        <div className="erp-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Shift A (Day • 12h)
            </span>
            <span className="erp-badge-blue text-[10px]">
              Master Asif
            </span>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
              2,190 m
            </span>
            <span className="text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400">
              72.4% Eff
            </span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div className="bg-[#0d6efd] h-full rounded-full" style={{ width: '54.7%' }} />
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            54.7% of daily output • 20 G6200 + 8 G6300 + 6 PU
          </p>
        </div>

        {/* Card 2: Shift B Breakdown */}
        <div className="erp-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Shift B (Night • 12h)
            </span>
            <span className="erp-badge-slate text-[10px]">
              Master Tariq
            </span>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
              1,814 m
            </span>
            <span className="text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400">
              67.2% Eff
            </span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div className="bg-sky-500 h-full rounded-full" style={{ width: '45.3%' }} />
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            45.3% of daily output • 20 G6200 + 8 G6300 + 6 PU
          </p>
        </div>

        {/* Card 3: Stop Loss Analysis */}
        <div className="erp-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Running Stop Loss
            </span>
            <span className="rounded bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 text-[10px] font-bold px-1.5 py-0.2 border border-rose-200 dark:border-rose-800">
              Floor Stoppages
            </span>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
              1,733 m
            </span>
            <span className="text-xs font-mono font-semibold text-rose-600 dark:text-rose-400">
              -30.2% Gap
            </span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div className="bg-rose-500 h-full rounded-full" style={{ width: '30.2%' }} />
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Theoretical: 5,737m • Warp/Weft/Knotting variance
          </p>
        </div>

        {/* Card 4: Daily Goal Fulfillment */}
        <div className="erp-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Daily Target Status
            </span>
            <span className="rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 text-[10px] font-bold px-1.5 py-0.2 border border-emerald-200 dark:border-emerald-800">
              100.1% Goal
            </span>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
              4,004 / 4,000 m
            </span>
            <span className="text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400">
              +4 m Surplus
            </span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div className="bg-emerald-500 h-full rounded-full" style={{ width: '100%' }} />
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Monthly Progress: 31,460 m (Days 2-9 Met)
          </p>
        </div>

      </div>
    </div>
  )
}
