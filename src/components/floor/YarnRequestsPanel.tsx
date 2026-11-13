'use client'

import Link from 'next/link'
import { useState } from 'react'
import { getCalendarToday } from '@/constants/productionCalendar'
import { longDateFromYmd } from '@/lib/longDate'
import { useAlertDialog } from '@/context/AlertDialogContext'
import {
  bagsText,
  fmtKg,
  requestRemainingKg,
  yarnRequestAction,
  yarnRequestShareText,
  type MillYarnStock,
  type YarnRequest,
} from '@/lib/floor/yarnSupply'

const shortDate = (ymd: string | null) => (ymd ? longDateFromYmd(ymd) : '—')

function RequestBadge({ q }: { q: YarnRequest }) {
  if (q.status === 'COMPLETE') return <span className="badge text-bg-success">Fully sent</span>
  if (q.status === 'CLOSED') return <span className="badge text-bg-secondary">Closed</span>
  if (q.status === 'CANCELLED') return <span className="badge text-bg-dark">Cancelled</span>
  return <span className="badge text-bg-primary">{q.sentKg > 0 ? 'Partly sent' : 'Open'}</span>
}

/** Mill: ask the supplier for yarn (new or change). */
function RequestDialog({
  q,
  stock,
  onClose,
  onSaved,
}: {
  q: YarnRequest | null
  stock: MillYarnStock[]
  onClose: () => void
  onSaved: (q: YarnRequest | null, created: boolean) => void
}) {
  const [yarnType, setYarnType] = useState(q?.yarnType || '')
  const [kg, setKg] = useState(q ? String(q.kg) : '')
  const [bags, setBags] = useState(q?.bags ? String(q.bags) : '')
  const [neededBy, setNeededBy] = useState(q?.neededBy || '')
  const [note, setNote] = useState(q?.note || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inStock = stock.find((y) => y.yarnType.toLowerCase().replace(/[\s\-_.]+/g, '') === yarnType.toLowerCase().replace(/[\s\-_.]+/g, ''))

  const save = () => {
    setBusy(true)
    setError(null)
    const request = { yarnType: inStock ? inStock.yarnType : yarnType.trim(), kg: Number(kg), bags: bags ? Number(bags) : null, neededBy: neededBy || null, note: note.trim() }
    yarnRequestAction(q ? { action: 'requestUpdate', id: q.id, request } : { action: 'requestCreate', request })
      .then((r) => onSaved(r, !q))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not save.'))
      .finally(() => setBusy(false))
  }

  return (
    <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true" style={{ backgroundColor: 'rgba(15, 23, 42, 0.65)' }}>
      <div className="modal-dialog modal-dialog-centered" role="document">
        <div className="modal-content border-0 shadow-lg" style={{ borderRadius: 14, overflow: 'hidden' }}>
          <div className="modal-header bg-light py-3 px-4">
            <h5 className="modal-title fs-6 fw-bold mb-0">{q ? 'Change yarn request' : 'Request yarn from the supplier'}</h5>
            <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
          </div>
          <div className="modal-body p-4">
            {error && <div className="alert alert-danger py-2 px-3 small">{error}</div>}
            <div className="row g-3">
              <div className="col-12">
                <label className="form-label small fw-semibold mb-1" htmlFor="yr-yarn">
                  Yarn
                </label>
                <input
                  id="yr-yarn"
                  className="form-control"
                  list="yr-yarn-list"
                  autoComplete="off"
                  maxLength={120}
                  placeholder="e.g. 20/1 Pv China"
                  value={yarnType}
                  onChange={(e) => setYarnType(e.target.value)}
                />
                <datalist id="yr-yarn-list">
                  {stock.map((y) => (
                    <option key={y.id} value={y.yarnType} />
                  ))}
                </datalist>
                {inStock && <div className="form-text small">In stock now: {fmtKg(inStock.balanceKg)}</div>}
              </div>
              <div className="col-6">
                <label className="form-label small fw-semibold mb-1" htmlFor="yr-kg">
                  Quantity (kg)
                </label>
                <input id="yr-kg" inputMode="decimal" className="form-control text-end" value={kg} onChange={(e) => setKg(e.target.value.replace(/[^\d.]/g, ''))} />
              </div>
              <div className="col-6">
                <label className="form-label small fw-semibold mb-1" htmlFor="yr-bags">
                  Bags <span className="text-secondary fw-normal">(optional)</span>
                </label>
                <input id="yr-bags" inputMode="numeric" className="form-control text-end" value={bags} onChange={(e) => setBags(e.target.value.replace(/[^\d]/g, ''))} />
              </div>
              <div className="col-12 col-sm-6">
                <label className="form-label small fw-semibold mb-1" htmlFor="yr-needed">
                  Needed by <span className="text-secondary fw-normal">(optional)</span>
                </label>
                <input id="yr-needed" type="date" className="form-control" min={q ? undefined : getCalendarToday()} value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
              </div>
              <div className="col-12">
                <label className="form-label small fw-semibold mb-1" htmlFor="yr-note">
                  Note <span className="text-secondary fw-normal">(optional — the supplier sees it)</span>
                </label>
                <input id="yr-note" className="form-control" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="modal-footer bg-light px-4 py-3">
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-sm btn-primary px-3" disabled={busy || !yarnType.trim() || !(Number(kg) > 0)} onClick={save}>
              <i className="bi bi-send me-1" />
              {busy ? 'Saving…' : q ? 'Save' : 'Send request'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Who did what on a request. */
function RequestLog({ q }: { q: YarnRequest }) {
  if (!q.log.length) return null
  const label: Record<string, string> = { REQUESTED: 'Requested', EDITED: 'Changed', CLOSED: 'Closed', CANCELLED: 'Cancelled', REOPENED: 'Reopened' }
  return (
    <details className="small text-secondary mt-1">
      <summary style={{ cursor: 'pointer' }}>History ({q.log.length})</summary>
      <ul className="mb-0 ps-3">
        {q.log.map((l, i) => (
          <li key={i}>
            {new Date(l.at).toLocaleString('en-PK', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' })} —{' '}
            <b>{label[l.action] || l.action}</b> by {l.by}
            {l.note ? `: ${l.note}` : ''}
          </li>
        ))}
      </ul>
    </details>
  )
}

/**
 * Yarn requests (the mill asks the supplier for yarn).
 *  - mill: Request yarn, change, close, cancel, reopen, WhatsApp it to the supplier.
 *  - supplier: see what the mill wants and "Send against this" (Send yarn page, linked).
 */
export function YarnRequestsPanel({
  mode,
  requests,
  stock,
  canManage,
  canSend,
  newOpen,
  onNewClose,
  onChanged,
  onShare,
}: {
  mode: 'supplier' | 'mill'
  requests: YarnRequest[]
  stock: MillYarnStock[]
  /** Mill with Yarn Stock (Edit). */
  canManage: boolean
  /** Supplier with Yarn Supply (Edit). */
  canSend: boolean
  /** The header's "Request yarn" button was pressed. */
  newOpen: boolean
  onNewClose: () => void
  onChanged: () => void
  onShare: (s: { title: string; text: string }) => void
}) {
  const { showConfirm, showError, showSuccessSoon } = useAlertDialog()
  const [editing, setEditing] = useState<YarnRequest | null>(null)
  const [showClosed, setShowClosed] = useState(false)
  const active = requests.filter((q) => q.status === 'OPEN' || q.status === 'COMPLETE')
  const closed = requests.filter((q) => q.status === 'CLOSED' || q.status === 'CANCELLED')
  const shown = showClosed ? requests : active

  const share = (q: YarnRequest) => onShare({ title: `Yarn request — ${q.yarnType}`, text: yarnRequestShareText(q) })

  const setStatus = (q: YarnRequest, action: 'requestClose' | 'requestCancel' | 'requestReopen') => {
    const words = {
      requestClose: { title: 'Close this request?', ok: 'Yes, close', msg: 'Nothing more is needed against it.' },
      requestCancel: { title: 'Cancel this request?', ok: 'Yes, cancel it', msg: 'The supplier will see it as cancelled.' },
      requestReopen: { title: 'Reopen this request?', ok: 'Yes, reopen', msg: 'The supplier can send against it again.' },
    }[action]
    showConfirm({
      title: words.title,
      message: `${q.yarnType} · ${fmtKg(q.kg)} · sent so far ${fmtKg(q.sentKg)}. ${words.msg}`,
      type: 'confirm',
      confirmText: words.ok,
      cancelText: 'No',
      onConfirm: () =>
        yarnRequestAction({ action, id: q.id })
          .then(() => onChanged())
          .catch((e: unknown) => showError({ title: 'Not saved', message: e instanceof Error ? e.message : 'Could not save.' })),
    })
  }

  const dialogOpen = newOpen || editing != null

  return (
    <>
      {shown.length === 0 ? (
        <div className="p-3 small text-secondary">
          {mode === 'mill' ? 'No open requests. Use “Request yarn” to ask the supplier for stock.' : 'The mill has no open requests right now.'}
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table table-sm table-hover align-middle mb-0" style={{ fontSize: 13 }}>
            <thead className="table-light">
              <tr>
                <th className="px-2">Requested</th>
                <th className="px-2">Yarn</th>
                <th className="px-2 text-end">Quantity</th>
                <th className="px-2">Needed by</th>
                <th className="px-2 text-end">Sent</th>
                <th className="px-2 text-end">Remaining</th>
                <th className="px-2">Status</th>
                <th className="px-2 text-end" style={{ width: 1 }} />
              </tr>
            </thead>
            <tbody>
              {shown.map((q) => {
                const isOpen = q.status === 'OPEN' || q.status === 'COMPLETE'
                const late = isOpen && q.status !== 'COMPLETE' && q.neededBy != null && q.neededBy < getCalendarToday()
                return (
                  <tr key={q.id} className={isOpen ? undefined : 'text-secondary'}>
                    <td className="px-2 text-nowrap">
                      {shortDate(q.createdAt.slice(0, 10))}
                      {q.requestedBy && <div className="small text-secondary">By {q.requestedBy}</div>}
                    </td>
                    <td className="px-2">
                      <div className="fw-semibold">{q.yarnType}</div>
                      {q.note && <div className="small text-secondary">{q.note}</div>}
                      <RequestLog q={q} />
                    </td>
                    <td className="px-2 text-end text-nowrap">
                      <div className="font-monospace">{fmtKg(q.kg)}</div>
                      {q.bags ? <div className="small text-secondary">{bagsText(q.bags)}</div> : null}
                    </td>
                    <td className={`px-2 text-nowrap ${late ? 'text-danger fw-semibold' : ''}`}>{q.neededBy ? shortDate(q.neededBy) : '—'}</td>
                    <td className="px-2 text-end text-nowrap">
                      <div className="font-monospace">{fmtKg(q.sentKg)}</div>
                      <div className="small text-secondary">
                        {q.lots} lot{q.lots === 1 ? '' : 's'}
                        {q.receivedKg > 0 ? ` · received ${fmtKg(q.receivedKg)}` : ''}
                      </div>
                    </td>
                    <td className="px-2 text-end font-monospace text-nowrap">{isOpen ? fmtKg(requestRemainingKg(q)) : '—'}</td>
                    <td className="px-2">
                      <RequestBadge q={q} />
                      {q.closeNote && <div className="small text-secondary">{q.closeNote}</div>}
                    </td>
                    <td className="px-2 text-end text-nowrap">
                      {mode === 'supplier' && canSend && q.status === 'OPEN' && (
                        <Link href={`/yarn-supply/send?request=${encodeURIComponent(q.id)}`} className="btn btn-sm btn-primary py-0 px-2">
                          <i className="bi bi-send me-1" />
                          Send against this
                        </Link>
                      )}
                      {mode === 'mill' && canManage && isOpen && (
                        <>
                          <button type="button" className="btn btn-sm btn-outline-primary py-0 px-2 me-1" onClick={() => setEditing(q)}>
                            Edit
                          </button>
                          <button type="button" className="btn btn-sm btn-outline-secondary py-0 px-2 me-1" onClick={() => setStatus(q, 'requestClose')}>
                            Close
                          </button>
                          <button type="button" className="btn btn-sm btn-outline-danger py-0 px-2 me-1" onClick={() => setStatus(q, 'requestCancel')}>
                            Cancel
                          </button>
                        </>
                      )}
                      {mode === 'mill' && canManage && !isOpen && (
                        <button type="button" className="btn btn-sm btn-outline-secondary py-0 px-2 me-1" onClick={() => setStatus(q, 'requestReopen')}>
                          Reopen
                        </button>
                      )}
                      {mode === 'mill' && isOpen && (
                        <button type="button" className="btn btn-sm btn-outline-success py-0 px-2" title="WhatsApp this request" onClick={() => share(q)}>
                          <i className="bi bi-whatsapp" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {closed.length > 0 && (
        <div className="px-3 py-2 border-top small">
          <button type="button" className="btn btn-link btn-sm p-0" onClick={() => setShowClosed((v) => !v)}>
            {showClosed ? 'Hide closed / cancelled' : `Show closed / cancelled (${closed.length})`}
          </button>
        </div>
      )}

      {dialogOpen && (
        <RequestDialog
          key={editing?.id || 'new'}
          q={editing}
          stock={stock}
          onClose={() => {
            setEditing(null)
            onNewClose()
          }}
          onSaved={(q, created) => {
            setEditing(null)
            onNewClose()
            onChanged()
            if (q && created) {
              showConfirm({
                title: 'Request saved',
                message: `${q.yarnType}: ${fmtKg(q.kg)}. The supplier sees it on Yarn Supply. Send it on WhatsApp too?`,
                type: 'confirm',
                confirmText: 'WhatsApp',
                cancelText: 'Not now',
                onConfirm: () => share(q),
              })
            } else {
              showSuccessSoon({ title: 'Saved', message: 'Request changed.' })
            }
          }}
        />
      )}
    </>
  )
}
