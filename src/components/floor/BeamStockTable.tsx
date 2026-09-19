'use client'

import { useState } from 'react'
import { BeamStockItem, DailyLoomProductionEntry } from '@/types/production'
import { formatNumber, cn } from '@/lib/utils'
import { Search, Layers, Download, CheckCircle2, AlertCircle, Unlink, Link2 } from 'lucide-react'

interface BeamStockTableProps {
  beams: BeamStockItem[]
  looms?: DailyLoomProductionEntry[]
  onMountBeam?: (beamNo: string, loomNumber: number) => void
  onUnmountBeam?: (beamNo: string) => void
  readOnly?: boolean
}

export function BeamStockTable({
  beams,
  looms = [],
  onMountBeam,
  onUnmountBeam,
  readOnly = false,
}: BeamStockTableProps) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'G6200' | 'G6300'>('ALL')

  const filtered = beams.filter((b) => {
    const matchesSearch =
      b.warp.toLowerCase().includes(search.toLowerCase()) ||
      b.beamNo.toLowerCase().includes(search.toLowerCase()) ||
      b.reedWidth.toLowerCase().includes(search.toLowerCase())
    const matchesType = typeFilter === 'ALL' || b.loomType === typeFilter
    return matchesSearch && matchesType
  })

  const totalLength = beams.reduce((s, b) => s + b.length, 0)
  const mountedCount = beams.filter((b) => b.usedInLoom).length
  const availableCount = beams.length - mountedCount

  // Looms needing beams (status = BEAM_END)
  const loomsNeedingBeams = looms.filter((l) => l.status === 'BEAM_END')

  const exportCsv = () => {
    let csv = 'Beam #,Warp Yarn,Reed/Width,Ends,Length (m),Type,Status\n'
    beams.forEach((b) => {
      csv += `"${b.beamNo}","${b.warp}","${b.reedWidth}",${b.ends},${b.length},"${b.loomType}","${
        b.usedInLoom ? `Used in Loom #${b.usedInLoom}` : 'Available on Floor'
      }"\n`
    })
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', 'Sara_Textile_Beam_Stock_Floor_Report.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-4 max-w-full">
      {/* Top Banner */}
      <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
            <Layers className="size-6" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
              Beam Store &amp; Floor Gaiting Inventory
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Connected to Floor Looms: Mount sized beams onto looms or track empty beam ends.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="absolute left-3 top-3 size-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search Warp, Beam #..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-44 sm:w-60 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc] focus:outline-none shadow-xs"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc] focus:outline-none cursor-pointer shadow-xs"
          >
            <option value="ALL">All Loom Types</option>
            <option value="G6200">G6200 Looms</option>
            <option value="G6300">G6300 Looms</option>
          </select>

          <button
            onClick={exportCsv}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer shadow-xs"
          >
            <Download className="size-4 text-[#0066cc]" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
        </div>
      </div>

      {/* Looms Alert Banner if any loom is waiting for a beam */}
      {loomsNeedingBeams.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4 text-xs sm:text-sm text-amber-900 dark:text-amber-200 shadow-xs">
          <div className="flex items-center gap-3">
            <AlertCircle className="size-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              <strong>Looms Awaiting Beams (BEAM_END):</strong> Looms{' '}
              {loomsNeedingBeams.map((l) => `#${l.loomNumber}`).join(', ')} currently have no beam. Mount an available beam below to resume production.
            </span>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-1 shadow-xs">
          <span className="text-xs uppercase font-bold text-slate-500 dark:text-slate-400">
            Total Floor Beams
          </span>
          <div className="font-mono text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
            {beams.length} Beams
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-1 shadow-xs">
          <span className="text-xs uppercase font-bold text-slate-500 dark:text-slate-400">
            Mounted On Looms
          </span>
          <div className="font-mono text-xl sm:text-2xl font-extrabold text-amber-600 dark:text-amber-400">
            {mountedCount} Beams
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-1 shadow-xs">
          <span className="text-xs uppercase font-bold text-slate-500 dark:text-slate-400">
            Available on Floor
          </span>
          <div className="font-mono text-xl sm:text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
            {availableCount} Beams
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-1 shadow-xs">
          <span className="text-xs uppercase font-bold text-slate-500 dark:text-slate-400">
            Total Warp Meters
          </span>
          <div className="font-mono text-xl sm:text-2xl font-extrabold text-[#0066cc] dark:text-sky-300">
            {formatNumber(totalLength, 0)} m
          </div>
        </div>
      </div>

      {/* Beams Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
        <div className="overflow-x-auto w-full max-w-full touch-pan-x custom-scrollbar">
          <table className="w-full text-left border-collapse font-mono text-xs sm:text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                <th className="py-3.5 px-3.5">Beam #</th>
                <th className="py-3.5 px-3">Warp Yarn Spec</th>
                <th className="py-3.5 px-3 text-center">Reed / Width</th>
                <th className="py-3.5 px-3 text-right">Ends</th>
                <th className="py-3.5 px-3 text-right">Length (m)</th>
                <th className="py-3.5 px-3 text-center">Loom Model</th>
                <th className="py-3.5 px-3 text-center">Loom Assignment &amp; Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((beam, idx) => {
                const isMounted = Boolean(beam.usedInLoom)
                return (
                  <tr
                    key={idx}
                    className={cn(
                      'hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors',
                      isMounted && 'bg-amber-500/5'
                    )}
                  >
                    <td className="py-3 px-3.5 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                      <span className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1 border border-slate-200 dark:border-slate-700 font-mono text-xs sm:text-sm font-bold">
                        {beam.beamNo}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-sans font-semibold text-slate-800 dark:text-slate-200">
                      {beam.warp}
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-slate-500 dark:text-slate-400">
                      {beam.reedWidth}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-slate-800 dark:text-slate-200">
                      {formatNumber(beam.ends, 0)}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                      {formatNumber(beam.length, 0)} m
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={cn(
                          'rounded-md px-2 py-0.5 text-xs font-bold border',
                          beam.loomType === 'G6200'
                            ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                            : 'bg-purple-500/10 text-purple-600 border-purple-500/20'
                        )}
                      >
                        {beam.loomType}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      {isMounted ? (
                        <div className="inline-flex items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 px-3 py-1 text-xs font-bold">
                            <CheckCircle2 className="size-3.5" />
                            <span>Mounted on Loom #{beam.usedInLoom}</span>
                          </span>

                          {!readOnly && onUnmountBeam && (
                            <button
                              type="button"
                              onClick={() => onUnmountBeam(beam.beamNo)}
                              title="Unmount Beam from Loom"
                              className="rounded-lg p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-transparent hover:border-rose-300 transition-colors cursor-pointer"
                            >
                              <Unlink className="size-4" />
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 px-3 py-1 text-xs font-bold">
                            Available on Floor
                          </span>

                          {!readOnly && onMountBeam && (
                            <select
                              defaultValue=""
                              onChange={(e) => {
                                const loomNum = parseInt(e.target.value)
                                if (!isNaN(loomNum)) {
                                  onMountBeam(beam.beamNo, loomNum)
                                }
                              }}
                              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs font-bold text-slate-800 dark:text-slate-200 hover:border-[#0066cc] cursor-pointer focus:outline-none"
                            >
                              <option value="" disabled>
                                + Mount on Loom...
                              </option>
                              {Array.from({ length: 34 }, (_, i) => i + 1).map((num) => {
                                const matchedLoom = looms.find((l) => l.loomNumber === num)
                                const isBeamEnd = matchedLoom?.status === 'BEAM_END'
                                return (
                                  <option key={num} value={num}>
                                    Loom #{num.toString().padStart(2, '0')}{' '}
                                    {isBeamEnd ? '⚠ (BEAM END)' : ''}
                                  </option>
                                )
                              })}
                            </select>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 dark:border-slate-700 bg-slate-100/90 dark:bg-slate-800/90 font-extrabold text-slate-900 dark:text-white">
                <td colSpan={3} className="py-4 px-3.5 uppercase tracking-wider font-sans text-xs sm:text-sm font-bold">
                  Total Floor Inventory ({filtered.length} Beams)
                </td>
                <td className="py-4 px-3 text-right">
                  {formatNumber(
                    filtered.reduce((s, b) => s + b.ends, 0),
                    0
                  )}
                </td>
                <td className="py-4 px-3 text-right text-emerald-600 dark:text-emerald-400 font-mono text-sm sm:text-base">
                  {formatNumber(
                    filtered.reduce((s, b) => s + b.length, 0),
                    0
                  )}{' '}
                  m
                </td>
                <td colSpan={2} className="py-4 px-3 text-center text-xs text-slate-500 font-sans font-medium">
                  {mountedCount} Active on Floor • {availableCount} In Reserve
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
