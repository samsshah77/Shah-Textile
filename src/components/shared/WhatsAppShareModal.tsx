'use client'

import { useState } from 'react'

export interface SavedContact {
  name: string
  number: string
}

export interface SavedEmailContact {
  name: string
  email: string
}

const WA_CONTACTS_KEY = 'sara_whatsapp_contacts_v1'
const EMAIL_CONTACTS_KEY = 'sara_email_contacts_v1'

function getSavedWaContacts(): SavedContact[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(WA_CONTACTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persistWaContacts(list: SavedContact[]) {
  try {
    window.localStorage.setItem(WA_CONTACTS_KEY, JSON.stringify(list))
  } catch {
    /* localStorage blocked */
  }
}

function getSavedEmailContacts(): SavedEmailContact[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(EMAIL_CONTACTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persistEmailContacts(list: SavedEmailContact[]) {
  try {
    window.localStorage.setItem(EMAIL_CONTACTS_KEY, JSON.stringify(list))
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
  onDownloadPdf,
  getPdfAttachment,
}: Omit<WhatsAppShareModalProps, 'isOpen'>) {
  // Tabs: 'whatsapp' or 'email'
  const [activeTab, setActiveTab] = useState<'whatsapp' | 'email'>('whatsapp')

  // WhatsApp states
  const [waContacts, setWaContacts] = useState<SavedContact[]>(() => getSavedWaContacts())
  const [selectedWaIdx, setSelectedWaIdx] = useState<string>(() => (waContacts.length ? '0' : ''))
  const [number, setNumber] = useState(() => waContacts[0]?.number || '')
  const [message, setMessage] = useState(defaultMessage)
  const [showSaveWaContact, setShowSaveWaContact] = useState(false)
  const [newWaContactName, setNewWaContactName] = useState('')
  const [copied, setCopied] = useState(false)

  // Email states
  const [emailContacts, setEmailContacts] = useState<SavedEmailContact[]>(() => getSavedEmailContacts())
  const [selectedEmailIdx, setSelectedEmailIdx] = useState<string>(() => (emailContacts.length ? '0' : ''))
  const [emailAddress, setEmailAddress] = useState(() => emailContacts[0]?.email || '')
  const [emailSubject, setEmailSubject] = useState(() => `${documentTitle} — Sara Textile`)
  const [emailBody, setEmailBody] = useState(defaultMessage)
  const [showSaveEmailContact, setShowSaveEmailContact] = useState(false)
  const [newEmailContactName, setNewEmailContactName] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailSuccess, setEmailSuccess] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)

  // WhatsApp contact select
  const handleSelectWaContact = (val: string) => {
    setSelectedWaIdx(val)
    if (val === '') {
      setNumber('')
    } else {
      const idx = parseInt(val, 10)
      if (!isNaN(idx) && waContacts[idx]) {
        setNumber(waContacts[idx].number)
      }
    }
    setShowSaveWaContact(false)
  }

  // Save WhatsApp contact
  const handleSaveWaContact = () => {
    const trimmedName = newWaContactName.trim()
    const trimmedNum = number.trim()
    if (!trimmedName || !trimmedNum) return

    const updated = [{ name: trimmedName, number: trimmedNum }, ...waContacts.filter((c) => c.number !== trimmedNum)]
    persistWaContacts(updated)
    setWaContacts(updated)
    setSelectedWaIdx('0')
    setNewWaContactName('')
    setShowSaveWaContact(false)
  }

  // Delete WhatsApp contact
  const handleDeleteWaContact = () => {
    const idx = parseInt(selectedWaIdx, 10)
    if (isNaN(idx) || !waContacts[idx]) return
    const contactToDelete = waContacts[idx]
    const updated = waContacts.filter((_, i) => i !== idx)
    persistWaContacts(updated)
    setWaContacts(updated)
    setSelectedWaIdx('')
    if (number === contactToDelete.number) {
      setNumber('')
    }
  }

  // Email contact select
  const handleSelectEmailContact = (val: string) => {
    setSelectedEmailIdx(val)
    if (val === '') {
      setEmailAddress('')
    } else {
      const idx = parseInt(val, 10)
      if (!isNaN(idx) && emailContacts[idx]) {
        setEmailAddress(emailContacts[idx].email)
      }
    }
    setShowSaveEmailContact(false)
  }

  // Save Email contact
  const handleSaveEmailContact = () => {
    const trimmedName = newEmailContactName.trim()
    const trimmedEmail = emailAddress.trim().toLowerCase()
    if (!trimmedName || !trimmedEmail) return

    const updated = [{ name: trimmedName, email: trimmedEmail }, ...emailContacts.filter((c) => c.email !== trimmedEmail)]
    persistEmailContacts(updated)
    setEmailContacts(updated)
    setSelectedEmailIdx('0')
    setNewEmailContactName('')
    setShowSaveEmailContact(false)
  }

  // Delete Email contact
  const handleDeleteEmailContact = () => {
    const idx = parseInt(selectedEmailIdx, 10)
    if (isNaN(idx) || !emailContacts[idx]) return
    const contactToDelete = emailContacts[idx]
    const updated = emailContacts.filter((_, i) => i !== idx)
    persistEmailContacts(updated)
    setEmailContacts(updated)
    setSelectedEmailIdx('')
    if (emailAddress === contactToDelete.email) {
      setEmailAddress('')
    }
  }

  // Copy message
  const handleCopy = () => {
    navigator.clipboard.writeText(message)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Send Email via Server (Free SMTP)
  const handleSendEmail = async () => {
    const trimmedEmail = emailAddress.trim()
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setEmailError('Pehle valid recipient email address darj karein.')
      return
    }

    setSendingEmail(true)
    setEmailError(null)
    setEmailSuccess(false)

    try {
      const autoPdf = getPdfAttachment ? await Promise.resolve(getPdfAttachment()) : null
      const sendFilename = autoPdf?.filename || `${documentTitle.replace(/\s+/g, '_')}.pdf`

      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          to: trimmedEmail,
          subject: emailSubject.trim() || documentTitle,
          text: emailBody.trim(),
          fileBase64: autoPdf?.base64,
          filename: sendFilename,
        }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || `Server error (${res.status})`)
      }

      setEmailSuccess(true)
      setTimeout(() => {
        onClose()
      }, 2000)
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Email bheji nahi ja saki.')
    } finally {
      setSendingEmail(false)
    }
  }

  // WhatsApp Web link
  const cleanCurrentNum = formatWhatsAppNumber(number)
  const waLink = `https://wa.me/${cleanCurrentNum}?text=${encodeURIComponent(message)}`
  const isWaAlreadySaved = waContacts.some(
    (c) => formatWhatsAppNumber(c.number) === cleanCurrentNum && cleanCurrentNum.length >= 10
  )

  // Email mailto fallback link
  const mailtoLink = `mailto:${encodeURIComponent(emailAddress.trim())}?subject=${encodeURIComponent(
    emailSubject
  )}&body=${encodeURIComponent(emailBody)}`
  const isEmailAlreadySaved = emailContacts.some(
    (c) => c.email.toLowerCase() === emailAddress.trim().toLowerCase()
  )

  return (
    <div
      className="modal fade show d-block d-print-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-title"
      style={{ background: 'rgba(15,23,42,.45)', zIndex: 1050 }}
      onClick={onClose}
    >
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-content border-0 shadow-lg rounded-3">
          {/* Modal Header with Tabs */}
          <div className="modal-header py-2.5 px-3 bg-light border-bottom d-flex align-items-center justify-content-between">
            <div className="d-flex align-items-center gap-2">
              <h5 id="share-title" className="modal-title fs-6 fw-bold mb-0 text-dark">
                Report Share — {documentTitle}
              </h5>
            </div>
            <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
          </div>

          {/* Navigation Tabs */}
          <div className="px-3 pt-2 bg-light border-bottom">
            <ul className="nav nav-tabs card-header-tabs" role="tablist">
              <li className="nav-item">
                <button
                  type="button"
                  className={`nav-link py-1.5 px-3 fw-bold small ${activeTab === 'whatsapp' ? 'active text-success' : 'text-secondary'}`}
                  onClick={() => setActiveTab('whatsapp')}
                >
                  <i className="bi bi-whatsapp me-1.5" /> WhatsApp (Direct)
                </button>
              </li>
              <li className="nav-item">
                <button
                  type="button"
                  className={`nav-link py-1.5 px-3 fw-bold small ${activeTab === 'email' ? 'active text-primary' : 'text-secondary'}`}
                  onClick={() => setActiveTab('email')}
                >
                  <i className="bi bi-envelope-at me-1.5" /> Email (100% Free)
                </button>
              </li>
            </ul>
          </div>

          {/* Modal Body */}
          <div className="modal-body px-3.5 py-3">
            {/* WHATSAPP TAB */}
            {activeTab === 'whatsapp' && (
              <div>
                {/* Safe WhatsApp notice banner */}
                <div
                  className="p-2 mb-3 rounded-2 border d-flex align-items-center gap-2"
                  style={{ background: 'rgba(25, 135, 84, 0.08)', borderColor: 'rgba(25, 135, 84, 0.25)' }}
                >
                  <i className="bi bi-shield-check text-success fs-5" />
                  <div>
                    <div className="small fw-bold text-dark" style={{ fontSize: 12 }}>
                      Official WhatsApp Web / Mobile Sharing
                    </div>
                    <div className="text-secondary" style={{ fontSize: 10.5 }}>
                      100% Mehfooz Tareeqa — is mein number ban hone ka bilkul koi khatra nahi hai.
                    </div>
                  </div>
                </div>

                {/* Saved Contacts & Number Input */}
                <div className="mb-3">
                  <div className="d-flex align-items-center justify-content-between mb-1">
                    <label className="form-label small fw-semibold mb-0" htmlFor="wa-number">
                      Recipient (WhatsApp Number):
                    </label>
                    {waContacts.length > 0 && selectedWaIdx !== '' && (
                      <button
                        type="button"
                        className="btn btn-link text-danger p-0 text-decoration-none small"
                        style={{ fontSize: 11 }}
                        onClick={handleDeleteWaContact}
                        title="Is contact ko list se hatayein"
                      >
                        <i className="bi bi-trash3 me-0.5" /> Contact Hatayein
                      </button>
                    )}
                  </div>

                  {waContacts.length > 0 && (
                    <select
                      className="form-select form-select-sm mb-2"
                      value={selectedWaIdx}
                      onChange={(e) => handleSelectWaContact(e.target.value)}
                    >
                      <option value="">-- Naya Number Likhein --</option>
                      {waContacts.map((c, i) => (
                        <option key={`${c.number}-${i}`} value={String(i)}>
                          {c.name} ({c.number})
                        </option>
                      ))}
                    </select>
                  )}

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
                        setSelectedWaIdx('')
                      }}
                    />
                  </div>

                  {number.trim().length >= 10 && !isWaAlreadySaved && (
                    <div className="mt-1.5">
                      {!showSaveWaContact ? (
                        <button
                          type="button"
                          className="btn btn-link text-primary p-0 text-decoration-none small"
                          style={{ fontSize: 11.5 }}
                          onClick={() => setShowSaveWaContact(true)}
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
                            value={newWaContactName}
                            onChange={(e) => setNewWaContactName(e.target.value)}
                            autoFocus
                          />
                          <button
                            type="button"
                            className="btn btn-sm btn-primary py-1 px-2.5 shrink-0"
                            onClick={handleSaveWaContact}
                            disabled={!newWaContactName.trim()}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary py-1 px-2 shrink-0"
                            onClick={() => {
                              setShowSaveWaContact(false)
                              setNewWaContactName('')
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
                  <div className="d-flex align-items-center justify-content-between mb-1">
                    <label className="form-label small fw-semibold mb-0" htmlFor="wa-message">
                      Report Message:
                    </label>
                    <button
                      type="button"
                      className="btn btn-link p-0 text-decoration-none text-secondary small"
                      style={{ fontSize: 11 }}
                      onClick={handleCopy}
                    >
                      <i className={`bi ${copied ? 'bi-check2 text-success' : 'bi-clipboard'}`} />{' '}
                      {copied ? 'Copied!' : 'Copy Text'}
                    </button>
                  </div>
                  <textarea
                    id="wa-message"
                    className="form-control form-control-sm font-monospace"
                    rows={5}
                    style={{ fontSize: 12 }}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* EMAIL TAB */}
            {activeTab === 'email' && (
              <div>
                {/* Free Email notice banner */}
                <div
                  className="p-2 mb-3 rounded-2 border d-flex align-items-center gap-2"
                  style={{ background: 'rgba(13, 110, 253, 0.08)', borderColor: 'rgba(13, 110, 253, 0.25)' }}
                >
                  <i className="bi bi-gift-fill text-primary fs-5" />
                  <div>
                    <div className="small fw-bold text-dark" style={{ fontSize: 12 }}>
                      100% Free Email Delivery (Zero Subscription)
                    </div>
                    <div className="text-secondary" style={{ fontSize: 10.5 }}>
                      Direct email pe report aur PDF send karein bina kisi extra fees ke.
                    </div>
                  </div>
                </div>

                {emailSuccess && (
                  <div className="alert alert-success d-flex align-items-center gap-2 py-2 px-3 mb-3 small">
                    <i className="bi bi-check-circle-fill fs-5" />
                    <div>
                      <strong>Kamyabi!</strong> Email PDF attachment ke sath deliver ho gayi hai.
                    </div>
                  </div>
                )}

                {emailError && (
                  <div className="alert alert-warning py-2 px-3 mb-3 small">
                    <div className="d-flex align-items-center gap-2 mb-1">
                      <i className="bi bi-exclamation-triangle-fill text-warning fs-6" />
                      <strong>Notice:</strong> {emailError}
                    </div>
                    <div className="mt-1 d-flex align-items-center gap-2">
                      <a href={mailtoLink} className="btn btn-xs btn-outline-primary py-0.5 px-2" style={{ fontSize: 11 }}>
                        <i className="bi bi-box-arrow-up-right me-1" /> Apne Gmail / Outlook mein kholein
                      </a>
                    </div>
                  </div>
                )}

                {/* Saved Email Contacts & Input */}
                <div className="mb-3">
                  <div className="d-flex align-items-center justify-content-between mb-1">
                    <label className="form-label small fw-semibold mb-0" htmlFor="email-to">
                      Recipient Email Address:
                    </label>
                    {emailContacts.length > 0 && selectedEmailIdx !== '' && (
                      <button
                        type="button"
                        className="btn btn-link text-danger p-0 text-decoration-none small"
                        style={{ fontSize: 11 }}
                        onClick={handleDeleteEmailContact}
                        title="Is contact ko list se hatayein"
                      >
                        <i className="bi bi-trash3 me-0.5" /> Email Hatayein
                      </button>
                    )}
                  </div>

                  {emailContacts.length > 0 && (
                    <select
                      className="form-select form-select-sm mb-2"
                      value={selectedEmailIdx}
                      onChange={(e) => handleSelectEmailContact(e.target.value)}
                    >
                      <option value="">-- Naya Email Address Likhein --</option>
                      {emailContacts.map((c, i) => (
                        <option key={`${c.email}-${i}`} value={String(i)}>
                          {c.name} ({c.email})
                        </option>
                      ))}
                    </select>
                  )}

                  <div className="input-group input-group-sm">
                    <span className="input-group-text bg-light text-primary">
                      <i className="bi bi-envelope" />
                    </span>
                    <input
                      id="email-to"
                      type="email"
                      className="form-control"
                      placeholder="e.g. director@company.com"
                      value={emailAddress}
                      onChange={(e) => {
                        setEmailAddress(e.target.value)
                        setSelectedEmailIdx('')
                      }}
                    />
                  </div>

                  {emailAddress.includes('@') && emailAddress.includes('.') && !isEmailAlreadySaved && (
                    <div className="mt-1.5">
                      {!showSaveEmailContact ? (
                        <button
                          type="button"
                          className="btn btn-link text-primary p-0 text-decoration-none small"
                          style={{ fontSize: 11.5 }}
                          onClick={() => setShowSaveEmailContact(true)}
                        >
                          <i className="bi bi-person-plus me-1" />
                          Is email ko naam ke sath save karein
                        </button>
                      ) : (
                        <div className="d-flex align-items-center gap-1.5 p-1.5 bg-light rounded border mt-1">
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            placeholder="Naam (e.g. Accounts Manager)"
                            value={newEmailContactName}
                            onChange={(e) => setNewEmailContactName(e.target.value)}
                            autoFocus
                          />
                          <button
                            type="button"
                            className="btn btn-sm btn-primary py-1 px-2.5 shrink-0"
                            onClick={handleSaveEmailContact}
                            disabled={!newEmailContactName.trim()}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary py-1 px-2 shrink-0"
                            onClick={() => {
                              setShowSaveEmailContact(false)
                              setNewEmailContactName('')
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Email Subject */}
                <div className="mb-2">
                  <label className="form-label small fw-semibold mb-1" htmlFor="email-subject">
                    Subject:
                  </label>
                  <input
                    id="email-subject"
                    className="form-control form-control-sm"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                  />
                </div>

                {/* Email Body */}
                <div className="mb-1">
                  <label className="form-label small fw-semibold mb-1" htmlFor="email-body">
                    Email Content:
                  </label>
                  <textarea
                    id="email-body"
                    className="form-control form-control-sm font-monospace"
                    rows={4}
                    style={{ fontSize: 12 }}
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                  />
                </div>

                {/* PDF Attached indicator */}
                <div className="mt-2 text-secondary small d-flex align-items-center gap-1.5">
                  <i className="bi bi-paperclip text-primary fs-6" />
                  <span>
                    Report PDF attachment khud ba khud email ke sath attach ho kar send hogi.
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="modal-footer py-2 px-3.5 bg-light border-top d-flex justify-content-between align-items-center">
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose} disabled={sendingEmail}>
              Cancel
            </button>

            <div className="d-flex align-items-center gap-2">
              {onDownloadPdf && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1.5"
                  onClick={onDownloadPdf}
                  disabled={sendingEmail}
                  title="PDF apne computer par download karein"
                >
                  <i className="bi bi-file-earmark-pdf" />
                  <span>PDF Save Karein</span>
                </button>
              )}

              {activeTab === 'whatsapp' ? (
                <a
                  className="btn btn-sm btn-success px-3.5 d-inline-flex align-items-center gap-1.5 shadow-sm"
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="WhatsApp Web ya App mein message open karein"
                >
                  <i className="bi bi-whatsapp" />
                  <span>WhatsApp Kholein</span>
                </a>
              ) : (
                <div className="d-flex align-items-center gap-1.5">
                  <a
                    className="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-1"
                    href={mailtoLink}
                    title="Apne system ke email client (Gmail / Outlook) se bhejein"
                  >
                    <i className="bi bi-box-arrow-up-right" />
                    <span>Email App Kholein</span>
                  </a>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary px-3 d-inline-flex align-items-center gap-1.5 shadow-sm"
                    onClick={handleSendEmail}
                    disabled={!emailAddress.trim() || sendingEmail}
                  >
                    {sendingEmail ? (
                      <>
                        <span className="spinner-border spinner-border-sm" role="status" />
                        Bhej raha hai…
                      </>
                    ) : (
                      <>
                        <i className="bi bi-send-fill" />
                        Email Bhejein
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
