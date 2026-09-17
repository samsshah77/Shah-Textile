'use client'

import { useState } from 'react'
import { ActiveQualityOrder } from '@/types/production'
import { formatNumber, cn } from '@/lib/utils'
import { Search, Receipt, Download, Layers, CheckCircle2 } from 'lucide-react'

interface ActiveQualitiesTableProps {
  qualities: ActiveQualityOrder[]
}

export function ActiveQualitiesTable({ qualities }: ActiveQualitiesTableProps) {
  const [search, setSearch] = useState('')

  const filtered = qualities.filter((q) =>
    q.qualityName.toLowerCase().includes(search.toLowerCase()) ||
    q.loomNumbers.includes(search) ||
    q.warpYarn.toLowerCase().includes(search.toLowerCase())
  )

  const totalTarget = qualities.reduce((s, q) => s + (typeof q.target === 'number' ? q.target : 0), 0)
  const totalProduction = qualities.reduce((s, q) => s + q.production, 0)
  const totalBalance = qualities.reduce((s, q) => s + (typeof q.balance === 'number' ? q.balance : 0), 0)

  const exportCsv = () => {
    let csv = 'Quality Name,Looms Count,Loom Numbers,Target (m),Produced (m),Balance (m),Eff %,Warp Yarn,Lot #,Weave Repeat\n'
    qualities.forEach((q) => {
      csv += `"${q.qualityName}",${q.loomsCount},"${q.loomNumbers}",${q.target},${q.production},${q.balance},${q.inRegister},"${q.warpYarn}","${q.lot}","${q.warpRepeat || ''}"\n`
    })
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', 'Sara_Textile_Active_Quality_Orders_Register.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-4">
      {/* Top Banner */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-card p-4 rounded-xl border border-border">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
            <Receipt className="size-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">
              Daily Quality End Reports • Active Quality Order Register
            </h3>
            <p className="text-xs text-muted-foreground">
              Target contract volume, delivered meterage, balance to weave, and assigned loom numbers.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search Quality, Loom #..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-44 sm:w-56 rounded-lg border border-border bg-background pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-blue-500 focus:outline-none"
            />
          </div>

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
            Active Qualities Running
          </span>
          <div className="font-mono text-xl font-black text-foreground">{qualities.length} Contracts</div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3 space-y-1">
          <span className="text-[10px] uppercase font-bold text-muted-foreground">
            Target Orders Volume
          </span>
          <div className="font-mono text-xl font-black text-blue-600 dark:text-blue-400">
            {formatNumber(totalTarget, 0)} m
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3 space-y-1">
          <span className="text-[10px] uppercase font-bold text-muted-foreground">
            Woven & Delivered
          </span>
          <div className="font-mono text-xl font-black text-emerald-600 dark:text-emerald-400">
            {formatNumber(totalProduction, 0)} m
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3 space-y-1">
          <span className="text-[10px] uppercase font-bold text-muted-foreground">
            Remaining Balance
          </span>
          <div className="font-mono text-xl font-black text-purple-600 dark:text-purple-400">
            {formatNumber(totalBalance, 0)} m
          </div>
        </div>
      </div>

      {/* Qualities Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse font-mono text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/60 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="py-3 px-3">Quality Name</th>
                <th className="py-3 px-3 text-center">Assigned Looms</th>
                <th className="py-3 px-3 text-right">Target (m)</th>
                <th className="py-3 px-3 text-right">Production (m)</th>
                <th className="py-3 px-3 text-center">In Register Eff</th>
                <th className="py-3 px-3 text-right">Balance (m)</th>
                <th className="py-3 px-3">Warp Spec</th>
                <th className="py-3 px-3 text-center">Weave Repeat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filtered.map((q, idx) => {
                const targetNum = typeof q.target === 'number' ? q.target : 0
                const progress = targetNum > 0 ? Math.min(100, Math.round((q.production / targetNum) * 100)) : 100

                return (
                  <tr key={idx} className="hover:bg-muted/40 transition-colors">
                    <td className="py-3 px-3 font-sans font-bold text-foreground">
                      <div>{q.qualityName}</div>
                      {q.lot && q.lot !== '0' && (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          Lot #{q.lot}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        {q.loomNumbers.split(',').map((lNum) => (
                          <span
                            key={lNum}
                            className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold border border-border text-foreground"
                          >
                            L#{lNum.trim()}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-muted-foreground">
                      {targetNum > 0 ? `${formatNumber(targetNum, 0)} m` : 'B/End'}
                    </td>
                    <td className="py-3 px-3 text-right font-black text-foreground">
                      {formatNumber(q.production, 0)} m
                    </td>
                    <td className="py-3 px-3 text-center">
                      {q.inRegister > 0 ? (
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-bold border',
                            q.inRegister >= 75
                              ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                          )}
                        >
                          {q.inRegister}% Eff
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-purple-700 dark:text-purple-400">
                      {typeof q.balance === 'number' && q.balance > 0
                        ? `${formatNumber(q.balance, 0)} m`
                        : '—'}
                    </td>
                    <td className="py-3 px-3 font-sans text-xs text-muted-foreground">
                      {q.warpYarn}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {q.warpRepeat ? (
                        <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-bold border border-border">
                          {q.warpRepeat}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/80 font-black text-foreground">
                <td className="py-3 px-3 uppercase tracking-wider font-sans">
                  Total Floor Orders ({filtered.length})
                </td>
                <td className="py-3 px-3 text-center">34 Looms</td>
                <td className="py-3 px-3 text-right text-muted-foreground">
                  {formatNumber(totalTarget, 0)} m
                </td>
                <td className="py-3 px-3 text-right text-emerald-700 dark:text-emerald-400 text-sm">
                  {formatNumber(totalProduction, 0)} m
                </td>
                <td />
                <td className="py-3 px-3 text-right text-purple-700 dark:text-purple-400">
                  {formatNumber(totalBalance, 0)} m
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
