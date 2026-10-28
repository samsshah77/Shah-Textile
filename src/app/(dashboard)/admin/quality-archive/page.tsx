'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AdminTabs } from '@/components/admin/AdminTabs'
import type { XlsxSheet } from '@/lib/archive/xlsx'
import { cellLabel } from '@/lib/archive/qualityRows'

type ArchiveFile = {
  id: string
  fileName: string
  sha256: string
  size: number
  year: number | null
  title: string
  uploadedBy: string
  uploadedAt: string
  sheets: Array<{ idx: number; name: string }>
  rows: number
}
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
  sha256: string
  size: number
  year: number | null
  title: string
  sheets: Array<{ name: string; cells: number; rows: number; production: number }>
  duplicateOf: { id: string; fileName: string; uploadedAt: string } | null
}
type Pending = { file: File; preview?: Preview; error?: string; saved?: boolean }

const n0 = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 })
const when = (iso: string) => new Date(iso).toLocaleString('en-PK', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** Administration → Quality Archive: past years' quality workbooks, exactly as in Excel. Read-only. */
export default function QualityArchivePage() {
  const [files, setFiles] = useState<ArchiveFile[]>([])
  const [rows, setRows] = useState<ArchiveRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState<'search' | 'excel' | 'files'>('search')
  const [focus, setFocus] = useState<{ fileId: string; idx: number; r?: number; c?: number } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/quality-archive', { credentials: 'same-origin', cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Load nahi hua')
      setFiles(data.files)
      setRows(data.rows)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load nahi hua')
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [load])

  const openInExcel = (r: ArchiveRow) => {
    setFocus({ fileId: r.fileId, idx: r.sheetIdx, r: r.row, c: r.col })
    setView('excel')
  }

  return (
    <div className="container-fluid py-3">
      <AdminTabs />
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <h1 className="h5 mb-0">
          <i className="bi bi-archive me-2" />
          Quality Archive
        </h1>
        <span className="badge text-bg-secondary">
          <i className="bi bi-lock-fill me-1" />
          Sirf record — koi badal ya mita nahi sakta
        </span>
        <div className="btn-group btn-group-sm ms-auto" role="group" aria-label="Archive view">
          {(
            [
              ['search', 'bi-search', 'Search'],
              ['excel', 'bi-file-earmark-spreadsheet', 'Excel'],
              ['files', 'bi-folder2-open', 'Files'],
            ] as const
          ).map(([k, icon, label]) => (
            <button key={k} type="button" className={`btn ${view === k ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setView(k)}>
              <i className={`bi ${icon} me-1`} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="alert alert-danger py-2">{error}</div>}
      {loaded && !error && files.length === 0 && view !== 'files' && (
        <div className="alert alert-info py-2">
          Abhi archive khali hai. <button type="button" className="btn btn-link p-0 align-baseline" onClick={() => setView('files')}>Files</button> mein ja kar
          Excel files daalein.
        </div>
      )}

      {view === 'search' && files.length > 0 && <SearchView files={files} rows={rows} onOpen={openInExcel} />}
      {view === 'excel' && files.length > 0 && <ExcelView files={files} focus={focus} onFocus={setFocus} />}
      {view === 'files' && <FilesView files={files} onChanged={load} />}
    </div>
  )
}

function SearchView({ files, rows, onOpen }: { files: ArchiveFile[]; rows: ArchiveRow[]; onOpen: (r: ArchiveRow) => void }) {
  const [q, setQ] = useState('')
  const [year, setYear] = useState('')
  const [kind, setKind] = useState('')
  const [reed, setReed] = useState('')
  const [pick, setPick] = useState('')
  const years = useMemo(() => [...new Set(rows.map((r) => r.year).filter((y): y is number => y != null))].sort(), [rows])
  const kinds = useMemo(() => [...new Set(rows.map((r) => r.sheetName.trim()))].sort(), [rows])
  const fileName = useMemo(() => new Map(files.map((f) => [f.id, f.fileName])), [files])

  const list = useMemo(() => {
    const words = norm(q).split(' ').filter(Boolean)
    return rows.filter((r) => {
      if (year && String(r.year) !== year) return false
      if (kind && r.sheetName.trim() !== kind) return false
      if (reed && String(r.reed) !== reed.trim()) return false
      if (pick && String(r.pick) !== pick.trim()) return false
      if (!words.length) return true
      const hay = norm(`${r.name} ${r.warp} ${r.weft} ${r.group}`)
      return words.every((w) => hay.includes(w))
    })
  }, [rows, q, year, kind, reed, pick])
  const total = list.reduce((t, r) => t + r.production, 0)

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const head = ['Year', 'Sheet', 'Name', 'Warp', 'Weft', 'Reed', 'Pick', 'Production', 'Group (Excel heading)', 'File', 'Cell']
    const body = list.map((r) =>
      [r.year, r.sheetName.trim(), r.name, r.warp, r.weft, r.reed, r.pick, r.production, r.group, fileName.get(r.fileId), cellLabel(r.row, r.col)]
        .map(esc)
        .join(',')
    )
    const blob = new Blob([`﻿${[head.map(esc).join(','), ...body].join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `Quality-Archive${year ? `-${year}` : ''}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
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
        <select className="form-select form-select-sm" style={{ width: 130 }} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Sheet">
          <option value="">Shirting + Suiting</option>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <input className="form-control form-control-sm" style={{ width: 80 }} placeholder="Reed" inputMode="numeric" value={reed} onChange={(e) => setReed(e.target.value)} aria-label="Reed" />
        <input className="form-control form-control-sm" style={{ width: 80 }} placeholder="Pick" inputMode="numeric" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Pick" />
        <span className="small text-secondary ms-auto">
          {list.length} qualities · <strong>{n0(total)}</strong> meter
        </span>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={exportCsv} disabled={!list.length}>
          <i className="bi bi-download me-1" />
          CSV
        </button>
      </div>
      <div className="table-responsive" style={{ maxHeight: '70vh' }}>
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
              <th>Excel</th>
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
                <td>
                  <button type="button" className="btn btn-link btn-sm p-0" onClick={() => onOpen(r)} title="Excel sheet mein yeh line dekhein">
                    {cellLabel(r.row, r.col)}
                  </button>
                </td>
              </tr>
            ))}
            {!list.length && (
              <tr>
                <td colSpan={9} className="text-center text-secondary py-4">
                  Kuch nahi mila
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="card-footer small text-secondary">
        Yeh list Excel sheets se nikli qualities hain. Har line ka asal &quot;Excel&quot; cell par click kar ke sheet mein dekh sakte hain —
        totals aur headings wahan bilkul Excel jaise hain.
      </div>
    </div>
  )
}

function ExcelView({
  files,
  focus,
  onFocus,
}: {
  files: ArchiveFile[]
  focus: { fileId: string; idx: number; r?: number; c?: number } | null
  onFocus: (f: { fileId: string; idx: number; r?: number; c?: number }) => void
}) {
  const fileId = focus?.fileId && files.some((f) => f.id === focus.fileId) ? focus.fileId : files[0].id
  const file = files.find((f) => f.id === fileId)!
  const idx = file.sheets.some((s) => s.idx === focus?.idx) ? focus!.idx : file.sheets[0]?.idx ?? 0
  const [sheet, setSheet] = useState<{ key: string; data: XlsxSheet } | null>(null)
  const [find, setFind] = useState('')
  const key = `${fileId}:${idx}`

  useEffect(() => {
    let live = true
    fetch(`/api/admin/quality-archive/${encodeURIComponent(fileId)}?sheet=${idx}`, { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d) => {
        if (live && d.sheet) setSheet({ key, data: d.sheet })
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [fileId, idx, key])

  return (
    <div className="card">
      <div className="card-body py-2 d-flex flex-wrap gap-2 align-items-center">
        <select className="form-select form-select-sm" style={{ width: 260 }} value={fileId} onChange={(e) => onFocus({ fileId: e.target.value, idx: 0 })} aria-label="File">
          {files.map((f) => (
            <option key={f.id} value={f.id}>
              {f.fileName}
            </option>
          ))}
        </select>
        <div className="btn-group btn-group-sm" role="group" aria-label="Sheet">
          {file.sheets.map((s) => (
            <button key={s.idx} type="button" className={`btn ${s.idx === idx ? 'btn-success' : 'btn-outline-success'}`} onClick={() => onFocus({ fileId, idx: s.idx })}>
              {s.name.trim()}
            </button>
          ))}
        </div>
        <input className="form-control form-control-sm" style={{ maxWidth: 220 }} placeholder="Sheet mein dhoondein…" value={find} onChange={(e) => setFind(e.target.value)} aria-label="Find in sheet" />
        <a className="btn btn-sm btn-outline-secondary ms-auto" href={`/api/admin/quality-archive/${encodeURIComponent(fileId)}?download=1`}>
          <i className="bi bi-file-earmark-excel me-1" />
          Asal Excel download
        </a>
      </div>
      {file.title && <div className="px-3 pb-2 small text-secondary">{file.title}</div>}
      {sheet?.key === key ? (
        <SheetGrid sheet={sheet.data} find={find} focus={focus && focus.fileId === fileId && focus.idx === idx ? focus : null} />
      ) : (
        <div className="p-4 text-secondary">Sheet load ho rahi hai…</div>
      )}
    </div>
  )
}

/** The sheet as Excel lays it out: same cells, merges, column widths and bold. */
function SheetGrid({ sheet, find, focus }: { sheet: XlsxSheet; find: string; focus: { r?: number; c?: number } | null }) {
  const focusRef = useRef<HTMLTableCellElement | null>(null)
  const { at, covered, span } = useMemo(() => {
    const at = new Map(sheet.cells.map((c) => [`${c.r}:${c.c}`, c]))
    const covered = new Set<string>()
    const span = new Map<string, { rows: number; cols: number }>()
    for (const m of sheet.merges) {
      span.set(`${m.r1}:${m.c1}`, { rows: m.r2 - m.r1 + 1, cols: m.c2 - m.c1 + 1 })
      for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) if (r !== m.r1 || c !== m.c1) covered.add(`${r}:${c}`)
    }
    return { at, covered, span }
  }, [sheet])
  const maxCol = Math.max(sheet.maxCol, ...sheet.merges.map((m) => Math.min(m.c2, sheet.maxCol + 10)))
  const needle = norm(find)

  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: 'center', inline: 'center' })
  }, [focus, sheet])

  const colPx = (c: number) => Math.round((sheet.colWidths[c] ?? 8.43) * 7 + 5)
  const rows = Array.from({ length: sheet.maxRow }, (_, i) => i + 1)
  const cols = Array.from({ length: maxCol }, (_, i) => i + 1)

  return (
    <div className="table-responsive" style={{ maxHeight: '72vh' }}>
      <table className="table table-bordered table-sm mb-0" style={{ tableLayout: 'fixed', width: 'max-content', fontSize: 12.5, fontFamily: 'Calibri, Arial, sans-serif' }}>
        <colgroup>
          <col style={{ width: 44 }} />
          {cols.map((c) => (
            <col key={c} style={{ width: colPx(c) }} />
          ))}
        </colgroup>
        <thead className="table-light" style={{ position: 'sticky', top: 0, zIndex: 2 }}>
          <tr>
            <th />
            {cols.map((c) => (
              <th key={c} className="text-center text-secondary fw-normal">
                {cellLabel(1, c).replace(/\d+$/, '')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r}>
              <th className="text-center text-secondary fw-normal table-light" style={{ position: 'sticky', left: 0 }}>
                {r}
              </th>
              {cols.map((c) => {
                const k = `${r}:${c}`
                if (covered.has(k)) return null
                const cell = at.get(k)
                const sp = span.get(k)
                const isFocus = focus?.r === r && focus?.c != null && c >= focus.c && c <= focus.c + 5
                const hit = Boolean(needle && cell && norm(cell.text).includes(needle))
                return (
                  <td
                    key={c}
                    ref={isFocus && c === focus?.c ? focusRef : undefined}
                    rowSpan={sp?.rows}
                    colSpan={sp?.cols}
                    className={`${typeof cell?.v === 'number' ? 'text-end' : ''} ${cell?.bold ? 'fw-bold' : ''}`}
                    style={{
                      whiteSpace: 'pre',
                      // Like Excel: long text runs over into empty cells on its right, else it is cut.
                      overflow: typeof cell?.v === 'string' && !sp && !at.has(`${r}:${c + 1}`) && !covered.has(`${r}:${c + 1}`) ? 'visible' : 'hidden',
                      textOverflow: 'clip',
                      background: isFocus ? '#fff3cd' : hit ? '#d1e7dd' : undefined,
                    }}
                    title={cell?.text}
                  >
                    {cell?.text ?? ''}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FilesView({ files, onChanged }: { files: ArchiveFile[]; onChanged: () => Promise<void> }) {
  const [pending, setPending] = useState<Pending[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const send = async (file: File, action: 'preview' | 'save') => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('action', action)
    const res = await fetch('/api/admin/quality-archive', { method: 'POST', body: fd, credentials: 'same-origin' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
    return data
  }

  const choose = async (list: FileList | null) => {
    if (!list?.length) return
    setMsg('')
    setBusy(true)
    const next: Pending[] = []
    for (const file of Array.from(list)) {
      try {
        next.push({ file, preview: (await send(file, 'preview')).preview })
      } catch (e) {
        next.push({ file, error: e instanceof Error ? e.message : 'Parh nahi saka' })
      }
    }
    setPending(next)
    setBusy(false)
  }

  const toSave = pending.filter((p) => p.preview && !p.preview.duplicateOf && !p.saved)

  const saveAll = async () => {
    if (!toSave.length) return
    if (!window.confirm(`${toSave.length} file(s) hamesha ke liye archive mein save hon gi.\n\nSave ke baad inhein koi badal ya mita nahi sakta (admin bhi nahi). Pehle upar ki list check kar lein.\n\nSave karein?`))
      return
    setBusy(true)
    const next = [...pending]
    for (const p of next) {
      if (!p.preview || p.preview.duplicateOf || p.saved) continue
      try {
        await send(p.file, 'save')
        p.saved = true
      } catch (e) {
        p.error = e instanceof Error ? e.message : 'Save nahi hua'
      }
    }
    setPending(next)
    setBusy(false)
    setMsg('Save ho gaya.')
    await onChanged()
  }

  return (
    <>
      <div className="card mb-3">
        <div className="card-header py-2 fw-semibold">Archive mein files</div>
        <div className="table-responsive">
          <table className="table table-sm mb-0 align-middle" style={{ fontSize: 13 }}>
            <thead className="table-light">
              <tr>
                <th>File</th>
                <th>Saal</th>
                <th>Period (Excel se)</th>
                <th>Sheets</th>
                <th className="text-end">Qualities</th>
                <th>Save kiya</th>
                <th>Fingerprint</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.id}>
                  <td className="fw-semibold">{f.fileName}</td>
                  <td>{f.year ?? '—'}</td>
                  <td className="small">{f.title}</td>
                  <td className="small">{f.sheets.map((s) => s.name.trim()).join(', ')}</td>
                  <td className="text-end">{f.rows}</td>
                  <td className="small">
                    {f.uploadedBy} · {when(f.uploadedAt)}
                  </td>
                  <td className="small font-monospace" title={`SHA-256 ${f.sha256}`}>
                    {f.sha256.slice(0, 12)}…
                  </td>
                  <td>
                    <a className="btn btn-sm btn-outline-secondary py-0" href={`/api/admin/quality-archive/${encodeURIComponent(f.id)}?download=1`}>
                      <i className="bi bi-download" />
                    </a>
                  </td>
                </tr>
              ))}
              {!files.length && (
                <tr>
                  <td colSpan={8} className="text-center text-secondary py-3">
                    Abhi koi file nahi
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header py-2 fw-semibold">Nayi file daalein</div>
        <div className="card-body">
          <p className="small text-secondary mb-2">
            Excel (.xlsx) chunein — pehle sirf parh kar dikhaya jaye ga ke us mein kya hai. &quot;Hamesha ke liye save&quot; dabane par hi save ho gi. Wohi
            file dobara daali to dobara save nahi ho gi.
          </p>
          <input type="file" className="form-control form-control-sm mb-3" style={{ maxWidth: 420 }} accept=".xlsx" multiple disabled={busy} onChange={(e) => void choose(e.target.files)} />
          {pending.length > 0 && (
            <table className="table table-sm align-middle" style={{ fontSize: 13 }}>
              <thead className="table-light">
                <tr>
                  <th>File</th>
                  <th>Saal</th>
                  <th>Period</th>
                  <th>Sheets (cells · qualities · meter)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((p) => (
                  <tr key={p.file.name}>
                    <td className="fw-semibold">{p.file.name}</td>
                    <td>{p.preview?.year ?? '—'}</td>
                    <td className="small">{p.preview?.title}</td>
                    <td className="small">
                      {p.preview?.sheets.map((s) => (
                        <div key={s.name}>
                          {s.name.trim()}: {s.cells} cells · {s.rows} qualities · {n0(s.production)} m
                        </div>
                      ))}
                    </td>
                    <td className="small">
                      {p.error ? (
                        <span className="text-danger">{p.error}</span>
                      ) : p.saved ? (
                        <span className="text-success">
                          <i className="bi bi-check-circle me-1" />
                          Save ho gayi
                        </span>
                      ) : p.preview?.duplicateOf ? (
                        <span className="text-secondary">Pehle se archive mein hai ({p.preview.duplicateOf.fileName})</span>
                      ) : (
                        <span className="text-primary">Save ke liye tayyar</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {msg && <div className="alert alert-success py-2">{msg}</div>}
          <button type="button" className="btn btn-sm btn-primary" disabled={busy || !toSave.length} onClick={() => void saveAll()}>
            <i className="bi bi-lock-fill me-1" />
            Hamesha ke liye save ({toSave.length})
          </button>
        </div>
      </div>
    </>
  )
}
