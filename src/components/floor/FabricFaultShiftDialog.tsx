'use client'

import { useEffect, useRef, useState } from 'react'
import type { DailyLoomProductionEntry } from '@/types/production'
import {
  FabricFaultMultiInput,
  joinFabricFaults,
  parseFabricFaults,
} from '@/components/floor/FabricFaultMultiInput'
import { startVoiceNote, type VoiceRecording } from '@/lib/voiceNote'
import type { FloorFaultReportItem } from '@/components/floor/FabricFaultMediaDialog'
import { getCalendarToday } from '@/constants/productionCalendar'

/** Build searchable `fabricFault` summary from per-shift lines (keeps old field alive). */
export function buildFabricFaultSummary(
  shiftA?: string | null,
  shiftB?: string | null,
  legacyFallback?: string | null
): string {
  const parts: string[] = []
  for (const line of parseFabricFaults(shiftA).filter((s) => s.trim())) {
    parts.push(`A: ${line}`)
  }
  for (const line of parseFabricFaults(shiftB).filter((s) => s.trim())) {
    parts.push(`B: ${line}`)
  }
  if (parts.length > 0) return parts.join('\n')
  return String(legacyFallback || '').trim()
}

/** Split stored fields / legacy `fabricFault` into Shift A & B without dropping text. */
export function resolveShiftFaults(entry: {
  fabricFault?: string | null
  fabricFaultA?: string | null
  fabricFaultB?: string | null
}): { shiftA: string; shiftB: string } {
  const hasSplit =
    (entry.fabricFaultA != null && String(entry.fabricFaultA).trim() !== '') ||
    (entry.fabricFaultB != null && String(entry.fabricFaultB).trim() !== '')
  if (hasSplit) {
    return {
      shiftA: String(entry.fabricFaultA || ''),
      shiftB: String(entry.fabricFaultB || ''),
    }
  }

  const a: string[] = []
  const b: string[] = []
  const other: string[] = []
  for (const line of parseFabricFaults(entry.fabricFault).filter((s) => s.trim())) {
    const m = line.match(/^\s*([ABab])\s*[:.\-]\s*(.*)$/)
    if (m) {
      if (m[1].toUpperCase() === 'A') a.push(m[2])
      else b.push(m[2])
    } else {
      other.push(line)
    }
  }
  // Unprefixed legacy text stays under Shift A so nothing is lost.
  return {
    shiftA: joinFabricFaults([...a, ...other]),
    shiftB: joinFabricFaults(b),
  }
}

export function fabricFaultPreview(entry: {
  fabricFault?: string | null
  fabricFaultA?: string | null
  fabricFaultB?: string | null
}): string {
  const { shiftA, shiftB } = resolveShiftFaults(entry)
  return buildFabricFaultSummary(shiftA, shiftB, entry.fabricFault)
}

/** Phone photos can be 4–12 MB; 2000px JPEG keeps details at a fraction of the size. */
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

function uploadMediaFile(
  blob: Blob,
  name: string,
  onProgress?: (p: number) => void
): Promise<{ url: string; kind: 'image' | 'video' }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/floor/fault-reports/media')
    xhr.upload.onprogress = (e) =>
      e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100))
    xhr.onload = () => {
      let data: { url?: string; kind?: 'image' | 'video'; error?: string } = {}
      try {
        data = JSON.parse(xhr.responseText)
      } catch {}
      if (xhr.status === 200 && data.url && data.kind) {
        resolve({ url: data.url, kind: data.kind })
      } else {
        reject(new Error(data.error || 'Upload nahi hui'))
      }
    }
    xhr.onerror = () => reject(new Error('Internet ka masla — dobara koshish karein'))
    const fd = new FormData()
    fd.append('file', blob, name)
    xhr.send(fd)
  })
}

interface FabricFaultShiftDialogProps {
  entry: DailyLoomProductionEntry | null
  open: boolean
  canEdit?: boolean
  selectedDate?: string
  existingReports?: FloorFaultReportItem[]
  onClose: () => void
  onSave: (patch: Partial<DailyLoomProductionEntry>) => void
  onReportCreated?: () => void
}

/**
 * Dialog: Shift A and Shift B fabric faults.
 * Ahmar & Javed Sir can type faults, use Voice-to-Text (Groq Whisper), and attach Photos/Videos!
 */
export function FabricFaultShiftDialog({
  entry,
  open,
  canEdit = false,
  selectedDate,
  existingReports: initialReports,
  onClose,
  onSave,
  onReportCreated,
}: FabricFaultShiftDialogProps) {
  const [shiftA, setShiftA] = useState('')
  const [shiftB, setShiftB] = useState('')

  // Media attachments added during this dialog session
  const [pendingMediaA, setPendingMediaA] = useState<Array<{ url: string; kind: 'image' | 'video' }>>([])
  const [pendingMediaB, setPendingMediaB] = useState<Array<{ url: string; kind: 'image' | 'video' }>>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  // Voice recording state
  const [activeRecordingShift, setActiveRecordingShift] = useState<'A' | 'B' | null>(null)
  const [voiceBusy, setVoiceBusy] = useState(false)
  const [recordingInstance, setRecordingInstance] = useState<VoiceRecording | null>(null)

  // Existing floor reports from Kamran or earlier
  const [existingReports, setExistingReports] = useState<FloorFaultReportItem[]>([])
  const [saving, setSaving] = useState(false)
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)

  const photoInputA = useRef<HTMLInputElement>(null)
  const videoInputA = useRef<HTMLInputElement>(null)
  const photoInputB = useRef<HTMLInputElement>(null)
  const videoInputB = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open || !entry) return
    const resolved = resolveShiftFaults(entry)
    setShiftA(resolved.shiftA)
    setShiftB(resolved.shiftB)
    setPendingMediaA([])
    setPendingMediaB([])
    setActiveRecordingShift(null)
    setVoiceBusy(false)
    setRecordingInstance(null)

    // Load existing reports if not provided or to refresh
    if (initialReports && initialReports.length > 0) {
      setExistingReports(initialReports)
    } else if (selectedDate) {
      let live = true
      fetch(`/api/floor/fault-reports?date=${selectedDate}&loom=${entry.loomNumber}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      })
        .then((r) => (r.ok ? r.json() : { reports: [] }))
        .then((d) => {
          if (live && Array.isArray(d.reports)) {
            setExistingReports(d.reports.filter((r: FloorFaultReportItem) => r.loomNumber === entry.loomNumber))
          }
        })
        .catch(() => {})
      return () => {
        live = false
      }
    }
  }, [open, entry, initialReports, selectedDate])

  // Hooks stay above the early return so their order never changes between renders.
  const [editingReportId, setEditingReportId] = useState<string | null>(null)
  const [editingReportText, setEditingReportText] = useState('')

  if (!open || !entry) return null

  const seg =
    entry.segmentIndex && entry.segmentIndex > 1 ? ` · Part ${entry.segmentIndex}` : ''

  // Voice recording handlers
  const handleStartVoice = async (shift: 'A' | 'B') => {
    try {
      const rec = await startVoiceNote(() => void handleStopVoice(shift, rec))
      setActiveRecordingShift(shift)
      setRecordingInstance(rec)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Microphone shuru nahi ho saka')
    }
  }

  const handleStopVoice = async (shift: 'A' | 'B', recTarget?: VoiceRecording | null) => {
    const rec = recTarget || recordingInstance
    if (!rec) return
    setVoiceBusy(true)
    try {
      const wav = await rec.stop()
      const fd = new FormData()
      fd.append('file', wav, 'voice.wav')
      const res = await fetch('/api/floor/fault-reports/voice', {
        method: 'POST',
        body: fd,
        credentials: 'same-origin',
      })
      const json = (await res.json().catch(() => null)) as { text?: string; error?: string } | null
      if (json?.text) {
        if (shift === 'A') {
          setShiftA((prev) => (prev.trim() ? `${prev}\n${json.text}` : json.text!))
        } else {
          setShiftB((prev) => (prev.trim() ? `${prev}\n${json.text}` : json.text!))
        }
      } else if (json?.error) {
        alert(json.error)
      }
    } catch {
      alert('Awaz transcribe nahi ho saki')
    } finally {
      setVoiceBusy(false)
      setActiveRecordingShift(null)
      setRecordingInstance(null)
    }
  }

  // Media file handlers
  const handleAddFiles = async (files: FileList | null, shift: 'A' | 'B') => {
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      for (const f of Array.from(files)) {
        const isImg = f.type.startsWith('image/')
        const blob = isImg ? await shrinkImage(f) : f
        const uploaded = await uploadMediaFile(blob, f.name, (p) => setUploadProgress(p))
        if (shift === 'A') {
          setPendingMediaA((prev) => [...prev, uploaded])
        } else {
          setPendingMediaB((prev) => [...prev, uploaded])
        }
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Media upload nahi ho saka')
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  const handleDeleteReport = async (reportId: string) => {
    if (!window.confirm('Yeh fault report delete karein?')) return
    try {
      const res = await fetch(`/api/floor/fault-reports/${reportId}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Delete fail ho gaya')
      }
      setExistingReports((prev) => prev.filter((r) => r.id !== reportId))
      onReportCreated?.()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Report delete nahi ho saki')
    }
  }

  const handleSaveEditReport = async (reportId: string) => {
    try {
      const res = await fetch(`/api/floor/fault-reports/${reportId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ text: editingReportText.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Update fail ho gaya')
      }
      setExistingReports((prev) =>
        prev.map((r) => (r.id === reportId ? { ...r, text: editingReportText.trim() } : r))
      )
      setEditingReportId(null)
      onReportCreated?.()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Report update nahi ho saki')
    }
  }

  const handleSave = async () => {
    if (!canEdit) {
      onClose()
      return
    }
    setSaving(true)
    const a = joinFabricFaults(parseFabricFaults(shiftA))
    const b = joinFabricFaults(parseFabricFaults(shiftB))

    // 1. Save standard fault fields to the sheet
    onSave({
      fabricFaultA: a,
      fabricFaultB: b,
      fabricFault: buildFabricFaultSummary(a, b, ''),
      segmentIndex: entry.segmentIndex,
    })

    // 2. If new media files were attached by Ahmar / Javed Sir, create corresponding fault reports
    // Uses Pakistan local wall-clock date (never slips to previous day between midnight & 5am)
    const targetDate = selectedDate || getCalendarToday()
    let reportCreated = false

    if (pendingMediaA.length > 0) {
      try {
        const resA = await fetch('/api/floor/fault-reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            date: targetDate,
            loomNumber: entry.loomNumber,
            shift: 'A',
            text: a || 'Fabric fault entry',
            media: pendingMediaA.map((m) => ({ url: m.url, kind: m.kind })),
          }),
        })
        if (!resA.ok) {
          const errData = await resA.json().catch(() => null)
          throw new Error(errData?.error || `Shift A photo report save nahi ho saki (${resA.status})`)
        }
        reportCreated = true
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Shift A photo report save nahi ho saki')
        setSaving(false)
        return
      }
    }

    if (pendingMediaB.length > 0) {
      try {
        const resB = await fetch('/api/floor/fault-reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            date: targetDate,
            loomNumber: entry.loomNumber,
            shift: 'B',
            text: b || 'Fabric fault entry',
            media: pendingMediaB.map((m) => ({ url: m.url, kind: m.kind })),
          }),
        })
        if (!resB.ok) {
          const errData = await resB.json().catch(() => null)
          throw new Error(errData?.error || `Shift B photo report save nahi ho saki (${resB.status})`)
        }
        reportCreated = true
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Shift B photo report save nahi ho saki')
        setSaving(false)
        return
      }
    }

    if (reportCreated) {
      onReportCreated?.()
    }

    setSaving(false)
    onClose()
  }

  const reportsA = existingReports.filter((r) => (r.shift || 'A') === 'A')
  const reportsB = existingReports.filter((r) => r.shift === 'B')

  return (
    <>
      <div
        className="modal fade show d-block"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fabric-fault-shift-title"
        style={{ background: 'rgba(15, 23, 42, 0.55)', zIndex: 1045 }}
        onClick={onClose}
      >
        <div
          className="modal-dialog modal-dialog-centered modal-xl modal-dialog-scrollable"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-content border-0 shadow-lg">
            {/* Modal Header */}
            <div className="modal-header py-2 px-3 bg-light border-bottom">
              <div>
                <h5 id="fabric-fault-shift-title" className="modal-title fs-6 fw-bold mb-0">
                  <span className="badge bg-primary me-2">Loom #{entry.loomNumber}</span>
                  Fabric Fault Entry & Floor Media
                  {seg}
                </h5>
                <div className="small text-secondary">
                  {entry.qualityName || '—'} {selectedDate ? `· Date: ${selectedDate}` : ''} · Ahmar / Javed Sir entry (Voice, Photo, Video)
                </div>
              </div>
              <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
            </div>

            {/* Modal Body */}
            <div className="modal-body px-3 py-3 bg-light-subtle">
              {uploading && (
                <div className="alert alert-info py-2 px-3 small d-flex align-items-center gap-2 mb-3">
                  <div className="spinner-border spinner-border-sm text-primary" role="status" />
                  <span>Media upload ho rahi hai… {uploadProgress > 0 ? `${uploadProgress}%` : ''}</span>
                </div>
              )}

              <div className="row g-3">
                {/* ---------------- SHIFT A COLUMN ---------------- */}
                <div className="col-lg-6">
                  <div className="card h-100 border shadow-xs">
                    <div className="card-header bg-white py-2 px-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
                      <div className="d-flex align-items-center gap-1.5">
                        <span className="badge text-bg-primary">A</span>
                        <span className="fw-semibold small">Shift A Fault</span>
                      </div>

                      {canEdit && (
                        <div className="d-flex align-items-center gap-1">
                          {/* Voice Button */}
                          {activeRecordingShift === 'A' ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-danger py-0.5 px-2 d-inline-flex align-items-center gap-1 animate-pulse"
                              onClick={() => void handleStopVoice('A')}
                              disabled={voiceBusy}
                            >
                              <i className="bi bi-stop-circle" />
                              <span className="small">{voiceBusy ? 'Transcribing…' : 'Stop ⏹'}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger py-0.5 px-2 d-inline-flex align-items-center gap-1"
                              onClick={() => void handleStartVoice('A')}
                              disabled={voiceBusy || activeRecordingShift !== null}
                              title="Awaz se likhein (Voice Note)"
                            >
                              <i className="bi bi-mic-fill" />
                              <span className="small d-none d-sm-inline">Voice</span>
                            </button>
                          )}

                          {/* Photo Button */}
                          <input
                            ref={photoInputA}
                            type="file"
                            accept="image/*"
                            className="d-none"
                            onChange={(e) => {
                              void handleAddFiles(e.target.files, 'A')
                              e.target.value = ''
                            }}
                          />
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary py-0.5 px-2 d-inline-flex align-items-center gap-1"
                            onClick={() => photoInputA.current?.click()}
                            disabled={uploading}
                            title="Photo attach karein"
                          >
                            <i className="bi bi-camera" />
                            <span className="small d-none d-sm-inline">Photo</span>
                          </button>

                          {/* Video Button */}
                          <input
                            ref={videoInputA}
                            type="file"
                            accept="video/*"
                            className="d-none"
                            onChange={(e) => {
                              void handleAddFiles(e.target.files, 'A')
                              e.target.value = ''
                            }}
                          />
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary py-0.5 px-2 d-inline-flex align-items-center gap-1"
                            onClick={() => videoInputA.current?.click()}
                            disabled={uploading}
                            title="Video attach karein"
                          >
                            <i className="bi bi-camera-video" />
                            <span className="small d-none d-sm-inline">Video</span>
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="card-body p-3 d-flex flex-column gap-2">
                      <FabricFaultMultiInput
                        value={shiftA}
                        canEdit={canEdit}
                        placeholder="Shift A fabric fault (type karein ya voice dabayein)…"
                        onChange={setShiftA}
                      />

                      {/* Attached New Media (Shift A) */}
                      {pendingMediaA.length > 0 && (
                        <div className="mt-2 p-2 rounded bg-light border">
                          <div className="small fw-semibold text-secondary mb-1.5 d-flex align-items-center gap-1">
                            <i className="bi bi-paperclip text-primary" /> Nayi attached files ({pendingMediaA.length}):
                          </div>
                          <div className="d-flex flex-wrap gap-2">
                            {pendingMediaA.map((m, idx) => (
                              <div
                                key={m.url || idx}
                                className="position-relative border rounded overflow-hidden"
                                style={{ width: 68, height: 68, backgroundColor: '#000' }}
                              >
                                {m.kind === 'image' ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={m.url}
                                    alt="Shift A fault"
                                    className="w-100 h-100"
                                    style={{ objectFit: 'cover', cursor: 'pointer' }}
                                    onClick={() => setLightboxImage(m.url)}
                                  />
                                ) : (
                                  <video src={m.url} className="w-100 h-100" style={{ objectFit: 'cover' }} />
                                )}
                                <button
                                  type="button"
                                  className="position-absolute top-0 end-0 btn btn-danger btn-xs p-0 px-1 rounded-0"
                                  style={{ fontSize: 10, lineHeight: 1.2 }}
                                  onClick={() =>
                                    setPendingMediaA((prev) => prev.filter((_, i) => i !== idx))
                                  }
                                  title="Remove file"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Kamran's Existing Floor Reports (Shift A) */}
                      {reportsA.length > 0 && (
                        <div className="mt-2 p-2 rounded bg-primary-subtle border border-primary-subtle">
                          <div className="small fw-semibold text-primary mb-1 d-flex align-items-center gap-1">
                            <i className="bi bi-person-badge" /> Floor Inspector (Kamran) Reports:
                          </div>
                          {reportsA.map((r) => (
                            <div key={r.id} className="small mb-1.5 pb-1 border-bottom border-primary-subtle last:border-0">
                              <div className="d-flex align-items-center justify-content-between gap-1">
                                <span className="fw-semibold text-dark">{r.createdBy}:</span>
                                {canEdit && (
                                  <div className="d-flex align-items-center gap-1">
                                    <button
                                      type="button"
                                      className="btn btn-xs btn-link text-primary p-0"
                                      style={{ fontSize: 11 }}
                                      onClick={() => {
                                        setEditingReportId(r.id)
                                        setEditingReportText(r.text)
                                      }}
                                      title="Edit report note"
                                    >
                                      <i className="bi bi-pencil" />
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-xs btn-link text-danger p-0 ms-1"
                                      style={{ fontSize: 11 }}
                                      onClick={() => void handleDeleteReport(r.id)}
                                      title="Delete report"
                                    >
                                      <i className="bi bi-trash" />
                                    </button>
                                  </div>
                                )}
                              </div>
                              {editingReportId === r.id ? (
                                <div className="mt-1 d-flex flex-column gap-1">
                                  <input
                                    className="form-control form-control-sm py-0.5 px-1.5"
                                    style={{ fontSize: 11 }}
                                    value={editingReportText}
                                    onChange={(e) => setEditingReportText(e.target.value)}
                                  />
                                  <div className="d-flex gap-1">
                                    <button
                                      type="button"
                                      className="btn btn-xs btn-primary py-0 px-2"
                                      style={{ fontSize: 11 }}
                                      onClick={() => void handleSaveEditReport(r.id)}
                                    >
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-xs btn-outline-secondary py-0 px-1.5"
                                      style={{ fontSize: 11 }}
                                      onClick={() => setEditingReportId(null)}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div>{r.text || '(sirf photo/video)'}</div>
                              )}
                              {r.media?.length > 0 && <ReportMediaThumbs media={r.media} onOpen={setLightboxImage} />}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ---------------- SHIFT B COLUMN ---------------- */}
                <div className="col-lg-6">
                  <div className="card h-100 border shadow-xs">
                    <div className="card-header bg-white py-2 px-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
                      <div className="d-flex align-items-center gap-1.5">
                        <span className="badge text-bg-secondary">B</span>
                        <span className="fw-semibold small">Shift B Fault</span>
                      </div>

                      {canEdit && (
                        <div className="d-flex align-items-center gap-1">
                          {/* Voice Button */}
                          {activeRecordingShift === 'B' ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-danger py-0.5 px-2 d-inline-flex align-items-center gap-1 animate-pulse"
                              onClick={() => void handleStopVoice('B')}
                              disabled={voiceBusy}
                            >
                              <i className="bi bi-stop-circle" />
                              <span className="small">{voiceBusy ? 'Transcribing…' : 'Stop ⏹'}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger py-0.5 px-2 d-inline-flex align-items-center gap-1"
                              onClick={() => void handleStartVoice('B')}
                              disabled={voiceBusy || activeRecordingShift !== null}
                              title="Awaz se likhein (Voice Note)"
                            >
                              <i className="bi bi-mic-fill" />
                              <span className="small d-none d-sm-inline">Voice</span>
                            </button>
                          )}

                          {/* Photo Button */}
                          <input
                            ref={photoInputB}
                            type="file"
                            accept="image/*"
                            className="d-none"
                            onChange={(e) => {
                              void handleAddFiles(e.target.files, 'B')
                              e.target.value = ''
                            }}
                          />
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary py-0.5 px-2 d-inline-flex align-items-center gap-1"
                            onClick={() => photoInputB.current?.click()}
                            disabled={uploading}
                            title="Photo attach karein"
                          >
                            <i className="bi bi-camera" />
                            <span className="small d-none d-sm-inline">Photo</span>
                          </button>

                          {/* Video Button */}
                          <input
                            ref={videoInputB}
                            type="file"
                            accept="video/*"
                            className="d-none"
                            onChange={(e) => {
                              void handleAddFiles(e.target.files, 'B')
                              e.target.value = ''
                            }}
                          />
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary py-0.5 px-2 d-inline-flex align-items-center gap-1"
                            onClick={() => videoInputB.current?.click()}
                            disabled={uploading}
                            title="Video attach karein"
                          >
                            <i className="bi bi-camera-video" />
                            <span className="small d-none d-sm-inline">Video</span>
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="card-body p-3 d-flex flex-column gap-2">
                      <FabricFaultMultiInput
                        value={shiftB}
                        canEdit={canEdit}
                        placeholder="Shift B fabric fault (type karein ya voice dabayein)…"
                        onChange={setShiftB}
                      />

                      {/* Attached New Media (Shift B) */}
                      {pendingMediaB.length > 0 && (
                        <div className="mt-2 p-2 rounded bg-light border">
                          <div className="small fw-semibold text-secondary mb-1.5 d-flex align-items-center gap-1">
                            <i className="bi bi-paperclip text-primary" /> Nayi attached files ({pendingMediaB.length}):
                          </div>
                          <div className="d-flex flex-wrap gap-2">
                            {pendingMediaB.map((m, idx) => (
                              <div
                                key={m.url || idx}
                                className="position-relative border rounded overflow-hidden"
                                style={{ width: 68, height: 68, backgroundColor: '#000' }}
                              >
                                {m.kind === 'image' ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={m.url}
                                    alt="Shift B fault"
                                    className="w-100 h-100"
                                    style={{ objectFit: 'cover', cursor: 'pointer' }}
                                    onClick={() => setLightboxImage(m.url)}
                                  />
                                ) : (
                                  <video src={m.url} className="w-100 h-100" style={{ objectFit: 'cover' }} />
                                )}
                                <button
                                  type="button"
                                  className="position-absolute top-0 end-0 btn btn-danger btn-xs p-0 px-1 rounded-0"
                                  style={{ fontSize: 10, lineHeight: 1.2 }}
                                  onClick={() =>
                                    setPendingMediaB((prev) => prev.filter((_, i) => i !== idx))
                                  }
                                  title="Remove file"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Kamran's Existing Floor Reports (Shift B) */}
                      {reportsB.length > 0 && (
                        <div className="mt-2 p-2 rounded bg-warning-subtle border border-warning-subtle">
                          <div className="small fw-semibold text-warning-emphasis mb-1 d-flex align-items-center gap-1">
                            <i className="bi bi-person-badge" /> Floor Inspector (Kamran) Reports:
                          </div>
                          {reportsB.map((r) => (
                            <div key={r.id} className="small mb-1.5 pb-1 border-bottom border-warning-subtle last:border-0">
                              <div className="d-flex align-items-center justify-content-between gap-1">
                                <span className="fw-semibold text-dark">{r.createdBy}:</span>
                                {canEdit && (
                                  <div className="d-flex align-items-center gap-1">
                                    <button
                                      type="button"
                                      className="btn btn-xs btn-link text-primary p-0"
                                      style={{ fontSize: 11 }}
                                      onClick={() => {
                                        setEditingReportId(r.id)
                                        setEditingReportText(r.text)
                                      }}
                                      title="Edit report note"
                                    >
                                      <i className="bi bi-pencil" />
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-xs btn-link text-danger p-0 ms-1"
                                      style={{ fontSize: 11 }}
                                      onClick={() => void handleDeleteReport(r.id)}
                                      title="Delete report"
                                    >
                                      <i className="bi bi-trash" />
                                    </button>
                                  </div>
                                )}
                              </div>
                              {editingReportId === r.id ? (
                                <div className="mt-1 d-flex flex-column gap-1">
                                  <input
                                    className="form-control form-control-sm py-0.5 px-1.5"
                                    style={{ fontSize: 11 }}
                                    value={editingReportText}
                                    onChange={(e) => setEditingReportText(e.target.value)}
                                  />
                                  <div className="d-flex gap-1">
                                    <button
                                      type="button"
                                      className="btn btn-xs btn-primary py-0 px-2"
                                      style={{ fontSize: 11 }}
                                      onClick={() => void handleSaveEditReport(r.id)}
                                    >
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-xs btn-outline-secondary py-0 px-1.5"
                                      style={{ fontSize: 11 }}
                                      onClick={() => setEditingReportId(null)}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div>{r.text || '(sirf photo/video)'}</div>
                              )}
                              {r.media?.length > 0 && <ReportMediaThumbs media={r.media} onOpen={setLightboxImage} />}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="form-text small mt-3 mb-0 text-secondary">
                <i className="bi bi-info-circle me-1" />
                Ahmar aur Javed Sir yahan se direct <strong>Voice (🎤)</strong>, <strong>Photo (📷)</strong> ya <strong>Video (🎥)</strong> attach kar sakte hain. Save dabane par sheet aur floor media dono update ho jayenge.
              </div>
            </div>

            {/* Modal Footer */}
            <div className="modal-footer py-2 px-3 bg-light border-top">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={onClose}
                disabled={saving || uploading}
              >
                {canEdit ? 'Cancel' : 'Close'}
              </button>
              {canEdit ? (
                <button
                  type="button"
                  className="btn btn-sm btn-primary px-3"
                  onClick={handleSave}
                  disabled={saving || uploading || voiceBusy}
                >
                  {saving ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-1.5" role="status" />
                      Saving…
                    </>
                  ) : (
                    'Save faults'
                  )}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox: a photo, or a video that plays here */}
      {lightboxImage && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex flex-column align-items-center justify-content-center p-3"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            zIndex: 1100,
          }}
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="position-absolute top-0 end-0 p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="btn btn-sm btn-danger py-1 px-2.5"
              onClick={() => setLightboxImage(null)}
            >
              <i className="bi bi-x-lg me-1" /> Close
            </button>
          </div>
          {isVideoUrl(lightboxImage) ? (
            <video
              src={lightboxImage}
              controls
              autoPlay
              playsInline
              className="rounded shadow-lg bg-black"
              style={{ maxWidth: '92vw', maxHeight: '85vh' }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={lightboxImage}
              alt="Fault preview"
              className="rounded shadow-lg"
              style={{ maxWidth: '92vw', maxHeight: '85vh', objectFit: 'contain' }}
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}
    </>
  )
}

const isVideoUrl = (url: string) => /\.(mp4|mov|webm)(\?|#|$)/i.test(url)

/**
 * Kamran's photos and videos on a report, shown as small pictures (a video shows its first
 * frame with a ▶ mark). Tapping one opens it large; a video plays there.
 */
function ReportMediaThumbs({
  media,
  onOpen,
}: {
  media: Array<{ url: string; kind: 'image' | 'video' }>
  onOpen: (url: string) => void
}) {
  return (
    <div className="d-flex flex-wrap gap-2 mt-1">
      {media.map((m, mi) => (
        <button
          key={m.url || mi}
          type="button"
          className="position-relative p-0 border rounded overflow-hidden bg-dark"
          style={{ width: m.kind === 'video' ? 112 : 84, height: 84 }}
          title={m.kind === 'video' ? 'Video chalayein' : 'Photo bari karein'}
          aria-label={m.kind === 'video' ? 'Video chalayein' : 'Photo bari karein'}
          onClick={() => onOpen(m.url)}
        >
          {m.kind === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.url} alt="Fault photo" loading="lazy" className="w-100 h-100" style={{ objectFit: 'cover' }} />
          ) : (
            <>
              <video
                src={`${m.url}#t=0.5`}
                preload="metadata"
                muted
                playsInline
                className="w-100 h-100"
                style={{ objectFit: 'cover', pointerEvents: 'none' }}
              />
              <span
                className="position-absolute top-50 start-50 translate-middle d-flex align-items-center justify-content-center rounded-circle text-white"
                style={{ width: 32, height: 32, background: 'rgba(0,0,0,0.6)', fontSize: 14 }}
                aria-hidden="true"
              >
                ▶
              </span>
            </>
          )}
        </button>
      ))}
    </div>
  )
}
