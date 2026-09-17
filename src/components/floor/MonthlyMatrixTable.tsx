'use client'

import { useState } from 'react'
import { MonthlyMatrixDay } from '@/types/production'
import { formatNumber, cn } from '@/lib/utils'
import { Download, Search, Calendar, Layers } from 'lucide-react'

interface MonthlyMatrixTableProps {
  days: MonthlyMatrixDay[]
  loomTotals: Record<number, number>
  grandTotalMeters: number
  avgPerDay: number
}

export function MonthlyMatrixTable({
  days,
  loomTotals,
  grandTotalMeters,
  avgPerDay,
}: MonthlyMatrixTableProps) {
  const [selectedLoom, setSelectedLoom] = useState<number | 'ALL'>('ALL')
  const loomNumbers = Array.from({ length: 34 }, (_, i) => i + 1)

  const exportCsv = () => {
    let csv = 'Date / Day,' + loomNumbers.map((n) => `Loom ${n}`).join(',') + ',Total (m)\n'
    days.forEach((d) => {
      const row = [
        `Day ${d.day} (${d.date})`,
        ...loomNumbers.map((n) => d.loomMeters[n] || 0),
        d.totalMeters,
      ]
      csv += row.join(',') + '\n'
    })
    csv += ['Loom Total', ...loomNumbers.map((n) => loomTotals[n] || 0), grandTotalMeters].join(',') + '\n'

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', 'Sara_Textile_Loom_Monthly_Production_Matrix_Total.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-4">
      {/* Top Banner & Filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-card p-4 rounded-xl border border-border">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
            <Calendar className="size-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">
              Sheet: Total • 34 Looms Daily Meter Matrix (September 2026)
            </h3>
            <p className="text-xs text-muted-foreground">
              Day-by-day floor production meterage verified from physical mill production book.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedLoom}
            onChange={(e) =>
              setSelectedLoom(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))
            }
            className="h-9 rounded-lg border border-border bg-background px-3 text-xs font-bold text-foreground focus:border-blue-500 focus:outline-none cursor-pointer"
          >
            <option value="ALL">All 34 Looms Display</option>
            {loomNumbers.map((n) => (
              <option key={n} value={n}>
                Focus: Loom #{n} ({loomTotals[n] || 0} m)
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

      {/* KPI Cards for Matrix */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-3 space-y-1">
          <span className="text-[10px] uppercase font-bold text-muted-foreground">
            Grand Total (Days 2-9)
          </span>
          <div className="font-mono text-xl font-black text-foreground">
            {formatNumber(grandTotalMeters, 0)} m
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3 space-y-1">
          <span className="text-[10px] uppercase font-bold text-muted-foreground">
            Average Per Day
          </span>
          <div className="font-mono text-xl font-black text-blue-600 dark:text-blue-400">
            {formatNumber(avgPerDay, 1)} m
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3 space-y-1">
          <span className="text-[10px] uppercase font-bold text-muted-foreground">
            1st Fortnight Total
          </span>
          <div className="font-mono text-xl font-black text-emerald-600 dark:text-emerald-400">
            {formatNumber(grandTotalMeters, 0)} m
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3 space-y-1">
          <span className="text-[10px] uppercase font-bold text-muted-foreground">
            Active Looms Recorded
          </span>
          <div className="font-mono text-xl font-black text-purple-600 dark:text-purple-400">
            34 / 34 Looms
          </div>
        </div>
      </div>

      {/* Interactive Matrix Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="overflow-x-auto max-h-[600px]">
          <table className="w-full text-left border-collapse font-mono text-xs">
            <thead className="sticky top-0 z-20 bg-muted/90 backdrop-blur-xs">
              <tr className="border-b border-border text-[11px] font-bold text-muted-foreground">
                <th className="sticky left-0 z-30 bg-muted px-3 py-2.5 whitespace-nowrap min-w-[130px] border-r border-border">
                  L/# → DATE ↓
                </th>
                {loomNumbers
                  .filter((n) => selectedLoom === 'ALL' || selectedLoom === n)
                  .map((n) => (
                    <th
                      key={n}
                      className="px-2 py-2.5 text-center min-w-[58px] border-r border-border/40 font-bold"
                    >
                      <span
                        className={cn(
                          'inline-block px-1.5 py-0.5 rounded text-[10px]',
                          n <= 20
                            ? 'text-blue-700 dark:text-blue-300'
                            : n <= 26
                            ? 'text-purple-700 dark:text-purple-300'
                            : 'text-sky-700 dark:text-sky-300'
                        )}
                      >
                        L#{n}
                      </span>
                    </th>
                  ))}
                <th className="px-3 py-2.5 text-right font-black text-foreground min-w-[90px]">
                  Daily Total (m)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {days.map((d) => (
                <tr key={d.day} className="hover:bg-muted/50 transition-colors">
                  <td className="sticky left-0 z-10 bg-card px-3 py-2 font-bold text-foreground border-r border-border whitespace-nowrap">
                    Day {d.day} (Sept 0{d.day})
                  </td>
                  {loomNumbers
                    .filter((n) => selectedLoom === 'ALL' || selectedLoom === n)
                    .map((n) => {
                      const mtr = d.loomMeters[n] || 0
                      return (
                        <td
                          key={n}
                          className={cn(
                            'px-2 py-2 text-center border-r border-border/40',
                            mtr === 0
                              ? 'text-muted-foreground/40'
                              : mtr >= 200
                              ? 'text-emerald-700 dark:text-emerald-400 font-black'
                              : 'text-foreground font-semibold'
                          )}
                        >
                          {mtr === 0 ? '—' : mtr}
                        </td>
                      )
                    })}
                  <td className="px-3 py-2 text-right font-black text-blue-700 dark:text-blue-400 bg-muted/20">
                    {formatNumber(d.totalMeters, 0)} m
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 z-20 bg-muted/95 backdrop-blur-xs font-black border-t-2 border-border text-foreground">
              <tr>
                <td className="sticky left-0 z-30 bg-muted px-3 py-3 uppercase tracking-wider font-sans border-r border-border">
                  Loom Total (m)
                </td>
                {loomNumbers
                  .filter((n) => selectedLoom === 'ALL' || selectedLoom === n)
                  .map((n) => (
                    <td
                      key={n}
                      className="px-2 py-3 text-center border-r border-border/40 text-blue-700 dark:text-blue-400 font-mono font-black"
                    >
                      {formatNumber(loomTotals[n] || 0, 0)}
                    </td>
                  ))}
                <td className="px-3 py-3 text-right font-black text-sm text-blue-900 dark:text-blue-300 bg-blue-500/10">
                  {formatNumber(grandTotalMeters, 0)} m
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
