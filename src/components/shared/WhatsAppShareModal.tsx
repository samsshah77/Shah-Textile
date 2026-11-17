'use client'

import { useEffect, useState } from 'react'

type PdfAttachment = { base64: string; filename: string }

export interface WhatsAppShareModalProps {
  isOpen: boolean
  onClose: () => void
  documentTitle: string
  defaultMessage: string
  onDownloadPdf?: () => void
  /** When given, the PDF can go with the message (phone share sheet, or email). */
  getPdfAttachment?: () => Promise<PdfAttachment | null> | PdfAttachment | null
}

/** Pakistani number → WhatsApp format: 0300 1234567 → 923001234567. */
export function formatWhatsAppNumber(raw: string): string {
  const d = raw.replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('0092')) return `92${d.slice(4)}`
  if (d.startsWith('03') && d.length === 11) return `92${d.slice(1)}`
  if (d.length === 10 && d.startsWith('3')) return `92${d}`
  return d
}

// Recently used numbers / emails, on this device only — offered as suggestions.
const RECENT = { wa: 'sara_share_recent_wa_v2', waContacts: 'sara_share_wa_contacts_v1', email: 'sara_share_recent_email_v2' } as const
type WaContact = { name: string; number: string }

function loadWaContacts(): WaContact[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(RECENT.waContacts) || '[]')
    if (Array.isArray(raw) && raw.length > 0) {
      return raw
        .filter((x) => x && typeof x.number === 'string' && formatWhatsAppNumber(x.number).length >= 10)
        .map((x) => ({ name: String(x.name || '').trim(), number: String(x.number).trim() }))
        .slice(0, 20)
    }
    const legacy = JSON.parse(window.localStorage.getItem(RECENT.wa) || '[]')
    if (Array.isArray(legacy)) {
      return legacy
        .filter((x) => typeof x === 'string' && formatWhatsAppNumber(x).length >= 10)
        .map((n) => ({ name: '', number: n.trim() }))
        .slice(0, 20)
    }
    return []
  } catch {
    return []
  }
}

function saveWaContacts(list: WaContact[]) {
  try {
    window.localStorage.setItem(RECENT.waContacts, JSON.stringify(list.slice(0, 20)))
  } catch {
    /* storage blocked */
  }
}

function recent(kind: 'email'): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(RECENT[kind]) || '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 15) : []
  } catch {
    return []
  }
}
function remember(kind: 'email', value: string | string[]) {
  const incoming = (Array.isArray(value) ? value : [value])
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
  if (!incoming.length) return
  try {
    const merged = Array.from(new Set([...incoming, ...recent(kind).map((x) => x.toLowerCase())])).slice(0, 15)
    window.localStorage.setItem(RECENT[kind], JSON.stringify(merged))
  } catch {
    /* storage blocked */
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
function parseEmails(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

function pdfFile(att: PdfAttachment): File {
  const b64 = att.base64.includes(',') ? att.base64.split(',')[1] : att.base64
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new File([bytes], att.filename, { type: 'application/pdf' })
}

export function WhatsAppShareModal(props: WhatsAppShareModalProps) {
  if (!props.isOpen) return null
  return <ShareBody key={props.defaultMessage} {...props} />
}

function ShareBody({ onClose, documentTitle, defaultMessage, onDownloadPdf, getPdfAttachment }: WhatsAppShareModalProps) {
  const [tab, setTab] = useState<'whatsapp' | 'email'>('whatsapp')
  const [message, setMessage] = useState(defaultMessage)
  const [waName, setWaName] = useState('')
  const [number, setNumber] = useState('')
  const [selectedWa, setSelectedWa] = useState<string[]>([])
  const [savedWa, setSavedWa] = useState<WaContact[]>(() => loadWaContacts())
  const [emailInput, setEmailInput] = useState('')
  const [selectedEmails, setSelectedEmails] = useState<string[]>([])
  const [recentEmail, setRecentEmail] = useState(() => recent('email'))
  const [emailReady, setEmailReady] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  // Phones & Windows can hand the PDF (or text) straight to WhatsApp through the native share sheet.
  const [canShareFile] = useState(() => {
    try {
      const probe = new File([new Uint8Array(1)], 'x.pdf', { type: 'application/pdf' })
      return Boolean(getPdfAttachment && navigator.canShare?.({ files: [probe] }))
    } catch {
      return false
    }
  })
  const [canShareText] = useState(() => typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  const typedWa = formatWhatsAppNumber(number)
  const allWaNumbers = Array.from(new Set([...selectedWa, ...(typedWa.length >= 10 ? [typedWa] : [])]))
  const useNativeShare = canShareFile || (!getPdfAttachment && canShareText && allWaNumbers.length === 0)

  useEffect(() => {
    let live = true
    fetch('/api/email/send', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setEmailReady(Boolean(d?.configured)))
      .catch(() => live && setEmailReady(false))
    return () => {
      live = false
    }
  }, [])

  const allRecipients = Array.from(new Set([...selectedEmails, ...parseEmails(emailInput)]))

  const addTypedEmails = () => {
    const typed = parseEmails(emailInput)
    if (!typed.length) return
    const bad = typed.find((e) => !EMAIL_RE.test(e))
    if (bad) {
      setNote({ ok: false, text: `Enter a correct email: "${bad}"` })
      return
    }
    setNote(null)
    setSelectedEmails((prev) => Array.from(new Set([...prev, ...typed])))
    remember('email', typed)
    setRecentEmail(recent('email'))
    setEmailInput('')
  }

  const toggleSavedEmail = (addr: string) => {
    const clean = addr.trim().toLowerCase()
    setSelectedEmails((prev) =>
      prev.includes(clean) ? prev.filter((x) => x !== clean) : [...prev, clean]
    )
    setNote(null)
  }

  const removeSavedEmail = (addr: string) => {
    const clean = addr.trim().toLowerCase()
    const next = recentEmail.filter((x) => x.toLowerCase() !== clean)
    setRecentEmail(next)
    setSelectedEmails((prev) => prev.filter((x) => x !== clean))
    try {
      window.localStorage.setItem(RECENT.email, JSON.stringify(next))
    } catch {
      /* storage blocked */
    }
  }

  const addWaContact = () => {
    const formatted = formatWhatsAppNumber(number)
    if (formatted.length < 10) {
      setNote({ ok: false, text: 'Enter a correct WhatsApp number (e.g. 0300 1234567)' })
      return
    }
    setNote(null)
    const entry: WaContact = { name: waName.trim(), number: formatted }
    const next = [entry, ...savedWa.filter((c) => formatWhatsAppNumber(c.number) !== formatted)].slice(0, 20)
    setSavedWa(next)
    saveWaContacts(next)
    setSelectedWa((prev) => Array.from(new Set([...prev, formatted])))
    setWaName('')
    setNumber('')
  }

  const toggleSavedWa = (num: string) => {
    const clean = formatWhatsAppNumber(num)
    setSelectedWa((prev) => (prev.includes(clean) ? prev.filter((x) => x !== clean) : [...prev, clean]))
    setNote(null)
  }

  const removeSavedWa = (num: string) => {
    const clean = formatWhatsAppNumber(num)
    const next = savedWa.filter((c) => formatWhatsAppNumber(c.number) !== clean)
    setSavedWa(next)
    saveWaContacts(next)
    setSelectedWa((prev) => prev.filter((x) => x !== clean))
  }

  const waLabel = (num: string) => {
    const found = savedWa.find((c) => formatWhatsAppNumber(c.number) === num)
    return found?.name ? `${found.name} (${num})` : num
  }

  const waLinkFor = (num: string) => `https://wa.me/${num}?text=${encodeURIComponent(message)}`
  const waLink = `https://wa.me/${allWaNumbers[0] || ''}?text=${encodeURIComponent(message)}`
  const subject = `${documentTitle} — Sara Textile`
  const mailto = `mailto:${allRecipients.map(encodeURIComponent).join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`

  const shareNative = async () => {
    setBusy(true)
    setNote(null)
    try {
      if (getPdfAttachment && canShareFile) {
        const att = await Promise.resolve(getPdfAttachment())
        if (!att) throw new Error('Could not make the PDF')
        await navigator.share({ files: [pdfFile(att)], text: message, title: documentTitle })
      } else {
        await navigator.share({ text: message, title: documentTitle })
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setNote({ ok: false, text: e instanceof Error ? e.message : 'Could not share' })
    } finally {
      setBusy(false)
    }
  }

  const sendEmail = async () => {
    const recipients = allRecipients
    if (recipients.length === 0) {
      setNote({ ok: false, text: 'Enter or select at least one email' })
      return
    }
    const invalid = recipients.find((e) => !EMAIL_RE.test(e))
    if (invalid) {
      setNote({ ok: false, text: `Enter a correct email: "${invalid}"` })
      return
    }
    setBusy(true)
    setNote(null)
    try {
      const att = getPdfAttachment ? await Promise.resolve(getPdfAttachment()) : null
      if (getPdfAttachment && !att) throw new Error('Could not make the PDF — please try again')
      const cleanBase64 = att?.base64 ? (att.base64.includes(',') ? att.base64.split(',')[1] : att.base64) : undefined
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ to: recipients, subject, text: message, fileBase64: cleanBase64, filename: att?.filename }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || `Email not sent (${res.status})`)
      remember('email', recipients)
      setRecentEmail(recent('email'))
      setSelectedEmails(recipients)
      setEmailInput('')
      const label = recipients.length === 1 ? recipients[0] : `${recipients.length} emails (${recipients.join(', ')})`
      setNote({ ok: true, text: `Email sent to ${label}${att ? ' (with PDF)' : ''}.` })
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : 'Email not sent' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="modal fade show d-block d-print-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-title"
      style={{ background: 'rgba(15,23,42,.45)', zIndex: 1050 }}
      onClick={onClose}
    >
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-content border-0 shadow">
          <div className="modal-header py-2">
            <h5 id="share-title" className="modal-title fs-6 fw-semibold">
              {documentTitle}
            </h5>
            <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
          </div>

          <div className="modal-body">
            <div className="btn-group btn-group-sm w-100 mb-3" role="group" aria-label="Where to send">
              <button type="button" className={`btn ${tab === 'whatsapp' ? 'btn-success' : 'btn-outline-success'}`} onClick={() => { setTab('whatsapp'); setNote(null) }}>
                <i className="bi bi-whatsapp me-1" />
                WhatsApp
              </button>
              <button type="button" className={`btn ${tab === 'email' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => { setTab('email'); setNote(null) }}>
                <i className="bi bi-envelope me-1" />
                Email
              </button>
            </div>

            {tab === 'whatsapp' ? (
              canShareFile ? null : (
              <>
                <div className="d-flex align-items-center justify-content-between mb-1">
                  <label className="form-label small mb-0" htmlFor="share-number">
                    Contacts / Numbers <span className="text-secondary">(select / add one or more)</span>
                  </label>
                  {allWaNumbers.length > 0 && (
                    <span className="badge bg-success-subtle text-success-emphasis border border-success-subtle">
                      {allWaNumbers.length} selected
                    </span>
                  )}
                </div>

                <div className="input-group input-group-sm mb-2">
                  <input
                    type="text"
                    className="form-control"
                    style={{ maxWidth: 140 }}
                    placeholder="Name (optional)"
                    value={waName}
                    onChange={(e) => setWaName(e.target.value)}
                  />
                  <input
                    id="share-number"
                    className="form-control"
                    inputMode="tel"
                    placeholder="0300 1234567"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addWaContact()
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-outline-success"
                    onClick={addWaContact}
                    disabled={!number.trim()}
                    title="Save to list"
                  >
                    + Add
                  </button>
                </div>

                {allWaNumbers.length > 0 && (
                  <div className="d-flex flex-wrap gap-1 mb-2">
                    {allWaNumbers.map((num) => (
                      <span
                        key={num}
                        className="badge bg-success d-inline-flex align-items-center gap-1 fw-normal py-1 px-2"
                        style={{ fontSize: 11.5 }}
                      >
                        {waLabel(num)}
                        <button
                          type="button"
                          className="btn-close btn-close-white"
                          style={{ fontSize: 8 }}
                          aria-label={`Remove ${num}`}
                          onClick={() => (selectedWa.includes(num) ? toggleSavedWa(num) : setNumber(''))}
                        />
                      </span>
                    ))}
                  </div>
                )}

                {savedWa.length > 0 && (
                  <div className="mb-3">
                    <div className="d-flex align-items-center justify-content-between mb-1">
                      <span className="text-secondary" style={{ fontSize: 11.5 }}>
                        Saved contacts (click to select):
                      </span>
                      {savedWa.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-link btn-sm p-0 text-decoration-none"
                          style={{ fontSize: 11.5 }}
                          onClick={() => {
                            const allNums = savedWa.map((c) => formatWhatsAppNumber(c.number))
                            const allSel = allNums.every((n) => selectedWa.includes(n))
                            setSelectedWa(allSel ? [] : allNums)
                          }}
                        >
                          {savedWa.every((c) => selectedWa.includes(formatWhatsAppNumber(c.number))) ? 'Unselect all' : 'Select all'}
                        </button>
                      )}
                    </div>
                    <div className="d-flex flex-wrap gap-1">
                      {savedWa.map((c) => {
                        const num = formatWhatsAppNumber(c.number)
                        const active = selectedWa.includes(num)
                        return (
                          <div key={num} className="btn-group btn-group-sm" role="group">
                            <button
                              type="button"
                              className={`btn btn-sm py-0 px-2 ${active ? 'btn-success' : 'btn-outline-secondary'}`}
                              style={{ fontSize: 11.5 }}
                              onClick={() => toggleSavedWa(num)}
                            >
                              {active ? '✓ ' : '+ '}
                              {c.name ? `${c.name} (${c.number})` : c.number}
                            </button>
                            <button
                              type="button"
                              className={`btn btn-sm py-0 px-1 ${active ? 'btn-success' : 'btn-outline-secondary'}`}
                              style={{ fontSize: 10 }}
                              title="Remove from saved list"
                              onClick={() => removeSavedWa(num)}
                            >
                              ×
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
              )
            ) : (
              <>
                <div className="d-flex align-items-center justify-content-between mb-1">
                  <label className="form-label small mb-0" htmlFor="share-email">
                    Emails <span className="text-secondary">(select / add one or more)</span>
                  </label>
                  {allRecipients.length > 0 && (
                    <span className="badge bg-primary-subtle text-primary-emphasis border border-primary-subtle">
                      {allRecipients.length} selected
                    </span>
                  )}
                </div>

                <div className="input-group input-group-sm mb-2">
                  <input
                    id="share-email"
                    type="text"
                    className="form-control"
                    placeholder="name@gmail.com (add with comma or Enter)"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault()
                        addTypedEmails()
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-outline-primary"
                    onClick={addTypedEmails}
                    disabled={!emailInput.trim()}
                    title="Add to list"
                  >
                    + Add
                  </button>
                </div>

                {selectedEmails.length > 0 && (
                  <div className="d-flex flex-wrap gap-1 mb-2">
                    {selectedEmails.map((addr) => (
                      <span
                        key={addr}
                        className="badge bg-primary d-inline-flex align-items-center gap-1 fw-normal py-1 px-2"
                        style={{ fontSize: 11.5 }}
                      >
                        {addr}
                        <button
                          type="button"
                          className="btn-close btn-close-white"
                          style={{ fontSize: 8 }}
                          aria-label={`Remove ${addr}`}
                          onClick={() => toggleSavedEmail(addr)}
                        />
                      </span>
                    ))}
                  </div>
                )}

                {recentEmail.length > 0 && (
                  <div className="mb-3">
                    <div className="d-flex align-items-center justify-content-between mb-1">
                      <span className="text-secondary" style={{ fontSize: 11.5 }}>
                        Saved emails (click to select):
                      </span>
                      {recentEmail.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-link btn-sm p-0 text-decoration-none"
                          style={{ fontSize: 11.5 }}
                          onClick={() => {
                            const allSelected = recentEmail.every((e) => selectedEmails.includes(e.toLowerCase()))
                            setSelectedEmails(allSelected ? [] : recentEmail.map((e) => e.toLowerCase()))
                          }}
                        >
                          {recentEmail.every((e) => selectedEmails.includes(e.toLowerCase())) ? 'Unselect all' : 'Select all'}
                        </button>
                      )}
                    </div>
                    <div className="d-flex flex-wrap gap-1">
                      {recentEmail.map((addr) => {
                        const active = selectedEmails.includes(addr.toLowerCase())
                        return (
                          <div key={addr} className="btn-group btn-group-sm" role="group">
                            <button
                              type="button"
                              className={`btn btn-sm py-0 px-2 ${active ? 'btn-primary' : 'btn-outline-secondary'}`}
                              style={{ fontSize: 11.5 }}
                              onClick={() => toggleSavedEmail(addr)}
                            >
                              {active ? '✓ ' : '+ '}
                              {addr}
                            </button>
                            <button
                              type="button"
                              className={`btn btn-sm py-0 px-1 ${active ? 'btn-primary' : 'btn-outline-secondary'}`}
                              style={{ fontSize: 10 }}
                              title="Remove from saved list"
                              onClick={() => removeSavedEmail(addr)}
                            >
                              ×
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            <label className="form-label small mb-1" htmlFor="share-message">
              Message
            </label>
            <textarea id="share-message" className="form-control form-control-sm" rows={6} style={{ fontSize: 12.5 }} value={message} onChange={(e) => setMessage(e.target.value)} />

            {tab === 'whatsapp' && !canShareFile && getPdfAttachment && (
              <p className="small text-secondary mt-2 mb-0">For a PDF: first &quot;PDF save&quot;, then attach it in the WhatsApp chat with 📎.</p>
            )}
            {tab === 'email' && emailReady === false && (
              <p className="small text-secondary mt-2 mb-0">Server email is not set up yet — send with &quot;Open email app&quot;{getPdfAttachment ? ' (attach the PDF yourself)' : ''}.</p>
            )}
            {note && <div className={`alert py-2 small mt-2 mb-0 ${note.ok ? 'alert-success' : 'alert-danger'}`}>{note.text}</div>}
          </div>

          <div className="modal-footer py-2 gap-2">
            {onDownloadPdf && (
              <button type="button" className="btn btn-sm btn-outline-secondary me-auto" onClick={onDownloadPdf} disabled={busy}>
                <i className="bi bi-file-earmark-pdf me-1" />
                PDF save
              </button>
            )}
            {tab === 'whatsapp' ? (
              useNativeShare ? (
                <button type="button" className="btn btn-sm btn-success" onClick={() => void shareNative()} disabled={busy}>
                  <i className="bi bi-share me-1" />
                  {busy ? 'Making PDF…' : canShareFile ? 'Send PDF on WhatsApp' : 'Send on WhatsApp'}
                </button>
              ) : allWaNumbers.length > 1 ? (
                <button
                  type="button"
                  className="btn btn-sm btn-success"
                  onClick={() => {
                    for (const num of allWaNumbers) {
                      window.open(waLinkFor(num), '_blank', 'noopener,noreferrer')
                    }
                  }}
                >
                  <i className="bi bi-whatsapp me-1" />
                  WhatsApp kholein ({allWaNumbers.length})
                </button>
              ) : (
                <a className="btn btn-sm btn-success" href={waLink} target="_blank" rel="noopener noreferrer">
                  <i className="bi bi-whatsapp me-1" />
                  Open WhatsApp
                </a>
              )
            ) : emailReady ? (
              <button type="button" className="btn btn-sm btn-primary" onClick={() => void sendEmail()} disabled={busy || allRecipients.length === 0}>
                <i className="bi bi-send me-1" />
                {busy
                  ? 'Sending…'
                  : `${getPdfAttachment ? 'Send email (with PDF)' : 'Send email'}${allRecipients.length > 1 ? ` (${allRecipients.length})` : ''}`}
              </button>
            ) : (
              <a
                className={`btn btn-sm btn-primary ${allRecipients.length === 0 ? 'disabled' : ''}`}
                href={mailto}
                onClick={() => remember('email', allRecipients)}
              >
                <i className="bi bi-envelope-open me-1" />
                Open email app{allRecipients.length > 1 ? ` (${allRecipients.length})` : ''}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
