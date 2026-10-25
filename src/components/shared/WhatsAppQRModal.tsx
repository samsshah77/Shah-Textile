'use client'

import { useEffect, useState } from 'react'
import type { WhatsAppConnectionStatus } from '@/server/whatsapp/evolution'

interface WhatsAppQRModalProps {
  isOpen: boolean
  onClose: () => void
  onConnected?: () => void
}

export function WhatsAppQRModal({ isOpen, onClose, onConnected }: WhatsAppQRModalProps) {
  const [status, setStatus] = useState<WhatsAppConnectionStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/whatsapp/status', {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as WhatsAppConnectionStatus
      setStatus(data)
      if (data.connected) {
        onConnected?.()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Server se rabta nahi ho saka')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isOpen) return
    void fetchStatus()

    // Poll every 5s while waiting for QR scan
    const interval = setInterval(() => {
      void fetchStatus()
    }, 5000)

    return () => clearInterval(interval)
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      className="modal fade show d-block"
      role="dialog"
      aria-modal="true"
      style={{ background: 'rgba(15, 23, 42, 0.65)', zIndex: 1060 }}
      onClick={onClose}
    >
      <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content border-0 shadow-lg">
          <div className="modal-header bg-light py-2 px-3 border-bottom">
            <h5 className="modal-title fs-6 fw-bold mb-0 d-flex align-items-center gap-2">
              <i className="bi bi-whatsapp text-success" />
              WhatsApp Server Connect (QR Code)
            </h5>
            <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
          </div>

          <div className="modal-body p-4 text-center">
            {loading && !status && (
              <div className="py-4">
                <div className="spinner-border text-success mb-2" role="status" />
                <div className="small text-secondary">WhatsApp server status check ho raha hai…</div>
              </div>
            )}

            {error && (
              <div className="alert alert-warning small text-start mb-3">
                <i className="bi bi-exclamation-triangle-fill me-1" />
                <strong>Masla:</strong> {error}
                <div className="mt-1 text-muted" style={{ fontSize: 11 }}>
                  VPS par Evolution API container check karein (<code>docker ps</code>).
                </div>
              </div>
            )}

            {status?.connected ? (
              <div className="py-3">
                <div className="text-success fs-1 mb-2">
                  <i className="bi bi-check-circle-fill" />
                </div>
                <h6 className="fw-bold text-success mb-1">WhatsApp Connected Hai!</h6>
                <p className="small text-secondary mb-3">
                  Aapka server WhatsApp se connected hai. Ab direct PDF aur messages send ho rahe hain.
                </p>
                <button type="button" className="btn btn-sm btn-outline-success px-3" onClick={onClose}>
                  Done
                </button>
              </div>
            ) : status?.qrcode ? (
              <div>
                <div className="small fw-semibold text-secondary mb-2">
                  Apne mobile se yeh QR Code scan karein:
                </div>
                <div className="d-inline-block p-2 bg-white border rounded shadow-sm mb-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={status.qrcode.startsWith('data:') ? status.qrcode : `data:image/png;base64,${status.qrcode}`}
                    alt="WhatsApp QR Code"
                    style={{ width: 220, height: 220, objectFit: 'contain' }}
                  />
                </div>
                <div className="small text-muted text-start bg-light p-2.5 rounded border mb-2">
                  <div className="fw-semibold mb-1">Mobile mein tareeqa:</div>
                  <ol className="mb-0 ps-3">
                    <li>Mobile par <strong>WhatsApp</strong> kholein</li>
                    <li><strong>Settings / Menu (⋮)</strong> ➔ <strong>Linked Devices</strong></li>
                    <li><strong>Link a Device</strong> par click karke yeh QR scan karein</li>
                  </ol>
                </div>
                <div className="small text-muted">
                  <span className="spinner-grow spinner-grow-sm me-1 text-success" />
                  Scan ka intezar hai… (auto refresh ho raha hai)
                </div>
              </div>
            ) : status && !status.connected ? (
              <div className="py-3 text-secondary">
                <i className="bi bi-phone fs-2 text-muted d-block mb-2" />
                <p className="small mb-2">QR Code generate ho raha hai ya instance shuru ho raha hai…</p>
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={fetchStatus}>
                  <i className="bi bi-arrow-clockwise me-1" /> Dobara check karein
                </button>
              </div>
            ) : null}
          </div>

          <div className="modal-footer py-2 px-3 bg-light border-top d-flex justify-content-between">
            <span className="small text-muted" style={{ fontSize: 11 }}>
              Instance: <code>{status?.instanceName || 'sara-textile'}</code>
            </span>
            <button type="button" className="btn btn-sm btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
