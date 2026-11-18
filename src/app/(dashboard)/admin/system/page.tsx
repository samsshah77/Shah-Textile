'use client'

import { useCallback, useEffect, useState } from 'react'
import { AdminTabs } from '@/components/admin/AdminTabs'
import { AdminSystemSkeleton } from '@/components/admin/AdminSkeleton'

type SystemInfo = {
  server: { time: string; timeZone: string; startedAt: string; node: string; memoryMb: number }
  database: { name: string; bytes: number; version: string; tables: Array<{ name: string; bytes: number; rows: number }> }
  uploads: Array<{ folder: string; bytes: number; files: number }>
  disk: { total: number; free: number } | null
  snapshots: Array<{ id: string; createdAt: string; reason: string; rows: number }>
  snapshotCount: number
  nightly: { dir: string; readable: boolean; count: number; latest: Array<{ name: string; bytes: number; at: string }> }
  ai: { claude: boolean; gemini: boolean }
  users: Record<string, number>
}

const size = (b: number) =>
  b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`
const when = (iso: string) => new Date(iso).toLocaleString('en-PK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const hoursAgo = (iso: string) => (Date.now() - new Date(iso).getTime()) / 3600_000
const FOLDER: Record<string, string> = {
  looms: 'Loom photos',
  bills: 'Bill photos',
  profiles: 'Profile photos',
  registers: 'Register photos (AI)',
  faults: 'Kamran Fault photos / video',
}
const REASON: Record<string, string> = { 'app-start': 'On deploy / restart', 'before-qualityId-backfill': 'Before data fix' }

function Status({ ok, warn, children }: { ok: boolean; warn?: boolean; children: React.ReactNode }) {
  return <span className={`badge ${ok ? 'text-bg-success' : warn ? 'text-bg-warning' : 'text-bg-danger'}`}>{children}</span>
}

/** Administration → System: is the data safe and is there room? Backups, sizes, disk, keys. */
export default function AdminSystemPage() {
  const [info, setInfo] = useState<SystemInfo | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/system', { credentials: 'same-origin', cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load')
      setInfo(data)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load')
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [load])

  const snapshotNow = async () => {
    if (!window.confirm('Take a copy (snapshot) of all data now? It takes 10–30 seconds.')) return
    setBusy(true)
    setNotice('')
    try {
      const res = await fetch('/api/admin/snapshots', { method: 'POST', credentials: 'same-origin' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || 'Snapshot failed')
      setNotice('Snapshot taken.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Snapshot failed')
    } finally {
      setBusy(false)
    }
  }

  const lastSnap = info?.snapshots[0]
  const lastNightly = info?.nightly.latest[0]
  const diskUsedPct = info?.disk ? Math.round(((info.disk.total - info.disk.free) / info.disk.total) * 100) : null
  const uploadsTotal = (info?.uploads || []).reduce((a, u) => a + u.bytes, 0)

  return (
    <div className="container-fluid px-2 px-md-3 py-3" style={{ maxWidth: 1100 }}>
      <AdminTabs />
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <h1 className="h5 fw-bold mb-0">System</h1>
        <div className="d-flex gap-2">
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => void load()}>
            <i className="bi bi-arrow-clockwise me-1" /> Refresh
          </button>
          <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => void snapshotNow()}>
            {busy ? 'Taking snapshot…' : 'Take snapshot now'}
          </button>
        </div>
      </div>
      {error && <div className="alert alert-danger py-2 small">{error}</div>}
      {notice && <div className="alert alert-success py-2 small">{notice}</div>}
      {!info && !error && <AdminSystemSkeleton />}

      {info && (
        <>
          <div className="row g-3 mb-3">
            <div className="col-6 col-lg-3">
              <div className="card h-100 shadow-sm">
                <div className="card-body p-3">
                  <div className="small text-secondary">Snapshot (copy inside the database)</div>
                  <div className="fw-bold">{lastSnap ? when(lastSnap.createdAt) : '—'}</div>
                  <Status ok={Boolean(lastSnap) && hoursAgo(lastSnap!.createdAt) < 72} warn={Boolean(lastSnap)}>
                    {lastSnap ? `${info.snapshotCount} kept` : 'None'}
                  </Status>
                </div>
              </div>
            </div>
            <div className="col-6 col-lg-3">
              <div className="card h-100 shadow-sm">
                <div className="card-body p-3">
                  <div className="small text-secondary">Nightly backup (pg_dump)</div>
                  <div className="fw-bold">{lastNightly ? when(lastNightly.at) : info.nightly.readable ? 'No file' : 'The app cannot see it'}</div>
                  {info.nightly.readable ? (
                    <Status ok={Boolean(lastNightly) && hoursAgo(lastNightly!.at) < 30}>{lastNightly ? `${info.nightly.count} files` : 'Check it'}</Status>
                  ) : (
                    <span className="small text-secondary">Check {info.nightly.dir} on the server</span>
                  )}
                </div>
              </div>
            </div>
            <div className="col-6 col-lg-3">
              <div className="card h-100 shadow-sm">
                <div className="card-body p-3">
                  <div className="small text-secondary">Server disk</div>
                  <div className="fw-bold">{info.disk ? `${size(info.disk.free)} khali` : '—'}</div>
                  {diskUsedPct !== null && (
                    <Status ok={diskUsedPct < 80} warn={diskUsedPct < 92}>
                      {diskUsedPct}% bhara
                    </Status>
                  )}
                </div>
              </div>
            </div>
            <div className="col-6 col-lg-3">
              <div className="card h-100 shadow-sm">
                <div className="card-body p-3">
                  <div className="small text-secondary">Database / Photos</div>
                  <div className="fw-bold">
                    {size(info.database.bytes)} / {size(uploadsTotal)}
                  </div>
                  <span className="small text-secondary">{info.database.version}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="row g-3">
            <div className="col-lg-6">
              <div className="card shadow-sm h-100">
                <div className="card-header py-2 small fw-bold">Photos / video (on server)</div>
                <table className="table table-sm small mb-0">
                  <tbody>
                    {info.uploads.length === 0 && (
                      <tr>
                        <td className="text-secondary">No files yet</td>
                      </tr>
                    )}
                    {info.uploads.map((u) => (
                      <tr key={u.folder}>
                        <td>{FOLDER[u.folder] || u.folder}</td>
                        <td className="text-end">{u.files} files</td>
                        <td className="text-end fw-semibold">{size(u.bytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="col-lg-6">
              <div className="card shadow-sm h-100">
                <div className="card-header py-2 small fw-bold">Server</div>
                <table className="table table-sm small mb-0">
                  <tbody>
                    <tr>
                      <td>Server time</td>
                      <td className="text-end">
                        {when(info.server.time)} <span className="text-secondary">({info.server.timeZone})</span>
                      </td>
                    </tr>
                    <tr>
                      <td>Last deploy / restart</td>
                      <td className="text-end">{when(info.server.startedAt)}</td>
                    </tr>
                    <tr>
                      <td>Memory</td>
                      <td className="text-end">{info.server.memoryMb} MB · Node {info.server.node}</td>
                    </tr>
                    <tr>
                      <td>AI — register photo</td>
                      <td className="text-end">
                        <Status ok={info.ai.claude || info.ai.gemini} warn>
                          {info.ai.claude ? 'Claude on' : info.ai.gemini ? 'Gemini on' : 'Off (no key)'}
                        </Status>
                      </td>
                    </tr>
                    <tr>
                      <td>AI — fault from voice</td>
                      <td className="text-end">
                        <Status ok={info.ai.gemini} warn>
                          {info.ai.gemini ? 'Gemini on' : 'Off (no key)'}
                        </Status>
                      </td>
                    </tr>
                    <tr>
                      <td>WhatsApp & Email Sharing</td>
                      <td className="text-end">
                        <Status ok={true}>Direct WA & Free Email</Status>
                      </td>
                    </tr>
                    <tr>
                      <td>Users</td>
                      <td className="text-end">
                        {info.users.APPROVED || 0} active{info.users.PENDING ? ` · ${info.users.PENDING} waiting` : ''}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div className="col-lg-6">
              <div className="card shadow-sm">
                <div className="card-header py-2 small fw-bold">Snapshots (last 10)</div>
                <table className="table table-sm small mb-0">
                  <tbody>
                    {info.snapshots.map((s) => (
                      <tr key={s.id}>
                        <td>{when(s.createdAt)}</td>
                        <td>{REASON[s.reason] || s.reason.replace(/^manual:/, 'By hand: ')}</td>
                        <td className="text-end text-secondary">{s.rows.toLocaleString()} rows</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="col-lg-6">
              <div className="card shadow-sm">
                <div className="card-header py-2 small fw-bold">Largest database tables</div>
                <table className="table table-sm small mb-0">
                  <tbody>
                    {info.database.tables.map((t) => (
                      <tr key={t.name}>
                        <td className="font-monospace">{t.name}</td>
                        <td className="text-end text-secondary">{t.rows.toLocaleString()} rows</td>
                        <td className="text-end">{size(t.bytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <p className="form-text small mt-3">
            A snapshot is a copy inside the database (made by itself on every deploy, the last 20 are kept). The nightly backup is a file on the server disk. If the
            server itself breaks, both are lost — so once a week also keep a backup file on Google Drive.
          </p>
        </>
      )}
    </div>
  )
}
