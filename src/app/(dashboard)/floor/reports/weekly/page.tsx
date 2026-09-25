'use client'

import { useState, useEffect } from 'react'
import { productionService, FloorWeeklyReport } from '@/services/productionService'
import { MetricCard } from '@/components/shared/MetricCard'
import { formatCurrency, formatNumber, cn } from '@/lib/utils'
import { CalendarRange, Layers, Gauge, DollarSign, ArrowUpRight, BarChart3 } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { ExportPdfButton } from '@/components/shared/ExportPdfButton'

export default function WeeklyProductionReportsPage() {
  const [reports, setReports] = useState<FloorWeeklyReport[]>([])
  const [selectedWeek, setSelectedWeek] = useState<number>(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const data = await productionService.getWeeklyRollups()
      setReports(data)
      setLoading(false)
    }
    load()
  }, [])

  const current = reports[selectedWeek]

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
            <div className="btn-group btn-group-sm" role="group" aria-label="Week selector">
              {reports.map((r, index) => (
                <button
                  key={r.weekLabel}
                  type="button"
                  onClick={() => setSelectedWeek(index)}
                  className={cn('btn', selectedWeek === index ? 'btn-primary' : 'btn-outline-primary')}
                >
                  Week {index + 1}
                </button>
              ))}
            </div>
            <ExportPdfButton
              filename={`Production-Weekly-${current?.weekLabel || `week-${selectedWeek + 1}`}`}
            />
          </>
        }
      />

      {current && (
        <>
          {/* KPI Metrics for Selected Week */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Weekly Production Total"
              value={`${formatNumber(current.totalMeters, 0)} m`}
              subValue={current.weekLabel}
              icon={Layers}
              colorVariant="blue"
              trend={{
                value: `Shift A: ${formatNumber(current.shiftAMeters, 0)}m`,
                isPositive: true,
                label: `Shift B: ${formatNumber(current.shiftBMeters, 0)}m`,
              }}
            />

            <MetricCard
              title="Average Weekly Efficiency"
              value={`${current.averageEfficiency.toFixed(1)}%`}
              subValue="Weighted Floor Average"
              icon={Gauge}
              colorVariant="blue"
              trend={{
                value: '+2.1%',
                isPositive: true,
                label: 'vs weekly target (82%)',
              }}
            />

            <MetricCard
              title="Active Running Looms"
              value={`${current.activeLoomsCount} / 34`}
              subValue="Weekly Floor Average"
              icon={BarChart3}
              colorVariant="amber"
            />

            <MetricCard
              title="Estimated Weekly Revenue"
              value={formatCurrency(current.totalRevenue)}
              subValue="Rate PKR 0.95/pick"
              icon={DollarSign}
              colorVariant="purple"
            />
          </div>

          {/* Model Breakdown Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-5 space-y-3 shadow-xs">
              <div className="flex items-center justify-between border-b border-border pb-2.5">
                <span className="font-bold text-xs text-foreground uppercase tracking-wider">
                  G6200 Rapier (Looms 1-20)
                </span>
                <span className="rounded bg-blue-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-blue-600 border border-blue-500/20">
                  {current.categoryBreakdown.G6200.efficiency}% Avg
                </span>
              </div>
              <div className="space-y-1">
                <div className="font-mono text-xl font-bold text-foreground">
                  {formatNumber(current.categoryBreakdown.G6200.totalMeters, 0)} m
                </div>
                <div className="text-xs text-muted-foreground">
                  Revenue: <span className="font-mono font-bold text-blue-600">{formatCurrency(current.categoryBreakdown.G6200.revenue)}</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 space-y-3 shadow-xs">
              <div className="flex items-center justify-between border-b border-border pb-2.5">
                <span className="font-bold text-xs text-foreground uppercase tracking-wider">
                  G6300 Rapier (Looms 21-28)
                </span>
                <span className="rounded bg-sky-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-sky-600 border border-sky-500/20">
                  {current.categoryBreakdown.G6300.efficiency}% Avg
                </span>
              </div>
              <div className="space-y-1">
                <div className="font-mono text-xl font-bold text-foreground">
                  {formatNumber(current.categoryBreakdown.G6300.totalMeters, 0)} m
                </div>
                <div className="text-xs text-muted-foreground">
                  Revenue: <span className="font-mono font-bold text-blue-600">{formatCurrency(current.categoryBreakdown.G6300.revenue)}</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 space-y-3 shadow-xs">
              <div className="flex items-center justify-between border-b border-border pb-2.5">
                <span className="font-bold text-xs text-foreground uppercase tracking-wider">
                  PU Sulzer (Looms 29-34)
                </span>
                <span className="rounded bg-purple-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-purple-600 border border-purple-500/20">
                  {current.categoryBreakdown.PU.efficiency}% Avg
                </span>
              </div>
              <div className="space-y-1">
                <div className="font-mono text-xl font-bold text-foreground">
                  {formatNumber(current.categoryBreakdown.PU.totalMeters, 0)} m
                </div>
                <div className="text-xs text-muted-foreground">
                  Revenue: <span className="font-mono font-bold text-blue-600">{formatCurrency(current.categoryBreakdown.PU.revenue)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 4 Weeks Comparison Matrix Table */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-bold text-foreground">Monthly Weekly Trend Comparison (September 2026)</h3>
              <span className="text-xs text-muted-foreground font-mono">All 4 Weeks</span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[760px] text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/60 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    <th className="py-3 px-3 min-w-[170px]">Week Period</th>
                    <th className="py-3 px-3 text-right font-mono min-w-[100px]">Shift A (m)</th>
                    <th className="py-3 px-3 text-right font-mono min-w-[100px]">Shift B (m)</th>
                    <th className="py-3 px-3 text-right font-mono min-w-[110px]">Total Meters</th>
                    <th className="py-3 px-3 text-center min-w-[110px]">Avg Efficiency</th>
                    <th className="py-3 px-3 text-center min-w-[100px]">Active Looms</th>
                    <th className="py-3 px-4 text-right font-mono min-w-[130px]">Weekly Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {reports.map((r, i) => (
                    <tr
                      key={r.weekLabel}
                      className={cn(
                        'hover:bg-muted/30 transition-colors',
                        selectedWeek === i && 'bg-blue-500/5 font-semibold'
                      )}
                    >
                      <td className="py-3 px-3 font-bold text-foreground min-w-[170px]">{r.weekLabel}</td>
                      <td className="py-3 px-3 text-right font-mono text-muted-foreground min-w-[100px]">
                        {formatNumber(r.shiftAMeters, 0)} m
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-muted-foreground min-w-[100px]">
                        {formatNumber(r.shiftBMeters, 0)} m
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-foreground min-w-[110px]">
                        {formatNumber(r.totalMeters, 0)} m
                      </td>
                      <td className="py-3 px-3 text-center min-w-[110px]">
                        <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[11px] font-bold text-blue-700 dark:text-blue-300">
                          {r.averageEfficiency.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center font-mono min-w-[100px]">{r.activeLoomsCount} / 34</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-blue-600 min-w-[130px]">
                        {formatCurrency(r.totalRevenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
