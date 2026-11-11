'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/shared/PageHeader'
import { getProductionCurrentMonth } from '@/constants/productionCalendar'
import { monthOptions, monthRange } from '@/services/floorReportsClient'
import type { FloorProblem } from '@/lib/floor/dataCheck'

type CheckResult = {
  ok: boolean
  error?: string
  days: number
  problems: FloorProblem[]
  unlinked: Array<{ date: string; loomNumber: number; qualityName: string; meters: number }>
  outsideRun: Array<{ date: string; loomNumber: number; qualityName: string; meters: number; startedOn: string | null; endedOn: string | null }>
  mismatches: Array<{ date: string }>
}

const KIND: Record<FloorProblem['kind'], string> = {
  'false-loss': 'Jhoothi loss',
  figures: 'Figures do not add up',
  'meters-no-quality': 'Meters without quality',
  'not-approved': 'Not approved',
}

/**
 * Production Data Check — read-only. Lists saved rows / days whose figures cannot be right,
 * so they can be corrected by hand on the Daily Entry. Nothing is changed here.
 */
export default function FloorDataCheckPage() {
  const months = useMemo(() => monthOptions(), [])
  const [month, setMonth] = useState(getProductionCurrentMonth())
  const range = useMemo(() => monthRange(month), [month])
  const [data, setData] = useState<CheckResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    fetch(`/api/floor/data-check?from=${range.from}&to=${range.to}`, { cache: 'no-store', credentials: 'include' })
      .then((r) => r.json())
      .then((j: CheckResult) => {
        if (!live) return
        if (j.ok) {
          setData(j)
          setError(null)
        } else setError(j.error || 'The check did not run.')
      })
      .catch(() => live && setError('Could not reach the server.'))
    return () => {
      live = false
    }
  }, [range.from, range.to])

  const shown = data && data.ok ? data : null
  const total = shown ? shown.problems.length + shown.unlinked.length + shown.outsideRun.length + shown.mismatches.length : 0
  const link = (date: string) => `/floor/production?tab=entry&date=${date}`

  return (
    <div className="space-y-4 pb-12">
      <PageHeader
        title="Production Data Check"
        breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Production', href: '/floor/production' }, { label: 'Data Check' }]}
        actions={
          <select value={month} onChange={(e) => setMonth(e.target.value)} className="form-select form-select-sm" aria-label="Month">
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        }
      />
      <div className="alert alert-info py-2 small mb-0">
        This page only shows problems — it changes nothing. Fix a wrong row by opening that day in Daily Entry.
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      {!shown && !error && <div className="text-muted small">Checking…</div>}
      {shown && (
        <>
          <div className={total ? 'alert alert-warning py-2 small' : 'alert alert-success py-2 small'}>
            {shown.days} days checked — {total ? `${total} items need attention.` : 'everything is fine.'}
          </div>
          {shown.problems.length > 0 && (
            <div className="card">
              <div className="card-header fw-semibold small">Rows / day</div>
              <div className="table-responsive">
                <table className="table table-sm mb-0 small">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Loom</th>
                      <th>Issue</th>
                      <th>Tafseel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.problems.map((p, i) => (
                      <tr key={i}>
                        <td className="font-monospace">
                          <Link href={link(p.date)}>{p.date}</Link>
                        </td>
                        <td>{p.loomNumber ? `${p.loomNumber}${p.part && p.part > 1 ? ` (P${p.part})` : ''}` : '—'}</td>
                        <td>
                          <span className="badge text-bg-warning">{KIND[p.kind]}</span>
                        </td>
                        <td>{p.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {(shown.unlinked.length > 0 || shown.outsideRun.length > 0 || shown.mismatches.length > 0) && (
            <div className="card">
              <div className="card-header fw-semibold small">Qualities / report</div>
              <ul className="list-group list-group-flush small">
                {shown.mismatches.map((m) => (
                  <li key={`m${m.date}`} className="list-group-item">
                    {m.date}: report totals do not match the saved sheet (refresh the page; if it stays, report it).
                  </li>
                ))}
                {shown.unlinked.map((u) => (
                  <li key={`u${u.date}${u.loomNumber}`} className="list-group-item">
                    {u.date} · Loom {u.loomNumber}: “{u.qualityName}” is not in Quality Master.
                  </li>
                ))}
                {shown.outsideRun.map((o) => (
                  <li key={`o${o.date}${o.loomNumber}`} className="list-group-item">
                    {o.date} · Loom {o.loomNumber}: “{o.qualityName}”{' '}
                    {o.startedOn && o.date < o.startedOn ? `before the start date (${o.startedOn})` : `meters after the end date (${o.endedOn})`}.
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}
