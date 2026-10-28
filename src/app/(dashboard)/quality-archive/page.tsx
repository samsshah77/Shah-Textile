'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminTabs } from '@/components/admin/AdminTabs'
import { useAuth } from '@/context/AuthContext'

type ArchiveRow = {
  fileId: string
  sheetIdx: number
  sheetName: string
  year: number | null
  row: number
  col: number
  name: string
  warp: string
  weft: string
  reed: number
  pick: number
  production: number
  group: string
}
type Preview = {
  fileName: string
  year: number | null
  title: string
  sheets: Array<{ name: string; cells: number; rows: number; production: number }>
}

const n0 = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 })
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** Administration → Quality Archive: past years' qualities (2020–2025). Read-only; search + CSV. */
export default function QualityArchivePage() {
  const { isAdmin } = useAuth()
  const [rows, setRows] = useState<ArchiveRow[]>([])
  const [sealed, setSealed] = useState<boolean | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/quality-archive', { credentials: 'same-origin', cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Load nahi hua')
      setRows(data.rows)
      setSealed(Boolean(data.sealed))
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load nahi hua')
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [load])

  return (
    <div className="container-fluid py-3">
      {isAdmin && <AdminTabs />}
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <h1 className="h5 mb-0">
          <i className="bi bi-archive me-2" />
          Quality Archive
        </h1>
        <span className="badge text-bg-secondary">
          <i className="bi bi-lock-fill me-1" />
          Sirf record — koi badal ya mita nahi sakta
        </span>
      </div>
      {error && <div className="alert alert-danger py-2">{error}</div>}
      {sealed === false && <OneTimeImport onDone={load} />}
      {sealed && <SearchView rows={rows} />}
    </div>
  )
}

function SearchView({ rows }: { rows: ArchiveRow[] }) {
  const [q, setQ] = useState('')
  const [year, setYear] = useState('')
  const [kind, setKind] = useState('')
  const [reed, setReed] = useState('')
  const [pick, setPick] = useState('')
  const years = useMemo(() => [...new Set(rows.map((r) => r.year).filter((y): y is number => y != null))].sort(), [rows])
  const kinds = useMemo(() => [...new Set(rows.map((r) => r.sheetName.trim()))].sort(), [rows])

  const list = useMemo(() => {
    const words = norm(q).split(' ').filter(Boolean)
    return rows.filter((r) => {
      if (year && String(r.year) !== year) return false
      if (kind && r.sheetName.trim() !== kind) return false
      if (reed.trim() && String(r.reed) !== reed.trim()) return false
      if (pick.trim() && String(r.pick) !== pick.trim()) return false
      if (!words.length) return true
      const hay = norm(`${r.name} ${r.warp} ${r.weft} ${r.group}`)
      return words.every((w) => hay.includes(w))
    })
  }, [rows, q, year, kind, reed, pick])
  const total = list.reduce((t, r) => t + r.production, 0)

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const head = ['Year', 'Sheet', 'Name', 'Warp', 'Weft', 'Reed', 'Pick', 'Production', 'Group (Excel heading)']
    const body = list.map((r) => [r.year, r.sheetName.trim(), r.name, r.warp, r.weft, r.reed, r.pick, r.production, r.group].map(esc).join(','))
    const blob = new Blob([`﻿${[head.map(esc).join(','), ...body].join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `Quality-Archive${year ? `-${year}` : ''}${kind ? `-${kind}` : ''}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const clear = () => {
    setQ('')
    setYear('')
    setKind('')
    setReed('')
    setPick('')
  }

  return (
    <div className="card">
      <div className="card-body py-2 d-flex flex-wrap gap-2 align-items-center">
        <input className="form-control form-control-sm" style={{ maxWidth: 280 }} placeholder="Naam, warp, weft…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <select className="form-select form-select-sm" style={{ width: 110 }} value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year">
          <option value="">Sab saal</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select className="form-select form-select-sm" style={{ width: 150 }} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Sheet">
          <option value="">Shirting + Suiting</option>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <input className="form-control form-control-sm" style={{ width: 80 }} placeholder="Reed" inputMode="numeric" value={reed} onChange={(e) => setReed(e.target.value)} aria-label="Reed" />
        <input className="form-control form-control-sm" style={{ width: 80 }} placeholder="Pick" inputMode="numeric" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Pick" />
        <button type="button" className="btn btn-sm btn-link text-secondary" onClick={clear}>
          Saaf karein
        </button>
        <span className="small text-secondary ms-auto">
          {list.length} qualities · <strong>{n0(total)}</strong> meter
        </span>
        <button type="button" className="btn btn-sm btn-outline-success" onClick={exportCsv} disabled={!list.length}>
          <i className="bi bi-filetype-csv me-1" />
          CSV download
        </button>
      </div>
      <div className="table-responsive" style={{ maxHeight: '72vh' }}>
        <table className="table table-sm table-hover table-bordered mb-0 align-middle" style={{ fontSize: 13 }}>
          <thead className="table-light" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th>Year</th>
              <th>Sheet</th>
              <th>Name</th>
              <th>Warp</th>
              <th>Weft</th>
              <th className="text-end">Reed</th>
              <th className="text-end">Pick</th>
              <th className="text-end">Production</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={`${r.fileId}-${r.sheetIdx}-${r.row}-${r.col}`} title={r.group}>
                <td>{r.year ?? '—'}</td>
                <td>{r.sheetName.trim()}</td>
                <td className="fw-semibold">{r.name}</td>
                <td>{r.warp}</td>
                <td>{r.weft}</td>
                <td className="text-end">{r.reed}</td>
                <td className="text-end">{r.pick}</td>
                <td className="text-end">{r.production}</td>
              </tr>
            ))}
            {!list.length && (
              <tr>
                <td colSpan={8} className="text-center text-secondary py-4">
                  Kuch nahi mila
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="card-footer small text-secondary">
        2020 aur 2021 ki files dono Nov 2020 se shuru hoti hain, is liye kuch qualities dono saal mein hain (Excel ki tarah). Total dekhte waqt saal chunein.
      </div>
    </div>
  )
}

/** Shown only while the archive is empty: the 2020–2025 workbooks go in once, together. */
function OneTimeImport({ onDone }: { onDone: () => Promise<void> }) {
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<Preview[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const post = async (list: File[], action: 'preview' | 'save') => {
    const fd = new FormData()
    for (const f of list) fd.append('file', f)
    fd.append('action', action)
    const res = await fetch('/api/admin/quality-archive', { method: 'POST', body: fd, credentials: 'same-origin' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
    return data
  }

  const choose = async (list: FileList | null) => {
    const chosen = Array.from(list ?? [])
    setFiles(chosen)
    setPreviews([])
    setError('')
    if (!chosen.length) return
    setBusy(true)
    try {
      setPreviews((await post(chosen, 'preview')).previews)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Files parh nahi saka')
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (!window.confirm(`${files.length} files hamesha ke liye save hon gi aur archive band ho jaye ga.\n\nIs ke baad na kuch add, na badal, na mita sakte hain (admin bhi nahi). Upar ki list check kar li?\n\nSave karein?`)) return
    setBusy(true)
    setError('')
    try {
      await post(files, 'save')
      await onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save nahi hua')
    } finally {
      setBusy(false)
    }
  }

  const totalRows = previews.reduce((t, p) => t + p.sheets.reduce((s, x) => s + x.rows, 0), 0)

  return (
    <div className="card">
      <div className="card-header py-2 fw-semibold">Ek dafa ka kaam: purani quality files daalein</div>
      <div className="card-body">
        <p className="small text-secondary mb-2">
          2020 se 2025 ki saari Excel files ek sath chunein. Pehle sirf parh kar dikhaya jaye ga; save ke baad archive band ho jaye ga aur yeh hissa nazar
          nahi aaye ga.
        </p>
        <input type="file" className="form-control form-control-sm mb-3" style={{ maxWidth: 420 }} accept=".xlsx" multiple disabled={busy} onChange={(e) => void choose(e.target.files)} />
        {previews.length > 0 && (
          <table className="table table-sm align-middle" style={{ fontSize: 13 }}>
            <thead className="table-light">
              <tr>
                <th>File</th>
                <th>Saal</th>
                <th>Period (Excel se)</th>
                <th>Sheets · qualities · meter</th>
              </tr>
            </thead>
            <tbody>
              {previews.map((p) => (
                <tr key={p.fileName}>
                  <td className="fw-semibold">{p.fileName}</td>
                  <td>{p.year ?? '—'}</td>
                  <td className="small">{p.title}</td>
                  <td className="small">
                    {p.sheets.map((s) => (
                      <div key={s.name}>
                        {s.name.trim()}: {s.rows} qualities · {n0(s.production)} m
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={3}>Kul</th>
                <th>{totalRows} qualities</th>
              </tr>
            </tfoot>
          </table>
        )}
        {error && <div className="alert alert-danger py-2">{error}</div>}
        <button type="button" className="btn btn-sm btn-primary" disabled={busy || !previews.length || previews.length !== files.length} onClick={() => void save()}>
          <i className="bi bi-lock-fill me-1" />
          {busy ? 'Ruk jayein…' : `Hamesha ke liye save (${previews.length})`}
        </button>
      </div>
    </div>
  )
}
