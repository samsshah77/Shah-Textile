'use client'

import { DailyLoomProductionEntry } from '@/types/production'
import { LoomCategory, LoomStatus } from '@/types/loom'
import { LoomDataRow } from './LoomDataRow'
import { formatCurrency, formatNumber, cn } from '@/lib/utils'
import { Download, RotateCcw, Search } from 'lucide-react'

interface ProductionTableProps {
  entries: DailyLoomProductionEntry[]
  onUpdateEntry: (loomNumber: number, patch: Partial<DailyLoomProductionEntry>) => void
  onResetDefaults: () => void
  onExportCsv: () => void
  filterCategory: LoomCategory | 'ALL'
  setFilterCategory: (c: LoomCategory | 'ALL') => void
  filterStatus: LoomStatus | 'ALL'
  setFilterStatus: (s: LoomStatus | 'ALL') => void
  searchQuery: string
  setSearchQuery: (q: string) => void
  modifiedLoomIds?: Set<number>
  readOnly?: boolean
}

export function ProductionTable({
  entries,
  onUpdateEntry,
  onResetDefaults,
  onExportCsv,
  filterCategory,
  setFilterCategory,
  filterStatus,
  setFilterStatus,
  searchQuery,
  setSearchQuery,
  modifiedLoomIds,
  readOnly = false,
}: ProductionTableProps) {
  const totals = entries.reduce(
    (acc, e) => {
      acc.shiftA += e.shiftAMeters || 0
      acc.shiftB += e.shiftBMeters || 0
      acc.actualTotal += (e.shiftAMeters || 0) + (e.shiftBMeters || 0)
      const theo = e.pick > 0 ? (e.rpm * 60 * (e.runningHours || 24)) / (e.pick * 39.3701) : 0
      acc.theoretical += theo
      acc.stopLoss += Math.max(0, theo - ((e.shiftAMeters || 0) + (e.shiftBMeters || 0)))
      acc.revenue += ((e.shiftAMeters || 0) + (e.shiftBMeters || 0)) * (e.pick * 0.95)
      return acc
    },
    { shiftA: 0, shiftB: 0, actualTotal: 0, theoretical: 0, stopLoss: 0, revenue: 0 }
  )

  const overallEfficiency = totals.theoretical > 0 ? (totals.actualTotal / totals.theoretical) * 100 : 0

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {(['ALL', 'G6200', 'PU', 'G6300'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer border',
                filterCategory === cat
                  ? 'bg-[#0066cc] border-[#0066cc] text-white shadow-xs'
                  : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              )}
            >
              {cat === 'ALL'
                ? 'All 34 Looms'
                : cat === 'G6200'
                ? 'G6200 (1-20)'
                : cat === 'PU'
                ? 'PU (21-26)'
                : 'G6300 (27-34)'}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search Loom #, Quality..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-40 sm:w-52 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-8 pr-3 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
            />
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as LoomStatus | 'ALL')}
            className="h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-xs font-medium text-slate-800 dark:text-slate-200 focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc] focus:outline-none cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value="RUNNING">RUNNING</option>
            <option value="STOPPED">STOPPED</option>
            <option value="KNOTTING">KNOTTING</option>
            <option value="BREAKDOWN">BREAKDOWN</option>
            <option value="BEAM_END">BEAM END</option>
          </select>

          <button
            onClick={onExportCsv}
            title="Export CSV"
            className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer shadow-xs"
          >
            <Download className="size-3.5 text-[#0066cc]" />
            <span className="hidden md:inline">Export CSV</span>
          </button>

          <button
            onClick={onResetDefaults}
            title="Reset Floor Defaults from production.xlsx"
            className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-xs font-medium text-slate-500 hover:text-rose-600 hover:border-rose-300 transition-colors cursor-pointer shadow-xs"
          >
            <RotateCcw className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                <th className="py-3 px-3">Loom / Cat</th>
                <th className="py-3 px-3">Quality / Fabric Spec</th>
                <th className="py-3 px-2">Status</th>
                <th className="py-3 px-2 text-right">RPM</th>
                <th className="py-3 px-2 text-right">Pick</th>
                <th className="py-3 px-2 text-right">Run Hrs</th>
                <th className="py-3 px-2 text-right">Shift A (m)</th>
                <th className="py-3 px-2 text-right">Shift B (m)</th>
                <th className="py-3 px-3 text-right">Total (m)</th>
                <th className="py-3 px-3 text-right">Theo (m)</th>
                <th className="py-3 px-3">Efficiency</th>
                <th className="py-3 px-3 text-right">Stop Loss (m)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-xs text-slate-500">
                    No looms match the selected criteria.
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <LoomDataRow
                    key={entry.loomNumber}
                    entry={entry}
                    onUpdate={onUpdateEntry}
                    isModified={modifiedLoomIds?.has(entry.loomNumber)}
                    readOnly={readOnly}
                  />
                ))
              )}
            </tbody>

            {/* Total Footer Row */}
            <tfoot>
              <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50/90 dark:bg-slate-800/90 font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                <td colSpan={3} className="py-3.5 px-3 uppercase tracking-wider font-sans text-xs font-bold text-slate-700 dark:text-slate-300">
                  Total Floor ({entries.length} Looms)
                </td>
                <td colSpan={3} className="py-3.5 px-2 text-right text-slate-500 font-sans text-[11px]">
                  Aggregates:
                </td>
                <td className="py-3.5 px-2 text-right text-[#0066cc] dark:text-sky-400 font-bold">
                  {formatNumber(totals.shiftA, 0)} m
                </td>
                <td className="py-3.5 px-2 text-right text-[#0066cc] dark:text-sky-400 font-bold">
                  {formatNumber(totals.shiftB, 0)} m
                </td>
                <td className="py-3.5 px-3 text-right text-slate-900 dark:text-white font-bold">
                  {formatNumber(totals.actualTotal, 0)} m
                </td>
                <td className="py-3.5 px-3 text-right text-slate-500">
                  {formatNumber(totals.theoretical, 0)} m
                </td>
                <td className="py-3.5 px-3">
                  <span className="rounded-full bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 px-2.5 py-0.5 text-xs text-[#0066cc] dark:text-sky-400 font-bold">
                    {overallEfficiency.toFixed(1)}% Avg
                  </span>
                </td>
                <td className="py-3.5 px-3 text-right text-rose-600 dark:text-rose-400 font-semibold">
                  {totals.stopLoss > 0 ? `${formatNumber(totals.stopLoss, 0)} m` : '—'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
