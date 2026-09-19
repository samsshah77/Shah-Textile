'use client'

import { useState } from 'react'
import { WeftStockDay } from '@/types/production'
import { formatNumber, cn } from '@/lib/utils'
import { Clock, Download, Search, Package } from 'lucide-react'

interface WeftStockTableProps {
  yarnColumns: string[]
  days: WeftStockDay[]
}

export function WeftStockTable({ yarnColumns, days }: WeftStockTableProps) {
  const [selectedYarn, setSelectedYarn] = useState<string>('ALL')

  // Calculate totals per yarn column across all days
  const yarnTotals: Record<string, number> = {}
  yarnColumns.forEach((y) => {
    yarnTotals[y] = days.reduce((s, d) => s + (d.consumption[y] || 0), 0)
  })

  const grandTotalKg = days.reduce((s, d) => s + d.totalKg, 0)
  const peakDay = days.reduce(
    (max, d) => (d.totalKg > (max?.totalKg || 0) ? d : max),
    days[0]
  )

  const activeYarns = yarnColumns.filter((y) => yarnTotals[y] > 0)
  const displayedYarns =
    selectedYarn === 'ALL' ? activeYarns : activeYarns.filter((y) => y === selectedYarn)

  const exportCsv = () => {
    let csv = 'Date / Day,' + displayedYarns.map((y) => `"${y}"`).join(',') + ',Total (Kg)\n'
    days.forEach((d) => {
      const row = [
        `Day ${d.day} (${d.date})`,
        ...displayedYarns.map((y) => d.consumption[y] || 0),
        d.totalKg,
      ]
      csv += row.join(',') + '\n'
    })
    csv += ['Total Consumption (Kg)', ...displayedYarns.map((y) => yarnTotals[y] || 0), grandTotalKg].join(',') + '\n'

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', 'Sara_Textile_Daily_Weft_Yarn_Record.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-4">
      {/* Top Banner */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-card p-4 rounded-xl border border-border">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600">
            <Package className="size-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">
              Sheet: Weft Stock • Daily Weft Yarn Consumption Record
            </h3>
            <p className="text-xs text-muted-foreground">
              Track actual kg of weft yarn packages issued to 34 looms day-by-day (September 2026).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedYarn}
            onChange={(e) => setSelectedYarn(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-3 text-xs font-bold text-foreground focus:border-blue-500 focus:outline-none cursor-pointer"
          >
            <option value="ALL">All Active Yarns ({activeYarns.length})</option>
            {activeYarns.map((y) => (
              <option key={y} value={y}>
                {y} ({yarnTotals[y].toFixed(1)} kg)
              </option>
            ))}
          </select>

          <button
            onClick={exportCsv}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-bold text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <Download className="size-3.5 text-blue-600" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-3 space-y-1">
          <span className="text-[10px] uppercase font-bold text-muted-foreground">
            Total Weft Issued ({days.length} Days)
          </span>
          <div className="font-mono text-xl font-black text-foreground">
            {formatNumber(grandTotalKg, 1)} kg
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3 space-y-1">
          <span className="text-[10px] uppercase font-bold text-muted-foreground">
            Average Per Day
          </span>
          <div className="font-mono text-xl font-black text-purple-600 dark:text-purple-400">
            {formatNumber(grandTotalKg / (days.length || 1), 1)} kg
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3 space-y-1">
          <span className="text-[10px] uppercase font-bold text-muted-foreground">
            Active Yarn Blends
          </span>
          <div className="font-mono text-xl font-black text-blue-600 dark:text-blue-400">
            {activeYarns.length} Varieties
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3 space-y-1">
          <span className="text-[10px] uppercase font-bold text-muted-foreground">
            Peak Issue Day
          </span>
          <div className="font-mono text-xl font-black text-emerald-600 dark:text-emerald-400">
            Day {peakDay?.day || 1} ({formatNumber(peakDay?.totalKg || 0, 1)} kg)
          </div>
        </div>
      </div>

      {/* Consumption Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-left border-collapse font-mono text-xs">
            <thead className="sticky top-0 z-20 bg-muted/90 backdrop-blur-xs">
              <tr className="border-b border-border text-[11px] font-bold text-muted-foreground">
                <th className="sticky left-0 z-30 bg-muted px-3 py-2.5 whitespace-nowrap min-w-[130px] border-r border-border">
                  DATE / DAY
                </th>
                {displayedYarns.map((y) => (
                  <th
                    key={y}
                    className="px-2.5 py-2.5 text-right min-w-[100px] border-r border-border/40 font-bold"
                  >
                    <span className="block truncate max-w-[130px]" title={y}>
                      {y}
                    </span>
                  </th>
                ))}
                <th className="px-3 py-2.5 text-right font-black text-foreground min-w-[100px]">
                  Total Kg
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {days.map((d) => (
                <tr key={d.day} className="hover:bg-muted/50 transition-colors">
                  <td className="sticky left-0 z-10 bg-card px-3 py-2 font-bold text-foreground border-r border-border whitespace-nowrap">
                    Day {d.day} (Sept {String(d.day).padStart(2, '0')})
                  </td>
                  {displayedYarns.map((y) => {
                    const kg = d.consumption[y] || 0
                    return (
                      <td
                        key={y}
                        className={cn(
                          'px-2.5 py-2 text-right border-r border-border/40',
                          kg === 0
                            ? 'text-muted-foreground/30'
                            : kg >= 150
                            ? 'text-purple-700 dark:text-purple-400 font-black'
                            : 'text-foreground font-semibold'
                        )}
                      >
                        {kg === 0 ? '—' : kg.toFixed(1)}
                      </td>
                    )
                  })}
                  <td className="px-3 py-2 text-right font-black text-purple-700 dark:text-purple-400 bg-muted/20">
                    {formatNumber(d.totalKg, 1)} kg
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 z-20 bg-muted/95 backdrop-blur-xs font-black border-t-2 border-border text-foreground">
              <tr>
                <td className="sticky left-0 z-30 bg-muted px-3 py-3 uppercase tracking-wider font-sans border-r border-border">
                  Total (Kg)
                </td>
                {displayedYarns.map((y) => (
                  <td
                    key={y}
                    className="px-2.5 py-3 text-right border-r border-border/40 text-purple-700 dark:text-purple-400 font-mono font-black"
                  >
                    {formatNumber(yarnTotals[y] || 0, 1)}
                  </td>
                ))}
                <td className="px-3 py-3 text-right font-black text-sm text-purple-900 dark:text-purple-300 bg-purple-500/10">
                  {formatNumber(grandTotalKg, 1)} kg
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
