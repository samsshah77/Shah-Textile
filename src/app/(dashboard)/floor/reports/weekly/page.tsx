'use client'

import { useMemo, useState } from 'react'
import { MetricCard } from '@/components/shared/MetricCard'
import { formatNumber, cn } from '@/lib/utils'
import { CalendarRange, Layers, Gauge, Cpu } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { ExportPdfButton } from '@/components/shared/ExportPdfButton'
import { TablePanScroll } from '@/components/shared/TablePanScroll'
import { ProductionReportSkeleton } from '@/components/floor/ProductionSkeleton'
import { ReportDataCheck } from '@/components/floor/ReportDataCheck'
import { getProductionTodayMonth } from '@/constants/productionCalendar'
import { useProductionReport } from '@/hooks/useProductionReport'
import {
  monthOptions,
  monthRange,
  monthWeeks,
  type ProductionReport,
} from '@/services/floorReportsClient'

type WeekRow = {
  label: string
  from: string
  to: string
  days: number
  meters: number
  shiftA: number
  shiftB: number
  avgEfficiency: number | null
  activeLooms: number
  byCategory: { category: string; meters: number; avgEfficiency: number | null }[]
}

function avg(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x != null)
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null
}

/** Weekly floor output (1–7, 8–14, …) — computed on the server from the saved daily sheets. */
export default function WeeklyProductionReportsPage() {
  const months = useMemo(() => monthOptions(), [])
  const [month, setMonth] = useState(getProductionTodayMonth())
  const range = useMemo(() => monthRange(month), [month])
  const { report, error, loading } = useProductionReport(range.from, range.to)
  const [picked, setPicked] = useState<{ month: string; index: number } | null>(null)


  const weeks: WeekRow[] = useMemo(() => {
    if (!report) return []
    return monthWeeks(month).map((w) => {
      const days = report.byDay.filter((d) => d.date >= w.from && d.date <= w.to)
      const cats = report.byDayCategory.filter((d) => d.date >= w.from && d.date <= w.to)
      const catNames = [...new Set(cats.map((c) => c.category))].sort()
      return {
        ...w,
        days: days.length,
        meters: days.reduce((s, d) => s + d.meters, 0),
        shiftA: days.reduce((s, d) => s + d.shiftA, 0),
        shiftB: days.reduce((s, d) => s + d.shiftB, 0),
        avgEfficiency: avg(days.map((d) => d.avgEfficiency)),
        activeLooms: Math.max(0, ...cats.length ? groupLooms(cats) : [0]),
        byCategory: catNames.map((c) => {
          const rows = cats.filter((x) => x.category === c)
          return {
            category: c,
            meters: rows.reduce((s, x) => s + x.meters, 0),
            avgEfficiency: avg(rows.map((x) => x.avgEfficiency)),
          }
        }),
      }
    })
  }, [report, month])

  // Default: the latest week that has data; a clicked week sticks for this month.
  const lastWithData = weeks.reduce((idx, w, i) => (w.days > 0 ? i : idx), 0)
  const selected = picked && picked.month === month ? picked.index : lastWithData
  const setSelected = (index: number) => setPicked({ month, index })

  const current = weeks[selected]

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Weekly Production"
        breadcrumbs={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Production', href: '/floor/production' },
          { label: 'Weekly Report' },
        ]}
        actions={
          <>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="form-select form-select-sm"
              aria-label="Month"
            >
              {months.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <div className="btn-group btn-group-sm" role="group" aria-label="Week selector">
              {weeks.map((w, i) => (
                <button
                  key={w.label}
                  type="button"
                  onClick={() => setSelected(i)}
                  className={cn('btn', selected === i ? 'btn-primary' : 'btn-outline-primary')}
                >
                  {w.label}
                </button>
              ))}
            </div>
            <ExportPdfButton filename={`Production-Weekly-${month}-${current?.label || ''}`} />
          </>
        }
      />

      {loading ? (
        <ProductionReportSkeleton />
      ) : error ? (
        <div className="alert alert-danger">{error}</div>
      ) : report && current ? (
        <>
          <ReportDataCheck report={report} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Week Production"
              value={`${formatNumber(current.meters, 0)} m`}
              subValue={`${current.from} → ${current.to}`}
              icon={Layers}
              colorVariant="blue"
            />
            <MetricCard
              title="Shift A / Shift B"
              value={`${formatNumber(current.shiftA, 0)} / ${formatNumber(current.shiftB, 0)}`}
              subValue="meters"
              icon={CalendarRange}
              colorVariant="blue"
            />
            <MetricCard
              title="Avg Efficiency"
              value={current.avgEfficiency != null ? `${current.avgEfficiency.toFixed(1)}%` : '—'}
              subValue={`${current.days} day(s) entered`}
              icon={Gauge}
              colorVariant="amber"
            />
            <MetricCard
              title="Looms With Production"
              value={String(current.activeLooms)}
              subValue="max on any day of the week"
              icon={Cpu}
              colorVariant="purple"
            />
          </div>

          {current.byCategory.length > 0 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {current.byCategory.map((c) => (
                <div key={c.category} className="rounded-xl border border-border bg-card p-4">
                  <div className="text-xs font-bold uppercase text-muted-foreground">{c.category}</div>
                  <div className="text-lg font-bold">{formatNumber(c.meters, 0)} m</div>
                  <div className="text-xs text-muted-foreground">
                    Avg efficiency {c.avgEfficiency != null ? `${c.avgEfficiency.toFixed(1)}%` : '—'}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
            <TablePanScroll>
              <table className="w-full min-w-[720px] text-left border-collapse font-mono text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/60 text-[11px] font-bold uppercase tracking-wider text-muted-foreground font-sans">
                    <th className="py-3 px-3">Week</th>
                    <th className="py-3 px-2 text-center">Days</th>
                    <th className="py-3 px-2 text-right">Shift A (m)</th>
                    <th className="py-3 px-2 text-right">Shift B (m)</th>
                    <th className="py-3 px-3 text-right">Total (m)</th>
                    <th className="py-3 px-3 text-center">Avg Eff.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {weeks.map((w, i) => (
                    <tr
                      key={w.label}
                      className={cn('cursor-pointer hover:bg-muted/30', i === selected && 'bg-muted/50')}
                      onClick={() => setSelected(i)}
                    >
                      <td className="py-3 px-3 font-bold">
                        {w.label} <span className="font-normal text-muted-foreground">({w.from.slice(5)} → {w.to.slice(5)})</span>
                      </td>
                      <td className="py-3 px-2 text-center">{w.days}</td>
                      <td className="py-3 px-2 text-right">{formatNumber(w.shiftA, 0)}</td>
                      <td className="py-3 px-2 text-right">{formatNumber(w.shiftB, 0)}</td>
                      <td className="py-3 px-3 text-right font-bold">{formatNumber(w.meters, 0)}</td>
                      <td className="py-3 px-3 text-center">
                        {w.avgEfficiency != null ? `${w.avgEfficiency.toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/80 font-bold">
                    <td className="py-3 px-3 font-sans uppercase">Month total</td>
                    <td className="py-3 px-2 text-center">{report.totals.days}</td>
                    <td className="py-3 px-2 text-right">{formatNumber(report.totals.shiftA, 0)}</td>
                    <td className="py-3 px-2 text-right">{formatNumber(report.totals.shiftB, 0)}</td>
                    <td className="py-3 px-3 text-right">{formatNumber(report.totals.meters, 0)}</td>
                    <td className="py-3 px-3" />
                  </tr>
                </tfoot>
              </table>
            </TablePanScroll>
          </div>
        </>
      ) : null}
    </div>
  )
}

/** Looms with production per day (summed over categories); returns one count per day. */
function groupLooms(cats: ProductionReport['byDayCategory']): number[] {
  const byDay = new Map<string, number>()
  for (const c of cats) byDay.set(c.date, (byDay.get(c.date) || 0) + c.looms)
  return [...byDay.values()]
}
