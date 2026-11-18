'use client'

import Link from 'next/link'
import { useState } from 'react'
import { getCalendarToday } from '@/constants/productionCalendar'
import { longDateFromYmd } from '@/lib/longDate'
import { useAlertDialog } from '@/context/AlertDialogContext'
import {
  bagsText,
  fmtKg,
  matchesTrackingPeriod,
  requestRemainingKg,
  yarnRequestAction,
  yarnRequestShareText,
  type SupplierStoreBalance,
  type TrackingPeriod,
  type YarnRequest,
} from '@/lib/floor/yarnSupply'
import { YarnEmptyState } from '@/components/floor/YarnEmptyState'

const shortDate = (ymd: string | null) => (ymd ? longDateFromYmd(ymd) : '—')

function requestState(q: YarnRequest) {
  if (q.status === 'CANCELLED') return { label: 'Cancelled', badge: 'text-bg-dark', row: 'table-light text-secondary' }
  if (q.status === 'CLOSED') return { label: 'Closed', badge: 'text-bg-secondary', row: 'table-light text-secondary' }
  if (q.issueLots > 0) return { label: 'Issue reported', badge: 'text-bg-danger', row: 'table-danger' }
  if (q.lots > 0 && q.verifiedLots === q.lots) return { label: 'Verified', badge: 'text-bg-success', row: 'table-secondary text-secondary' }
  if (q.lots > 0) return { label: 'Sent — waiting', badge: 'text-bg-warning text-dark', row: 'table-warning' }
  return { label: 'Open', badge: 'text-bg-primary', row: '' }
}

function RequestBadge({ q }: { q: YarnRequest }) {
  const st = requestState(q)
  return <span className={`badge ${st.badge}`}>{st.label}</span>
}

/** Writable count input with - / + stepper buttons. */
function CountStepper({
  value,
  onChange,
  min = 0,
  ariaLabel = 'Count',
}: {
  value: number
  onChange: (next: number) => void
  min?: number
  ariaLabel?: string
}) {
  const clamp = (n: number) => Math.max(min, Math.min(10000, Math.round(n || 0)))
  return (
    <div className="input-group input-group-sm flex-nowrap" style={{ width: 120 }}>
      <button
        type="button"
        className="btn btn-outline-secondary px-2"
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= min}
        aria-label={`Decrease ${ariaLabel}`}
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        className="form-control text-center fw-semibold px-1"
        aria-label={ariaLabel}
        value={value === 0 ? '' : String(value)}
        placeholder="0"
        onChange={(e) => {
          const digits = e.target.value.replace(/[^\d]/g, '')
          onChange(digits === '' ? 0 : clamp(Number(digits)))
        }}
      />
      <button
        type="button"
        className="btn btn-outline-secondary px-2"
        onClick={() => onChange(clamp(value + 1))}
        aria-label={`Increase ${ariaLabel}`}
      >
        +
      </button>
    </div>
  )
}

/** Mill: ask the supplier for yarn (new or change) on a full page. */
export function YarnRequestForm({
  q,
  store,
  onBack,
  onSaved,
}: {
  q: YarnRequest | null
  store: SupplierStoreBalance[]
  onBack: () => void
  onSaved: (items: YarnRequest[], created: boolean) => void
}) {
  // Edit mode state
  const [yarnType, setYarnType] = useState(q?.yarnType || '')
  const [editCount, setEditCount] = useState(q?.bags ?? 1)

  // Create mode state: Fazal Umer stock suggestions + custom added qualities
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [customItems, setCustomItems] = useState<{ yarnType: string; count: number }[]>([])
  const [query, setQuery] = useState('')
  const [draftCount, setDraftCount] = useState(0)

  const [neededBy, setNeededBy] = useState(q?.neededBy || '')
  const [note, setNote] = useState(q?.note || '')
  const [imageUrl, setImageUrl] = useState<string | null>(q?.imageUrl || null)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const norm = (s: string) => s.toLowerCase().replace(/[\s\-_.]+/g, '')

  const sortedStore = [...store].sort((a, b) => {
    const aPos = a.balanceKg > 0 ? 0 : 1
    const bPos = b.balanceKg > 0 ? 0 : 1
    if (aPos !== bPos) return aPos - bPos
    return a.yarnType.localeCompare(b.yarnType)
  })

  const qLower = query.trim().toLowerCase()
  const filteredStore = qLower
    ? sortedStore.filter((s) => s.yarnType.toLowerCase().includes(qLower) || norm(s.yarnType).includes(norm(query)))
    : sortedStore

  const setStoreCount = (name: string, next: number) =>
    setCounts((prev) => ({ ...prev, [name]: next }))

  const addTypedQuality = () => {
    const name = query.trim()
    if (!name) return
    const qty = draftCount > 0 ? draftCount : 1
    const existingStore = store.find((y) => norm(y.yarnType) === norm(name))
    if (existingStore) {
      setStoreCount(existingStore.yarnType, (counts[existingStore.yarnType] || 0) + qty)
    } else {
      const existingCustom = customItems.findIndex((c) => norm(c.yarnType) === norm(name))
      if (existingCustom >= 0) {
        setCustomItems((prev) =>
          prev.map((c, idx) => (idx === existingCustom ? { ...c, count: c.count + qty } : c))
        )
      } else {
        setCustomItems((prev) => [...prev, { yarnType: name, count: qty }])
      }
    }
    setQuery('')
    setDraftCount(0)
  }

  const handleImagePick = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload?kind=yarn-request', { method: 'POST', credentials: 'same-origin', body: fd })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d?.url) throw new Error(d?.error || 'Could not upload image.')
      setImageUrl(String(d.url))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not upload image.')
    } finally {
      setUploading(false)
    }
  }

  // Gather all items to send in create mode
  const selectedItems = (() => {
    const items: { yarnType: string; count: number; source: 'store' | 'custom' | 'draft' }[] = []
    for (const y of sortedStore) {
      const c = counts[y.yarnType] || 0
      if (c > 0) items.push({ yarnType: y.yarnType, count: c, source: 'store' })
    }
    for (const c of customItems) {
      if (c.yarnType.trim() && c.count > 0) items.push({ yarnType: c.yarnType.trim(), count: c.count, source: 'custom' })
    }
    if (query.trim() && draftCount > 0) {
      const existing = items.find((i) => norm(i.yarnType) === norm(query.trim()))
      if (!existing) items.push({ yarnType: query.trim(), count: draftCount, source: 'draft' })
    }
    return items
  })()

  const canSave = q ? Boolean(yarnType.trim()) && editCount > 0 : selectedItems.length > 0

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      if (q) {
        const saved = await yarnRequestAction({
          action: 'requestUpdate',
          id: q.id,
          request: {
            yarnType: yarnType.trim(),
            kg: q.kg || 0,
            bags: editCount,
            neededBy: neededBy || null,
            note: note.trim(),
            imageUrl,
          },
        })
        onSaved(saved ? [saved] : [], false)
      } else {
        const createdList: YarnRequest[] = []
        for (const item of selectedItems) {
          const saved = await yarnRequestAction({
            action: 'requestCreate',
            request: {
              yarnType: item.yarnType,
              kg: 0,
              bags: item.count,
              neededBy: neededBy || null,
              note: note.trim(),
              imageUrl,
            },
          })
          if (saved) createdList.push(saved)
        }
        onSaved(createdList, true)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card shadow-sm border-0" style={{ maxWidth: 760, margin: '0 auto' }}>
      <div className="card-header bg-light py-3 px-4 d-flex align-items-center justify-content-between gap-2">
        <div className="d-flex align-items-center gap-2">
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onBack}>
            <i className="bi bi-arrow-left me-1" /> Back
          </button>
          <h5 className="card-title fs-6 fw-bold mb-0">{q ? 'Change yarn request' : 'Request yarn from the supplier'}</h5>
        </div>
      </div>
      <div className="card-body p-4">
            {error && <div className="alert alert-danger py-2 px-3 small">{error}</div>}
            <div className="row g-3">
              {q ? (
                <>
                  <div className="col-12">
                    <label className="form-label small fw-semibold mb-1" htmlFor="yr-yarn">
                      Yarn Quality
                    </label>
                    <input
                      id="yr-yarn"
                      list="yr-store-suggestions"
                      autoComplete="off"
                      className="form-control"
                      maxLength={120}
                      value={yarnType}
                      onChange={(e) => setYarnType(e.target.value)}
                    />
                    <datalist id="yr-store-suggestions">
                      {sortedStore.map((s) => (
                        <option key={s.yarnType} value={s.yarnType} />
                      ))}
                    </datalist>
                  </div>
                  <div className="col-12 d-flex align-items-center justify-content-between">
                    <span className="small fw-semibold">Count (Bags)</span>
                    <CountStepper value={editCount} min={1} onChange={setEditCount} ariaLabel="Count" />
                  </div>
                </>
              ) : (
                <div className="col-12">
                  {/* Type to search Fazal Umer stock or add a new quality */}
                  <label className="form-label small fw-semibold mb-1" htmlFor="yr-search">
                    Type Yarn Quality &amp; Bags
                  </label>
                  <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                    <input
                      id="yr-search"
                      type="text"
                      className="form-control form-control-sm flex-fill"
                      style={{ minWidth: 160 }}
                      maxLength={120}
                      autoComplete="off"
                      placeholder="Type to search Fazal Umer stock or enter quality…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && query.trim()) {
                          e.preventDefault()
                          addTypedQuality()
                        }
                      }}
                    />
                    <CountStepper
                      value={draftCount}
                      onChange={setDraftCount}
                      ariaLabel="Bags"
                    />
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      disabled={!query.trim()}
                      onClick={addTypedQuality}
                    >
                      <i className="bi bi-plus-lg" /> Add
                    </button>
                  </div>

                  {/* Suggestions from Fazal Umer's stock (shown only while typing) */}
                  {qLower && (
                    <>
                      <div className="small fw-semibold text-secondary mb-1">
                        Fazal Umer Stock Suggestions ({filteredStore.length} matching)
                      </div>
                      <div className="border rounded mb-3" style={{ maxHeight: 170, overflowY: 'auto' }}>
                        {filteredStore.length === 0 ? (
                          <div className="p-2 small text-secondary text-center">
                            {store.length === 0
                              ? 'No yarn in Fazal Umer stock yet — click Add above to request it.'
                              : `No matching yarn in Fazal Umer stock for “${query.trim()}” — click Add above to request it anyway.`}
                          </div>
                        ) : (
                          filteredStore.map((y) => {
                            const c = counts[y.yarnType] || 0
                            return (
                              <div
                                key={y.yarnType}
                                className={`d-flex align-items-center justify-content-between gap-2 px-3 py-2 border-bottom ${c > 0 ? 'bg-primary-subtle bg-opacity-25' : ''}`}
                              >
                                <div
                                  className="min-w-0 flex-fill"
                                  style={{ cursor: 'pointer' }}
                                  onClick={() => setQuery(y.yarnType)}
                                  title="Click to fill in box"
                                >
                                  <div className="fw-semibold small text-truncate">{y.yarnType}</div>
                                  <div className={y.balanceKg > 0 ? 'text-secondary' : 'text-danger'} style={{ fontSize: 11 }}>
                                    Fazal Umer stock: {fmtKg(y.balanceKg)} · {bagsText(y.balanceBags)}
                                  </div>
                                </div>
                                <CountStepper
                                  value={c}
                                  onChange={(next) => setStoreCount(y.yarnType, next)}
                                  ariaLabel={y.yarnType}
                                />
                              </div>
                            )
                          })
                        )}
                      </div>
                    </>
                  )}

                  {/* Clear summary of what is being requested */}
                  <div className="border rounded bg-light p-2">
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <span className="small fw-semibold">Requested Items</span>
                      <span className={`badge ${selectedItems.length > 0 ? 'text-bg-primary' : 'text-bg-secondary'}`}>
                        {selectedItems.length} {selectedItems.length === 1 ? 'item' : 'items'}
                      </span>
                    </div>
                    {selectedItems.length === 0 ? (
                      <div className="small text-secondary py-1">
                        No items added yet — type a yarn quality above and click Add, or pick from the suggestions.
                      </div>
                    ) : (
                      <div className="bg-white border rounded divide-y">
                        {selectedItems.map((item) => (
                          <div
                            key={`${item.source}-${item.yarnType}`}
                            className="d-flex align-items-center justify-content-between gap-2 px-2 py-1 border-bottom"
                          >
                            <div className="min-w-0 flex-fill">
                              <div className="fw-semibold small text-truncate">{item.yarnType}</div>
                              <div className="text-secondary" style={{ fontSize: 11 }}>
                                {bagsText(item.count)}
                              </div>
                            </div>
                            <div className="d-flex align-items-center gap-1">
                              <CountStepper
                                value={item.count}
                                onChange={(next) => {
                                  if (item.source === 'store') setStoreCount(item.yarnType, next)
                                  else if (item.source === 'draft') setDraftCount(next)
                                  else
                                    setCustomItems((prev) =>
                                      next === 0
                                        ? prev.filter((c) => norm(c.yarnType) !== norm(item.yarnType))
                                        : prev.map((c) => (norm(c.yarnType) === norm(item.yarnType) ? { ...c, count: next } : c))
                                    )
                                }}
                                ariaLabel={item.yarnType}
                              />
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger py-0 px-2"
                                title="Remove"
                                aria-label={`Remove ${item.yarnType}`}
                                onClick={() => {
                                  if (item.source === 'store') setStoreCount(item.yarnType, 0)
                                  else if (item.source === 'draft') {
                                    setQuery('')
                                    setDraftCount(0)
                                  } else {
                                    setCustomItems((prev) => prev.filter((c) => norm(c.yarnType) !== norm(item.yarnType)))
                                  }
                                }}
                              >
                                <i className="bi bi-x-lg" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="col-12 col-sm-6">
                <label className="form-label small fw-semibold mb-1" htmlFor="yr-needed">
                  Needed by <span className="text-secondary fw-normal">(optional)</span>
                </label>
                <input id="yr-needed" type="date" className="form-control form-control-sm" min={q ? undefined : getCalendarToday()} value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
              </div>

              <div className="col-12 col-sm-6">
                <label className="form-label small fw-semibold mb-1" htmlFor="yr-image">
                  Image <span className="text-secondary fw-normal">(optional)</span>
                </label>
                <div className="d-flex align-items-center gap-2">
                  <input
                    id="yr-image"
                    type="file"
                    accept="image/*"
                    className="form-control form-control-sm"
                    disabled={uploading}
                    onChange={(e) => void handleImagePick(e.target.files?.[0])}
                  />
                </div>
                {uploading && <div className="small text-secondary mt-1">Uploading…</div>}
                {imageUrl && (
                  <div className="d-flex align-items-center gap-2 mt-2">
                    <a href={imageUrl} target="_blank" rel="noreferrer">
                      <img src={imageUrl} alt="Yarn request attachment" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6 }} className="border" />
                    </a>
                    <button type="button" className="btn btn-sm btn-outline-danger py-0 px-2" onClick={() => setImageUrl(null)}>
                      Remove
                    </button>
                  </div>
                )}
              </div>

              <div className="col-12">
                <label className="form-label small fw-semibold mb-1" htmlFor="yr-note">
                  Note <span className="text-secondary fw-normal">(optional — the supplier sees it)</span>
                </label>
                <input id="yr-note" className="form-control form-control-sm" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="card-footer bg-light px-4 py-3 d-flex justify-content-end gap-2">
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onBack}>
              Back
            </button>
            <button type="button" className="btn btn-sm btn-primary px-3" disabled={busy || uploading || !canSave} onClick={() => void save()}>
              <i className="bi bi-send me-1" />
              {busy ? 'Saving…' : q ? 'Save' : `Send request${selectedItems.length > 1 ? ` (${selectedItems.length})` : ''}`}
            </button>
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
  canManage,
  canSend,
  embedded = false,
  period = 'all',
  anchorDate,
  onChanged,
  onShare,
}: {
  mode: 'supplier' | 'mill'
  requests: YarnRequest[]
  /** Mill with Yarn Stock (Edit). */
  canManage: boolean
  /** Supplier with Yarn Supply (Edit). */
  canSend: boolean
  embedded?: boolean
  period?: TrackingPeriod
  anchorDate?: string
  onChanged: () => void
  onShare: (s: { title: string; text: string }) => void
}) {
  const { showConfirm, showError } = useAlertDialog()
  const [showClosed, setShowClosed] = useState(false)
  const todayYmd = anchorDate || getCalendarToday()
  // The supplier sees only requests still to send; once sent they move to Sent → Verified.
  const supplierView = mode === 'supplier'
  const active = requests.filter((q) => q.status === 'OPEN' || (!supplierView && q.status === 'COMPLETE'))
  const closed = supplierView ? [] : requests.filter((q) => q.status === 'CLOSED' || q.status === 'CANCELLED')
  const baseShown = showClosed ? requests : active
  const shown =
    supplierView || embedded || period === 'all'
      ? baseShown
      : baseShown.filter((q) => matchesTrackingPeriod(q.createdAt.slice(0, 10), period, todayYmd))

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

  return (
    <>
      {shown.length === 0 ? (
        <YarnEmptyState
          icon="bi-clipboard-check"
          title={mode === 'mill' ? 'No open requests' : 'No requests from Shah Textile'}
          subtitle={
            mode === 'mill'
              ? 'Use “Request yarn” to ask the supplier for stock.'
              : 'Nothing to send right now. Sent yarn is in “Sent — waiting”, then “Verified”.'
          }
        />
      ) : (
        <div className="table-responsive">
          <table className="table table-sm table-hover align-middle text-center mb-0" style={{ fontSize: 13 }}>
            <thead className="table-light">
              <tr>
                <th className="px-2">Requested</th>
                <th className="px-2">Yarn</th>
                <th className="px-2">Quantity</th>
                <th className="px-2">Needed by</th>
                <th className="px-2">Sent</th>
                <th className="px-2">Remaining</th>
                <th className="px-2">Status</th>
                <th className="px-2" style={{ width: 1 }} />
                {mode === 'mill' && <th className="px-2" style={{ width: 1 }} />}
              </tr>
            </thead>
            <tbody>
              {shown.map((q, idx) => {
                const isOpen = q.status === 'OPEN' || q.status === 'COMPLETE'
                const st = requestState(q)
                const late = isOpen && q.lots === 0 && q.neededBy != null && q.neededBy < getCalendarToday()
                const dateKey = q.createdAt.slice(0, 10)
                const prevDateKey = idx > 0 ? shown[idx - 1].createdAt.slice(0, 10) : null
                const isFirstOfDate = dateKey !== prevDateKey
                let dateSpan = 1
                if (isFirstOfDate) {
                  while (idx + dateSpan < shown.length && shown[idx + dateSpan].createdAt.slice(0, 10) === dateKey) {
                    dateSpan++
                  }
                }
                return (
                  <tr
                    key={q.id}
                    className={st.row || undefined}
                    style={idx > 0 && isFirstOfDate ? { borderTop: '2px solid #cbd5e1' } : undefined}
                  >
                    {isFirstOfDate && (
                      <td rowSpan={dateSpan} className="px-2 text-nowrap align-middle bg-white border-end">
                        <div className="fw-medium">{shortDate(dateKey)}</div>
                        {q.requestedBy && <div className="small text-secondary">By {q.requestedBy}</div>}
                      </td>
                    )}
                    <td className="px-2">
                      <div className="d-flex align-items-center justify-content-center gap-2">
                        {q.imageUrl && (
                          <a href={q.imageUrl} target="_blank" rel="noreferrer" title="View attached image">
                            <img
                              src={q.imageUrl}
                              alt={q.yarnType}
                              style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 4 }}
                              className="border"
                            />
                          </a>
                        )}
                        <div className="fw-semibold">{q.yarnType}</div>
                      </div>
                      {q.note && <div className="small text-secondary">{q.note}</div>}
                      <RequestLog q={q} />
                    </td>
                    <td className="px-2 text-nowrap">
                      {q.kg > 0 ? (
                        <>
                          <div className="sara-num">{fmtKg(q.kg)}</div>
                          {q.bags ? <div className="small text-secondary">{bagsText(q.bags)}</div> : null}
                        </>
                      ) : (
                        <div className="fw-semibold">{bagsText(q.bags)}</div>
                      )}
                    </td>
                    <td className={`px-2 text-nowrap ${late ? 'text-danger fw-semibold' : ''}`}>{q.neededBy ? shortDate(q.neededBy) : '—'}</td>
                    <td className="px-2 text-nowrap">
                      <div className="sara-num">{fmtKg(q.sentKg)}</div>
                      <div className="small text-secondary">
                        {q.sentBags > 0 ? `${bagsText(q.sentBags)} · ` : ''}
                        {q.lots} lot{q.lots === 1 ? '' : 's'}
                        {q.receivedKg > 0 ? ` · received ${fmtKg(q.receivedKg)}` : ''}
                      </div>
                    </td>
                    <td className="px-2 sara-num text-nowrap">
                      {isOpen
                        ? q.kg > 0
                          ? fmtKg(requestRemainingKg(q))
                          : q.bags != null && q.bags > 0
                            ? bagsText(Math.max(0, q.bags - q.sentBags))
                            : '—'
                        : '—'}
                    </td>
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
                          <Link href={`/floor/yarn-request?id=${encodeURIComponent(q.id)}`} className="btn btn-sm btn-outline-primary py-0 px-2 me-1">
                            Edit
                          </Link>
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
                    </td>
                    {mode === 'mill' && isFirstOfDate && (() => {
                      const groupOpen = shown
                        .slice(idx, idx + dateSpan)
                        .filter((item) => item.status === 'OPEN' || item.status === 'COMPLETE')
                      return (
                        <td rowSpan={dateSpan} className="px-2 text-center align-middle bg-white border-start text-nowrap">
                          {groupOpen.length > 0 && (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-success py-1 px-2"
                              title="Send all requests of this date by WhatsApp or Email"
                              onClick={() =>
                                onShare({
                                  title:
                                    groupOpen.length > 1
                                      ? `Yarn requests — ${shortDate(dateKey)}`
                                      : `Yarn request — ${groupOpen[0].yarnType}`,
                                  text: groupOpen.map((item) => yarnRequestShareText(item)).join('\n\n'),
                                })
                              }
                            >
                              <i className="bi bi-whatsapp" />
                            </button>
                          )}
                        </td>
                      )
                    })()}
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
            {showClosed ? 'Hide cancelled' : `Show cancelled (${closed.length})`}
          </button>
        </div>
      )}
    </>
  )
}
