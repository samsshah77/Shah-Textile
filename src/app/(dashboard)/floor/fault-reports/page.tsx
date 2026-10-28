'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { startVoiceNote, type VoiceRecording } from '@/lib/voiceNote'
import { getCalendarToday } from '@/constants/productionCalendar'

type Media = { url: string; kind: 'image' | 'video' }
type Report = {
  id: string
  date: string
  loomNumber: number
  shift?: 'A' | 'B'
  text: string
  media: Media[]
  createdBy: string
  createdById: string
  createdAt: string
}
type Data = {
  reports: Report[]
  looms: Array<{ loomNumber: number; name: string }>
  canPost: boolean
  voice: boolean
  me: { id: string; isAdmin: boolean }
}
/** A picture / video picked on the phone, uploading or uploaded. */
type Pending = { key: string; kind: 'image' | 'video'; preview: string; progress: number; url?: string; error?: string }

const today = () => getCalendarToday()
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit' })

/** Phone photos are 4–12 MB; 2000 px JPEG keeps every fault visible at a fraction of the size. */
async function shrinkImage(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * scale)
    c.height = Math.round(bmp.height * scale)
    c.getContext('2d')?.drawImage(bmp, 0, 0, c.width, c.height)
    return (await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.85))) || file
  } catch {
    return file
  }
}

/** Upload with progress (videos are big on a phone connection). */
function uploadFile(blob: Blob, name: string, onProgress: (p: number) => void): Promise<Media> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/floor/fault-reports/media')
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100))
    xhr.onload = () => {
      let data: { url?: string; kind?: Media['kind']; error?: string } = {}
      try {
        data = JSON.parse(xhr.responseText)
      } catch {
        /* not JSON (e.g. the web server refused a very big file) */
      }
      if (xhr.status === 200 && data.url && data.kind) resolve({ url: data.url, kind: data.kind })
      else reject(new Error(data.error || (xhr.status === 413 ? 'File bohat bari hai — choti video lein' : 'Upload nahi hui')))
    }
    xhr.onerror = () => reject(new Error('Internet ka masla — dobara try karein'))
    const fd = new FormData()
    fd.append('file', blob, name)
    xhr.send(fd)
  })
}

/**
 * Kamran Fault — floor fault reports from the phone: pick a loom, take photos / video,
 * type or speak the fault, send. Automatically updates the Fabric Fault page.
 */
export default function FaultReportsPage() {
  const [date, setDate] = useState(today)
  const [data, setData] = useState<Data | null>(null)
  const [loadError, setLoadError] = useState('')
  const [filterLoom, setFilterLoom] = useState('')

  const [loom, setLoom] = useState('')
  const [shift, setShift] = useState<'A' | 'B'>('A')
  const [text, setText] = useState('')
  const [pending, setPending] = useState<Pending[]>([])
  const [sending, setSending] = useState(false)
  const [formMsg, setFormMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [rec, setRec] = useState<VoiceRecording | null>(null)
  const [recSeconds, setRecSeconds] = useState(0)
  const [voiceBusy, setVoiceBusy] = useState(false)

  const [editingReport, setEditingReport] = useState<{
    id: string
    loomNumber: number
    shift: 'A' | 'B'
    text: string
  } | null>(null)
  const [updating, setUpdating] = useState(false)

  const photoRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/floor/fault-reports?date=${date}`, { credentials: 'same-origin', cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Load nahi hua')
      setData(json)
      setLoadError('')
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Load nahi hua')
    }
  }, [date])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!rec) return
    const t = setInterval(() => setRecSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [rec])

  const addFiles = (files: FileList | null) => {
    if (!files) return
    for (const file of Array.from(files).slice(0, 10)) {
      const kind: Media['kind'] = file.type.startsWith('video/') ? 'video' : 'image'
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const preview = URL.createObjectURL(file)
      setPending((p) => [...p, { key, kind, preview, progress: 0 }])
      void (async () => {
        try {
          const blob = kind === 'image' ? await shrinkImage(file) : file
          const media = await uploadFile(blob, kind === 'image' ? 'photo.jpg' : file.name || 'video.mp4', (progress) =>
            setPending((p) => p.map((x) => (x.key === key ? { ...x, progress } : x)))
          )
          setPending((p) => p.map((x) => (x.key === key ? { ...x, progress: 100, url: media.url, kind: media.kind } : x)))
        } catch (e) {
          setPending((p) => p.map((x) => (x.key === key ? { ...x, error: e instanceof Error ? e.message : 'Upload nahi hui' } : x)))
        }
      })()
    }
  }

  const removePending = (key: string) =>
    setPending((p) => {
      const gone = p.find((x) => x.key === key)
      if (gone) URL.revokeObjectURL(gone.preview)
      return p.filter((x) => x.key !== key)
    })

  const stopVoice = async (r: VoiceRecording | null = rec) => {
    if (!r) return
    setRec(null)
    setVoiceBusy(true)
    setFormMsg(null)
    try {
      const wav = await r.stop()
      const fd = new FormData()
      fd.append('file', wav, 'voice.wav')
      const res = await fetch('/api/floor/fault-reports/voice', { method: 'POST', body: fd, credentials: 'same-origin' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Awaz se likhna nahi hua')
      setText((t) => (t.trim() ? `${t.trim()}\n${json.text}` : json.text))
    } catch (e) {
      setFormMsg({ ok: false, text: e instanceof Error ? e.message : 'Awaz se likhna nahi hua' })
    } finally {
      setVoiceBusy(false)
    }
  }

  const startVoice = async () => {
    setFormMsg(null)
    try {
      setRecSeconds(0)
      let started: VoiceRecording | null = null
      started = await startVoiceNote(() => void stopVoice(started))
      setRec(started)
    } catch (e) {
      setFormMsg({ ok: false, text: e instanceof Error && e.name !== 'NotAllowedError' ? e.message : 'Mic ki ijazat dein (browser mein).' })
    }
  }

  const uploading = pending.some((p) => !p.url && !p.error)
  const ready = pending.filter((p) => p.url)

  const send = async () => {
    setFormMsg(null)
    if (!loom) return setFormMsg({ ok: false, text: 'Pehle loom chunein.' })
    if (!text.trim() && ready.length === 0) return setFormMsg({ ok: false, text: 'Photo / video lein ya fault likhein.' })
    setSending(true)
    try {
      const res = await fetch('/api/floor/fault-reports', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          date,
          loomNumber: Number(loom),
          shift,
          text,
          media: ready.map((p) => ({ url: p.url, kind: p.kind })),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Bheja nahi gaya')
      pending.forEach((p) => URL.revokeObjectURL(p.preview))
      setPending([])
      setText('')
      // Loom (and shift) stay selected, so the next fault on the same loom needs no re-select
      setFormMsg({ ok: true, text: `Loom ${json.report.loomNumber} (Shift ${json.report.shift || shift}) ka fault bhej diya — Fabric Fault page par update ho gaya.` })
      void load()
    } catch (e) {
      setFormMsg({ ok: false, text: e instanceof Error ? e.message : 'Bheja nahi gaya' })
    } finally {
      setSending(false)
    }
  }

  const canManageReport = useCallback(
    (r: Report) => Boolean(data?.canPost || data?.me?.isAdmin || data?.me?.id === r.createdById),
    [data]
  )

  const startEdit = (r: Report) => {
    setEditingReport({
      id: r.id,
      loomNumber: r.loomNumber,
      shift: r.shift || 'A',
      text: r.text || '',
    })
  }

  const cancelEdit = () => {
    setEditingReport(null)
  }

  const saveEdit = async () => {
    if (!editingReport) return
    setUpdating(true)
    try {
      const res = await fetch(`/api/floor/fault-reports/${editingReport.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          loomNumber: Number(editingReport.loomNumber),
          shift: editingReport.shift,
          text: editingReport.text.trim(),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Update fail ho gaya')
      setEditingReport(null)
      await load()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Update nahi ho saka')
    } finally {
      setUpdating(false)
    }
  }

  const remove = async (r: Report) => {
    if (!window.confirm(`Loom ${r.loomNumber} (Shift ${r.shift || 'A'}) ki yeh entry hata dein?`)) return
    try {
      const res = await fetch(`/api/floor/fault-reports/${r.id}`, { method: 'DELETE', credentials: 'same-origin' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Nahi hata')
      await load()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Nahi hata')
    }
  }

  const shown = useMemo(
    () => (data?.reports || []).filter((r) => !filterLoom || String(r.loomNumber) === filterLoom),
    [data, filterLoom]
  )
  const loomName = (n: number) => data?.looms.find((l) => l.loomNumber === n)?.name || ''

  return (
    <div className="container-fluid px-2 px-md-3 py-3" style={{ maxWidth: 900 }}>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <h1 className="h5 fw-bold mb-0">
          <i className="bi bi-camera-video me-1" /> Kamran Fault
        </h1>
        <input
          type="date"
          className="form-control form-control-sm"
          style={{ width: 160 }}
          value={date}
          max={today()}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          aria-label="Date"
        />
      </div>

      {loadError && <div className="alert alert-danger small">{loadError}</div>}

      {data?.canPost && (
        <div className="card shadow-sm mb-4">
          <div className="card-body p-3">
            <div className="row g-2 mb-3">
              <div className="col-7 col-sm-8">
                <label className="form-label small fw-semibold mb-1" htmlFor="fault-loom">
                  Loom
                </label>
                <select id="fault-loom" className="form-select" value={loom} onChange={(e) => setLoom(e.target.value)}>
                  <option value="">— Loom chunein —</option>
                  {data.looms.map((l) => (
                    <option key={l.loomNumber} value={l.loomNumber}>
                      Loom {l.loomNumber}
                      {l.name && l.name !== String(l.loomNumber) ? ` · ${l.name}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-5 col-sm-4">
                <label className="form-label small fw-semibold mb-1">
                  Shift
                </label>
                <div className="btn-group w-100" role="group" aria-label="Shift selection">
                  <button
                    type="button"
                    className={`btn ${shift === 'A' ? 'btn-primary' : 'btn-outline-secondary'}`}
                    onClick={() => setShift('A')}
                  >
                    Shift A
                  </button>
                  <button
                    type="button"
                    className={`btn ${shift === 'B' ? 'btn-primary' : 'btn-outline-secondary'}`}
                    onClick={() => setShift('B')}
                  >
                    Shift B
                  </button>
                </div>
              </div>
            </div>

            <div className="d-flex flex-wrap gap-2 mb-2">
              <input ref={photoRef} type="file" accept="image/*" capture="environment" className="d-none" aria-label="Photo lein" onChange={(e) => (addFiles(e.target.files), (e.target.value = ''))} />
              <input ref={videoRef} type="file" accept="video/*" capture="environment" className="d-none" aria-label="Video lein" onChange={(e) => (addFiles(e.target.files), (e.target.value = ''))} />
              <input ref={galleryRef} type="file" accept="image/*,video/*" multiple className="d-none" aria-label="Gallery se chunein" onChange={(e) => (addFiles(e.target.files), (e.target.value = ''))} />
              <button type="button" className="btn btn-outline-primary" onClick={() => photoRef.current?.click()}>
                <i className="bi bi-camera me-1" /> Photo
              </button>
              <button type="button" className="btn btn-outline-primary" onClick={() => videoRef.current?.click()}>
                <i className="bi bi-camera-video me-1" /> Video
              </button>
              <button type="button" className="btn btn-outline-secondary" onClick={() => galleryRef.current?.click()}>
                <i className="bi bi-images me-1" /> Gallery
              </button>
            </div>

            {pending.length > 0 && (
              <div className="d-flex flex-wrap gap-2 mb-3">
                {pending.map((p) => (
                  <div key={p.key} className="position-relative border rounded overflow-hidden" style={{ width: 96, height: 96 }}>
                    {p.kind === 'image' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.preview} alt="" className="w-100 h-100" style={{ objectFit: 'cover' }} />
                    ) : (
                      <video src={p.preview} className="w-100 h-100" style={{ objectFit: 'cover' }} muted playsInline />
                    )}
                    <div
                      className={`position-absolute bottom-0 start-0 end-0 text-center small fw-semibold ${p.error ? 'bg-danger text-white' : p.url ? 'bg-success text-white' : 'bg-light'}`}
                      style={{ fontSize: 11 }}
                    >
                      {p.error ? 'Fail' : p.url ? (p.kind === 'video' ? '🎥 OK' : 'OK') : `${p.progress}%`}
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-light position-absolute top-0 end-0 py-0 px-1"
                      aria-label="Hatayein"
                      onClick={() => removePending(p.key)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            {pending.some((p) => p.error) && (
              <div className="small text-danger mb-2">{pending.find((p) => p.error)?.error}</div>
            )}

            <label className="form-label small fw-semibold mb-1" htmlFor="fault-text">
              Fault
            </label>
            <textarea
              id="fault-text"
              className="form-control mb-2"
              rows={3}
              placeholder="Fault likhein — ya 🎤 dabakar bolein"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />

            <div className="d-flex flex-wrap align-items-center gap-2">
              {data.voice &&
                (rec ? (
                  <button type="button" className="btn btn-danger" onClick={() => void stopVoice()}>
                    <i className="bi bi-stop-circle me-1" /> Bas — {recSeconds}s
                  </button>
                ) : (
                  <button type="button" className="btn btn-outline-danger" disabled={voiceBusy} onClick={() => void startVoice()}>
                    {voiceBusy ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-1" /> Likh rahe hain…
                      </>
                    ) : (
                      <>
                        <i className="bi bi-mic me-1" /> Bolein
                      </>
                    )}
                  </button>
                ))}
              <button type="button" className="btn btn-success ms-auto px-4" disabled={sending || uploading || Boolean(rec) || voiceBusy} onClick={() => void send()}>
                {sending ? 'Bhej rahe hain…' : uploading ? 'Upload ho raha hai…' : 'Bhejein'}
              </button>
            </div>
            {formMsg && <div className={`small mt-2 ${formMsg.ok ? 'text-success' : 'text-danger'}`}>{formMsg.text}</div>}
          </div>
        </div>
      )}

      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
        <h2 className="h6 fw-bold mb-0">
          {date === today() ? 'Aaj' : date} ke faults ({shown.length})
        </h2>
        {data && data.reports.length > 0 && (
          <select className="form-select form-select-sm" style={{ width: 150 }} value={filterLoom} onChange={(e) => setFilterLoom(e.target.value)} aria-label="Loom filter">
            <option value="">Sab looms</option>
            {[...new Set(data.reports.map((r) => r.loomNumber))]
              .sort((a, b) => a - b)
              .map((n) => (
                <option key={n} value={n}>
                  Loom {n}
                </option>
              ))}
          </select>
        )}
      </div>

      {!data && !loadError && <div className="text-secondary small">Load ho raha hai…</div>}
      {data && shown.length === 0 && <div className="text-secondary small border rounded p-4 text-center">Is din koi fault nahi bheja gaya.</div>}

      <div className="d-flex flex-column gap-3">
        {shown.map((r) => (
          <div key={r.id} className="card shadow-sm">
            <div className="card-body p-3">
              <div className="d-flex align-items-center gap-2 mb-2">
                <span className="badge text-bg-primary fs-6">Loom {r.loomNumber}</span>
                <span className={`badge fs-6 ${r.shift === 'B' ? 'bg-warning text-dark' : 'bg-info text-dark'}`}>
                  Shift {r.shift || 'A'}
                </span>
                {loomName(r.loomNumber) && loomName(r.loomNumber) !== String(r.loomNumber) && (
                  <span className="small text-secondary">{loomName(r.loomNumber)}</span>
                )}
                <span className="small text-secondary ms-auto">
                  {timeOf(r.createdAt)} · {r.createdBy}
                </span>
                {canManageReport(r) && (
                  <div className="btn-group btn-group-sm ms-2">
                    <button
                      type="button"
                      className="btn btn-outline-secondary py-0 px-2"
                      aria-label="Edit entry"
                      title="Edit fault"
                      onClick={() => (editingReport?.id === r.id ? cancelEdit() : startEdit(r))}
                    >
                      <i className={`bi ${editingReport?.id === r.id ? 'bi-x-lg' : 'bi-pencil'}`} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-danger py-0 px-2"
                      aria-label="Delete entry"
                      title="Delete fault"
                      onClick={() => void remove(r)}
                    >
                      <i className="bi bi-trash" />
                    </button>
                  </div>
                )}
              </div>
              {r.media.length > 0 && (
                <div className="d-flex flex-wrap gap-2 mb-2">
                  {r.media.map((m) =>
                    m.kind === 'image' ? (
                      <a key={m.url} href={m.url} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={m.url} alt={`Loom ${r.loomNumber} fault`} loading="lazy" className="rounded border" style={{ width: 140, height: 140, objectFit: 'cover' }} />
                      </a>
                    ) : (
                      <video key={m.url} src={m.url} controls preload="metadata" playsInline className="rounded border bg-dark" style={{ width: 260, maxWidth: '100%', height: 180 }} />
                    )
                  )}
                </div>
              )}
              {editingReport?.id === r.id ? (
                <div className="mt-2 p-3 border rounded bg-light">
                  <div className="row g-2 mb-2">
                    <div className="col-6 col-sm-4">
                      <label className="form-label small fw-semibold mb-1">Loom</label>
                      <select
                        className="form-select form-select-sm"
                        value={editingReport.loomNumber}
                        onChange={(e) => setEditingReport({ ...editingReport, loomNumber: Number(e.target.value) })}
                      >
                        {data?.looms.map((l) => (
                          <option key={l.loomNumber} value={l.loomNumber}>
                            Loom {l.loomNumber} {l.name && l.name !== String(l.loomNumber) ? `(${l.name})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-6 col-sm-4">
                      <label className="form-label small fw-semibold mb-1">Shift</label>
                      <div className="btn-group btn-group-sm w-100">
                        <button
                          type="button"
                          className={`btn ${editingReport.shift === 'A' ? 'btn-primary' : 'btn-outline-primary'}`}
                          onClick={() => setEditingReport({ ...editingReport, shift: 'A' })}
                        >
                          Shift A
                        </button>
                        <button
                          type="button"
                          className={`btn ${editingReport.shift === 'B' ? 'btn-primary' : 'btn-outline-primary'}`}
                          onClick={() => setEditingReport({ ...editingReport, shift: 'B' })}
                        >
                          Shift B
                        </button>
                      </div>
                    </div>
                  </div>
                  <label className="form-label small fw-semibold mb-1">Fault Note</label>
                  <textarea
                    className="form-control form-control-sm mb-2"
                    rows={3}
                    value={editingReport.text}
                    onChange={(e) => setEditingReport({ ...editingReport, text: e.target.value })}
                    placeholder="Fault note..."
                  />
                  <div className="d-flex justify-content-end gap-2">
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={cancelEdit}
                      disabled={updating}
                    >
                      Radd karein
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-success"
                      onClick={() => void saveEdit()}
                      disabled={updating}
                    >
                      {updating ? 'Mehfooz ho raha hai…' : 'Mehfooz karein'}
                    </button>
                  </div>
                </div>
              ) : (
                r.text && <div style={{ whiteSpace: 'pre-wrap' }}>{r.text}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
