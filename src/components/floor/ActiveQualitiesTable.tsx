'use client'

import { useState } from 'react'
import { ActiveQualityOrder } from '@/types/production'
import { formatNumber } from '@/lib/utils'
import { Search, Receipt, Download } from 'lucide-react'

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
    let csv = 'Quality Name,Looms Count,Loom Numbers,Target (m),Produced (m),Balance (m),Warp Yarn,Lot #,Weave Repeat\n'
    qualities.forEach((q) => {
      csv += `"${q.qualityName}",${q.loomsCount},"${q.loomNumbers}",${q.target},${q.production},${q.balance},"${q.warpYarn}","${q.lot}","${q.warpRepeat || ''}"\n`
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
    <div className="space-y-4 max-w-full">
      {/* Top Banner */}
      <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
            <Receipt className="size-6" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
              Active Fabric Quality Register &amp; Orders
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Target contract volume, delivered meterage, balance to weave, and assigned loom numbers.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="absolute left-3 top-3 size-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search Quality, Loom #, Warp..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-48 sm:w-64 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc] focus:outline-none shadow-xs"
            />
          </div>

          <button
            onClick={exportCsv}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer shadow-xs"
          >
            <Download className="size-4 text-[#0066cc]" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-1 shadow-xs">
          <span className="text-xs uppercase font-bold text-slate-500 dark:text-slate-400">
            Active Qualities
          </span>
          <div className="font-mono text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
            {qualities.length} Varieties
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-1 shadow-xs">
          <span className="text-xs uppercase font-bold text-slate-500 dark:text-slate-400">
            Target Orders Volume
          </span>
          <div className="font-mono text-xl sm:text-2xl font-extrabold text-[#0066cc] dark:text-sky-300">
            {formatNumber(totalTarget, 0)} m
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-1 shadow-xs">
          <span className="text-xs uppercase font-bold text-slate-500 dark:text-slate-400">
            Woven &amp; Delivered
          </span>
          <div className="font-mono text-xl sm:text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
            {formatNumber(totalProduction, 0)} m
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-1 shadow-xs">
          <span className="text-xs uppercase font-bold text-slate-500 dark:text-slate-400">
            Remaining Balance
          </span>
          <div className="font-mono text-xl sm:text-2xl font-extrabold text-purple-600 dark:text-purple-400">
            {formatNumber(totalBalance, 0)} m
          </div>
        </div>
      </div>

      {/* Qualities Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
        <div className="overflow-x-auto w-full max-w-full touch-pan-x custom-scrollbar">
          <table className="w-full text-left border-collapse font-mono text-xs sm:text-sm min-w-[960px]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                <th className="py-3.5 px-3.5">Quality Name</th>
                <th className="py-3.5 px-3 text-center">Assigned Looms</th>
                <th className="py-3.5 px-3 text-right">Target (m)</th>
                <th className="py-3.5 px-3 text-right">Production (m)</th>
                <th className="py-3.5 px-3 text-right">Balance (m)</th>
                <th className="py-3.5 px-3">Warp Spec</th>
                <th className="py-3.5 px-3 text-center">Weave Repeat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((q, idx) => {
                const targetNum = typeof q.target === 'number' ? q.target : 0

                return (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="py-3 px-3.5 font-sans font-bold text-slate-900 dark:text-slate-100">
                      <div className="text-sm sm:text-base font-bold">{q.qualityName}</div>
                      {q.lot && q.lot !== '0' && (
                        <span className="font-mono text-xs text-slate-500 dark:text-slate-400 font-medium">
                          Lot #{q.lot}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        {q.loomNumbers ? (
                          q.loomNumbers.split(',').map((lNum) => (
                            <span
                              key={lNum}
                              className="rounded-md bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 text-xs font-bold border border-blue-200 dark:border-blue-800 text-[#0066cc] dark:text-sky-300"
                            >
                              L#{lNum.trim()}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400">None</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-slate-500 dark:text-slate-400">
                      {targetNum > 0 ? `${formatNumber(targetNum, 0)} m` : 'B/End'}
                    </td>
                    <td className="py-3 px-3 text-right font-extrabold text-slate-900 dark:text-white">
                      {formatNumber(q.production, 0)} m
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-purple-700 dark:text-purple-400">
                      {typeof q.balance === 'number' && q.balance > 0
                        ? `${formatNumber(q.balance, 0)} m`
                        : '—'}
                    </td>
                    <td className="py-3 px-3 font-sans text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium">
                      {q.warpYarn}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {q.warpRepeat ? (
                        <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-bold border border-slate-200 dark:border-slate-700">
                          {q.warpRepeat}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 dark:border-slate-700 bg-slate-100/90 dark:bg-slate-800/90 font-extrabold text-slate-900 dark:text-white">
                <td className="py-4 px-3.5 uppercase tracking-wider font-sans text-xs sm:text-sm font-bold">
                  Total Floor Orders ({filtered.length})
                </td>
                <td className="py-4 px-3 text-center text-xs text-slate-600 dark:text-slate-300">
                  34 Looms Active
                </td>
                <td className="py-4 px-3 text-right text-slate-500 font-mono">
                  {formatNumber(totalTarget, 0)} m
                </td>
                <td className="py-4 px-3 text-right text-emerald-600 dark:text-emerald-400 font-mono text-sm sm:text-base">
                  {formatNumber(totalProduction, 0)} m
                </td>
                <td className="py-4 px-3 text-right text-purple-600 dark:text-purple-400 font-mono text-sm sm:text-base">
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
