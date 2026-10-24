'use client'

import { useState } from 'react'

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
    /* storage blocked — fine */
  }
}

/** 0300 1234567 / +92 300 1234567 → 923001234567 (what wa.me needs). Empty = choose in WhatsApp. */
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
  /** When set, a "PDF save karein" button is shown (attach the file in WhatsApp yourself). */
  onDownloadPdf?: () => void
}

/**
 * Share a report on WhatsApp: optional number, an editable message, then WhatsApp opens
 * (phone app or WhatsApp Web). Nothing is sent from the server.
 */
export function WhatsAppShareModal({ isOpen, onClose, documentTitle, defaultMessage, onDownloadPdf }: WhatsAppShareModalProps) {
  if (!isOpen) return null
  return <ShareBody key={defaultMessage} onClose={onClose} documentTitle={documentTitle} defaultMessage={defaultMessage} onDownloadPdf={onDownloadPdf} />
}

function ShareBody({ onClose, documentTitle, defaultMessage, onDownloadPdf }: Omit<WhatsAppShareModalProps, 'isOpen'>) {
  const [number, setNumber] = useState('')
  const [message, setMessage] = useState(defaultMessage)
  const [saved] = useState(savedNumbers)

  const send = () => {
    const to = formatWhatsAppNumber(number)
    if (to) remember(number.trim())
    window.open(`https://wa.me/${to}?text=${encodeURIComponent(message.trim())}`, '_blank', 'noopener,noreferrer')
    onClose()
  }

  return (
    <div className="modal fade show d-block d-print-none" role="dialog" aria-modal="true" aria-labelledby="wa-title" style={{ background: 'rgba(15,23,42,.45)' }} onClick={onClose}>
      <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content border-0 shadow">
          <div className="modal-header py-2 px-3">
            <h5 id="wa-title" className="modal-title fs-6 fw-bold mb-0">
              <i className="bi bi-whatsapp text-success me-1" /> WhatsApp — {documentTitle}
            </h5>
            <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
          </div>
          <div className="modal-body px-3 py-3">
            <label className="form-label small fw-semibold mb-1" htmlFor="wa-number">
              Number (chahein to khali chhor dein — WhatsApp mein khud chunein)
            </label>
            <input
              id="wa-number"
              className="form-control form-control-sm mb-3"
              inputMode="tel"
              placeholder="0300 1234567"
              list="wa-saved"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
            <datalist id="wa-saved">
              {saved.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <label className="form-label small fw-semibold mb-1" htmlFor="wa-message">
              Message
            </label>
            <textarea id="wa-message" className="form-control form-control-sm" rows={7} value={message} onChange={(e) => setMessage(e.target.value)} />
            {onDownloadPdf && (
              <div className="form-text small mt-2">PDF bhejni ho to pehle &quot;PDF save karein&quot; dabayein, phir WhatsApp mein file attach kar dein.</div>
            )}
          </div>
          <div className="modal-footer py-2 px-3">
            <button type="button" className="btn btn-sm btn-outline-secondary me-auto" onClick={onClose}>
              Cancel
            </button>
            {onDownloadPdf && (
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onDownloadPdf}>
                <i className="bi bi-file-earmark-pdf me-1" /> PDF save karein
              </button>
            )}
            <button type="button" className="btn btn-sm btn-success" onClick={send} disabled={!message.trim()}>
              <i className="bi bi-whatsapp me-1" /> WhatsApp kholein
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
