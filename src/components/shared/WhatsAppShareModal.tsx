'use client'

import { useEffect, useState } from 'react'
import { WhatsAppQRModal } from './WhatsAppQRModal'
import type { WhatsAppConnectionStatus } from '@/server/whatsapp/evolution'

const SAVED_KEY = 'sara_whatsapp_numbers_v2'

/** Numbers this browser has sent to before (kept only on this device). */
function savedNumbers(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(SAVED_KEY) || '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 10) : []
  } catch {
    return []
  }
}

function remember(num: string) {
  try {
    const list = [num, ...savedNumbers().filter((x) => x !== num)].slice(0, 10)
    window.localStorage.setItem(SAVED_KEY, JSON.stringify(list))
  } catch {
    /* storage blocked */
  }
}

/** 0300 1234567 / +92 300 1234567 → 923001234567 (what wa.me & Evolution API need). */
export function formatWhatsAppNumber(raw: string): string {
  const d = raw.replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('03') && d.length === 11) return `92${d.slice(1)}`
  if (d.length === 10 && d.startsWith('3')) return `92${d}`
  return d
}

export interface WhatsAppShareModalProps {
  isOpen: boolean
  onClose: () => void
  documentTitle: string
  defaultMessage: string
  /** When set, a "PDF save karein" button is shown. */
  onDownloadPdf?: () => void
}

export function WhatsAppShareModal({
  isOpen,
  onClose,
  documentTitle,
  defaultMessage,
  onDownloadPdf,
}: WhatsAppShareModalProps) {
  if (!isOpen) return null
  return (
    <ShareBody
      key={defaultMessage}
      onClose={onClose}
      documentTitle={documentTitle}
      defaultMessage={defaultMessage}
      onDownloadPdf={onDownloadPdf}
    />
  )
}

function ShareBody({
  onClose,
  documentTitle,
  defaultMessage,
  onDownloadPdf,
}: Omit<WhatsAppShareModalProps, 'isOpen'>) {
  const [number, setNumber] = useState('')
  const [message, setMessage] = useState(defaultMessage)
  const [saved] = useState(savedNumbers)

  // Direct server WhatsApp status & sending states
  const [serverStatus, setServerStatus] = useState<WhatsAppConnectionStatus | null>(null)
  const [sendingDirect, setSendingDirect] = useState(false)
  const [directSuccess, setDirectSuccess] = useState(false)
  const [directError, setDirectError] = useState<string | null>(null)
  const [showQRModal, setShowQRModal] = useState(false)

  // Attached PDF file to send directly
  const [attachedFile, setAttachedFile] = useState<File | null>(null)

  // Check server connection status on mount
  useEffect(() => {
    let live = true
    fetch('/api/whatsapp/status', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (live && data) setServerStatus(data)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  // Send via standard wa.me fallback
  const sendViaWeb = () => {
    const to = formatWhatsAppNumber(number)
    if (to) remember(number.trim())
    window.open(
      `https://wa.me/${to}?text=${encodeURIComponent(message.trim())}`,
      '_blank',
      'noopener,noreferrer'
    )
    onClose()
  }

  // Send direct document or message via VPS Evolution API
  const sendViaServer = async () => {
    const to = formatWhatsAppNumber(number)
    if (!to || to.length < 10) {
      setDirectError('Pehle valid WhatsApp number likhein (e.g. 0300 1234567)')
      return
    }

    setSendingDirect(true)
    setDirectError(null)
    setDirectSuccess(false)

    try {
      let fileBase64: string | undefined

      if (attachedFile) {
        const buffer = await attachedFile.arrayBuffer()
        const bytes = new Uint8Array(buffer)
        let binary = ''
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i])
        }
        fileBase64 = btoa(binary)
      }

      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          number: to,
          text: message.trim(),
          fileBase64,
          filename: attachedFile?.name || `${documentTitle.replace(/\s+/g, '_')}.pdf`,
          mimeType: attachedFile?.type || 'application/pdf',
          caption: message.trim(),
        }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || `Server error (${res.status})`)
      }

      remember(number.trim())
      setDirectSuccess(true)
      setTimeout(() => {
        onClose()
      }, 2000)
    } catch (err) {
      setDirectError(
        err instanceof Error
          ? err.message
          : 'Server se WhatsApp nahi ja saka. Purana tareeqa use karein.'
      )
    } finally {
      setSendingDirect(false)
    }
  }

  return (
    <>
      <div
        className="modal fade show d-block d-print-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wa-title"
        style={{ background: 'rgba(15,23,42,.45)', zIndex: 1050 }}
        onClick={onClose}
      >
        <div className="modal-dialog modal-dialog-centered modal-lg" onClick={(e) => e.stopPropagation()}>
          <div className="modal-content border-0 shadow-lg">
            {/* Modal Header */}
            <div className="modal-header py-2 px-3 bg-light border-bottom">
              <div className="d-flex align-items-center gap-2 flex-wrap">
                <h5 id="wa-title" className="modal-title fs-6 fw-bold mb-0">
                  <i className="bi bi-whatsapp text-success me-1" /> WhatsApp — {documentTitle}
                </h5>
                {serverStatus?.connected ? (
                  <span className="badge text-bg-success px-2 py-1 small">
                    <i className="bi bi-check-circle me-1" /> Server Connected
                  </span>
                ) : serverStatus?.configured ? (
                  <button
                    type="button"
                    className="btn btn-xs btn-outline-warning py-0 px-2 rounded-pill"
                    onClick={() => setShowQRModal(true)}
                    title="QR Code scan karke phone link karein"
                  >
                    <i className="bi bi-qr-code me-1" /> QR Link Chahiye
                  </button>
                ) : (
                  <span className="badge text-bg-secondary px-2 py-1 small">Web Mode</span>
                )}
              </div>
              <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
            </div>

            {/* Modal Body */}
            <div className="modal-body px-3 py-3">
              {directSuccess && (
                <div className="alert alert-success d-flex align-items-center gap-2 py-2 px-3 mb-3">
                  <i className="bi bi-check-circle-fill fs-5" />
                  <div>
                    <strong>Kamyabi!</strong> WhatsApp par direct bhej diya gaya hai.
                  </div>
                </div>
              )}

              {directError && (
                <div className="alert alert-danger d-flex align-items-center justify-content-between py-2 px-3 mb-3 small">
                  <div>
                    <i className="bi bi-exclamation-triangle-fill me-1" />
                    {directError}
                  </div>
                  {serverStatus && !serverStatus.connected && (
                    <button
                      type="button"
                      className="btn btn-xs btn-outline-danger ms-2 py-0"
                      onClick={() => setShowQRModal(true)}
                    >
                      QR Scan Karein
                    </button>
                  )}
                </div>
              )}

              {/* Number Input */}
              <div className="mb-3">
                <label className="form-label small fw-semibold mb-1" htmlFor="wa-number">
                  Recipient Number (WhatsApp Number):
                </label>
                <div className="input-group input-group-sm">
                  <span className="input-group-text bg-light">
                    <i className="bi bi-telephone text-success" />
                  </span>
                  <input
                    id="wa-number"
                    className="form-control"
                    inputMode="tel"
                    placeholder="0300 1234567 ya +92 300 1234567"
                    list="wa-saved"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                  />
                </div>
                <datalist id="wa-saved">
                  {saved.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
                <div className="form-text small" style={{ fontSize: 11 }}>
                  Pakistan numbers: <code>0300 1234567</code> khud <code>923001234567</code> ban jate hain.
                </div>
              </div>

              {/* Message Input */}
              <div className="mb-3">
                <label className="form-label small fw-semibold mb-1" htmlFor="wa-message">
                  Report Summary / Message:
                </label>
                <textarea
                  id="wa-message"
                  className="form-control form-control-sm font-monospace"
                  rows={6}
                  style={{ fontSize: 12.5 }}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>

              {/* PDF Document Attachment Box */}
              <div className="p-2.5 rounded bg-light border mb-2">
                <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-1.5">
                  <div className="small fw-semibold text-secondary d-flex align-items-center gap-1">
                    <i className="bi bi-file-earmark-pdf text-danger" />
                    Direct PDF File Attach Karein (Server se send karne ke liye):
                  </div>
                  {onDownloadPdf && (
                    <button
                      type="button"
                      className="btn btn-xs btn-outline-secondary py-0.5 px-2"
                      onClick={onDownloadPdf}
                      title="Pehle PDF apne computer mein save karein"
                    >
                      <i className="bi bi-download me-1" />
                      PDF Download Karein
                    </button>
                  )}
                </div>

                <div className="d-flex align-items-center gap-2">
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    className="form-control form-control-sm"
                    onChange={(e) => setAttachedFile(e.target.files?.[0] || null)}
                  />
                  {attachedFile && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger py-0 px-2"
                      onClick={() => setAttachedFile(null)}
                      title="File hatayein"
                    >
                      ×
                    </button>
                  )}
                </div>

                {attachedFile ? (
                  <div className="small text-success mt-1.5 d-flex align-items-center gap-1">
                    <i className="bi bi-check2-circle" />
                    <strong>Attached:</strong> {attachedFile.name} ({(attachedFile.size / 1024).toFixed(1)} KB) — yeh file direct WhatsApp par deliver hogi!
                  </div>
                ) : (
                  <div className="form-text small mt-1" style={{ fontSize: 11 }}>
                    Agar PDF document direct WhatsApp par bhejni hai to &quot;PDF Download&quot; karke yahan attach karein.
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="modal-footer py-2 px-3 bg-light border-top d-flex flex-wrap justify-content-between gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={onClose}
                disabled={sendingDirect}
              >
                Cancel
              </button>

              <div className="d-flex align-items-center gap-2">
                {/* Fallback Option */}
                <button
                  type="button"
                  className="btn btn-sm btn-outline-success"
                  onClick={sendViaWeb}
                  disabled={!message.trim() || sendingDirect}
                  title="WhatsApp Web / App khol kar link bhejega"
                >
                  <i className="bi bi-box-arrow-up-right me-1" />
                  WhatsApp Web Kholein
                </button>

                {/* Direct Server Send Option */}
                <button
                  type="button"
                  className="btn btn-sm btn-success px-3 d-inline-flex align-items-center gap-1.5 shadow-sm"
                  onClick={sendViaServer}
                  disabled={!number.trim() || sendingDirect}
                  title="Server direct samne wale ke number par PDF/message deliver karega"
                >
                  {sendingDirect ? (
                    <>
                      <span className="spinner-border spinner-border-sm" role="status" />
                      Bhej raha hai…
                    </>
                  ) : (
                    <>
                      <i className="bi bi-send-fill" />
                      Direct Bhejein (Server 🚀)
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* QR Code Modal for linking phone */}
      <WhatsAppQRModal
        isOpen={showQRModal}
        onClose={() => setShowQRModal(false)}
        onConnected={() => {
          setShowQRModal(false)
          fetch('/api/whatsapp/status', { credentials: 'same-origin', cache: 'no-store' })
            .then((r) => r.ok && r.json())
            .then((d) => d && setServerStatus(d))
            .catch(() => {})
        }}
      />
    </>
  )
}
