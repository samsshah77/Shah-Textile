'use client'

import type { ProductionReport } from '@/services/floorReportsClient'

/** Shows what the server's own check found (ledger vs sheets, unknown names, out-of-run rows). */
export function ReportDataCheck({ report }: { report: ProductionReport }) {
  const { mismatches, unlinked, outsideRun } = report
  if (mismatches.length === 0 && unlinked.length === 0 && outsideRun.length === 0) {
    return (
      <div className="alert alert-success py-2 px-3 small mb-0">
        <i className="bi bi-check-circle-fill me-1" />
        Data check OK — totals match the saved sheets and every row belongs to a known quality.
      </div>
    )
  }
  return (
    <div className="alert alert-warning py-2 px-3 small mb-0">
      <div className="fw-semibold mb-1">
        <i className="bi bi-exclamation-triangle-fill me-1" />
        Data check — please review:
      </div>
      <ul className="mb-0 ps-3">
        {mismatches.length > 0 && (
          <li>
            Totals differ from saved sheets on {mismatches.map((m) => m.date).join(', ')} (refresh;
            if it stays, report it).
          </li>
        )}
        {unlinked.slice(0, 8).map((u) => (
          <li key={`u-${u.date}-${u.loomNumber}`}>
            {u.date} · Loom {u.loomNumber}: “{u.qualityName}” is not in Quality Master
          </li>
        ))}
        {outsideRun.slice(0, 8).map((o) => (
          <li key={`o-${o.date}-${o.loomNumber}`}>
            {o.date} · Loom {o.loomNumber}: “{o.qualityName}”
            {o.startedOn && o.date < o.startedOn
              ? ` is before its start date (${o.startedOn})`
              : ` has meters after its end date (${o.endedOn})`}
          </li>
        ))}
        {unlinked.length + outsideRun.length > 16 && <li>…and more</li>}
      </ul>
    </div>
  )
}
