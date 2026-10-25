'use client'

import { useEffect, useState } from 'react'
import { WhatsAppQRModal } from './WhatsAppQRModal'
import type { WhatsAppConnectionStatus } from '@/server/whatsapp/evolution'

export interface SavedContact {
  name: string
  number: string
}

const CONTACTS_KEY = 'sara_whatsapp_contacts_v1'

function getSavedContacts(): SavedContact[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(CONTACTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persistContacts(list: SavedContact[]) {
  try {
    window.localStorage.setItem(CONTACTS_KEY, JSON.stringify(list))
  } catch {
    /* localStorage blocked */
  }
}

/** Standardize Pakistan and international numbers: 0300 1234567 -> 923001234567 */
export function formatWhatsAppNumber(raw: string): string {
  const d = raw.replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('0092')) return `92${d.slice(4)}`
  if (d.startsWith('03') && d.length === 11) return `92${d.slice(1)}`
  if (d.length === 10 && d.startsWith('3')) return `92${d}`
  return d
}

export interface WhatsAppShareModalProps {
  isOpen: boolean
  onClose: () => void
  documentTitle: string
  defaultMessage: string
  onDownloadPdf?: () => void
  getPdfAttachment?: () => Promise<{ base64: string; filename: string } | null> | { base64: string; filename: string } | null
}

export function WhatsAppShareModal({
  isOpen,
  onClose,
  documentTitle,
  defaultMessage,
  onDownloadPdf,
  getPdfAttachment,
}: WhatsAppShareModalProps) {
  if (!isOpen) return null
  return (
    <ShareBody
      key={defaultMessage}
      onClose={onClose}
      documentTitle={documentTitle}
      defaultMessage={defaultMessage}
      onDownloadPdf={onDownloadPdf}
      getPdfAttachment={getPdfAttachment}
    />
  )
}

function ShareBody({
  onClose,
  documentTitle,
  defaultMessage,
  getPdfAttachment,
}: Omit<WhatsAppShareModalProps, 'isOpen'>) {
  const [contacts, setContacts] = useState<SavedContact[]>([])
  const [selectedContactIdx, setSelectedContactIdx] = useState<string>('')
  const [number, setNumber] = useState('')
  const [message, setMessage] = useState(defaultMessage)

  // Save new contact states
  const [showSaveContact, setShowSaveContact] = useState(false)
  const [newContactName, setNewContactName] = useState('')

  // Server WhatsApp status & sending states
  const [serverStatus, setServerStatus] = useState<WhatsAppConnectionStatus | null>(null)
  const [sendingDirect, setSendingDirect] = useState(false)
  const [directSuccess, setDirectSuccess] = useState(false)
  const [directError, setDirectError] = useState<string | null>(null)
  const [showQRModal, setShowQRModal] = useState(false)

  // Auto-generated PDF attachment
  const [autoPdf, setAutoPdf] = useState<{ base64: string; filename: string } | null>(null)

  // Load saved contacts on mount
  useEffect(() => {
    const list = getSavedContacts()
    setContacts(list)
    if (list.length > 0) {
      setSelectedContactIdx('0')
      setNumber(list[0].number)
    }
  }, [])

  // Load auto-generated PDF attachment quietly in background
  useEffect(() => {
    if (!getPdfAttachment) return
    let live = true
    Promise.resolve(getPdfAttachment())
      .then((res) => {
        if (live && res) setAutoPdf(res)
      })
      .catch((err) => {
        console.error('[whatsapp-pdf]', err)
      })
    return () => {
      live = false
    }
  }, [getPdfAttachment])

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

  // Handle contact selection from dropdown
  const handleSelectContact = (val: string) => {
    setSelectedContactIdx(val)
    if (val === '') {
      // Manual custom number
      setNumber('')
    } else {
      const idx = parseInt(val, 10)
      if (!isNaN(idx) && contacts[idx]) {
        setNumber(contacts[idx].number)
      }
    }
    setShowSaveContact(false)
  }

  // Save new contact
  const handleSaveContact = () => {
    const trimmedName = newContactName.trim()
    const trimmedNum = number.trim()
    if (!trimmedName || !trimmedNum) return

    const updated = [{ name: trimmedName, number: trimmedNum }, ...contacts.filter((c) => c.number !== trimmedNum)]
    persistContacts(updated)
    setContacts(updated)
    setSelectedContactIdx('0')
    setNewContactName('')
    setShowSaveContact(false)
  }

  // Delete saved contact
  const handleDeleteContact = () => {
    const idx = parseInt(selectedContactIdx, 10)
    if (isNaN(idx) || !contacts[idx]) return
    const contactToDelete = contacts[idx]
    const updated = contacts.filter((_, i) => i !== idx)
    persistContacts(updated)
    setContacts(updated)
    setSelectedContactIdx('')
    if (number === contactToDelete.number) {
      setNumber('')
    }
  }

  // Check if current number is already saved
  const cleanCurrentNum = formatWhatsAppNumber(number)
  const isAlreadySaved = contacts.some(
    (c) => formatWhatsAppNumber(c.number) === cleanCurrentNum && cleanCurrentNum.length >= 10
  )

  // Send direct document or message via VPS Evolution API
  const sendViaServer = async () => {
    const to = formatWhatsAppNumber(number)
    if (!to || to.length < 10) {
      setDirectError('Pehle valid WhatsApp number darj karein (e.g. 0300 1234567)')
      return
    }

    setSendingDirect(true)
    setDirectError(null)
    setDirectSuccess(false)

    try {
      const sendFilename = autoPdf?.filename || `${documentTitle.replace(/\s+/g, '_')}.pdf`

      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          number: to,
          text: message.trim(),
          fileBase64: autoPdf?.base64,
          filename: sendFilename,
          mimeType: 'application/pdf',
          caption: message.trim(),
        }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || `Server error (${res.status})`)
      }

      setDirectSuccess(true)
      setTimeout(() => {
        onClose()
      }, 1800)
    } catch (err) {
      setDirectError(
        err instanceof Error
          ? err.message
          : 'Server se WhatsApp nahi ja saka. Connection check karein.'
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
        <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
          <div className="modal-content border-0 shadow-lg rounded-3">
            {/* Modal Header */}
            <div className="modal-header py-2.5 px-3 bg-light border-bottom">
              <div className="d-flex align-items-center gap-2">
                <h5 id="wa-title" className="modal-title fs-6 fw-bold mb-0 text-dark">
                  <i className="bi bi-whatsapp text-success me-1.5" /> WhatsApp — {documentTitle}
                </h5>
                {serverStatus?.connected ? (
                  <span className="badge text-bg-success px-2 py-0.5" style={{ fontSize: 10.5 }}>
                    <i className="bi bi-check-circle me-1" /> Connected
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn btn-xs btn-outline-warning py-0 px-2 rounded-pill"
                    onClick={() => setShowQRModal(true)}
                    title="QR Code scan karke phone link karein"
                    style={{ fontSize: 10.5 }}
                  >
                    <i className="bi bi-qr-code me-1" /> QR Link
                  </button>
                )}
              </div>
              <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
            </div>

            {/* Modal Body */}
            <div className="modal-body px-3.5 py-3">
              {directSuccess && (
                <div className="alert alert-success d-flex align-items-center gap-2 py-2 px-3 mb-3">
                  <i className="bi bi-check-circle-fill fs-5" />
                  <div>
                    <strong>Kamyabi!</strong> WhatsApp par direct deliver ho gaya hai.
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
                      QR Scan
                    </button>
                  )}
                </div>
              )}

              {/* Saved Contacts & Number Input */}
              <div className="mb-3">
                <div className="d-flex align-items-center justify-content-between mb-1">
                  <label className="form-label small fw-semibold mb-0" htmlFor="wa-number">
                    Recipient (WhatsApp Number):
                  </label>
                  {contacts.length > 0 && selectedContactIdx !== '' && (
                    <button
                      type="button"
                      className="btn btn-link text-danger p-0 text-decoration-none small"
                      style={{ fontSize: 11 }}
                      onClick={handleDeleteContact}
                      title="Is contact ko list se hatayein"
                    >
                      <i className="bi bi-trash3 me-0.5" /> Contact Hatayein
                    </button>
                  )}
                </div>

                {/* Contacts Picker Dropdown */}
                {contacts.length > 0 && (
                  <select
                    className="form-select form-select-sm mb-2"
                    value={selectedContactIdx}
                    onChange={(e) => handleSelectContact(e.target.value)}
                  >
                    <option value="">-- Naya Number Likhein --</option>
                    {contacts.map((c, i) => (
                      <option key={`${c.number}-${i}`} value={String(i)}>
                        {c.name} ({c.number})
                      </option>
                    ))}
                  </select>
                )}

                {/* Direct Number Input */}
                <div className="input-group input-group-sm">
                  <span className="input-group-text bg-light text-success">
                    <i className="bi bi-telephone" />
                  </span>
                  <input
                    id="wa-number"
                    className="form-control"
                    inputMode="tel"
                    placeholder="e.g. 0325 5246937"
                    value={number}
                    onChange={(e) => {
                      setNumber(e.target.value)
                      setSelectedContactIdx('')
                    }}
                  />
                </div>

                {/* Inline Save Contact Prompt */}
                {number.trim().length >= 10 && !isAlreadySaved && (
                  <div className="mt-1.5">
                    {!showSaveContact ? (
                      <button
                        type="button"
                        className="btn btn-link text-primary p-0 text-decoration-none small"
                        style={{ fontSize: 11.5 }}
                        onClick={() => setShowSaveContact(true)}
                      >
                        <i className="bi bi-person-plus me-1" />
                        Is number ko naam ke sath save karein
                      </button>
                    ) : (
                      <div className="d-flex align-items-center gap-1.5 p-1.5 bg-light rounded border mt-1">
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          placeholder="Naam (e.g. Director / Malik Sahib)"
                          value={newContactName}
                          onChange={(e) => setNewContactName(e.target.value)}
                          autoFocus
                        />
                        <button
                          type="button"
                          className="btn btn-sm btn-primary py-1 px-2.5 shrink-0"
                          onClick={handleSaveContact}
                          disabled={!newContactName.trim()}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary py-1 px-2 shrink-0"
                          onClick={() => {
                            setShowSaveContact(false)
                            setNewContactName('')
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Message Input */}
              <div className="mb-1">
                <label className="form-label small fw-semibold mb-1" htmlFor="wa-message">
                  Report Summary / Message:
                </label>
                <textarea
                  id="wa-message"
                  className="form-control form-control-sm font-monospace"
                  rows={5}
                  style={{ fontSize: 12.5 }}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="modal-footer py-2 px-3.5 bg-light border-top d-flex justify-content-between align-items-center">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={onClose}
                disabled={sendingDirect}
              >
                Cancel
              </button>

              <button
                type="button"
                className="btn btn-sm btn-success px-3.5 d-inline-flex align-items-center gap-1.5 shadow-sm"
                onClick={sendViaServer}
                disabled={!number.trim() || sendingDirect}
                title="Server direct WhatsApp par report aur PDF deliver karega"
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
