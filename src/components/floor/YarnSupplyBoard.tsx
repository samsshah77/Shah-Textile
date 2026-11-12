'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getCalendarToday } from '@/constants/productionCalendar'
import { longDateFromYmd } from '@/lib/longDate'
import { useAlertDialog } from '@/context/AlertDialogContext'
import { WhatsAppShareModal } from '@/components/shared/WhatsAppShareModal'
import { SectionLoader } from '@/components/shared/Loaders'
import {
  bagsText,
  diffText,
  fetchYarnSupply,
  fmtKg,
  receivedDayText,
  receivedDiff,
  yarnSupplyAction,
  yarnSupplyShareText,
  type YarnDispatch,
  type YarnSupplyList,
} from '@/lib/floor/yarnSupply'

type View = 'open' | 'verified' | 'all'

const shortDate = (ymd: string | null) => (ymd ? longDateFromYmd(ymd) : '—')

function StatusBadge({ d }: { d: YarnDispatch }) {
  if (d.status === 'VERIFIED') return <span className="badge text-bg-success">Verified</span>
  if (d.status === 'ISSUE') return <span className="badge text-bg-danger">Issue reported</span>
  return <span className="badge text-bg-warning">Waiting for mill check</span>
}

/** Who did what, newest last (shown under the row). */
function LogLine({ d }: { d: YarnDispatch }) {
  if (!d.log.length) return null
  const label: Record<string, string> = { SENT: 'Sent', EDITED: 'Corrected', ISSUE: 'Issue', VERIFIED: 'Verified', CORRECTED: 'Received changed' }
  return (
    <details className="small text-secondary mt-1">
      <summary style={{ cursor: 'pointer' }}>History ({d.log.length})</summary>
      <ul className="mb-0 ps-3">
        {d.log.map((l, i) => (
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

/** Every bag's weight (bags of different weight show one by one). */
function BagWeights({ kg }: { kg: number[] }) {
  const same = kg.every((w) => w === kg[0])
  if (same) return <div className="small text-secondary text-nowrap">{kg.length > 1 ? `each ${kg[0].toFixed(2)} kg` : `${kg[0].toFixed(2)} kg`}</div>
  const list = kg.map((w, i) => (
    <span key={i} className="text-nowrap">
      B{i + 1}: {w.toFixed(2)}
    </span>
  ))
  if (kg.length <= 6) {
    return <div className="small text-secondary d-flex flex-wrap justify-content-end column-gap-2">{list}</div>
  }
  return (
    <details className="small text-secondary">
      <summary style={{ cursor: 'pointer' }}>Bag weights</summary>
      <div className="d-flex flex-wrap justify-content-end column-gap-2">{list}</div>
    </details>
  )
}

/** Mill: Verify (or correct a verified entry) — what actually arrived. */
function ReceiveDialog({
  d,
  correcting,
  onClose,
  onSaved,
}: {
  d: YarnDispatch
  correcting: boolean
  onClose: () => void
  onSaved: (d: YarnDispatch | null) => void
}) {
  const [date, setDate] = useState(d.receivedDate || getCalendarToday())
  const [bags, setBags] = useState(String(d.receivedBags ?? d.bags))
  const [kg, setKg] = useState(String(d.receivedKg ?? d.weightKg))
  const [note, setNote] = useState(correcting ? d.verifyNote : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nBags = Math.round(Number(bags) || 0)
  const nKg = Math.round((Number(kg) || 0) * 100) / 100
  const differs = nBags !== d.bags || nKg !== d.weightKg

  const save = () => {
    setBusy(true)
    setError(null)
    yarnSupplyAction({
      action: correcting ? 'correct' : 'verify',
      id: d.id,
      receive: { receivedDate: date, receivedBags: nBags, receivedKg: nKg, note: note.trim() },
    })
      .then(onSaved)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not save.'))
      .finally(() => setBusy(false))
  }

  return (
    <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true" style={{ backgroundColor: 'rgba(15, 23, 42, 0.65)' }}>
      <div className="modal-dialog modal-dialog-centered" role="document">
        <div className="modal-content border-0 shadow-lg" style={{ borderRadius: 14, overflow: 'hidden' }}>
          <div className="modal-header bg-light py-3 px-4">
            <h5 className="modal-title fs-6 fw-bold mb-0">
              {correcting ? 'Correct received yarn' : 'Verify yarn received'} — {d.yarnType}
            </h5>
            <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
          </div>
          <div className="modal-body p-4">
            {error && <div className="alert alert-danger py-2 px-3 small">{error}</div>}
            <div className="rounded border bg-light px-3 py-2 small mb-3">
              <div>
                <b>Sent:</b> {shortDate(d.sentDate)} · {bagsText(d.bags)} · {fmtKg(d.weightKg)}
              </div>
              {(d.challanNo || d.lotNo || d.vehicleNo) && (
                <div className="text-secondary">
                  {[d.challanNo && `Challan ${d.challanNo}`, d.lotNo && `Lot ${d.lotNo}`, d.vehicleNo && `Vehicle ${d.vehicleNo}`].filter(Boolean).join(' · ')}
                </div>
              )}
              {d.bagKg.length > 0 && (
                <div className="text-secondary">Bags (kg): {d.bagKg.map((w) => w.toFixed(2)).join(', ')}</div>
              )}
            </div>
            <div className="row g-3">
              <div className="col-12 col-sm-4">
                <label className="form-label small fw-semibold mb-1" htmlFor="ys-date">
                  Received on
                </label>
                <input id="ys-date" type="date" className="form-control" value={date} max={getCalendarToday()} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="col-6 col-sm-4">
                <label className="form-label small fw-semibold mb-1" htmlFor="ys-bags">
                  Bags received
                </label>
                <input id="ys-bags" inputMode="numeric" className="form-control text-end" value={bags} onChange={(e) => setBags(e.target.value.replace(/[^\d]/g, ''))} />
              </div>
              <div className="col-6 col-sm-4">
                <label className="form-label small fw-semibold mb-1" htmlFor="ys-kg">
                  Kg received
                </label>
                <input id="ys-kg" inputMode="decimal" className="form-control text-end" value={kg} onChange={(e) => setKg(e.target.value.replace(/[^\d.]/g, ''))} />
              </div>
              <div className="col-12">
                <label className="form-label small fw-semibold mb-1" htmlFor="ys-note">
                  Note <span className="text-secondary fw-normal">(optional — the supplier sees it)</span>
                </label>
                <input id="ys-note" className="form-control" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
            {differs && nKg > 0 && (
              <div className="alert alert-warning py-2 px-3 small mt-3 mb-0">
                Different from what was sent: {diffText({ bags: nBags - d.bags, kg: Math.round((nKg - d.weightKg) * 100) / 100 })}. Yarn
                Stock gets what you received.
              </div>
            )}
          </div>
          <div className="modal-footer bg-light px-4 py-3">
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-sm btn-success px-3" disabled={busy || nKg <= 0} onClick={save}>
              <i className="bi bi-check2-circle me-1" />
              {busy ? 'Saving…' : correcting ? 'Save' : 'Verify & add to Yarn Stock'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Mill: something is wrong — the supplier sees this note and corrects the entry. */
function IssueDialog({ d, onClose, onSaved }: { d: YarnDispatch; onClose: () => void; onSaved: (d: YarnDispatch | null) => void }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = () => {
    setBusy(true)
    setError(null)
    yarnSupplyAction({ action: 'issue', id: d.id, note: note.trim() })
      .then(onSaved)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not save.'))
      .finally(() => setBusy(false))
  }
  return (
    <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true" style={{ backgroundColor: 'rgba(15, 23, 42, 0.65)' }}>
      <div className="modal-dialog modal-dialog-centered" role="document">
        <div className="modal-content border-0 shadow-lg" style={{ borderRadius: 14, overflow: 'hidden' }}>
          <div className="modal-header bg-light py-3 px-4">
            <h5 className="modal-title fs-6 fw-bold mb-0">Report an issue — {d.yarnType}</h5>
            <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
          </div>
          <div className="modal-body p-4">
            {error && <div className="alert alert-danger py-2 px-3 small">{error}</div>}
            <div className="small text-secondary mb-2">
              Sent {shortDate(d.sentDate)} · {bagsText(d.bags)} · {fmtKg(d.weightKg)}. The supplier sees your note, corrects the entry and it comes back here to be checked again.
            </div>
            <textarea
              className="form-control"
              rows={3}
              maxLength={500}
              autoFocus
              placeholder="e.g. 2 bags short, Bag 4 weighs 48.20 kg"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="modal-footer bg-light px-4 py-3">
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-sm btn-danger px-3" disabled={busy || !note.trim()} onClick={save}>
              <i className="bi bi-exclamation-triangle me-1" />
              {busy ? 'Saving…' : 'Report issue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Yarn Supply list.
 *  - mode "supplier" (Yarn Supply page): send / correct / delete own entries, see what the mill
 *    received and the mill's yarn stock. Javed Sir sees it view-only.
 *  - mode "mill" (Yarn Stock tab): verify into Yarn Stock, report issues, correct verified
 *    entries, and WhatsApp what came in.
 */
export function YarnSupplyBoard({
  mode,
  selectedDate,
  embedded = false,
  onOpenCount,
}: {
  mode: 'supplier' | 'mill'
  selectedDate?: string
  /** Inside another card (Yarn Stock → From Supplier tab): no card of its own. */
  embedded?: boolean
  /** Entries waiting for the mill (for a tab badge). */
  onOpenCount?: (n: number) => void
}) {
  const { showConfirm, showError, showSuccessSoon } = useAlertDialog()
  const [data, setData] = useState<YarnSupplyList | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [view, setView] = useState<View>('open')
  const [receiving, setReceiving] = useState<{ d: YarnDispatch; correcting: boolean } | null>(null)
  const [issue, setIssue] = useState<YarnDispatch | null>(null)
  const [share, setShare] = useState<{ title: string; text: string } | null>(null)
  const [shareDate, setShareDate] = useState(() => selectedDate || getCalendarToday())

  const load = useCallback(() => {
    fetchYarnSupply()
      .then((d) => {
        setData(d)
        setLoadError(null)
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : 'Could not load.'))
  }, [])

  useEffect(() => {
    load()
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    const t = setInterval(load, 60_000)
    return () => {
      window.removeEventListener('focus', onFocus)
      clearInterval(t)
    }
  }, [load])

  const canSend = mode === 'supplier' && Boolean(data?.canSend)
  const canVerify = mode === 'mill' && Boolean(data?.canVerify)
  const list = useMemo(() => data?.dispatches ?? [], [data])
  const open = list.filter((d) => d.status !== 'VERIFIED')
  const issues = list.filter((d) => d.status === 'ISSUE').length
  const shown = view === 'open' ? open : view === 'verified' ? list.filter((d) => d.status === 'VERIFIED') : list
  const afterSave = (msg: string) => (d: YarnDispatch | null) => {
    setReceiving(null)
    setIssue(null)
    load()
    if (d && mode === 'mill' && d.status === 'VERIFIED') {
      // Straight after a check: offer the WhatsApp message.
      showConfirm({
        title: msg,
        message: `${d.yarnType}: ${bagsText(d.receivedBags)}, ${fmtKg(d.receivedKg)} is in Yarn Stock. Send it on WhatsApp?`,
        type: 'confirm',
        confirmText: 'WhatsApp',
        cancelText: 'Not now',
        onConfirm: () => setShare({ title: `Yarn received — ${d.yarnType}`, text: yarnSupplyShareText(d) }),
      })
    } else {
      showSuccessSoon({ title: 'Saved', message: msg })
    }
  }

  const remove = (d: YarnDispatch) =>
    showConfirm({
      title: 'Delete this entry?',
      message: `${d.yarnType} · ${shortDate(d.sentDate)} · ${bagsText(d.bags)} · ${fmtKg(d.weightKg)}`,
      type: 'confirm',
      confirmText: 'Yes, delete',
      cancelText: 'Cancel',
      onConfirm: () =>
        yarnSupplyAction({ action: 'delete', id: d.id })
          .then(() => load())
          .catch((e: unknown) => showError({ title: 'Not deleted', message: e instanceof Error ? e.message : 'Could not delete.' })),
    })

  useEffect(() => {
    if (data) onOpenCount?.(open.length)
  }, [data, open.length, onOpenCount])

  const verifiedOnShareDate = list.filter((d) => d.status === 'VERIFIED' && d.receivedDate === shareDate).length

  return (
    <>
      <div className={embedded ? '' : 'card mb-3'}>
        <div className={`${embedded ? 'px-3 py-2 border-bottom bg-light' : 'card-header'} d-flex flex-wrap align-items-center gap-2`}>
          <h3 className={`${embedded ? 'fs-6 fw-semibold' : 'card-title'} mb-0 me-auto`}>
            <i className="bi bi-truck me-1" />
            {mode === 'mill' ? 'Yarn from supplier' : 'Yarn sent to the mill'}
            {open.length > 0 && <span className="badge text-bg-warning ms-2">{open.length} to check</span>}
            {issues > 0 && <span className="badge text-bg-danger ms-1">{issues} issue{issues === 1 ? '' : 's'}</span>}
          </h3>
          <div className="btn-group btn-group-sm" role="group">
            {(
              [
                ['open', `Waiting (${open.length})`],
                ['verified', 'Verified'],
                ['all', 'All'],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" className={`btn ${view === k ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setView(k)}>
                {label}
              </button>
            ))}
          </div>
          {mode === 'mill' && (
            <div className="d-flex align-items-center gap-1">
              <input
                type="date"
                className="form-control form-control-sm"
                style={{ width: 140 }}
                value={shareDate}
                max={getCalendarToday()}
                onChange={(e) => setShareDate(e.target.value)}
                title="Day to share"
              />
              <button
                type="button"
                className="btn btn-sm btn-outline-success text-nowrap"
                onClick={() => setShare({ title: `Yarn received — ${longDateFromYmd(shareDate)}`, text: receivedDayText(shareDate, list, longDateFromYmd) })}
                title="WhatsApp the yarn received (verified) on this day"
              >
                <i className="bi bi-whatsapp me-1" />
                Received ({verifiedOnShareDate})
              </button>
            </div>
          )}
          {canSend && (
            <Link href="/yarn-supply/send" className="btn btn-sm btn-primary">
              <i className="bi bi-send me-1" /> Send yarn
            </Link>
          )}
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={load} title="Refresh">
            <i className="bi bi-arrow-clockwise" />
          </button>
        </div>
        <div className="card-body p-0">
          {loadError ? (
            <div className="p-3 text-danger small">{loadError}</div>
          ) : !data ? (
            <SectionLoader compact />
          ) : shown.length === 0 ? (
            <div className="p-3 small text-secondary">
              {view === 'open' ? (mode === 'mill' ? 'No yarn waiting to be checked.' : 'Nothing waiting — everything sent has been checked by the mill.') : 'No entries.'}
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm table-hover align-middle mb-0" style={{ fontSize: 13 }}>
                <thead className="table-light">
                  <tr>
                    <th className="px-2">Sent</th>
                    <th className="px-2">Yarn</th>
                    <th className="px-2 text-end">Bags</th>
                    <th className="px-2 text-end">Kg sent</th>
                    <th className="px-2">Challan / Lot / Vehicle</th>
                    <th className="px-2">Status</th>
                    <th className="px-2">Received by mill</th>
                    <th className="px-2 text-end" style={{ width: 1 }} />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((d) => {
                    const diff = receivedDiff(d)
                    return (
                      <tr key={d.id} className={d.status === 'ISSUE' ? 'table-danger' : undefined}>
                        <td className="px-2 text-nowrap">{shortDate(d.sentDate)}</td>
                        <td className="px-2">
                          <div className="fw-semibold">{d.yarnType}</div>
                          {d.remarks && <div className="small text-secondary">{d.remarks}</div>}
                          {mode === 'mill' && d.createdBy && <div className="small text-secondary">By {d.createdBy}</div>}
                          <LogLine d={d} />
                        </td>
                        <td className="px-2 text-end">
                          <div className="font-monospace">{d.bags}</div>
                          {d.bagKg.length > 0 && <BagWeights kg={d.bagKg} />}
                        </td>
                        <td className="px-2 text-end font-monospace text-nowrap">{fmtKg(d.weightKg)}</td>
                        <td className="px-2 small">
                          {[d.challanNo && `Challan ${d.challanNo}`, d.lotNo && `Lot ${d.lotNo}`, d.vehicleNo && `Vehicle ${d.vehicleNo}`]
                            .filter(Boolean)
                            .map((t) => (
                              <div key={String(t)}>{t}</div>
                            ))}
                        </td>
                        <td className="px-2">
                          <StatusBadge d={d} />
                          {d.status === 'ISSUE' && (
                            <div className="small text-danger-emphasis mt-1">
                              {d.issueNote}
                              {d.issueBy ? ` — ${d.issueBy}` : ''}
                            </div>
                          )}
                        </td>
                        <td className="px-2 small">
                          {d.status === 'VERIFIED' ? (
                            <>
                              <div className="text-nowrap">
                                {shortDate(d.receivedDate)} · <b>{bagsText(d.receivedBags)}</b> · <b>{fmtKg(d.receivedKg)}</b>
                              </div>
                              {(diff.bags !== 0 || diff.kg !== 0) && (
                                <div className="text-danger-emphasis">Difference: {diffText(diff)}</div>
                              )}
                              {d.verifyNote && <div className="text-secondary">{d.verifyNote}</div>}
                              {d.verifiedBy && <div className="text-secondary">Checked by {d.verifiedBy}</div>}
                            </>
                          ) : (
                            <span className="text-secondary">—</span>
                          )}
                        </td>
                        <td className="px-2 text-end text-nowrap">
                          {canSend && d.status !== 'VERIFIED' && (
                            <>
                              <Link href={`/yarn-supply/send?id=${encodeURIComponent(d.id)}`} className="btn btn-sm btn-outline-primary py-0 px-2 me-1">
                                {d.status === 'ISSUE' ? 'Correct' : 'Edit'}
                              </Link>
                              <button type="button" className="btn btn-sm btn-outline-danger py-0 px-2" onClick={() => remove(d)} title="Delete">
                                <i className="bi bi-trash" />
                              </button>
                            </>
                          )}
                          {canVerify && d.status !== 'VERIFIED' && (
                            <>
                              <button type="button" className="btn btn-sm btn-success py-0 px-2 me-1" onClick={() => setReceiving({ d, correcting: false })}>
                                Verify
                              </button>
                              <button type="button" className="btn btn-sm btn-outline-danger py-0 px-2" onClick={() => setIssue(d)}>
                                Report issue
                              </button>
                            </>
                          )}
                          {canVerify && d.status === 'VERIFIED' && (
                            <button type="button" className="btn btn-sm btn-outline-secondary py-0 px-2 me-1" onClick={() => setReceiving({ d, correcting: true })}>
                              Edit
                            </button>
                          )}
                          {mode === 'supplier' && (
                            <Link
                              href={`/yarn-supply/challan?id=${encodeURIComponent(d.id)}`}
                              className="btn btn-sm btn-outline-secondary py-0 px-2 ms-1"
                              title="Print challan"
                            >
                              <i className="bi bi-printer" /> Challan
                            </Link>
                          )}
                          {mode === 'mill' && d.status === 'VERIFIED' && (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-success py-0 px-2"
                              title="WhatsApp this entry"
                              onClick={() => setShare({ title: `Yarn received — ${d.yarnType}`, text: yarnSupplyShareText(d) })}
                            >
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
        </div>
      </div>

      {mode === 'supplier' && data && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title mb-0">
              <i className="bi bi-box-seam me-1" /> Mill yarn stock now
            </h3>
          </div>
          <div className="card-body p-0">
            {data.stock.length === 0 ? (
              <div className="p-3 small text-secondary">No yarn in stock.</div>
            ) : (
              <table className="table table-sm mb-0" style={{ fontSize: 13 }}>
                <thead className="table-light">
                  <tr>
                    <th className="px-2">Yarn</th>
                    <th className="px-2 text-end">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.stock.map((y) => (
                    <tr key={y.id}>
                      <td className="px-2">{y.yarnType}</td>
                      <td className={`px-2 text-end font-monospace ${y.balanceKg <= 0 ? 'text-danger' : ''}`}>{fmtKg(y.balanceKg)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {receiving && (
        <ReceiveDialog
          d={receiving.d}
          correcting={receiving.correcting}
          onClose={() => setReceiving(null)}
          onSaved={afterSave(receiving.correcting ? 'Received figures changed' : 'Verified')}
        />
      )}
      {issue && <IssueDialog d={issue} onClose={() => setIssue(null)} onSaved={afterSave('Issue reported — the supplier will see it.')} />}
      <WhatsAppShareModal isOpen={share != null} onClose={() => setShare(null)} documentTitle={share?.title || ''} defaultMessage={share?.text || ''} />
    </>
  )
}
