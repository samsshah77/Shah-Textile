'use client'

import { useState } from 'react'
import { QualityEndRecord } from '@/types/production'
import { formatNumber, cn } from '@/lib/utils'
import { Award, Download, CheckCircle2 } from 'lucide-react'
import { ExportPdfButton, exportSheetPdf } from '@/components/shared/ExportPdfButton'
import { WhatsAppShareButton } from '@/components/shared/WhatsAppShareButton'

interface QualityEndTableProps {
  records: QualityEndRecord[]
}

export function QualityEndTable({ records }: QualityEndTableProps) {
  const totalProduction = records.reduce((s, r) => s + r.productionMeters, 0)

  const whatsAppText = () =>
    [
      '*Sara Textile — Quality End Report*',
      `Mukammal qualities: ${records.length}`,
      `Kul production: ${totalProduction.toLocaleString()} m`,
    ].join('\n')

  const exportCsv = () => {
    let csv = 'S.No,Quality Name,Quality End Date,Warp Yarn,Weft Yarn,Reed,Pick,Completed Production (m)\n'
    records.forEach((r) => {
      csv += `${r.sNo},"${r.qualityName}",${r.endDate},"${r.warpYarn}","${r.weftYarn}",${r.reed},${r.pick},${r.productionMeters}\n`
    })
    csv += `Total Completed Production,,,,,,,${totalProduction}\n`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', 'Sara_Textile_Monthly_Quality_End_Report.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-4">
      {/* Top Banner */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-card p-4 rounded-xl border border-border">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
            <Award className="size-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">
              Sheet: Quality End Report • Monthly Quality Completion Register
            </h3>
            <p className="text-xs text-muted-foreground">
              Officially closed weave runs, beam-out deliveries, and order fulfillment archives.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ExportPdfButton
            filename="Quality-End-Report"
            sheetLabel="Quality End Report • Completion Register"
            className="h-9 px-3 text-xs font-bold"
          />

          <WhatsAppShareButton
            documentTitle="Quality End Report"
            message={whatsAppText}
            onDownloadPdf={() => exportSheetPdf('Quality-End-Report', 'Quality End Report • Completion Register')}
          />

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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-3 space-y-1">
          <span className="text-[10px] uppercase font-bold text-muted-foreground">
            Completed Qualities
          </span>
          <div className="font-mono text-xl font-black text-foreground">
            {records.length} Completed Runs
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3 space-y-1">
          <span className="text-[10px] uppercase font-bold text-muted-foreground">
            Total Fulfilled Production
          </span>
          <div className="font-mono text-xl font-black text-emerald-600 dark:text-emerald-400">
            {formatNumber(totalProduction, 0)} m
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3 space-y-1">
          <span className="text-[10px] uppercase font-bold text-muted-foreground">
            Archive Period
          </span>
          <div className="font-mono text-xl font-black text-blue-600 dark:text-blue-400">
            Sept 02 - Sept 08
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse font-mono text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/60 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="py-3 px-3 text-center w-12">S.#</th>
                <th className="py-3 px-3">Quality Name</th>
                <th className="py-3 px-3 text-center">Quality End Date</th>
                <th className="py-3 px-3">Warp Spec</th>
                <th className="py-3 px-3">Weft Spec</th>
                <th className="py-3 px-3 text-center">Reed</th>
                <th className="py-3 px-3 text-center">Pick</th>
                <th className="py-3 px-3 text-right">Production (Meters)</th>
                <th className="py-3 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {records.map((r) => (
                <tr key={r.sNo} className="hover:bg-muted/40 transition-colors">
                  <td className="py-3 px-3 text-center font-bold text-muted-foreground">
                    {r.sNo}
                  </td>
                  <td className="py-3 px-3 font-sans font-bold text-foreground">
                    {r.qualityName}
                  </td>
                  <td className="py-3 px-3 text-center font-semibold text-muted-foreground">
                    <span className="rounded bg-muted px-2 py-0.5 border border-border">
                      {r.endDate}
                    </span>
                  </td>
                  <td className="py-3 px-3 font-sans text-xs text-muted-foreground">
                    {r.warpYarn}
                  </td>
                  <td className="py-3 px-3 font-sans text-xs text-muted-foreground">
                    {r.weftYarn}
                  </td>
                  <td className="py-3 px-3 text-center font-bold text-foreground">
                    {r.reed}
                  </td>
                  <td className="py-3 px-3 text-center font-bold text-foreground">
                    {r.pick}
                  </td>
                  <td className="py-3 px-3 text-right font-black text-emerald-700 dark:text-emerald-400">
                    {formatNumber(r.productionMeters, 0)} m
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-bold">
                      <CheckCircle2 className="size-3" />
                      <span>Completed</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/80 font-black text-foreground">
                <td colSpan={7} className="py-3.5 px-3 uppercase tracking-wider font-sans">
                  Total Completed Production (5 Orders)
                </td>
                <td className="py-3.5 px-3 text-right text-emerald-700 dark:text-emerald-400 text-sm">
                  {formatNumber(totalProduction, 0)} m
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
