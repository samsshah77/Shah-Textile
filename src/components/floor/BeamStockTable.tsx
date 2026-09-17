'use client'

import { useState } from 'react'
import { BeamStockItem } from '@/types/production'
import { formatNumber, cn } from '@/lib/utils'
import { Search, Layers, Download, CheckCircle2, AlertCircle } from 'lucide-react'

interface BeamStockTableProps {
  beams: BeamStockItem[]
}

export function BeamStockTable({ beams }: BeamStockTableProps) {
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
  const totalEnds = beams.reduce((s, b) => s + b.ends, 0)

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
    <div className="space-y-4">
      {/* Top Banner */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-card p-4 rounded-xl border border-border">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
            <Layers className="size-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">
              Sheet: Beem Stock • Beam Stock on Floor Report
            </h3>
            <p className="text-xs text-muted-foreground">
              Current floor inventory of sized and warped beams ready for loom gaiting.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search Warp, Beam #..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-44 sm:w-56 rounded-lg border border-border bg-background pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-blue-500 focus:outline-none"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="h-9 rounded-lg border border-border bg-background px-3 text-xs font-bold text-foreground focus:border-blue-500 focus:outline-none cursor-pointer"
          >
            <option value="ALL">All Loom Types</option>
            <option value="G6200">G6200 Looms</option>
            <option value="G6300">G6300 Looms</option>
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
            Total Floor Beams
          </span>
          <div className="font-mono text-xl font-black text-foreground">{beams.length} Beams</div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3 space-y-1">
          <span className="text-[10px] uppercase font-bold text-muted-foreground">
            Total Warp Length
          </span>
          <div className="font-mono text-xl font-black text-emerald-600 dark:text-emerald-400">
            {formatNumber(totalLength, 0)} m
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3 space-y-1">
          <span className="text-[10px] uppercase font-bold text-muted-foreground">
            G6200 Sized Beams
          </span>
          <div className="font-mono text-xl font-black text-blue-600 dark:text-blue-400">
            {beams.filter((b) => b.loomType === 'G6200').length} Beams
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3 space-y-1">
          <span className="text-[10px] uppercase font-bold text-muted-foreground">
            G6300 Sized Beams
          </span>
          <div className="font-mono text-xl font-black text-purple-600 dark:text-purple-400">
            {beams.filter((b) => b.loomType === 'G6300').length} Beams
          </div>
        </div>
      </div>

      {/* Beams Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse font-mono text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/60 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="py-3 px-3">Beam #</th>
                <th className="py-3 px-3">Warp Yarn Spec</th>
                <th className="py-3 px-3 text-center">Reed / Width</th>
                <th className="py-3 px-3 text-right">Ends</th>
                <th className="py-3 px-3 text-right">Length (Meters)</th>
                <th className="py-3 px-3 text-center">Loom Model</th>
                <th className="py-3 px-3 text-center">Status / Assigned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filtered.map((beam, idx) => (
                <tr key={idx} className="hover:bg-muted/40 transition-colors">
                  <td className="py-2.5 px-3 font-bold text-foreground">
                    <span className="rounded bg-muted px-2 py-0.5 border border-border">
                      {beam.beamNo}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-sans font-medium text-foreground">
                    {beam.warp}
                  </td>
                  <td className="py-2.5 px-3 text-center font-bold text-muted-foreground">
                    {beam.reedWidth}
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-foreground">
                    {formatNumber(beam.ends, 0)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                    {formatNumber(beam.length, 0)} m
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span
                      className={cn(
                        'rounded px-2 py-0.5 text-[10px] font-bold border',
                        beam.loomType === 'G6200'
                          ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                          : 'bg-purple-500/10 text-purple-600 border-purple-500/20'
                      )}
                    >
                      {beam.loomType}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    {beam.usedInLoom ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 px-2 py-0.5 text-[10px] font-bold">
                        <CheckCircle2 className="size-3" />
                        <span>Used in Loom #{beam.usedInLoom}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-bold">
                        <span>On Floor Available</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/80 font-black text-foreground">
                <td colSpan={3} className="py-3 px-3 uppercase tracking-wider font-sans">
                  Total Floor Inventory ({filtered.length} Beams)
                </td>
                <td className="py-3 px-3 text-right">
                  {formatNumber(
                    filtered.reduce((s, b) => s + b.ends, 0),
                    0
                  )}
                </td>
                <td className="py-3 px-3 text-right text-emerald-700 dark:text-emerald-400 text-sm">
                  {formatNumber(
                    filtered.reduce((s, b) => s + b.length, 0),
                    0
                  )}{' '}
                  m
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
