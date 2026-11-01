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
  figures: 'Hisaab nahi milta',
  'meters-no-quality': 'Meters, quality nahi',
  'not-approved': 'Approve nahi hua',
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
        } else setError(j.error || 'Check nahi chala.')
      })
      .catch(() => live && setError('Server se raabta nahi hua.'))
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
        Ye page sirf dikhata hai — kuch nahi badalta. Ghalat row Daily Entry par us din khol kar theek karein.
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      {!shown && !error && <div className="text-muted small">Check ho raha hai…</div>}
      {shown && (
        <>
          <div className={total ? 'alert alert-warning py-2 small' : 'alert alert-success py-2 small'}>
            {shown.days} din check hue — {total ? `${total} cheezein dekhne wali hain.` : 'sab theek hai.'}
          </div>
          {shown.problems.length > 0 && (
            <div className="card">
              <div className="card-header fw-semibold small">Rows / din</div>
              <div className="table-responsive">
                <table className="table table-sm mb-0 small">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Loom</th>
                      <th>Kya</th>
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
                    {m.date}: report ke totals saved sheet se nahi milte (page refresh karein; rahe to batayein).
                  </li>
                ))}
                {shown.unlinked.map((u) => (
                  <li key={`u${u.date}${u.loomNumber}`} className="list-group-item">
                    {u.date} · Loom {u.loomNumber}: “{u.qualityName}” Quality Master mein nahi.
                  </li>
                ))}
                {shown.outsideRun.map((o) => (
                  <li key={`o${o.date}${o.loomNumber}`} className="list-group-item">
                    {o.date} · Loom {o.loomNumber}: “{o.qualityName}”{' '}
                    {o.startedOn && o.date < o.startedOn ? `start date (${o.startedOn}) se pehle` : `end date (${o.endedOn}) ke baad meters`}.
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
