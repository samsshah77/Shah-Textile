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
const REASON: Record<string, string> = { 'app-start': 'Deploy / restart par', 'before-qualityId-backfill': 'Data fix se pehle' }

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
      if (!res.ok) throw new Error(data.error || 'Load nahi hua')
      setInfo(data)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load nahi hua')
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [load])

  const snapshotNow = async () => {
    if (!window.confirm('Abhi poore data ki copy (snapshot) le lein? 10–30 second lagte hain.')) return
    setBusy(true)
    setNotice('')
    try {
      const res = await fetch('/api/admin/snapshots', { method: 'POST', credentials: 'same-origin' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || 'Snapshot nahi hua')
      setNotice('Snapshot le liya gaya.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Snapshot nahi hua')
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
            {busy ? 'Snapshot ho raha hai…' : 'Abhi snapshot lein'}
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
                  <div className="small text-secondary">Snapshot (database ke andar copy)</div>
                  <div className="fw-bold">{lastSnap ? when(lastSnap.createdAt) : '—'}</div>
                  <Status ok={Boolean(lastSnap) && hoursAgo(lastSnap!.createdAt) < 72} warn={Boolean(lastSnap)}>
                    {lastSnap ? `${info.snapshotCount} rakhe hain` : 'Koi nahi'}
                  </Status>
                </div>
              </div>
            </div>
            <div className="col-6 col-lg-3">
              <div className="card h-100 shadow-sm">
                <div className="card-body p-3">
                  <div className="small text-secondary">Raat ka backup (pg_dump)</div>
                  <div className="fw-bold">{lastNightly ? when(lastNightly.at) : info.nightly.readable ? 'Koi file nahi' : 'App ko nazar nahi aata'}</div>
                  {info.nightly.readable ? (
                    <Status ok={Boolean(lastNightly) && hoursAgo(lastNightly!.at) < 30}>{lastNightly ? `${info.nightly.count} files` : 'Check karein'}</Status>
                  ) : (
                    <span className="small text-secondary">Server par {info.nightly.dir} dekhein</span>
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
                <div className="card-header py-2 small fw-bold">Photos / video (server par)</div>
                <table className="table table-sm small mb-0">
                  <tbody>
                    {info.uploads.length === 0 && (
                      <tr>
                        <td className="text-secondary">Abhi koi file nahi</td>
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
                      <td>Server ka waqt</td>
                      <td className="text-end">
                        {when(info.server.time)} <span className="text-secondary">({info.server.timeZone})</span>
                      </td>
                    </tr>
                    <tr>
                      <td>Aakhri deploy / restart</td>
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
                          {info.ai.claude ? 'Claude on' : info.ai.gemini ? 'Gemini on' : 'Off (key nahi)'}
                        </Status>
                      </td>
                    </tr>
                    <tr>
                      <td>AI — awaz se fault</td>
                      <td className="text-end">
                        <Status ok={info.ai.gemini} warn>
                          {info.ai.gemini ? 'Gemini on' : 'Off (key nahi)'}
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
                        {info.users.APPROVED || 0} chalu{info.users.PENDING ? ` · ${info.users.PENDING} intezar mein` : ''}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div className="col-lg-6">
              <div className="card shadow-sm">
                <div className="card-header py-2 small fw-bold">Snapshots (aakhri 10)</div>
                <table className="table table-sm small mb-0">
                  <tbody>
                    {info.snapshots.map((s) => (
                      <tr key={s.id}>
                        <td>{when(s.createdAt)}</td>
                        <td>{REASON[s.reason] || s.reason.replace(/^manual:/, 'Hath se: ')}</td>
                        <td className="text-end text-secondary">{s.rows.toLocaleString()} rows</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="col-lg-6">
              <div className="card shadow-sm">
                <div className="card-header py-2 small fw-bold">Database ke bare tables</div>
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
            Snapshot database ke andar copy hai (har deploy par khud banta hai, aakhri 20 rakhe jate hain). Raat ka backup server ki disk par file hai. Server
            hi kharab ho jaye to dono jayenge — is liye hafte mein ek dafa backup file Google Drive par bhi rakhni chahiye.
          </p>
        </>
      )}
    </div>
  )
}
