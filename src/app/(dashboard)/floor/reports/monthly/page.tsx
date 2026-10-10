'use client'

import { useState, useEffect } from 'react'
import { productionService, LoomMonthlyRollup } from '@/services/productionService'
import { MetricCard } from '@/components/shared/MetricCard'
import { LoomEfficiencyBadge } from '@/components/floor/LoomEfficiencyBadge'
import { formatCurrency, formatNumber, cn } from '@/lib/utils'
import {
  CalendarDays,
  Layers,
  Gauge,
  DollarSign,
  Gift,
  Download,
  Filter,
  Search,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { ExportPdfButton } from '@/components/shared/ExportPdfButton'
import { TablePanScroll } from '@/components/shared/TablePanScroll'

export default function MonthlyProductionReportsPage() {
  const [monthRollup, setMonthRollup] = useState<{
    month: string
    looomRollups: LoomMonthlyRollup[]
    grandTotalMeters: number
    grandTheoreticalMeters: number
    averageFloorEfficiency: number
    totalRevenuePKR: number
    totalBonusPayoutPKR: number
  } | null>(null)
  const [selectedMonth, setSelectedMonth] = useState('2026-09')
  const [filterCategory, setFilterCategory] = useState<'ALL' | 'G6200' | 'G6300' | 'PU'>('ALL')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const data = await productionService.getMonthlyLoomRollup(selectedMonth)
      setMonthRollup(data)
      setLoading(false)
    }
    load()
  }, [selectedMonth])

  const filteredLooms = (monthRollup?.looomRollups || []).filter((l) => {
    if (filterCategory !== 'ALL' && l.category !== filterCategory) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return l.loomNumber.toString().includes(q) || l.qualityName.toLowerCase().includes(q)
    }
    return true
  })

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
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="form-select form-select-sm"
              aria-label="Statement month"
            >
              <option value="2026-09">September 2026</option>
            </select>
            <ExportPdfButton filename={`Production-Monthly-${selectedMonth}`} />
          </>
        }
      />

      {monthRollup && (
        <>
          {/* Monthly KPI Metrics */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Monthly Grand Production"
              value={`${formatNumber(monthRollup.grandTotalMeters, 0)} m`}
              subValue="All 34 Looms"
              icon={Layers}
              colorVariant="blue"
            />

            <MetricCard
              title="Monthly Weighted Efficiency"
              value={`${monthRollup.averageFloorEfficiency.toFixed(1)}%`}
              subValue="Weighted Average"
              icon={Gauge}
              colorVariant="blue"
            />

            <MetricCard
              title="Operator Bonus Payout Pool"
              value={formatCurrency(monthRollup.totalBonusPayoutPKR)}
              subValue="Incentive Threshold ≥70%"
              icon={Gift}
              colorVariant="amber"
            />

            <MetricCard
              title="Total Monthly Mill Revenue"
              value={formatCurrency(monthRollup.totalRevenuePKR)}
              subValue="Contract Rate (0.95/pick)"
              icon={DollarSign}
              colorVariant="purple"
            />
          </div>

          {/* Table Container */}
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-card p-4 rounded-xl border border-border">
              <div className="flex flex-wrap items-center gap-1.5">
                {(['ALL', 'G6200', 'G6300', 'PU'] as const).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setFilterCategory(cat)}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer',
                      filterCategory === cat
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    {cat === 'ALL'
                      ? 'All 34 Looms'
                      : cat === 'G6200'
                      ? 'G6200 (1-20)'
                      : cat === 'G6300'
                      ? 'G6300 (21-28)'
                      : 'PU Sulzer (29-34)'}
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
                <table className="w-full min-w-[1100px] text-left border-collapse font-mono text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/60 text-[11px] font-bold uppercase tracking-wider text-muted-foreground font-sans">
                      <th className="py-3 px-3 w-28 min-w-[110px]">Loom #</th>
                      <th className="py-3 px-3 min-w-[200px]">Quality Construction</th>
                      <th className="py-3 px-2 text-center w-24 min-w-[85px]">Run Days</th>
                      <th className="py-3 px-2 text-right w-24 min-w-[90px]">Shift A (m)</th>
                      <th className="py-3 px-2 text-right w-24 min-w-[90px]">Shift B (m)</th>
                      <th className="py-3 px-3 text-right w-28 min-w-[100px]">Total (m)</th>
                      <th className="py-3 px-3 text-right w-28 min-w-[100px]">Theo (m)</th>
                      <th className="py-3 px-3 text-center w-24 min-w-[90px]">Efficiency</th>
                      <th className="py-3 px-3 text-center w-20 min-w-[75px]">Bonus %</th>
                      <th className="py-3 px-3 text-right w-28 min-w-[105px]">Bonus (PKR)</th>
                      <th className="py-3 px-4 text-right w-32 min-w-[120px]">Revenue (PKR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {filteredLooms.map((loom) => (
                      <tr key={loom.loomNumber} className="hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 px-3 min-w-[110px]">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-foreground">
                              #{loom.loomNumber.toString().padStart(2, '0')}
                            </span>
                            <span className="rounded bg-muted px-1.5 py-0.2 text-[10px] text-muted-foreground border">
                              {loom.category}
                            </span>
                          </div>
                        </td>

                        <td className="py-2.5 px-3 font-sans min-w-[200px] text-foreground font-medium" title={loom.qualityName}>
                          {loom.qualityName}
                        </td>

                        <td className="py-2.5 px-2 text-center text-foreground font-semibold min-w-[85px]">
                          {loom.totalRunningDays} d
                        </td>

                        <td className="py-2.5 px-2 text-right text-muted-foreground min-w-[90px]">
                          {formatNumber(loom.totalShiftAMeters, 0)}
                        </td>

                        <td className="py-2.5 px-2 text-right text-muted-foreground min-w-[90px]">
                          {formatNumber(loom.totalShiftBMeters, 0)}
                        </td>

                        <td className="py-2.5 px-3 text-right font-bold text-foreground min-w-[100px]">
                          {formatNumber(loom.grandTotalMeters, 0)} m
                        </td>

                        <td className="py-2.5 px-3 text-right text-muted-foreground min-w-[100px]">
                          {formatNumber(loom.theoreticalMeters, 0)} m
                        </td>

                        <td className="py-2.5 px-3 text-center min-w-[90px]">
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[11px] font-bold',
                              loom.averageEfficiency >= 85
                                ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300'
                                : loom.averageEfficiency >= 70
                                ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                                : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                            )}
                          >
                            {loom.averageEfficiency.toFixed(1)}%
                          </span>
                        </td>

                        <td className="py-2.5 px-3 text-center font-bold min-w-[75px]">
                          {loom.bonusPercentage > 0 ? (
                            <span className="text-blue-600">+{loom.bonusPercentage}%</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>

                        <td className="py-2.5 px-3 text-right font-bold text-amber-600 dark:text-amber-400 min-w-[105px]">
                          {loom.bonusAmountPKR > 0 ? formatCurrency(loom.bonusAmountPKR) : '-'}
                        </td>

                        <td className="py-2.5 px-4 text-right font-bold text-blue-600 min-w-[120px]">
                          {formatCurrency(loom.totalRevenuePKR)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/80 font-mono text-xs font-bold text-foreground">
                      <td colSpan={3} className="py-3 px-3 uppercase tracking-wider font-sans min-w-[395px]">
                        Monthly Grand Totals ({filteredLooms.length} Looms)
                      </td>
                      <td colSpan={2} className="py-3 px-2 text-right text-muted-foreground font-sans text-[11px] min-w-[180px]">
                        Aggregates:
                      </td>
                      <td className="py-3 px-3 text-right text-foreground min-w-[100px]">
                        {formatNumber(monthRollup.grandTotalMeters, 0)} m
                      </td>
                      <td className="py-3 px-3 text-right text-muted-foreground min-w-[100px]">
                        {formatNumber(monthRollup.grandTheoreticalMeters, 0)} m
                      </td>
                      <td className="py-3 px-3 text-center min-w-[90px]">
                        <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-700 dark:text-blue-300 font-bold">
                          {monthRollup.averageFloorEfficiency.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center min-w-[75px]">-</td>
                      <td className="py-3 px-3 text-right text-amber-600 dark:text-amber-400 min-w-[105px]">
                        {formatCurrency(monthRollup.totalBonusPayoutPKR)}
                      </td>
                      <td className="py-3 px-4 text-right text-blue-600 min-w-[120px]">
                        {formatCurrency(monthRollup.totalRevenuePKR)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </TablePanScroll>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
