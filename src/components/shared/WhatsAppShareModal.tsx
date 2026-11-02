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
const RECENT = { wa: 'sara_share_recent_wa_v2', email: 'sara_share_recent_email_v2' } as const
function recent(kind: keyof typeof RECENT): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(RECENT[kind]) || '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 10) : []
  } catch {
    return []
  }
}
function remember(kind: keyof typeof RECENT, value: string) {
  const v = value.trim()
  if (!v) return
  try {
    window.localStorage.setItem(RECENT[kind], JSON.stringify([v, ...recent(kind).filter((x) => x !== v)].slice(0, 10)))
  } catch {
    /* storage blocked */
  }
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
  const [number, setNumber] = useState('')
  const [email, setEmail] = useState('')
  const [recentWa] = useState(() => recent('wa'))
  const [recentEmail] = useState(() => recent('email'))
  const [emailReady, setEmailReady] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  // Phones (Android / iPhone) can hand the PDF straight to WhatsApp through the share sheet.
  const [canShareFile] = useState(() => {
    try {
      const probe = new File([new Uint8Array(1)], 'x.pdf', { type: 'application/pdf' })
      return Boolean(getPdfAttachment && navigator.canShare?.({ files: [probe] }))
    } catch {
      return false
    }
  })

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

  const waNumber = formatWhatsAppNumber(number)
  const waLink = `https://wa.me/${waNumber.length >= 10 ? waNumber : ''}?text=${encodeURIComponent(message)}`
  const subject = `${documentTitle} — Shah Textile`
  const mailto = `mailto:${encodeURIComponent(email.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`

  const shareWithPdf = async () => {
    if (!getPdfAttachment) return
    setBusy(true)
    setNote(null)
    try {
      const att = await Promise.resolve(getPdfAttachment())
      if (!att) throw new Error('PDF ban nahi saki')
      await navigator.share({ files: [pdfFile(att)], text: message, title: documentTitle })
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setNote({ ok: false, text: e instanceof Error ? e.message : 'Share nahi ho saka' })
    } finally {
      setBusy(false)
    }
  }

  const sendEmail = async () => {
    const to = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      setNote({ ok: false, text: 'Sahi email likhein (misaal: name@gmail.com)' })
      return
    }
    setBusy(true)
    setNote(null)
    try {
      const att = getPdfAttachment ? await Promise.resolve(getPdfAttachment()) : null
      if (getPdfAttachment && !att) throw new Error('PDF ban nahi saki — dobara koshish karein')
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ to, subject, text: message, fileBase64: att?.base64, filename: att?.filename }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || `Email nahi gayi (${res.status})`)
      remember('email', to)
      setNote({ ok: true, text: `Email ${to} ko chali gayi${att ? ' (PDF ke sath)' : ''}.` })
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : 'Email nahi gayi' })
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
            <button type="button" className="btn-close" aria-label="Band karein" onClick={onClose} />
          </div>

          <div className="modal-body">
            <div className="btn-group btn-group-sm w-100 mb-3" role="group" aria-label="Kahan bhejna hai">
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
              <>
                <label className="form-label small mb-1" htmlFor="share-number">
                  Number <span className="text-secondary">(khali chhoren to WhatsApp mein khud chunein)</span>
                </label>
                <input id="share-number" className="form-control form-control-sm mb-3" inputMode="tel" placeholder="0300 1234567" list="share-recent-wa" value={number} onChange={(e) => setNumber(e.target.value)} />
                <datalist id="share-recent-wa">
                  {recentWa.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </>
            ) : (
              <>
                <label className="form-label small mb-1" htmlFor="share-email">
                  Email
                </label>
                <input id="share-email" type="email" className="form-control form-control-sm mb-3" placeholder="name@gmail.com" list="share-recent-email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <datalist id="share-recent-email">
                  {recentEmail.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </>
            )}

            <label className="form-label small mb-1" htmlFor="share-message">
              Message
            </label>
            <textarea id="share-message" className="form-control form-control-sm" rows={6} style={{ fontSize: 12.5 }} value={message} onChange={(e) => setMessage(e.target.value)} />

            {tab === 'whatsapp' && !canShareFile && getPdfAttachment && (
              <p className="small text-secondary mt-2 mb-0">PDF ke liye: pehle &quot;PDF save&quot;, phir WhatsApp chat mein 📎 se lagayein.</p>
            )}
            {tab === 'email' && emailReady === false && (
              <p className="small text-secondary mt-2 mb-0">Server se email abhi set nahi — &quot;Email app kholein&quot; se bhejein{getPdfAttachment ? ' (PDF khud lagayein)' : ''}.</p>
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
              canShareFile ? (
                <button type="button" className="btn btn-sm btn-success" onClick={() => void shareWithPdf()} disabled={busy}>
                  <i className="bi bi-share me-1" />
                  {busy ? 'PDF ban rahi hai…' : 'WhatsApp par PDF bhejein'}
                </button>
              ) : (
                <a className="btn btn-sm btn-success" href={waLink} target="_blank" rel="noopener noreferrer" onClick={() => remember('wa', number)}>
                  <i className="bi bi-whatsapp me-1" />
                  WhatsApp kholein
                </a>
              )
            ) : emailReady ? (
              <button type="button" className="btn btn-sm btn-primary" onClick={() => void sendEmail()} disabled={busy || !email.trim()}>
                <i className="bi bi-send me-1" />
                {busy ? 'Bhej raha hai…' : getPdfAttachment ? 'Email bhejein (PDF ke sath)' : 'Email bhejein'}
              </button>
            ) : (
              <a className="btn btn-sm btn-primary" href={mailto} onClick={() => remember('email', email)}>
                <i className="bi bi-envelope-open me-1" />
                Email app kholein
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
