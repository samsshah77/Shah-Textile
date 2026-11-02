'use client'

import { useProductionReport } from '@/hooks/useProductionReport'
import { monthRange } from '@/services/floorReportsClient'
import { ReportDataCheck } from '@/components/floor/ReportDataCheck'
import { formatNumber } from '@/lib/utils'

/**
 * Cross-check for the Total tracking page: the month total computed in the browser
 * vs the same total computed by the server from the saved sheets.
 */
export function ServerMonthCheck({ month, until, pageTotal }: { month: string; until?: string; pageTotal: number }) {
  const range = monthRange(month)
  const from = range.from
  // "As of" a day: only up to that day.
  const to = until && until < range.to ? (until < from ? from : until) : range.to
  const { report, loading, error } = useProductionReport(from, to)
  if (loading || error || !report) return null
  const serverTotal = report.totals.meters
  const differs = Math.abs(serverTotal - pageTotal) > 0.5
  return (
    <div className="d-flex flex-column gap-2 mb-3">
      <div className={`${differs ? 'text-danger fw-semibold' : 'text-dark'}`}>
        <i className={`bi ${differs ? 'bi-exclamation-octagon-fill' : 'bi-database-check'} me-1`} />
        Database total for this month: {formatNumber(serverTotal, 0)} m
        {differs
          ? ` — this page shows ${formatNumber(pageTotal, 0)} m. Trust the database figure and report this difference.`
          : ' — matches this page.'}
      </div>
      <ReportDataCheck report={report} />
    </div>
  )
}
