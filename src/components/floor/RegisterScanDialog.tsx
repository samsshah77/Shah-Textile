'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { DailyLoomProductionEntry } from '@/types/production'

/** One register line as read from the photo, editable before it goes in the table. */
interface ReviewRow {
  key: number
  use: boolean
  loom: string
  weightKg: string
  shiftA: string
  shiftB: string
  total: number | null
  note: string
  unsure: boolean
}

export interface RegisterScanPatch {
  loomNumber: number
  weightKg?: number
  shiftAMeters?: number
  shiftBMeters?: number
}

type Status = { enabled: boolean; usedToday: number; dailyLimit: number } | null

/** Phone photos are large; 2000 px is plenty to read the digits and keeps upload + AI cost low. */
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d')?.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.88))
    return blob || file
  } catch {
    return file
  }
}

const toNum = (s: string): number | null => {
  const t = s.replace(/,/g, '').trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/**
 * "📷 Register se bharein": photo → AI reads loom / weight / A / B → this review screen →
 * only the ticked rows are put in the Daily Entry table. Saving and Finalize stay as before.
 */
export function RegisterScanDialog({
  entries,
  onApply,
  onClose,
}: {
  entries: DailyLoomProductionEntry[]
  onApply: (patches: RegisterScanPatch[]) => void
  onClose: () => void
}) {
  const [status, setStatus] = useState<Status>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [rows, setRows] = useState<ReviewRow[] | null>(null)
  const [photoUrl, setPhotoUrl] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let live = true
    fetch('/api/floor/register-scan', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((s) => live && setStatus(s))
      .catch(() => live && setStatus({ enabled: false, usedToday: 0, dailyLimit: 0 }))
    return () => {
      live = false
    }
  }, [])

  /** Part 1 row of each loom on today's sheet. */
  const sheetLoom = useMemo(() => {
    const m = new Map<number, { entry: DailyLoomProductionEntry; parts: number }>()
    for (const e of entries) {
      const seg = Math.max(1, Math.floor(Number(e.segmentIndex) || 1))
      const cur = m.get(e.loomNumber)
      if (!cur) m.set(e.loomNumber, { entry: e, parts: 1 })
      else {
        cur.parts++
        if (seg === 1) cur.entry = e
      }
    }
    return m
  }, [entries])

  const upload = async (file: File) => {
    setBusy(true)
    setError('')
    try {
      const body = new FormData()
      body.append('file', await shrink(file), 'register.jpg')
      const res = await fetch('/api/floor/register-scan', { method: 'POST', body, credentials: 'same-origin' })
      const data = await res.json().catch(() => ({}))
      if (data.url) setPhotoUrl(data.url)
      if (!res.ok) {
        setError(data.error || 'Photo nahi parhi gayi. Manual entry karein.')
        return
      }
      const list = (data.rows || []) as Array<{
        loom: number
        weightKg: number | null
        shiftA: number | null
        shiftB: number | null
        total: number | null
        note: string
        unsure: boolean
      }>
      setRows(
        list.map((r, i) => ({
          key: i,
          use: sheetLoom.has(r.loom),
          loom: String(r.loom),
          weightKg: r.weightKg === null ? '' : String(r.weightKg),
          shiftA: r.shiftA === null ? '' : String(r.shiftA),
          shiftB: r.shiftB === null ? '' : String(r.shiftB),
          total: r.total,
          note: r.note || '',
          unsure: Boolean(r.unsure),
        }))
      )
      setStatus((s) => (s ? { ...s, usedToday: s.usedToday + 1 } : s))
    } catch {
      setError('Internet / server ka masla. Manual entry karein.')
    } finally {
      setBusy(false)
    }
  }

  const edit = (key: number, patch: Partial<ReviewRow>) =>
    setRows((prev) => (prev ? prev.map((r) => (r.key === key ? { ...r, ...patch } : r)) : prev))

  /** What is wrong / worth a look on a row — shown in yellow / red. */
  const checks = (r: ReviewRow) => {
    const out: Array<{ text: string; bad?: boolean }> = []
    const loom = Number(r.loom)
    const onSheet = sheetLoom.get(loom)
    if (!onSheet) out.push({ text: 'Yeh loom aaj ki sheet mein nahi', bad: true })
    else if (onSheet.parts > 1) out.push({ text: `${onSheet.parts} parts — Part 1 mein jayega` })
    const a = toNum(r.shiftA)
    const b = toNum(r.shiftB)
    if (r.total !== null && a !== null && b !== null && Math.abs(a + b - r.total) > 0.01)
      out.push({ text: `A + B = ${a + b}, register Total ${r.total}`, bad: true })
    if (r.unsure) out.push({ text: 'Likhai saaf nahi — register se dekh lein' })
    if (onSheet && ((onSheet.entry.shiftAMeters || 0) > 0 || (onSheet.entry.shiftBMeters || 0) > 0))
      out.push({ text: `Sheet mein pehle se A ${onSheet.entry.shiftAMeters || 0} / B ${onSheet.entry.shiftBMeters || 0} — badal jayega` })
    return out
  }

  const chosen = (rows || []).filter((r) => r.use && sheetLoom.has(Number(r.loom)))

  const apply = () => {
    const patches: RegisterScanPatch[] = []
    for (const r of chosen) {
      const p: RegisterScanPatch = { loomNumber: Number(r.loom) }
      const w = toNum(r.weightKg)
      const a = toNum(r.shiftA)
      const b = toNum(r.shiftB)
      if (w !== null) p.weightKg = w
      if (a !== null) p.shiftAMeters = a
      if (b !== null) p.shiftBMeters = b
      if (Object.keys(p).length > 1) patches.push(p)
    }
    onApply(patches)
  }

  const cellInput = 'form-control form-control-sm text-end font-monospace px-1'

  return (
    <div className="modal fade show d-block" role="dialog" aria-modal="true" aria-labelledby="register-scan-title" style={{ background: 'rgba(15,23,42,0.45)' }}>
      <div className="modal-dialog modal-dialog-centered modal-xl modal-dialog-scrollable">
        <div className="modal-content border-0 shadow">
          <div className="modal-header py-2 px-3">
            <div>
              <h5 id="register-scan-title" className="modal-title fs-6 fw-bold mb-0">
                <i className="bi bi-camera me-1" /> Register se bharein — Weight, A, B
              </h5>
              <div className="small text-secondary">
                Photo se number parhe jayenge. Check kar ke &quot;Table mein daalo&quot; dabaein — Save / Finalize pehle jaise.
              </div>
            </div>
            <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
          </div>

          <div className="modal-body px-3 py-3">
            {status && !status.enabled && (
              <div className="alert alert-warning small mb-3">
                Photo se entry abhi on nahi hai — server par AI key nahi lagi. Tab tak manual entry karein.
              </div>
            )}

            {!rows && (
              <div className="d-flex flex-column align-items-center gap-2 py-4">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="d-none"
                  aria-label="Register photo"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (f) void upload(f)
                  }}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || !status?.enabled || status.usedToday >= status.dailyLimit}
                  onClick={() => fileRef.current?.click()}
                >
                  {busy ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" /> Parh rahe hain… (20–40 second)
                    </>
                  ) : (
                    <>
                      <i className="bi bi-camera me-1" /> Photo lein / chunein
                    </>
                  )}
                </button>
                <div className="small text-secondary text-center">
                  Page seedha upar se, achi roshni mein, poora frame mein.
                  {status?.enabled && ` Aaj ${status.usedToday}/${status.dailyLimit} photos.`}
                </div>
              </div>
            )}

            {error && <div className="alert alert-danger small mb-3">{error}</div>}

            {rows && (
              <div className="row g-3">
                <div className="col-lg-8">
                  <div className="table-responsive">
                    <table className="table table-sm table-bordered align-middle small mb-2">
                      <thead className="table-light">
                        <tr>
                          <th style={{ width: 36 }} />
                          <th style={{ width: 70 }}>Loom</th>
                          <th style={{ width: 90 }} className="text-end">Weight</th>
                          <th style={{ width: 80 }} className="text-end">A</th>
                          <th style={{ width: 80 }} className="text-end">B</th>
                          <th style={{ width: 70 }} className="text-end">A+B</th>
                          <th>Check</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => {
                          const c = checks(r)
                          const bad = c.some((x) => x.bad)
                          const a = toNum(r.shiftA) || 0
                          const b = toNum(r.shiftB) || 0
                          return (
                            <tr key={r.key} className={bad ? 'table-danger' : c.length ? 'table-warning' : ''}>
                              <td className="text-center">
                                <input
                                  type="checkbox"
                                  className="form-check-input"
                                  checked={r.use}
                                  onChange={(e) => edit(r.key, { use: e.target.checked })}
                                  aria-label={`Loom ${r.loom} table mein daalo`}
                                />
                              </td>
                              <td>
                                <input className={cellInput} inputMode="numeric" value={r.loom} onChange={(e) => edit(r.key, { loom: e.target.value })} aria-label="Loom" />
                              </td>
                              <td>
                                <input className={cellInput} inputMode="decimal" value={r.weightKg} onChange={(e) => edit(r.key, { weightKg: e.target.value })} aria-label={`Loom ${r.loom} weight`} />
                              </td>
                              <td>
                                <input className={cellInput} inputMode="decimal" value={r.shiftA} onChange={(e) => edit(r.key, { shiftA: e.target.value })} aria-label={`Loom ${r.loom} A`} />
                              </td>
                              <td>
                                <input className={cellInput} inputMode="decimal" value={r.shiftB} onChange={(e) => edit(r.key, { shiftB: e.target.value })} aria-label={`Loom ${r.loom} B`} />
                              </td>
                              <td className="text-end font-monospace fw-semibold">{a + b}</td>
                              <td>
                                {c.map((x, i) => (
                                  <div key={i} className={x.bad ? 'text-danger fw-semibold' : 'text-warning-emphasis'}>
                                    {x.text}
                                  </div>
                                ))}
                                {r.note && <div className="text-secondary fst-italic">Note: {r.note}</div>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="small text-secondary">
                    {rows.length} lines parhi gayin · {chosen.length} table mein jayengi. Lal / peeli lines register se mila lein.
                  </div>
                </div>
                <div className="col-lg-4">
                  {photoUrl && (
                    <a href={photoUrl} target="_blank" rel="noreferrer" title="Photo bari kar ke dekhein">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoUrl} alt="Register photo" className="img-fluid rounded border" />
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="modal-footer py-2 px-3">
            {rows && (
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary me-auto"
                onClick={() => {
                  setRows(null)
                  setPhotoUrl('')
                  setError('')
                }}
              >
                Doosri photo
              </button>
            )}
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose}>
              Band karein
            </button>
            {rows && (
              <button type="button" className="btn btn-sm btn-success" disabled={chosen.length === 0} onClick={apply}>
                <i className="bi bi-check2 me-1" /> Table mein daalo ({chosen.length})
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
