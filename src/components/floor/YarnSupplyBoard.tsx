'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getCalendarToday } from '@/constants/productionCalendar'
import { longDateFromYmd } from '@/lib/longDate'
import { useAlertDialog } from '@/context/AlertDialogContext'
import { WhatsAppShareModal } from '@/components/shared/WhatsAppShareModal'
import { NamedDateInput } from '@/components/shared/NamedDateInput'
import { SectionLoader } from '@/components/shared/Loaders'
import { YarnRequestsPanel } from '@/components/floor/YarnRequestsPanel'
import {
  bagsText,
  diffText,
  fetchYarnSupply,
  fmtKg,
  markVerifiedSeen,
  matchesTrackingPeriod,
  newVerifiedCount,
  receivedDayText,
  receivedDiff,
  yarnSupplyAction,
  yarnSupplyShareText,
  type TrackingPeriod,
  type YarnDispatch,
  type YarnSupplyList,
  VERIFIED_SEEN_EVENT,
  verifiedSeenAt,
} from '@/lib/floor/yarnSupply'
import { TrackingPeriodBar } from '@/components/floor/TrackingPeriodBar'
import { YarnEmptyState } from '@/components/floor/YarnEmptyState'
import { YarnDispatchBarcodeModal } from '@/components/floor/YarnDispatchBarcodeModal'

/** supplier: requests | sent | verified | stock — mill: waiting | verified | requests */
export type YarnSupplyTab = 'requests' | 'sent' | 'waiting' | 'verified' | 'stock'

const shortDate = (ymd: string | null) => (ymd ? longDateFromYmd(ymd) : '—')

function StatusBadge({ d }: { d: YarnDispatch }) {
  if (d.status === 'VERIFIED') return <span className="badge text-bg-success">Verified</span>
  if (d.status === 'ISSUE') return <span className="badge text-bg-danger">Issue reported</span>
  return <span className="badge text-bg-warning">Waiting for Sara Textile check</span>
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
  if (same) {
    return (
      <div className="mt-1">
        <span className="badge text-bg-light border text-dark fw-normal sara-num text-nowrap">
          {kg.length > 1 ? `each ${kg[0].toFixed(2)} kg` : `${kg[0].toFixed(2)} kg`}
        </span>
      </div>
    )
  }
  const list = kg.map((w, i) => (
    <span key={i} className="badge text-bg-light border text-dark fw-normal sara-num text-nowrap">
      Bag {i + 1}: <b>{w.toFixed(2)} kg</b>
    </span>
  ))
  if (kg.length <= 6) {
    return <div className="d-flex flex-wrap justify-content-center gap-1 mt-1">{list}</div>
  }
  return (
    <details className="small text-dark mt-1">
      <summary style={{ cursor: 'pointer' }}>Bag weights ({kg.length})</summary>
      <div className="d-flex flex-wrap justify-content-center gap-1 mt-1">{list}</div>
    </details>
  )
}

/** Mill: Verify (or correct a verified entry) — what actually arrived (supports single or same-date group). */
function ReceiveDialog({
  items,
  correcting,
  onClose,
  onSaved,
}: {
  items: YarnDispatch[]
  correcting: boolean
  onClose: () => void
  onSaved: (saved: YarnDispatch[]) => void
}) {
  const isSingle = items.length === 1
  const first = items[0]
  const [date, setDate] = useState(first.receivedDate || getCalendarToday())
  const [note, setNote] = useState(correcting ? first.verifyNote : '')
  const [rows, setRows] = useState(() =>
    items.map((d) => ({
      d,
      selected: true,
      bags: String(d.receivedBags ?? d.bags),
      kg: String(d.receivedKg ?? d.weightKg),
    }))
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedRows = rows.filter((r) => r.selected)
  const allValid =
    selectedRows.length > 0 && selectedRows.every((r) => Math.round((Number(r.kg) || 0) * 100) / 100 > 0)

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const saved: YarnDispatch[] = []
      for (const r of selectedRows) {
        const nBags = Math.round(Number(r.bags) || 0)
        const nKg = Math.round((Number(r.kg) || 0) * 100) / 100
        const res = await yarnSupplyAction({
          action: correcting ? 'correct' : 'verify',
          id: r.d.id,
          receive: { receivedDate: date, receivedBags: nBags, receivedKg: nKg, note: note.trim() },
        })
        if (res) saved.push(res)
      }
      onSaved(saved)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  const singleRow = rows[0]
  const singleNBags = Math.round(Number(singleRow.bags) || 0)
  const singleNKg = Math.round((Number(singleRow.kg) || 0) * 100) / 100
  const singleDiffers = singleNBags !== first.bags || singleNKg !== first.weightKg

  return (
    <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true" style={{ backgroundColor: 'rgba(15, 23, 42, 0.65)' }}>
      <div className={`modal-dialog modal-dialog-centered ${isSingle ? '' : 'modal-lg'}`} role="document">
        <div className="modal-content border-0 shadow-lg" style={{ borderRadius: 14, overflow: 'hidden' }}>
          <div className="modal-header bg-light py-3 px-4">
            <h5 className="modal-title fs-6 fw-bold mb-0">
              {correcting
                ? `Correct received yarn — ${first.yarnType}`
                : isSingle
                  ? `Verify yarn received — ${first.yarnType}`
                  : `Verify yarn received — ${shortDate(first.sentDate)} (${items.length} items)`}
            </h5>
            <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
          </div>
          <div className="modal-body p-4">
            {error && <div className="alert alert-danger py-2 px-3 small">{error}</div>}
            {isSingle ? (
              <>
                <div className="rounded border bg-light px-3 py-2 small mb-3">
                  <div>
                    <b>Sent:</b> {shortDate(first.sentDate)} · {bagsText(first.bags)} · {fmtKg(first.weightKg)}
                  </div>
                  {first.lotNo && <div className="text-secondary">Lot {first.lotNo}</div>}
                  {first.bagKg.length > 0 && (
                    <div className="text-secondary">Bags (kg): {first.bagKg.map((w) => w.toFixed(2)).join(', ')}</div>
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
                    <input
                      id="ys-bags"
                      inputMode="numeric"
                      className="form-control text-end"
                      value={singleRow.bags}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r, i) => (i === 0 ? { ...r, bags: e.target.value.replace(/[^\d]/g, '') } : r))
                        )
                      }
                    />
                  </div>
                  <div className="col-6 col-sm-4">
                    <label className="form-label small fw-semibold mb-1" htmlFor="ys-kg">
                      Kg received
                    </label>
                    <input
                      id="ys-kg"
                      inputMode="decimal"
                      className="form-control text-end"
                      value={singleRow.kg}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r, i) => (i === 0 ? { ...r, kg: e.target.value.replace(/[^\d.]/g, '') } : r))
                        )
                      }
                    />
                  </div>
                  <div className="col-12">
                    <label className="form-label small fw-semibold mb-1" htmlFor="ys-note">
                      Note <span className="text-secondary fw-normal">(optional — the supplier sees it)</span>
                    </label>
                    <input id="ys-note" className="form-control" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
                  </div>
                </div>
                {singleDiffers && singleNKg > 0 && (
                  <div className="alert alert-warning py-2 px-3 small mt-3 mb-0">
                    Different from what was sent: {diffText({ bags: singleNBags - first.bags, kg: Math.round((singleNKg - first.weightKg) * 100) / 100 })}. Yarn
                    Stock gets what you received.
                  </div>
                )}
              </>
            ) : (
              <div className="row g-3">
                <div className="col-12 col-sm-5">
                  <label className="form-label small fw-semibold mb-1" htmlFor="ys-date">
                    Received on
                  </label>
                  <input id="ys-date" type="date" className="form-control form-control-sm" value={date} max={getCalendarToday()} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div className="col-12 col-sm-7">
                  <label className="form-label small fw-semibold mb-1" htmlFor="ys-note">
                    Note <span className="text-secondary fw-normal">(optional)</span>
                  </label>
                  <input id="ys-note" className="form-control form-control-sm" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
                <div className="col-12">
                  <div className="table-responsive border rounded">
                    <table className="table table-sm align-middle mb-0" style={{ fontSize: 13 }}>
                      <thead className="table-light">
                        <tr>
                          <th className="px-2" style={{ width: 28 }}>
                            <input
                              type="checkbox"
                              className="form-check-input"
                              checked={selectedRows.length === rows.length}
                              onChange={(e) => setRows((prev) => prev.map((r) => ({ ...r, selected: e.target.checked })))}
                            />
                          </th>
                          <th className="px-2">Yarn</th>
                          <th className="px-2 text-end">Sent</th>
                          <th className="px-2 text-end" style={{ width: 100 }}>Bags</th>
                          <th className="px-2 text-end" style={{ width: 120 }}>Kg</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, idx) => (
                          <tr key={r.d.id} className={r.selected ? '' : 'table-light text-secondary'}>
                            <td className="px-2">
                              <input
                                type="checkbox"
                                className="form-check-input"
                                checked={r.selected}
                                onChange={(e) =>
                                  setRows((prev) =>
                                    prev.map((x, i) => (i === idx ? { ...x, selected: e.target.checked } : x))
                                  )
                                }
                              />
                            </td>
                            <td className="px-2 fw-semibold">
                              {r.d.yarnType}
                              {r.d.lotNo && <div className="small text-secondary fw-normal">Lot {r.d.lotNo}</div>}
                            </td>
                            <td className="px-2 text-end text-nowrap small">
                              {bagsText(r.d.bags)} · {fmtKg(r.d.weightKg)}
                            </td>
                            <td className="px-2">
                              <input
                                inputMode="numeric"
                                disabled={!r.selected}
                                className="form-control form-control-sm text-end"
                                value={r.bags}
                                onChange={(e) =>
                                  setRows((prev) =>
                                    prev.map((x, i) =>
                                      i === idx ? { ...x, bags: e.target.value.replace(/[^\d]/g, '') } : x
                                    )
                                  )
                                }
                              />
                            </td>
                            <td className="px-2">
                              <input
                                inputMode="decimal"
                                disabled={!r.selected}
                                className="form-control form-control-sm text-end"
                                value={r.kg}
                                onChange={(e) =>
                                  setRows((prev) =>
                                    prev.map((x, i) =>
                                      i === idx ? { ...x, kg: e.target.value.replace(/[^\d.]/g, '') } : x
                                    )
                                  )
                                }
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="modal-footer bg-light px-4 py-3">
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-sm btn-success px-3" disabled={busy || !allValid} onClick={save}>
              <i className="bi bi-check2-circle me-1" />
              {busy
                ? 'Saving…'
                : correcting
                  ? 'Save'
                  : isSingle
                    ? 'Verify & add to Yarn Stock'
                    : `Verify (${selectedRows.length}) & add to Yarn Stock`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Mill: something is wrong — the supplier sees this note and corrects the entry. */
function IssueDialog({ items, onClose, onSaved }: { items: YarnDispatch[]; onClose: () => void; onSaved: (saved: YarnDispatch[]) => void }) {
  const isSingle = items.length === 1
  const first = items[0]
  const [selectedIds, setSelectedIds] = useState<string[]>(() => items.map((d) => d.id))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleId = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const saved: YarnDispatch[] = []
      for (const id of selectedIds) {
        const res = await yarnSupplyAction({ action: 'issue', id, note: note.trim() })
        if (res) saved.push(res)
      }
      onSaved(saved)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true" style={{ backgroundColor: 'rgba(15, 23, 42, 0.65)' }}>
      <div className="modal-dialog modal-dialog-centered" role="document">
        <div className="modal-content border-0 shadow-lg" style={{ borderRadius: 14, overflow: 'hidden' }}>
          <div className="modal-header bg-light py-3 px-4">
            <h5 className="modal-title fs-6 fw-bold mb-0">
              {isSingle ? `Report an issue — ${first.yarnType}` : `Report an issue — ${shortDate(first.sentDate)}`}
            </h5>
            <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
          </div>
          <div className="modal-body p-4">
            {error && <div className="alert alert-danger py-2 px-3 small">{error}</div>}
            {isSingle ? (
              <div className="small text-secondary mb-2">
                Sent {shortDate(first.sentDate)} · {bagsText(first.bags)} · {fmtKg(first.weightKg)}. The supplier sees your note, corrects the entry and it comes back here to be checked again.
              </div>
            ) : (
              <div className="mb-3">
                <div className="small fw-semibold mb-1">Select items with an issue:</div>
                <div className="border rounded p-2 d-flex flex-column gap-1" style={{ maxHeight: 160, overflowY: 'auto' }}>
                  {items.map((d) => (
                    <label key={d.id} className="d-flex align-items-center gap-2 small mb-0" style={{ cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        className="form-check-input mt-0"
                        checked={selectedIds.includes(d.id)}
                        onChange={() => toggleId(d.id)}
                      />
                      <span className="fw-semibold">{d.yarnType}</span>
                      <span className="text-secondary ms-auto">
                        {bagsText(d.bags)} · {fmtKg(d.weightKg)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
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
            <button type="button" className="btn btn-sm btn-danger px-3" disabled={busy || !note.trim() || selectedIds.length === 0} onClick={save}>
              <i className="bi bi-exclamation-triangle me-1" />
              {busy ? 'Saving…' : isSingle ? 'Report issue' : `Report issue (${selectedIds.length})`}
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
  tab,
  onTabChange,
  newRequestOpen,
  onNewRequestOpenChange,
}: {
  mode: 'supplier' | 'mill'
  selectedDate?: string
  /** Inside another card (Yarn Stock → From Supplier tab): no card of its own. */
  embedded?: boolean
  /** Entries waiting for the mill (for a tab badge). */
  onOpenCount?: (n: number) => void
  /** Open tab (kept in the address by the Yarn Supply page). */
  tab?: YarnSupplyTab
  onTabChange?: (t: YarnSupplyTab) => void
  /** Controlled Request Yarn modal from the parent toolbar. */
  newRequestOpen?: boolean
  onNewRequestOpenChange?: (open: boolean) => void
}) {
  const { showConfirm, showError, showSuccessSoon } = useAlertDialog()
  const [data, setData] = useState<YarnSupplyList | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tabState, setTabState] = useState<YarnSupplyTab>(() => {
    if (embedded && typeof window !== 'undefined') {
      const saved = window.sessionStorage.getItem('sara:yarn-supply-embedded-tab') as YarnSupplyTab | null
      if (saved === 'waiting' || saved === 'verified' || saved === 'requests') return saved
    }
    return mode === 'mill' ? 'waiting' : 'requests'
  })
  const view: YarnSupplyTab = tab ?? tabState
  const setView = (t: YarnSupplyTab) => {
    setTabState(t)
    if (embedded && typeof window !== 'undefined') {
      window.sessionStorage.setItem('sara:yarn-supply-embedded-tab', t)
    }
    onTabChange?.(t)
  }
  const [newRequestLocal, setNewRequestLocal] = useState(false)
  const newRequest = newRequestOpen ?? newRequestLocal
  const setNewRequest = (next: boolean) => {
    onNewRequestOpenChange?.(next)
    if (newRequestOpen === undefined) setNewRequestLocal(next)
  }
  useEffect(() => {
    if (newRequest && view !== 'requests') setView('requests')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newRequest])
  const [receiving, setReceiving] = useState<{ items: YarnDispatch[]; correcting: boolean } | null>(null)
  const [issue, setIssue] = useState<YarnDispatch[] | null>(null)
  const [share, setShare] = useState<{ title: string; text: string } | null>(null)
  const [barcodeItems, setBarcodeItems] = useState<YarnDispatch[] | null>(null)
  const [shareDate, setShareDate] = useState(() => selectedDate || getCalendarToday())
  const [verifiedPeriod, setVerifiedPeriod] = useState<TrackingPeriod>('monthly')
  const [verifiedDate, setVerifiedDate] = useState(() => selectedDate || getCalendarToday())
  // Supplier: new-verified badge on the Verified tab (cleared when the tab is opened).
  const [seenAt, setSeenAt] = useState(() => verifiedSeenAt())
  useEffect(() => {
    const onSeen = () => setSeenAt(verifiedSeenAt())
    window.addEventListener(VERIFIED_SEEN_EVENT, onSeen)
    return () => window.removeEventListener(VERIFIED_SEEN_EVENT, onSeen)
  }, [])
  useEffect(() => {
    if (mode !== 'supplier' || !data) return
    // Opening Verified clears the badge; the first visit on a device starts counting from now.
    if (view === 'verified' || verifiedSeenAt() == null) markVerifiedSeen(data.dispatches)
  }, [mode, view, data])

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
  const verified = list.filter((d) => d.status === 'VERIFIED')
  const todayYmd = selectedDate || getCalendarToday()
  const verifiedFiltered = verified.filter((d) =>
    matchesTrackingPeriod(d.receivedDate || d.sentDate, embedded ? 'monthly' : verifiedPeriod, embedded ? todayYmd : verifiedDate)
  )
  const shown = view === 'verified' ? verifiedFiltered : open
  const requests = useMemo(() => data?.requests ?? [], [data])
  const openRequests = requests.filter((q) => q.status === 'OPEN')
  const requestById = useMemo(() => new Map(requests.map((q) => [q.id, q])), [requests])
  const afterSave = (msg: string) => (saved: YarnDispatch[]) => {
    setReceiving(null)
    setIssue(null)
    load()
    const verifiedItems = saved.filter((d) => d.status === 'VERIFIED')
    if (mode === 'mill' && verifiedItems.length > 0) {
      setView('verified')
      const first = verifiedItems[0]
      const summary =
        verifiedItems.length === 1
          ? `${first.yarnType}: ${bagsText(first.receivedBags)}, ${fmtKg(first.receivedKg)}`
          : `${verifiedItems.length} yarn entries`
      const text =
        verifiedItems.length === 1
          ? yarnSupplyShareText(first)
          : receivedDayText(first.receivedDate || getCalendarToday(), verifiedItems, longDateFromYmd)
      const title =
        verifiedItems.length === 1
          ? `Yarn received — ${first.yarnType}`
          : `Yarn received — ${longDateFromYmd(first.receivedDate || getCalendarToday())}`
      showConfirm({
        title: msg,
        message: `${summary} added to Yarn Stock. Send it on WhatsApp?`,
        type: 'confirm',
        confirmText: 'WhatsApp',
        cancelText: 'Not now',
        onConfirm: () => setShare({ title, text }),
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

  const tabs: Array<[YarnSupplyTab, string, number | null, string]> =
    mode === 'mill'
      ? [
          ['waiting', 'Waiting for check', open.length, 'bi-hourglass-split'],
          ['verified', 'Verified', null, 'bi-check2-circle'],
          ['requests', 'Requests', openRequests.length, 'bi-clipboard-check'],
        ]
      : [
          ['requests', 'Requests from Sara Textile', openRequests.length, 'bi-clipboard-check'],
          ['sent', 'Sent — waiting', open.length, 'bi-hourglass-split'],
          ['verified', 'Verified', view === 'verified' ? null : newVerifiedCount(list, seenAt), 'bi-check2-circle'],
          ['stock', 'Sara Textile stock', null, 'bi-box-seam'],
        ]

  const activeTab = tabs.find(([k]) => k === view)

  return (
    <>
      {!embedded && ((view === 'requests' && mode === 'mill') || view === 'verified') && (
        <div className="mb-3">
          <TrackingPeriodBar
            period={verifiedPeriod}
            onPeriodChange={setVerifiedPeriod}
            anchorDate={verifiedDate}
            onAnchorDateChange={setVerifiedDate}
            maxDate={todayYmd}
          />
        </div>
      )}
      <div className="card mb-3">
        <div className={`card-header border-bottom ${embedded ? 'pt-2 pb-0 px-3' : 'pb-0'}`}>
          {embedded ? (
            <div className="d-flex flex-wrap align-items-center gap-3 w-100">
              {mode === 'mill' && (
                <ul className="nav nav-tabs border-bottom-0 me-auto" role="tablist">
                  {tabs.map(([k, label, count, icon]) => (
                    <li key={k} className="nav-item" role="presentation">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={view === k}
                        className={`nav-link py-2 px-3 ${view === k ? 'active fw-semibold' : 'text-secondary'}`}
                        onClick={() => setView(k)}
                      >
                        <i className={`bi ${icon} me-1`} />
                        {label}
                        {count ? <span className={`badge ms-1 ${k === 'requests' ? 'text-bg-primary' : k === 'verified' ? 'text-bg-success' : 'text-bg-warning'}`}>{count}</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="d-flex flex-wrap align-items-center gap-2 ms-auto pb-2">
                {issues > 0 && <span className="badge text-bg-danger">{issues} issue{issues === 1 ? '' : 's'}</span>}
                {mode === 'mill' && view === 'verified' && (
                  <div className="d-flex align-items-center gap-1">
                    <NamedDateInput
                      size="sm"
                      minWidth={135}
                      value={shareDate}
                      max={getCalendarToday()}
                      ariaLabel="Day to share"
                      onChange={(v) => v && setShareDate(v)}
                    />
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-success text-nowrap d-inline-flex align-items-center gap-1"
                      onClick={() => setShare({ title: `Yarn received — ${longDateFromYmd(shareDate)}`, text: receivedDayText(shareDate, list, longDateFromYmd) })}
                      title="Send by WhatsApp or Email"
                    >
                      <i className="bi bi-whatsapp" />
                      <span>WhatsApp / Email ({verifiedOnShareDate})</span>
                    </button>
                  </div>
                )}
                {mode === 'mill' && view === 'requests' && data?.canVerify && !onNewRequestOpenChange && (
                  <Link href="/floor/yarn-request" className="btn btn-sm btn-primary">
                    <i className="bi bi-plus-lg me-1" /> Request yarn
                  </Link>
                )}
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={load} title="Refresh">
                  <i className="bi bi-arrow-clockwise" />
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="d-flex flex-wrap align-items-center gap-2 mb-2 w-100">
                <h3 className="card-title mb-0 me-auto fw-semibold">
                  <i className={`bi ${mode === 'supplier' && activeTab ? activeTab[3] : 'bi-truck'} me-2`} />
                  {mode === 'supplier' && activeTab ? activeTab[1] : mode === 'mill' ? 'Yarn from supplier' : 'Yarn Supply'}
                  {issues > 0 && <span className="badge text-bg-danger ms-2">{issues} issue{issues === 1 ? '' : 's'}</span>}
                </h3>
                {mode === 'mill' && view === 'verified' && (
                  <div className="d-flex align-items-center gap-1">
                    <NamedDateInput
                      size="sm"
                      minWidth={135}
                      value={shareDate}
                      max={getCalendarToday()}
                      ariaLabel="Day to share"
                      onChange={(v) => v && setShareDate(v)}
                    />
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-success text-nowrap d-inline-flex align-items-center gap-1"
                      onClick={() => setShare({ title: `Yarn received — ${longDateFromYmd(shareDate)}`, text: receivedDayText(shareDate, list, longDateFromYmd) })}
                      title="Send by WhatsApp or Email"
                    >
                      <i className="bi bi-whatsapp" />
                      <span>WhatsApp / Email ({verifiedOnShareDate})</span>
                    </button>
                  </div>
                )}
                {mode === 'mill' && view === 'requests' && data?.canVerify && !onNewRequestOpenChange && (
                  <Link href="/floor/yarn-request" className="btn btn-sm btn-primary">
                    <i className="bi bi-plus-lg me-1" /> Request yarn
                  </Link>
                )}
                {canSend && (view === 'sent' || view === 'verified') && (
                  <Link href="/yarn-supply/send" className="btn btn-sm btn-primary">
                    <i className="bi bi-send me-1" /> Send yarn
                  </Link>
                )}
                <button type="button" className="btn btn-sm btn-outline-secondary ms-auto" onClick={load} title="Refresh">
                  <i className="bi bi-arrow-clockwise" />
                </button>
              </div>
              {mode === 'mill' && (
                <ul className="nav nav-tabs border-bottom-0" role="tablist">
                  {tabs.map(([k, label, count, icon]) => (
                    <li key={k} className="nav-item" role="presentation">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={view === k}
                        className={`nav-link py-1 px-3 ${view === k ? 'active fw-semibold' : 'text-secondary'}`}
                        onClick={() => setView(k)}
                      >
                        <i className={`bi ${icon} me-1`} />
                        {label}
                        {count ? <span className={`badge ms-1 ${k === 'requests' ? 'text-bg-primary' : k === 'verified' ? 'text-bg-success' : 'text-bg-warning'}`}>{count}</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
        <div className="card-body p-0">
          {loadError ? (
            <div className="p-3 text-danger small">{loadError}</div>
          ) : !data ? (
            <SectionLoader compact />
          ) : view === 'requests' ? (
            <YarnRequestsPanel
              mode={mode}
              requests={requests}
              canManage={mode === 'mill' && data.canVerify}
              canSend={canSend}
              embedded={embedded}
              period={embedded ? 'all' : verifiedPeriod}
              anchorDate={verifiedDate}
              onChanged={load}
              onShare={setShare}
            />
          ) : view === 'stock' ? (
            data.stock.length === 0 ? (
              <YarnEmptyState
                icon="bi-box-seam"
                title="No yarn in stock"
                subtitle="Stock updates automatically when Sara Textile verifies received yarn."
              />
            ) : (
              <table className="table table-sm mb-0 text-center align-middle" style={{ fontSize: 13 }}>
                <thead className="table-light">
                  <tr>
                    <th className="px-2">Yarn</th>
                    <th className="px-2">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.stock.map((y) => (
                    <tr key={y.id}>
                      <td className="px-2">{y.yarnType}</td>
                      <td className={`px-2 sara-num ${y.balanceKg <= 0 ? 'text-danger' : ''}`}>{fmtKg(y.balanceKg)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : shown.length === 0 ? (
            view === 'verified' ? (
              <YarnEmptyState
                icon="bi-check2-circle"
                title="No verified entries"
                subtitle="Verified yarn entries for this period will appear here."
              />
            ) : mode === 'mill' ? (
              <YarnEmptyState
                icon="bi-hourglass-split"
                title="No yarn waiting to be checked"
                subtitle="Everything sent by the supplier has already been checked."
              />
            ) : (
              <YarnEmptyState
                icon="bi-check2-circle"
                title="Nothing waiting"
                subtitle="Everything sent has been checked by Sara Textile."
                action={
                  canSend ? (
                    <Link href="/yarn-supply/send" className="btn btn-sm btn-primary">
                      <i className="bi bi-send me-1" /> Send yarn
                    </Link>
                  ) : undefined
                }
              />
            )
          ) : (
            <div className="table-responsive">
              <table className="table table-sm table-hover align-middle text-center mb-0" style={{ fontSize: 13 }}>
                <thead className="table-light">
                  <tr>
                    <th className="px-2">Sent</th>
                    <th className="px-2">Yarn</th>
                    <th className="px-2">Bags</th>
                    <th className="px-2">Kg sent</th>
                    <th className="px-2">Lot #</th>
                    <th className="px-2">Status</th>
                    <th className="px-2">Received by Sara Textile</th>
                    <th className="px-2" style={{ width: 1 }} />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((d, idx) => {
                    const diff = receivedDiff(d)
                    const prevDate = idx > 0 ? shown[idx - 1].sentDate : null
                    const isFirstOfDate = d.sentDate !== prevDate
                    let dateSpan = 1
                    if (isFirstOfDate) {
                      while (idx + dateSpan < shown.length && shown[idx + dateSpan].sentDate === d.sentDate) {
                        dateSpan++
                      }
                    }
                    return (
                      <tr
                        key={d.id}
                        className={
                          d.status === 'ISSUE'
                            ? 'table-danger'
                            : d.status === 'PENDING'
                              ? 'table-warning'
                              : undefined
                        }
                        style={idx > 0 && isFirstOfDate ? { borderTop: '2px solid #cbd5e1' } : undefined}
                      >
                        {isFirstOfDate && (
                          <td rowSpan={dateSpan} className="px-2 text-nowrap align-middle bg-white border-end fw-medium">
                            <div>{shortDate(d.sentDate)}</div>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-dark py-0 px-2 mt-1"
                              title={`Barcode for all stock sent on ${shortDate(d.sentDate)}`}
                              onClick={() => setBarcodeItems(shown.slice(idx, idx + dateSpan))}
                            >
                              <i className="bi bi-upc-scan me-1" />
                              Barcode
                            </button>
                          </td>
                        )}
                        <td className="px-2">
                          <div className="fw-semibold">{d.yarnType}</div>
                          {d.remarks && <div className="small text-secondary">{d.remarks}</div>}
                          {mode === 'mill' && d.createdBy && <div className="small text-secondary">By {d.createdBy}</div>}
                          {d.requestId && requestById.get(d.requestId) && (
                            <div className="small">
                              <span className="badge text-bg-light border">
                                For request:{' '}
                                {requestById.get(d.requestId)!.kg > 0
                                  ? fmtKg(requestById.get(d.requestId)!.kg)
                                  : bagsText(requestById.get(d.requestId)!.bags)}{' '}
                                · {shortDate(requestById.get(d.requestId)!.createdAt.slice(0, 10))}
                              </span>
                            </div>
                          )}
                          <LogLine d={d} />
                        </td>
                        <td className="px-2">
                          <div className="sara-num fw-semibold">{d.bags}</div>
                          {d.bagKg.length > 0 && <BagWeights kg={d.bagKg} />}
                        </td>
                        <td className="px-2 sara-num text-nowrap">{fmtKg(d.weightKg)}</td>
                        <td className="px-2 small">
                          {d.lotNo ? <div>Lot {d.lotNo}</div> : <span className="text-secondary">—</span>}
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
                        {view === 'waiting' && canVerify ? (
                          isFirstOfDate && (
                            <td rowSpan={dateSpan} className="px-2 text-center text-nowrap align-middle bg-white border-start">
                              <button
                                type="button"
                                className="btn btn-sm btn-success py-0 px-2 me-1"
                                onClick={() => setReceiving({ items: shown.slice(idx, idx + dateSpan), correcting: false })}
                              >
                                Verify
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger py-0 px-2"
                                onClick={() => setIssue(shown.slice(idx, idx + dateSpan))}
                              >
                                Report issue
                              </button>
                            </td>
                          )
                        ) : (
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
                            {canVerify && d.status === 'VERIFIED' && (
                              <button type="button" className="btn btn-sm btn-outline-secondary py-0 px-2 me-1" onClick={() => setReceiving({ items: [d], correcting: true })}>
                                Edit
                              </button>
                            )}
                            {mode === 'mill' && d.status === 'VERIFIED' && (
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-success py-0 px-2"
                                title="Send by WhatsApp or Email"
                                onClick={() => setShare({ title: `Yarn received — ${d.yarnType}`, text: yarnSupplyShareText(d) })}
                              >
                                <i className="bi bi-whatsapp" />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {receiving && (
        <ReceiveDialog
          items={receiving.items}
          correcting={receiving.correcting}
          onClose={() => setReceiving(null)}
          onSaved={afterSave(receiving.correcting ? 'Received figures changed' : 'Verified')}
        />
      )}
      {issue && <IssueDialog items={issue} onClose={() => setIssue(null)} onSaved={afterSave('Issue reported — the supplier will see it.')} />}
      {barcodeItems && <YarnDispatchBarcodeModal items={barcodeItems} onClose={() => setBarcodeItems(null)} />}
      <WhatsAppShareModal isOpen={share != null} onClose={() => setShare(null)} documentTitle={share?.title || ''} defaultMessage={share?.text || ''} />
    </>
  )
}
