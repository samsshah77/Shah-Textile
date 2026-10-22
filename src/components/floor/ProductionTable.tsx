'use client'

import { useState } from 'react'
import { DailyLoomProductionEntry } from '@/types/production'
import { LoomCategory, LoomStatus } from '@/types/loom'
import { LoomDataRow } from './LoomDataRow'
import { LoomCard } from './LoomCard'
import { formatNumber, cn } from '@/lib/utils'
import { Download, RotateCcw, Search, LayoutGrid, Table as TableIcon } from 'lucide-react'
import { EmptyPlaceholder } from '@/components/shared/EmptyPlaceholder'
import { TablePanScroll } from '@/components/shared/TablePanScroll'

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
  availableQualities?: string[]
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
  availableQualities = [],
}: ProductionTableProps) {
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table')

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
    <div className="space-y-4 max-w-full">
      {/* Controls Bar */}
      <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        {/* Category Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {(['ALL', 'G6200', 'PU', 'G6300'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={cn(
                'rounded-xl px-3.5 py-2 text-xs sm:text-sm font-bold transition-all cursor-pointer border',
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

        {/* View Mode Toggle, Search, Filter & Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* View Toggle: Table vs Cards */}
          <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-1 shadow-xs">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              title="Wide Desktop Table View"
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all cursor-pointer',
                viewMode === 'table'
                  ? 'bg-white dark:bg-slate-900 text-[#0066cc] dark:text-sky-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              )}
            >
              <TableIcon className="size-4" />
              <span className="hidden sm:inline">Table View</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              title="Touch & Mobile Cards View"
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all cursor-pointer',
                viewMode === 'cards'
                  ? 'bg-white dark:bg-slate-900 text-[#0066cc] dark:text-sky-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              )}
            >
              <LayoutGrid className="size-4" />
              <span className="hidden sm:inline">Cards View</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="absolute left-3 top-3 size-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search Loom #, Quality..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 w-40 sm:w-56 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc] focus:outline-none shadow-xs"
            />
          </div>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as LoomStatus | 'ALL')}
            className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc] focus:outline-none cursor-pointer shadow-xs"
          >
            <option value="ALL">All Statuses</option>
            <option value="RUNNING">RUNNING</option>
            <option value="STOPPED">STOPPED</option>
            <option value="KNOTTING">KNOTTING</option>
            <option value="BREAKDOWN">BREAKDOWN</option>
            <option value="BEAM_END">BEAM END</option>
            <option value="NO_WEFT">NO WEFT</option>
          </select>

          {/* Export CSV */}
          <button
            onClick={onExportCsv}
            title="Export CSV"
            className="flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer shadow-xs"
          >
            <Download className="size-4 text-[#0066cc]" />
            <span className="hidden md:inline">Export CSV</span>
          </button>

          {/* Reset Defaults */}
          <button
            onClick={onResetDefaults}
            title="Reset Floor Defaults from production.xlsx"
            className="flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs sm:text-sm font-medium text-slate-500 hover:text-rose-600 hover:border-rose-300 transition-colors cursor-pointer shadow-xs"
          >
            <RotateCcw className="size-4" />
          </button>
        </div>
      </div>

      {/* RENDER VIEW: TABLE OR CARDS */}
      {viewMode === 'cards' ? (
        /* Mobile / Touch Ergonomic Card Grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {entries.length === 0 ? (
            <div className="col-span-full">
              <EmptyPlaceholder
                icon="bi-grid-3x3-gap"
                title="No looms match filters"
                hint="Category, status ya search change karke dekho — matching looms yahan dikhengi."
              />
            </div>
          ) : (
            entries.map((entry) => (
              <LoomCard
                key={entry.id || `${entry.loomNumber}-s${Math.max(1, Math.floor(Number(entry.segmentIndex) || 1))}`}
                entry={entry}
                onUpdate={onUpdateEntry}
                isModified={modifiedLoomIds?.has(entry.loomNumber)}
                readOnly={readOnly}
                availableQualities={availableQualities}
              />
            ))
          )}
        </div>
      ) : (
        /* Manager / Desktop Clear Large Table */
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <TablePanScroll className="touch-pan-x custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[1100px]">
              <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800 shadow-xs">
                <tr className="border-b border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  <th className="py-3.5 px-3.5">Loom / Cat</th>
                  <th className="py-3.5 px-3">Quality / Fabric Spec</th>
                  <th className="py-3.5 px-2 text-center">SW #</th>
                  <th className="py-3.5 px-2">Status</th>
                  <th className="py-3.5 px-2 text-right">RPM</th>
                  <th className="py-3.5 px-2 text-right">Pick</th>
                  <th className="py-3.5 px-2 text-right">Run Hrs</th>
                  <th className="py-3.5 px-2 text-right">Shift A (m)</th>
                  <th className="py-3.5 px-2 text-right">Shift B (m)</th>
                  <th className="py-3.5 px-3 text-right">Total (m)</th>
                  <th className="py-3.5 px-3 text-right">Theo (m)</th>
                  <th className="py-3.5 px-3">Efficiency</th>
                  <th className="py-3.5 px-3 text-right">Stop Loss (m)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="p-0 border-0">
                      <EmptyPlaceholder
                        icon="bi-grid-3x3-gap"
                        title="No looms match filters"
                        hint="Category, status ya search change karke dekho — matching looms yahan dikhengi."
                        compact
                      />
                    </td>
                  </tr>
                ) : (
                  entries.map((entry) => (
                    <LoomDataRow
                      key={entry.id || `${entry.loomNumber}-s${Math.max(1, Math.floor(Number(entry.segmentIndex) || 1))}`}
                      entry={entry}
                      onUpdate={onUpdateEntry}
                      isModified={modifiedLoomIds?.has(entry.loomNumber)}
                      readOnly={readOnly}
                      availableQualities={availableQualities}
                    />
                  ))
                )}
              </tbody>

              {/* Total Footer Row */}
              <tfoot>
                <tr className="border-t-2 border-slate-300 dark:border-slate-700 bg-slate-100/90 dark:bg-slate-800/90 font-mono text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                  <td colSpan={4} className="py-4 px-3.5 uppercase tracking-wider font-sans text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                    Total Floor ({entries.length} Looms)
                  </td>
                  <td colSpan={3} className="py-4 px-2 text-right text-slate-500 font-sans text-xs font-semibold">
                    Aggregates:
                  </td>
                  <td className="py-4 px-2 text-right text-[#0066cc] dark:text-sky-400 font-bold">
                    {formatNumber(totals.shiftA, 0)} m
                  </td>
                  <td className="py-4 px-2 text-right text-[#0066cc] dark:text-sky-400 font-bold">
                    {formatNumber(totals.shiftB, 0)} m
                  </td>
                  <td className="py-4 px-3 text-right text-slate-900 dark:text-white font-extrabold">
                    {formatNumber(totals.actualTotal, 0)} m
                  </td>
                  <td className="py-4 px-3 text-right text-slate-500">
                    {formatNumber(totals.theoretical, 0)} m
                  </td>
                  <td className="py-4 px-3">
                    <span className="inline-flex rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 px-3 py-1 text-xs sm:text-sm text-[#0066cc] dark:text-sky-300 font-extrabold shadow-xs">
                      {overallEfficiency.toFixed(1)}% Avg
                    </span>
                  </td>
                  <td className="py-4 px-3 text-right text-rose-600 dark:text-rose-400 font-bold">
                    {totals.stopLoss > 0 ? `${formatNumber(totals.stopLoss, 0)} m` : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </TablePanScroll>
        </div>
      )}
    </div>
  )
}
