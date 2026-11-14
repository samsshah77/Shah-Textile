'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Html5Qrcode } from 'html5-qrcode'
import { jsPDF } from 'jspdf'
import { longDateFromYmd } from '@/lib/longDate'
import {
  bagsText,
  DESTINATION_LABEL,
  diffText,
  fmtKg,
  receivedDiff,
  type YarnDispatch,
} from '@/lib/floor/yarnSupply'

/** Barcode ID for all stock sent on one date. */
export function dayBarcodeId(sentDate: string): string {
  return `DAY-${sentDate}`
}

/** Plain-text details embedded in the QR code so scanning with any device/camera immediately gives all sent stock details. */
export function buildDayQrPayload(items: YarnDispatch[]): string {
  if (!items.length) return ''
  const sentDate = items[0].sentDate
  const totalBags = items.reduce((a, d) => a + d.bags, 0)
  const totalKg = Math.round(items.reduce((a, d) => a + d.weightKg, 0) * 100) / 100
  const dest = DESTINATION_LABEL[items[0].destination] || 'Sara Textile Mill'

  const lines = items.map((d, i) => {
    const meta = [d.lotNo ? `Lot ${d.lotNo}` : '', d.challanNo ? `Challan ${d.challanNo}` : '', d.vehicleNo ? `Vehicle ${d.vehicleNo}` : '']
      .filter(Boolean)
      .join(', ')
    return `${i + 1}. ${d.yarnType} — ${bagsText(d.bags)}, ${fmtKg(d.weightKg)}${meta ? ` (${meta})` : ''}`
  })

  return [
    `Sara Textile — Yarn Stock (${longDateFromYmd(sentDate)})`,
    `To: ${dest}`,
    '',
    ...lines,
    '',
    `Total: ${bagsText(totalBags)}, ${fmtKg(totalKg)}`,
    `Code: ${dayBarcodeId(sentDate)}`,
  ].join('\n')
}

/** Extract either a date (`DAY-YYYY-MM-DD`) or a single dispatch ID (`ysd-...`) from scanned text. */
export function parseScannedDispatchCode(raw: string): { kind: 'day'; date: string } | { kind: 'id'; id: string } | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const dayMatch = trimmed.match(/DAY-(\d{4}-\d{2}-\d{2})/i)
  if (dayMatch) return { kind: 'day', date: dayMatch[1] }

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { code?: unknown; date?: unknown; id?: unknown }
      if (typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date.trim())) {
        return { kind: 'day', date: parsed.date.trim() }
      }
      if (typeof parsed.id === 'string' && parsed.id.trim()) {
        return { kind: 'id', id: parsed.id.trim() }
      }
    } catch {
      // Fall through to raw string matching
    }
  }

  return { kind: 'id', id: trimmed }
}

/** Format all stock sent on one date for WhatsApp sharing. */
export function buildDayDispatchShareText(items: YarnDispatch[]): string {
  if (!items.length) return ''
  const sentDate = items[0].sentDate
  const totalBags = items.reduce((a, d) => a + d.bags, 0)
  const totalKg = Math.round(items.reduce((a, d) => a + d.weightKg, 0) * 100) / 100
  const dest = DESTINATION_LABEL[items[0].destination] || 'Sara Textile Mill'

  const lines = items.map((d, i) => {
    const statusText =
      d.status === 'VERIFIED'
        ? `Verified (${bagsText(d.receivedBags)}, ${fmtKg(d.receivedKg)})`
        : d.status === 'ISSUE'
          ? `Issue: ${d.issueNote || 'Reported'}`
          : 'Waiting for mill check'
    const meta = [d.lotNo ? `Lot ${d.lotNo}` : '', d.challanNo ? `Challan ${d.challanNo}` : ''].filter(Boolean).join(' · ')
    return [
      `${i + 1}. *${d.yarnType}* — ${bagsText(d.bags)}, ${fmtKg(d.weightKg)}`,
      meta ? `   ${meta}` : '',
      `   Status: ${statusText}`,
    ]
      .filter(Boolean)
      .join('\n')
  })

  return `*Sara Textile — Yarn Stock (${longDateFromYmd(sentDate)})*\nTo: ${dest}\n\n${lines.join('\n\n')}\n\n*Total: ${bagsText(totalBags)}, ${fmtKg(totalKg)}*`
}

export function YarnDispatchBarcodeModal({
  items,
  onClose,
}: {
  items: YarnDispatch[]
  onClose: () => void
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [copied, setCopied] = useState(false)

  const sentDate = items[0]?.sentDate || ''
  const code = dayBarcodeId(sentDate)
  const totalBags = useMemo(() => items.reduce((a, d) => a + d.bags, 0), [items])
  const totalKg = useMemo(() => Math.round(items.reduce((a, d) => a + d.weightKg, 0) * 100) / 100, [items])
  const qrPayload = useMemo(() => buildDayQrPayload(items), [items])

  useEffect(() => {
    let alive = true
    QRCode.toDataURL(qrPayload, { width: 340, margin: 2, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (alive) setQrDataUrl(url)
      })
      .catch(() => {
        if (alive) setQrDataUrl('')
      })
    return () => {
      alive = false
    }
  }, [qrPayload])

  const copyDetails = async () => {
    try {
      await navigator.clipboard.writeText(qrPayload)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard unavailable
    }
  }

  const downloadLabelPdf = () => {
    const extraHeight = Math.max(0, items.length - 2) * 5
    const pageH = Math.max(85, 68 + extraHeight)
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [120, pageH] })

    doc.setDrawColor(203, 213, 225)
    doc.rect(3, 3, 114, pageH - 6)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('SARA TEXTILE — YARN STOCK LABEL', 6, 9)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.text(`Sent: ${longDateFromYmd(sentDate)}`, 6, 15)
    doc.text(`Total: ${totalBags} bags · ${fmtKg(totalKg)}`, 6, 20)

    let y = 26.5
    doc.setFontSize(8)
    items.forEach((d, i) => {
      const lotPart = d.lotNo ? ` (Lot ${d.lotNo})` : ''
      const line = `${i + 1}. ${d.yarnType} — ${d.bags} bags, ${fmtKg(d.weightKg)}${lotPart}`
      doc.text(line.slice(0, 42), 6, y)
      y += 4.8
    })

    if (qrDataUrl) {
      doc.addImage(qrDataUrl, 'PNG', 68, 12, 46, 46)
    }

    doc.save(`barcode-${sentDate}.pdf`)
  }

  return (
    <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true" style={{ backgroundColor: 'rgba(15, 23, 42, 0.65)' }}>
      <div className="modal-dialog modal-dialog-centered modal-lg" role="document">
        <div className="modal-content border-0 shadow-lg" style={{ borderRadius: 14, overflow: 'hidden' }}>
          <div className="modal-header bg-light py-3 px-4">
            <h5 className="modal-title fs-6 fw-bold mb-0">
              <i className="bi bi-upc-scan me-2 text-primary" />
              Stock Barcode — {longDateFromYmd(sentDate)}
            </h5>
            <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
          </div>

          <div className="modal-body p-4">
            <div className="border rounded-3 p-3 bg-white shadow-sm">
              <div className="d-flex justify-content-between align-items-start border-bottom pb-2 mb-2">
                <div>
                  <div className="fw-bold text-uppercase small text-primary">Sara Textile — Incoming Stock</div>
                  <div className="fw-bold fs-6">{longDateFromYmd(sentDate)}</div>
                </div>
                <span className="badge text-bg-light border font-monospace">
                  {totalBags} bags · {fmtKg(totalKg)}
                </span>
              </div>

              <ul className="list-unstyled small mb-3">
                {items.map((d, i) => (
                  <li key={d.id} className="d-flex justify-content-between align-items-center py-1 border-bottom border-light">
                    <span>
                      <strong>{i + 1}. {d.yarnType}</strong>
                      {d.lotNo ? <span className="text-secondary"> · Lot {d.lotNo}</span> : null}
                      {d.challanNo ? <span className="text-secondary"> · Ch {d.challanNo}</span> : null}
                    </span>
                    <span className="font-monospace text-nowrap ms-2">
                      {d.bags} bags · {fmtKg(d.weightKg)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="d-flex flex-column align-items-center pt-2">
                {qrDataUrl && (
                  <div className="text-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrDataUrl} alt={`QR code for ${code}`} width={280} height={280} className="border rounded p-2 bg-white" />
                    <div className="text-secondary small mt-1 font-monospace">{code}</div>
                  </div>
                )}
              </div>
            </div>

            <div className="small text-secondary mt-3">
              <i className="bi bi-info-circle me-1" />
              One barcode covers all <strong>{items.length}</strong> yarn {items.length === 1 ? 'entry' : 'entries'} sent on{' '}
              <strong>{longDateFromYmd(sentDate)}</strong> — scanning it extracts all sent details directly.
            </div>
          </div>

          <div className="modal-footer bg-light py-2 px-4 d-flex justify-content-between">
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={copyDetails}>
              <i className={`bi ${copied ? 'bi-check2' : 'bi-clipboard'} me-1`} />
              {copied ? 'Copied Details' : 'Copy Details'}
            </button>
            <div className="d-flex gap-2">
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose}>
                Close
              </button>
              <button type="button" className="btn btn-sm btn-primary" onClick={downloadLabelPdf}>
                <i className="bi bi-printer me-1" /> Download Label PDF
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function YarnBarcodeLookupModal({
  dispatches,
  onOpenLabel,
  onShare,
  onClose,
}: {
  dispatches: YarnDispatch[]
  onOpenLabel: (items: YarnDispatch[]) => void
  onShare: (items: YarnDispatch[]) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const scannerRef = useRef<Html5Qrcode | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!cameraOpen) return
    let active = true
    const readerId = 'yarn-barcode-camera-reader'
    const scanner = new Html5Qrcode(readerId)
    scannerRef.current = scanner

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 15, qrbox: { width: 280, height: 170 } },
        (decodedText) => {
          if (!active) return
          setQuery(decodedText)
          setCameraOpen(false)
          setCameraError(null)
        },
        () => {
          // Ignore per-frame decode misses while scanning
        }
      )
      .catch((err: unknown) => {
        if (!active) return
        setCameraError(err instanceof Error ? err.message : 'Could not access camera. Please allow camera permission.')
        setCameraOpen(false)
      })

    return () => {
      active = false
      const current = scannerRef.current
      scannerRef.current = null
      if (current) {
        current
          .stop()
          .catch(() => {})
          .finally(() => {
            try {
              current.clear()
            } catch {
              // Ignore cleanup errors if element already unmounted
            }
          })
      }
    }
  }, [cameraOpen])

  const parsed = useMemo(() => parseScannedDispatchCode(query), [query])
  const matches = useMemo(() => {
    if (!parsed) return []
    if (parsed.kind === 'day') {
      return dispatches.filter((d) => d.sentDate === parsed.date)
    }
    const lower = parsed.id.toLowerCase()
    return dispatches.filter((d) => d.id.toLowerCase() === lower)
  }, [dispatches, parsed])

  const totalBags = matches.reduce((a, d) => a + d.bags, 0)
  const totalKg = Math.round(matches.reduce((a, d) => a + d.weightKg, 0) * 100) / 100

  return (
    <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true" style={{ backgroundColor: 'rgba(15, 23, 42, 0.65)' }}>
      <div className="modal-dialog modal-dialog-centered modal-lg" role="document">
        <div className="modal-content border-0 shadow-lg" style={{ borderRadius: 14, overflow: 'hidden' }}>
          <div className="modal-header bg-light py-3 px-4">
            <h5 className="modal-title fs-6 fw-bold mb-0">
              <i className="bi bi-upc-scan me-2 text-primary" />
              Scan / Extract Stock Data
            </h5>
            <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
          </div>

          <div className="modal-body p-4">
            <label className="form-label small fw-semibold" htmlFor="yarn-barcode-scan-input">
              Scan barcode with scanner, camera, or paste barcode code
            </label>
            <div className="input-group mb-3">
              <span className="input-group-text">
                <i className="bi bi-upc" />
              </span>
              <input
                ref={inputRef}
                id="yarn-barcode-scan-input"
                type="text"
                className="form-control font-monospace"
                placeholder="e.g. DAY-2026-11-14"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button type="button" className="btn btn-outline-secondary" onClick={() => setQuery('')} title="Clear">
                  <i className="bi bi-x-lg" />
                </button>
              )}
              <button
                type="button"
                className={`btn ${cameraOpen ? 'btn-danger' : 'btn-outline-primary'}`}
                onClick={() => {
                  setCameraError(null)
                  setCameraOpen((v) => !v)
                }}
                title={cameraOpen ? 'Stop camera' : 'Scan using camera'}
              >
                <i className={`bi ${cameraOpen ? 'bi-camera-video-off' : 'bi-camera'} me-1`} />
                {cameraOpen ? 'Stop' : 'Camera'}
              </button>
            </div>

            {cameraError && <div className="alert alert-danger small py-2 mb-3">{cameraError}</div>}

            {cameraOpen && (
              <div className="mb-3 border rounded-3 overflow-hidden bg-dark text-center">
                <div id="yarn-barcode-camera-reader" style={{ width: '100%', minHeight: 220 }} />
                <div className="small text-light py-1 bg-dark">Point camera at the 1D Barcode or QR Code</div>
              </div>
            )}

            {!parsed ? (
              <div className="text-center text-secondary small py-3 border rounded-3 bg-light">
                Ready to scan. Point your USB/Bluetooth barcode scanner at the label or click <strong>Camera</strong>.
              </div>
            ) : matches.length === 0 ? (
              <div className="alert alert-warning small mb-0">
                No stock found matching <code className="font-monospace">{parsed.kind === 'day' ? `DAY-${parsed.date}` : parsed.id}</code>.
              </div>
            ) : (
              <div className="border rounded-3 p-3 bg-light">
                <div className="d-flex justify-content-between align-items-center pb-2 mb-2 border-bottom">
                  <div>
                    <div className="fw-bold fs-6">Sent on {longDateFromYmd(matches[0].sentDate)}</div>
                    <div className="small text-secondary">
                      {matches.length} {matches.length === 1 ? 'item' : 'items'} · {DESTINATION_LABEL[matches[0].destination] || 'Sara Textile Mill'}
                    </div>
                  </div>
                  <span className="badge text-bg-primary font-monospace">
                    {totalBags} bags · {fmtKg(totalKg)}
                  </span>
                </div>

                <div className="d-flex flex-column gap-2" style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {matches.map((m, i) => {
                    const diff = receivedDiff(m)
                    return (
                      <div key={m.id} className="bg-white border rounded-3 p-2 small">
                        <div className="d-flex justify-content-between align-items-start">
                          <div>
                            <strong>{i + 1}. {m.yarnType}</strong>
                            <span className="ms-2 font-monospace text-secondary">
                              {m.bags} bags · {fmtKg(m.weightKg)}
                            </span>
                          </div>
                          <span
                            className={`badge ${
                              m.status === 'VERIFIED'
                                ? 'text-bg-success'
                                : m.status === 'ISSUE'
                                  ? 'text-bg-danger'
                                  : 'text-bg-warning'
                            }`}
                          >
                            {m.status === 'VERIFIED' ? 'Verified' : m.status === 'ISSUE' ? 'Issue' : 'Waiting'}
                          </span>
                        </div>
                        {(m.lotNo || m.challanNo || m.vehicleNo || m.remarks) && (
                          <div className="text-secondary mt-1">
                            {[
                              m.lotNo ? `Lot: ${m.lotNo}` : '',
                              m.challanNo ? `Challan: ${m.challanNo}` : '',
                              m.vehicleNo ? `Vehicle: ${m.vehicleNo}` : '',
                              m.remarks ? `Remarks: ${m.remarks}` : '',
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        )}
                        {m.bagKg.length > 0 && (
                          <div className="text-secondary mt-1">
                            Bag weights: <span className="font-monospace text-dark">{m.bagKg.map((w) => w.toFixed(2)).join(', ')} kg</span>
                          </div>
                        )}
                        {m.status === 'VERIFIED' && (
                          <div className="mt-1 text-success-emphasis">
                            Mill received: {m.receivedDate ? longDateFromYmd(m.receivedDate) : '—'} · {bagsText(m.receivedBags)} ·{' '}
                            {fmtKg(m.receivedKg)}
                            {(diff.bags !== 0 || diff.kg !== 0) && (
                              <span className="text-danger-emphasis ms-2">(Diff: {diffText(diff)})</span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="modal-footer bg-light py-2 px-4 d-flex justify-content-between">
            {matches.length > 0 ? (
              <div className="d-flex gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-success"
                  onClick={() => {
                    onClose()
                    onShare(matches)
                  }}
                >
                  <i className="bi bi-whatsapp me-1" /> WhatsApp
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary"
                  onClick={() => {
                    onClose()
                    onOpenLabel(matches)
                  }}
                >
                  <i className="bi bi-upc-scan me-1" /> Barcode Label
                </button>
              </div>
            ) : (
              <span />
            )}
            <button type="button" className="btn btn-sm btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
