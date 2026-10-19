'use client'

import { useMemo, useState } from 'react'
import { MetricCard } from '@/components/shared/MetricCard'
import { formatNumber, cn } from '@/lib/utils'
import { Layers, Gauge, Search, CalendarDays, Cpu } from 'lucide-react'
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
  type ProductionReport,
} from '@/services/floorReportsClient'

/** Monthly floor output per loom — computed on the server from the saved daily sheets. */
export default function MonthlyProductionReportsPage() {
  const months = useMemo(() => monthOptions(), [])
  const [month, setMonth] = useState(getProductionTodayMonth())
  const range = useMemo(() => monthRange(month), [month])
  const { report, error, loading } = useProductionReport(range.from, range.to)
  const [category, setCategory] = useState('ALL')
  const [search, setSearch] = useState('')


  const categories = useMemo(
    () => ['ALL', ...new Set((report?.byLoom || []).map((l) => l.category || 'Other'))],
    [report]
  )

  const looms = (report?.byLoom || []).filter((l) => {
    if (category !== 'ALL' && (l.category || 'Other') !== category) return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    return String(l.loomNumber).includes(q) || (l.mainQuality || '').toLowerCase().includes(q)
  })

  const sum = (pick: (l: ProductionReport['byLoom'][number]) => number) =>
    looms.reduce((s, l) => s + pick(l), 0)
  const totalMeters = sum((l) => l.meters)
  const totalTheo = sum((l) => l.theoretical)
  const effOf = (m: number, t: number) => (t > 0 ? (m / t) * 100 : 0)
  const runningLooms = looms.filter((l) => l.meters > 0).length

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Monthly Floor Output"
        breadcrumbs={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Production', href: '/floor/production' },
          { label: 'Monthly Report' },
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
            <ExportPdfButton filename={`Production-Monthly-${month}`} />
          </>
        }
      />

      {loading ? (
        <ProductionReportSkeleton />
      ) : error ? (
        <div className="alert alert-danger">{error}</div>
      ) : report ? (
        <>
          <ReportDataCheck report={report} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Total Production"
              value={`${formatNumber(totalMeters, 0)} m`}
              subValue={`Shift A ${formatNumber(sum((l) => l.shiftA), 0)} · Shift B ${formatNumber(sum((l) => l.shiftB), 0)}`}
              icon={Layers}
              colorVariant="blue"
            />
            <MetricCard
              title="Efficiency (meters ÷ theoretical)"
              value={`${effOf(totalMeters, totalTheo).toFixed(1)}%`}
              subValue={`Theoretical ${formatNumber(totalTheo, 0)} m`}
              icon={Gauge}
              colorVariant="blue"
            />
            <MetricCard
              title="Days Entered"
              value={String(report.totals.days)}
              subValue={`${report.byDay[0]?.date ?? '—'} → ${report.byDay[report.byDay.length - 1]?.date ?? '—'}`}
              icon={CalendarDays}
              colorVariant="amber"
            />
            <MetricCard
              title="Looms With Production"
              value={String(runningLooms)}
              subValue={`of ${looms.length} looms`}
              icon={Cpu}
              colorVariant="purple"
            />
          </div>

          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-card p-4 rounded-xl border border-border">
              <div className="flex flex-wrap items-center gap-1.5">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer',
                      category === cat
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    {cat === 'ALL' ? 'All Looms' : cat}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search Loom #, Quality..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 w-60 rounded-lg border border-border bg-background pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
              <TablePanScroll>
                <table className="w-full min-w-[900px] text-left border-collapse font-mono text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/60 text-[11px] font-bold uppercase tracking-wider text-muted-foreground font-sans">
                      <th className="py-3 px-3">Loom #</th>
                      <th className="py-3 px-3">Main Quality</th>
                      <th className="py-3 px-2 text-center">Run Days</th>
                      <th className="py-3 px-2 text-right">Shift A (m)</th>
                      <th className="py-3 px-2 text-right">Shift B (m)</th>
                      <th className="py-3 px-3 text-right">Total (m)</th>
                      <th className="py-3 px-3 text-right">Theo (m)</th>
                      <th className="py-3 px-3 text-center">Efficiency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {looms.map((l) => {
                      const eff = effOf(l.meters, l.theoretical)
                      return (
                        <tr key={l.loomNumber} className="hover:bg-muted/30 transition-colors">
                          <td className="py-2.5 px-3">
                            <span className="font-bold text-foreground">
                              #{String(l.loomNumber).padStart(2, '0')}
                            </span>{' '}
                            <span className="rounded bg-muted px-1.5 text-[10px] text-muted-foreground border">
                              {l.category || '—'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-sans text-foreground font-medium">
                            {l.mainQuality || '—'}
                          </td>
                          <td className="py-2.5 px-2 text-center font-semibold">{l.runDays} d</td>
                          <td className="py-2.5 px-2 text-right text-muted-foreground">{formatNumber(l.shiftA, 0)}</td>
                          <td className="py-2.5 px-2 text-right text-muted-foreground">{formatNumber(l.shiftB, 0)}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-foreground">{formatNumber(l.meters, 0)} m</td>
                          <td className="py-2.5 px-3 text-right text-muted-foreground">{formatNumber(l.theoretical, 0)} m</td>
                          <td className="py-2.5 px-3 text-center">
                            {l.theoretical > 0 ? (
                              <span
                                className={cn(
                                  'rounded-full px-2 py-0.5 text-[11px] font-bold',
                                  eff >= 85
                                    ? 'bg-blue-500/15 text-blue-700'
                                    : eff >= 70
                                      ? 'bg-sky-500/15 text-sky-700'
                                      : 'bg-rose-500/15 text-rose-700'
                                )}
                              >
                                {eff.toFixed(1)}%
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/80 font-bold text-foreground">
                      <td colSpan={3} className="py-3 px-3 uppercase tracking-wider font-sans">
                        Total ({looms.length} looms)
                      </td>
                      <td className="py-3 px-2 text-right">{formatNumber(sum((l) => l.shiftA), 0)}</td>
                      <td className="py-3 px-2 text-right">{formatNumber(sum((l) => l.shiftB), 0)}</td>
                      <td className="py-3 px-3 text-right">{formatNumber(totalMeters, 0)} m</td>
                      <td className="py-3 px-3 text-right text-muted-foreground">{formatNumber(totalTheo, 0)} m</td>
                      <td className="py-3 px-3 text-center">{effOf(totalMeters, totalTheo).toFixed(1)}%</td>
                    </tr>
                  </tfoot>
                </table>
              </TablePanScroll>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
