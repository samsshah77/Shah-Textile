'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { AdminTabs } from '@/components/admin/AdminTabs'

type Row = {
  id: string
  createdAt: string
  actorName: string | null
  actorRole: string | null
  module: string
  action: string
  entityKey: string
  entityId: string | null
  changes: unknown
  meta: Record<string, unknown> | null
  ip: string | null
}
type Data = { rows: Row[]; total: number; page: number; pageSize: number; actors: string[] }

const MODULES: Array<[string, string]> = [
  ['', 'Sab'],
  ['payroll', 'Salary'],
  ['accounts', 'Accounts'],
  ['floor', 'Production'],
  ['auth', 'Login / Users'],
  ['system', 'System'],
]
const MODULE_BADGE: Record<string, string> = {
  payroll: 'text-bg-success',
  accounts: 'text-bg-primary',
  floor: 'text-bg-warning',
  auth: 'text-bg-info',
  system: 'text-bg-secondary',
}
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-PK', { day: 'numeric', month: 'short', year: '2-digit', hour: 'numeric', minute: '2-digit' })

/** One-line summary of a change record (rows added / removed / fields changed). */
function summary(changes: unknown): string {
  if (!changes || typeof changes !== 'object') return ''
  const c = changes as Record<string, unknown>
  if (c.kind === 'rows') {
    const parts = []
    if (Array.isArray(c.added) && c.added.length) parts.push(`${c.added.length} naye`)
    if (Array.isArray(c.changed) && c.changed.length) parts.push(`${c.changed.length} badle`)
    if (Array.isArray(c.removed) && c.removed.length) parts.push(`${c.removed.length} hataye`)
    return parts.join(' · ')
  }
  if (c.kind === 'object' && c.fields && typeof c.fields === 'object') return `Badla: ${Object.keys(c.fields).slice(0, 6).join(', ')}`
  if (c.kind === 'none') return ''
  const keys = Object.keys(c).filter((k) => k !== 'kind')
  return keys.length ? keys.slice(0, 6).map((k) => `${k}: ${typeof c[k] === 'object' ? '…' : String(c[k])}`).join(' · ') : ''
}

/** Administration → Audit log: who changed what and when (read only). */
export default function AdminAuditPage() {
  const [filters, setFilters] = useState({ module: '', actor: '', from: '', to: '', q: '' })
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(async () => {
    const sp = new URLSearchParams({ page: String(page) })
    for (const [k, v] of Object.entries(filters)) if (v) sp.set(k, v)
    try {
      const res = await fetch(`/api/admin/audit?${sp}`, { credentials: 'same-origin', cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Load nahi hua')
      setData(json)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load nahi hua')
    }
  }, [filters, page])

  useEffect(() => {
    const t = setTimeout(() => void load(), filters.q ? 350 : 0)
    return () => clearTimeout(t)
  }, [load, filters.q])

  const set = (k: keyof typeof filters, v: string) => {
    setPage(1)
    setFilters((f) => ({ ...f, [k]: v }))
  }
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div className="container-fluid px-2 px-md-3 py-3" style={{ maxWidth: 1200 }}>
      <AdminTabs />
      <h1 className="h5 fw-bold mb-3">Audit log</h1>

      <div className="card shadow-sm mb-3">
        <div className="card-body p-2 row g-2 align-items-end">
          <div className="col-6 col-md-2">
            <label className="form-label small mb-1" htmlFor="au-mod">Hissa</label>
            <select id="au-mod" className="form-select form-select-sm" value={filters.module} onChange={(e) => set('module', e.target.value)}>
              {MODULES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label small mb-1" htmlFor="au-actor">Kis ne</label>
            <select id="au-actor" className="form-select form-select-sm" value={filters.actor} onChange={(e) => set('actor', e.target.value)}>
              <option value="">Sab</option>
              {(data?.actors || []).map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label small mb-1" htmlFor="au-from">Se</label>
            <input id="au-from" type="date" className="form-control form-control-sm" value={filters.from} onChange={(e) => set('from', e.target.value)} />
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label small mb-1" htmlFor="au-to">Tak</label>
            <input id="au-to" type="date" className="form-control form-control-sm" value={filters.to} onChange={(e) => set('to', e.target.value)} />
          </div>
          <div className="col-12 col-md-4">
            <label className="form-label small mb-1" htmlFor="au-q">Dhoondein</label>
            <input id="au-q" className="form-control form-control-sm" placeholder="bill, salary, loom, naam…" value={filters.q} onChange={(e) => set('q', e.target.value)} />
          </div>
        </div>
      </div>

      {error && <div className="alert alert-danger py-2 small">{error}</div>}
      {!data && !error && <div className="text-secondary small">Load ho raha hai…</div>}

      {data && (
        <>
          <div className="small text-secondary mb-2">{data.total.toLocaleString()} entries</div>
          <div className="table-responsive card shadow-sm">
            <table className="table table-sm small align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th style={{ width: 130 }}>Kab</th>
                  <th style={{ width: 130 }}>Kis ne</th>
                  <th style={{ width: 110 }}>Hissa</th>
                  <th>Kya</th>
                  <th>Tafseel</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-secondary py-4">
                      Koi entry nahi.
                    </td>
                  </tr>
                )}
                {data.rows.map((r) => (
                  <Fragment key={r.id}>
                    <tr role="button" onClick={() => setOpen(open === r.id ? null : r.id)} className={open === r.id ? 'table-active' : ''}>
                      <td className="text-nowrap">{when(r.createdAt)}</td>
                      <td>
                        {r.actorName || '—'}
                        {r.actorRole && <div className="text-secondary" style={{ fontSize: 10 }}>{r.actorRole}</div>}
                      </td>
                      <td>
                        <span className={`badge ${MODULE_BADGE[r.module] || 'text-bg-light'}`}>{MODULES.find(([k]) => k === r.module)?.[1] || r.module}</span>
                      </td>
                      <td>
                        <span className="fw-semibold">{r.action}</span>
                        <div className="text-secondary font-monospace" style={{ fontSize: 10 }}>
                          {r.entityKey}
                          {r.entityId ? ` · ${r.entityId}` : ''}
                        </div>
                      </td>
                      <td className="text-secondary">{summary(r.changes)}</td>
                    </tr>
                    {open === r.id && (
                      <tr>
                        <td colSpan={5} className="bg-body-tertiary">
                          <pre className="small mb-0 p-2" style={{ maxHeight: 360, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                            {JSON.stringify({ changes: r.changes, meta: r.meta, ip: r.ip }, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="d-flex align-items-center justify-content-center gap-2 mt-3">
            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              ‹ Pichle
            </button>
            <span className="small">
              Page {page} / {pages}
            </span>
            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Agle ›
            </button>
          </div>
        </>
      )}
    </div>
  )
}
