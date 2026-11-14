'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getCalendarToday } from '@/constants/productionCalendar'
import { longDateFromYmd } from '@/lib/longDate'
import { useAlertDialog } from '@/context/AlertDialogContext'
import { SectionLoader } from '@/components/shared/Loaders'
import {
  DESTINATION_LABEL,
  bagsText,
  fetchYarnSupply,
  fmtKg,
  yarnSupplyAction,
  type SupplierStockEntry,
  type SupplierTwisting,
  type YarnSupplyList,
} from '@/lib/floor/yarnSupply'

export type StoreTab = 'stock' | 'twist' | 'out'

const MAX_BAGS = 200
const shortDate = (ymd: string | null) => (ymd ? longDateFromYmd(ymd) : '—')
const yarnKey = (s: string) => s.toLowerCase().replace(/[\s\-_.]+/g, '')

/** Each bag's kg, folded behind a small link so the table stays short. */
function BagWeights({ list }: { list: number[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="small">
      <button type="button" className="btn btn-link btn-sm p-0" style={{ fontSize: 12 }} onClick={() => setOpen((v) => !v)}>
        {open ? 'Hide bag weights' : 'Bag weights'}
      </button>
      {open && (
        <div className="text-secondary font-monospace" style={{ maxWidth: 260, whiteSpace: 'normal' }}>
          {list.map((w, i) => `${i + 1}: ${w.toFixed(2)}`).join(' · ')}
        </div>
      )}
    </div>
  )
}

/** Add / correct one Inventory entry, or one lot going into Twisting (`twisting`). */
function StockDialog({
  entry,
  twisting = null,
  forTwisting = false,
  yarnNames,
  supplierNames,
  onClose,
  onSaved,
}: {
  entry: SupplierStockEntry | null
  /** Correcting a lot in Twisting. */
  twisting?: SupplierTwisting | null
  /** Add to Twisting (not the Inventory). */
  forTwisting?: boolean
  yarnNames: string[]
  /** Supplier names used before (suggestions). */
  supplierNames: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const isTwist = forTwisting || twisting != null
  const [yarnType, setYarnType] = useState(twisting?.inYarnType || entry?.yarnType || '')
  const [date, setDate] = useState(twisting?.inDate || entry?.date || getCalendarToday())
  const [bags, setBags] = useState(twisting ? String(twisting.inBags || '') : entry ? String(entry.bags || '') : '')
  const [kg, setKg] = useState(twisting ? String(twisting.inKg) : entry ? String(entry.kg) : '')
  // Inventory (not Twisting): one bag weight for all the bags.
  const [bagWeight, setBagWeight] = useState(entry && entry.bags > 0 ? (Math.round((entry.kg / entry.bags) * 100) / 100).toFixed(2) : '')
  const bagCount = Number(bags) || 0
  const bagW = Math.round((parseFloat(bagWeight) || 0) * 100) / 100
  const invKg = Math.round(bagCount * bagW * 100) / 100
  const ready = isTwist ? Number(kg) > 0 : bagCount > 0 && bagW > 0
  const [note, setNote] = useState(twisting?.note || entry?.note || '')
  const [supplierName, setSupplierName] = useState(twisting?.supplierName || entry?.supplierName || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = () => {
    setBusy(true)
    setError(null)
    const stock = {
      yarnType: yarnType.trim(),
      date,
      bags: Number(bags) || 0,
      kg: isTwist ? Number(kg) : invKg,
      note: note.trim(),
      supplierName: supplierName.trim(),
      ...(isTwist ? {} : { bagWeightKg: bagW }),
    }
    yarnSupplyAction(
      isTwist
        ? twisting
          ? { action: 'twistUpdate', id: twisting.id, twist: stock }
          : { action: 'twistAdd', twist: stock }
        : entry
          ? { action: 'stockUpdate', id: entry.id, stock }
          : { action: 'stockAdd', stock }
    )
      .then(onSaved)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not save.'))
      .finally(() => setBusy(false))
  }

  return (
    <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true" style={{ backgroundColor: 'rgba(15, 23, 42, 0.65)' }}>
      <div className="modal-dialog modal-dialog-centered" role="document">
        <div className="modal-content border-0 shadow-lg" style={{ borderRadius: 14, overflow: 'hidden' }}>
          <div className="modal-header bg-light py-3 px-4">
            <h5 className="modal-title fs-6 fw-bold mb-0">{isTwist
                ? twisting
                  ? 'Correct twisting lot'
                  : 'Add yarn to Twisting'
                : entry
                  ? 'Correct inventory entry'
                  : 'Add stock to Inventory'}</h5>
            <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
          </div>
          <div className="modal-body p-4">
            {error && <div className="alert alert-danger py-2 px-3 small">{error}</div>}
            <div className="row g-3">
              <div className="col-12">
                <label className="form-label small fw-semibold mb-1" htmlFor="ss-yarn">
                  Yarn
                </label>
                <input
                  id="ss-yarn"
                  className="form-control"
                  list="ss-yarn-list"
                  autoComplete="off"
                  maxLength={120}
                  placeholder="e.g. 20/1 Pv China"
                  value={yarnType}
                  onChange={(e) => setYarnType(e.target.value)}
                />
                <datalist id="ss-yarn-list">
                  {yarnNames.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </div>
              <div className="col-12">
                <label className="form-label small fw-semibold mb-1" htmlFor="ss-supplier">
                  Supplier <span className="text-secondary fw-normal">(who the yarn came from)</span>
                </label>
                <input
                  id="ss-supplier"
                  className="form-control"
                  list="ss-supplier-list"
                  autoComplete="off"
                  maxLength={120}
                  placeholder="Supplier name"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                />
                <datalist id="ss-supplier-list">
                  {supplierNames.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </div>
              <div className="col-12 col-sm-4">
                <label className="form-label small fw-semibold mb-1" htmlFor="ss-date">
                  Date
                </label>
                <input id="ss-date" type="date" className="form-control" max={getCalendarToday()} value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="col-6 col-sm-4">
                <label className="form-label small fw-semibold mb-1" htmlFor="ss-bags">
                  Bags
                </label>
                <input id="ss-bags" inputMode="numeric" className="form-control text-end" value={bags} onChange={(e) => setBags(e.target.value.replace(/[^\d]/g, ''))} />
              </div>
              {isTwist ? (
                <div className="col-6 col-sm-4">
                  <label className="form-label small fw-semibold mb-1" htmlFor="ss-kg">
                    Kg
                  </label>
                  <input id="ss-kg" inputMode="decimal" className="form-control text-end" value={kg} onChange={(e) => setKg(e.target.value.replace(/[^\d.]/g, ''))} />
                </div>
              ) : (
                <div className="col-6 col-sm-4">
                  <label className="form-label small fw-semibold mb-1" htmlFor="ss-bagkg">
                    Weight of 1 bag (kg)
                  </label>
                  <input
                    id="ss-bagkg"
                    inputMode="decimal"
                    className="form-control text-end"
                    value={bagWeight}
                    onChange={(e) => setBagWeight(e.target.value.replace(/[^\d.]/g, ''))}
                    onBlur={(e) => {
                      const raw = e.target.value.trim()
                      if (raw !== '' && !isNaN(Number(raw))) setBagWeight(parseFloat(raw).toFixed(2))
                    }}
                  />
                </div>
              )}
              {!isTwist && (
                <div className="col-12">
                  <div id="ss-total" className="rounded border bg-light px-3 py-2 small">
                    Total: <b>{fmtKg(invKg)}</b>
                    {bagCount > 0 && bagW > 0 && (
                      <span className="text-secondary">
                        {' '}
                        ({bagCount} {bagCount === 1 ? 'bag' : 'bags'} × {bagW.toFixed(2)} kg)
                      </span>
                    )}
                  </div>
                </div>
              )}
              <div className="col-12">
                <label className="form-label small fw-semibold mb-1" htmlFor="ss-note">
                  Note <span className="text-secondary fw-normal">(optional — e.g. lot #)</span>
                </label>
                <input id="ss-note" className="form-control" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="modal-footer bg-light px-4 py-3">
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-sm btn-primary px-3" disabled={busy || !yarnType.trim() || !supplierName.trim() || !ready} onClick={save}>
              <i className="bi bi-check-lg me-1" />
              {busy ? 'Saving…' : entry || twisting ? 'Save' : isTwist ? 'Add to Twisting' : 'Add to Inventory'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Twisting done: the twisted yarn goes into the Inventory (its own name and kg). */
function TwistDoneDialog({
  t,
  yarnNames,
  onClose,
  onSaved,
}: {
  t: SupplierTwisting
  yarnNames: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const [yarnType, setYarnType] = useState(t.inYarnType)
  const [date, setDate] = useState(getCalendarToday())
  const startBags = Math.min(MAX_BAGS, Math.max(1, t.inBags || 1))
  const [bagCountText, setBagCountText] = useState(String(startBags))
  const [bagKg, setBagKg] = useState<string[]>(() => Array(startBags).fill(''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const weights = bagKg.map((v) => Math.round((parseFloat(v) || 0) * 100) / 100)
  const filled = weights.filter((w) => w > 0).length
  const kg = Math.round(weights.reduce((a, w) => a + w, 0) * 100) / 100
  const allFilled = filled === bagKg.length && bagKg.length > 0
  const loss = Math.round((t.inKg - kg) * 100) / 100
  const firstW = parseFloat(bagKg[0])

  const setBagCount = (n: number) => {
    const next = Math.min(MAX_BAGS, Math.max(1, Math.floor(n) || 1))
    setBagKg((prev) => {
      const copy = prev.slice(0, next)
      while (copy.length < next) copy.push('')
      return copy
    })
  }

  const save = () => {
    if (!allFilled) return setError(`Enter the weight of all ${bagKg.length} bags.`)
    setBusy(true)
    setError(null)
    yarnSupplyAction({ action: 'twistDone', id: t.id, out: { yarnType: yarnType.trim(), date, bagKg: weights } })
      .then(onSaved)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not save.'))
      .finally(() => setBusy(false))
  }

  return (
    <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true" style={{ backgroundColor: 'rgba(15, 23, 42, 0.65)' }}>
      <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg" role="document">
        <div className="modal-content border-0 shadow-lg" style={{ borderRadius: 14, overflow: 'hidden' }}>
          <div className="modal-header bg-light py-3 px-4">
            <h5 className="modal-title fs-6 fw-bold mb-0">Twisting done — move to Inventory</h5>
            <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
          </div>
          <div className="modal-body p-4">
            {error && <div className="alert alert-danger py-2 px-3 small">{error}</div>}
            <div className="rounded border bg-light px-3 py-2 small mb-3">
              <b>Went in:</b> {t.inYarnType} · {shortDate(t.inDate)} · {bagsText(t.inBags)} · {fmtKg(t.inKg)}
              {t.supplierName && <> · Supplier: {t.supplierName}</>}
            </div>
            <div className="row g-3">
              <div className="col-12">
                <label className="form-label small fw-semibold mb-1" htmlFor="td-yarn">
                  Twisted yarn (name in the Inventory)
                </label>
                <input
                  id="td-yarn"
                  className="form-control"
                  list="td-yarn-list"
                  autoComplete="off"
                  maxLength={120}
                  value={yarnType}
                  onChange={(e) => setYarnType(e.target.value)}
                />
                <datalist id="td-yarn-list">
                  {yarnNames.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </div>
              <div className="col-12 col-sm-4">
                <label className="form-label small fw-semibold mb-1" htmlFor="td-date">
                  Date
                </label>
                <input id="td-date" type="date" className="form-control" min={t.inDate} max={getCalendarToday()} value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="col-12 col-sm-8">
                <label className="form-label small fw-semibold mb-1" htmlFor="td-bags">
                  Bags out
                </label>
                <div className="d-flex flex-wrap align-items-center gap-2">
                  <div className="input-group" style={{ width: 150 }}>
                    <button
                      type="button"
                      className="btn btn-outline-secondary px-2"
                      aria-label="Fewer bags"
                      disabled={bagKg.length <= 1}
                      onClick={() => {
                        setBagCount(bagKg.length - 1)
                        setBagCountText(String(Math.max(1, bagKg.length - 1)))
                      }}
                    >
                      −
                    </button>
                    <input
                      id="td-bags"
                      inputMode="numeric"
                      className="form-control text-center fw-semibold px-1"
                      value={bagCountText}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 3)
                        setBagCountText(digits)
                        if (digits !== '') setBagCount(Number(digits))
                      }}
                      onBlur={() => {
                        const n = Math.min(MAX_BAGS, Math.max(1, Number(bagCountText) || 1))
                        setBagCount(n)
                        setBagCountText(String(n))
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-outline-secondary px-2"
                      aria-label="More bags"
                      disabled={bagKg.length >= MAX_BAGS}
                      onClick={() => {
                        setBagCount(bagKg.length + 1)
                        setBagCountText(String(Math.min(MAX_BAGS, bagKg.length + 1)))
                      }}
                    >
                      +
                    </button>
                  </div>
                  <span className="small text-secondary">
                    <strong id="td-total" className="text-dark">{fmtKg(kg)}</strong> · {filled}/{bagKg.length} filled
                  </span>
                  {firstW > 0 && bagKg.length > 1 && (
                    <button type="button" className="btn btn-sm btn-outline-primary py-0 px-2" onClick={() => setBagKg((prev) => prev.map(() => firstW.toFixed(2)))}>
                      Same weight ({firstW.toFixed(2)} kg)
                    </button>
                  )}
                </div>
              </div>
              <div className="col-12">
                <div className="row g-2">
                  {bagKg.map((v, i) => (
                    <div key={i} className="col-6 col-md-4">
                      <div className="input-group input-group-sm">
                        <span className="input-group-text" style={{ minWidth: 64 }}>
                          Bag {i + 1}
                        </span>
                        <input
                          inputMode="decimal"
                          className="form-control text-end td-bag"
                          placeholder="kg"
                          value={v}
                          onFocus={(e) => e.currentTarget.select()}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^\d.]/g, '')
                            setBagKg((prev) => prev.map((w, j) => (j === i ? val : w)))
                            setError(null)
                          }}
                          onBlur={(e) => {
                            const raw = e.target.value.trim()
                            if (raw !== '' && !isNaN(Number(raw))) setBagKg((prev) => prev.map((w, j) => (j === i ? parseFloat(raw).toFixed(2) : w)))
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {kg > 0 && loss !== 0 && (
              <div className={`small mt-3 ${loss > 0 ? 'text-danger' : 'text-success'}`}>
                {loss > 0 ? `Twisting loss: ${fmtKg(loss)}` : `Gain: ${fmtKg(-loss)}`}
              </div>
            )}
          </div>
          <div className="modal-footer bg-light px-4 py-3">
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-sm btn-success px-3" disabled={busy || !yarnType.trim() || !allFilled} onClick={save}>
              <i className="bi bi-box-arrow-in-down me-1" />
              {busy ? 'Saving…' : 'Move to Inventory'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Fazal Umer Inventory (Yarn Supply):
 *  - Store stock: his yarn inventory per yarn — added here, taken out by every lot he sends
 *    (to Sara Textile mill, Sizing or Warping).
 *  - Sizing / Warping: lots sent to his own departments (record only; the mill does not check them).
 */
export function SupplierStorePanel({ tab, onTabChange }: { tab: StoreTab; onTabChange: (t: StoreTab) => void }) {
  const { showConfirm, showError, showSuccessSoon } = useAlertDialog()
  const [data, setData] = useState<YarnSupplyList | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ entry: SupplierStockEntry | null; twisting?: SupplierTwisting | null; forTwisting?: boolean } | null>(null)
  const [twistDone, setTwistDone] = useState<SupplierTwisting | null>(null)
  const [showDoneTwists, setShowDoneTwists] = useState(false)
  const [showEntries, setShowEntries] = useState(false)
  const [deptFilter, setDeptFilter] = useState<'ALL' | 'SIZING' | 'WARPING'>('ALL')

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
  }, [load])

  const canEdit = Boolean(data?.canSend)
  const store = useMemo(() => data?.store ?? [], [data])
  const entries = data?.storeEntries ?? []
  const dept = (data?.deptDispatches ?? []).filter((d) => deptFilter === 'ALL' || d.destination === deptFilter)
  const yarnNames = useMemo(() => {
    const seen = new Map<string, string>()
    for (const n of [...store.map((s) => s.yarnType), ...(data?.stock ?? []).map((s) => s.yarnType)]) {
      if (!seen.has(yarnKey(n))) seen.set(yarnKey(n), n)
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b))
  }, [store, data])
  const supplierNames = useMemo(() => {
    const seen = new Map<string, string>()
    for (const n of [...(data?.storeEntries ?? []).map((e) => e.supplierName), ...(data?.twisting ?? []).map((t) => t.supplierName)]) {
      const name = (n || '').trim()
      if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name)
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b))
  }, [data])
  const totals = store.reduce(
    (a, s) => ({ inKg: a.inKg + s.inKg, outKg: a.outKg + s.outKg, balanceKg: a.balanceKg + s.balanceKg }),
    { inKg: 0, outKg: 0, balanceKg: 0 }
  )
  const deptTotals = (data?.deptDispatches ?? []).reduce(
    (a, d) => {
      if (d.destination === 'SIZING') a.sizing += d.weightKg
      if (d.destination === 'WARPING') a.warping += d.weightKg
      return a
    },
    { sizing: 0, warping: 0 }
  )

  const removeEntry = (e: SupplierStockEntry) =>
    showConfirm({
      title: 'Delete this stock entry?',
      message: `${e.yarnType} · ${shortDate(e.date)} · ${bagsText(e.bags)} · ${fmtKg(e.kg)}`,
      type: 'confirm',
      confirmText: 'Yes, delete',
      cancelText: 'Cancel',
      onConfirm: () =>
        yarnSupplyAction({ action: 'stockDelete', id: e.id })
          .then(load)
          .catch((err: unknown) => showError({ title: 'Not deleted', message: err instanceof Error ? err.message : 'Could not delete.' })),
    })

  const removeDispatch = (id: string, label: string) =>
    showConfirm({
      title: 'Delete this lot?',
      message: label,
      type: 'confirm',
      confirmText: 'Yes, delete',
      cancelText: 'Cancel',
      onConfirm: () =>
        yarnSupplyAction({ action: 'delete', id })
          .then(load)
          .catch((err: unknown) => showError({ title: 'Not deleted', message: err instanceof Error ? err.message : 'Could not delete.' })),
    })

  const tabs: Array<[StoreTab, string, string]> = [
    ['stock', 'Inventory', 'bi-box-seam'],
    ['twist', 'Twisting', 'bi-arrow-repeat'],
  ]
  const twists = data?.twisting ?? []
  const inTwisting = twists.filter((t) => t.status === 'IN_TWISTING')
  const shownTwists = showDoneTwists ? twists : inTwisting
  const twistKg = inTwisting.reduce((a, t) => a + t.inKg, 0)

  const removeTwist = (t: SupplierTwisting) =>
    showConfirm({
      title: 'Delete this twisting lot?',
      message: `${t.inYarnType} · ${shortDate(t.inDate)} · ${bagsText(t.inBags)} · ${fmtKg(t.inKg)}`,
      type: 'confirm',
      confirmText: 'Yes, delete',
      cancelText: 'Cancel',
      onConfirm: () =>
        yarnSupplyAction({ action: 'twistDelete', id: t.id })
          .then(load)
          .catch((err: unknown) => showError({ title: 'Not deleted', message: err instanceof Error ? err.message : 'Could not delete.' })),
    })
  const undoTwist = (t: SupplierTwisting) =>
    showConfirm({
      title: 'Undo "moved to Inventory"?',
      message: `${t.outYarnType} · ${fmtKg(t.outKg)} is taken out of the Inventory and the lot is back in Twisting.`,
      type: 'confirm',
      confirmText: 'Yes, undo',
      cancelText: 'Cancel',
      onConfirm: () =>
        yarnSupplyAction({ action: 'twistUndo', id: t.id })
          .then(load)
          .catch((err: unknown) => showError({ title: 'Not undone', message: err instanceof Error ? err.message : 'Could not undo.' })),
    })

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div className="d-flex flex-wrap align-items-center gap-2 w-100">
          <h3 className="card-title mb-0 flex-grow-1" style={{ float: 'none' }}>
            {tab === 'out' ? 'Sizing / Sectional Warping' : 'Fazal Umer Inventory'}
          </h3>
          {tab !== 'out' && (
          <div className="btn-group btn-group-sm" role="tablist" aria-label="Inventory view">
            {tabs.map(([k, label, icon]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                className={`btn ${tab === k ? 'btn-primary' : 'btn-outline-primary'}`}
                onClick={() => onTabChange(k)}
              >
                <i className={`bi ${icon} me-1`} />
                {label}
                {k === 'twist' && inTwisting.length > 0 ? <span className="badge text-bg-warning ms-1">{inTwisting.length}</span> : null}
              </button>
            ))}
          </div>
          )}
          {canEdit && tab === 'twist' && (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setDialog({ entry: null, forTwisting: true })}>
              <i className="bi bi-plus-lg me-1" /> Add to Twisting
            </button>
          )}
          {canEdit && tab === 'stock' && (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setDialog({ entry: null })}>
              <i className="bi bi-plus-lg me-1" /> Add stock
            </button>
          )}
          {canEdit && tab === 'out' && (
            <>
              <Link href="/yarn-supply/send?to=SIZING" className="btn btn-sm btn-primary">
                <i className="bi bi-send me-1" /> Send to Sizing
              </Link>
              <Link href="/yarn-supply/send?to=WARPING" className="btn btn-sm btn-primary">
                <i className="bi bi-send me-1" /> Send to Sectional Warping
              </Link>
            </>
          )}
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={load} title="Refresh" aria-label="Refresh">
            <i className="bi bi-arrow-clockwise" />
          </button>
          </div>
        </div>

        <div className="card-body p-0">
          {loadError ? (
            <div className="p-3 text-danger small">{loadError}</div>
          ) : !data ? (
            <SectionLoader compact />
          ) : tab === 'stock' ? (
            <>
              <div className="row g-0 border-bottom text-center small">
                <div className="col-4 py-2">
                  <div className="text-secondary">Added</div>
                  <div className="fw-bold text-success">{fmtKg(totals.inKg)}</div>
                </div>
                <div className="col-4 py-2 border-start">
                  <div className="text-secondary">Sent (mill + Sizing + Sectional Warping)</div>
                  <div className="fw-bold text-danger">{fmtKg(totals.outKg)}</div>
                </div>
                <div className="col-4 py-2 border-start">
                  <div className="text-secondary">In inventory now</div>
                  <div className="fw-bold text-primary">{fmtKg(totals.balanceKg)}</div>
                </div>
              </div>
              {store.length === 0 ? (
                <div className="p-3 small text-secondary">No stock yet. Use “Add stock” to enter the yarn in the Inventory.</div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-sm table-hover align-middle mb-0" style={{ fontSize: 13 }}>
                    <thead className="table-light">
                      <tr>
                        <th className="px-2">Yarn</th>
                        <th className="px-2 text-center">Added</th>
                        <th className="px-2 text-center">Sent</th>
                        <th className="px-2 text-center">In inventory</th>
                      </tr>
                    </thead>
                    <tbody>
                      {store.map((s) => (
                        <tr key={s.yarnType}>
                          <td className="px-2 fw-semibold">{s.yarnType}</td>
                          <td className="px-2 text-center font-monospace">
                            {fmtKg(s.inKg)}
                            <div className="small text-secondary">{bagsText(s.inBags)}</div>
                          </td>
                          <td className="px-2 text-center font-monospace">
                            {fmtKg(s.outKg)}
                            <div className="small text-secondary">{bagsText(s.outBags)}</div>
                          </td>
                          <td className={`px-2 text-center font-monospace fw-bold ${s.balanceKg < 0 ? 'text-danger' : 'text-primary'}`}>
                            {fmtKg(s.balanceKg)}
                            <div className="small fw-normal text-secondary">{bagsText(s.balanceBags)}</div>
                            {s.balanceKg < 0 && <div className="small fw-normal text-danger">More sent than added — add the missing stock</div>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="px-3 py-2 border-top small">
                <button type="button" className="btn btn-link btn-sm p-0" onClick={() => setShowEntries((v) => !v)}>
                  {showEntries ? 'Hide stock entries' : `Stock entries (${entries.length})`}
                </button>
              </div>
              {showEntries && entries.length > 0 && (
                <div className="table-responsive border-top">
                  <table className="table table-sm align-middle mb-0" style={{ fontSize: 13 }}>
                    <thead className="table-light">
                      <tr>
                        <th className="px-2 text-center">Date</th>
                        <th className="px-2">Yarn</th>
                        <th className="px-2 text-center">Supplier</th>
                        <th className="px-2 text-center">Bags</th>
                        <th className="px-2 text-center">Kg</th>
                        <th className="px-2 text-center">Note</th>
                        <th className="px-2 text-end" style={{ width: 1 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((e) => (
                        <tr key={e.id}>
                          <td className="px-2 text-nowrap text-center">{shortDate(e.date)}</td>
                          <td className="px-2">{e.yarnType}</td>
                          <td className="px-2 text-center">{e.supplierName || '—'}</td>
                          <td className="px-2 text-center">
                            {e.bags}
                            {e.bagKg.length === 0 && e.bags > 0 && (
                              <div className="small text-secondary">× {(Math.round((e.kg / e.bags) * 100) / 100).toFixed(2)} kg</div>
                            )}
                          </td>
                          <td className="px-2 text-center font-monospace">
                            {fmtKg(e.kg)}
                            {e.bagKg.length > 0 && <BagWeights list={e.bagKg} />}
                          </td>
                          <td className="px-2 small text-secondary text-center">
                            {e.note}
                            {e.createdBy && <div>By {e.createdBy}</div>}
                          </td>
                          <td className="px-2 text-end text-nowrap">
                            {canEdit && (
                              <>
                                <button type="button" className="btn btn-sm btn-outline-primary py-0 px-2 me-1" onClick={() => setDialog({ entry: e })}>
                                  Edit
                                </button>
                                <button type="button" className="btn btn-sm btn-outline-danger py-0 px-2" title="Delete" onClick={() => removeEntry(e)}>
                                  <i className="bi bi-trash" />
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : tab === 'twist' ? (
            <>
              <div className="row g-0 border-bottom text-center small">
                <div className="col-6 py-2">
                  <div className="text-secondary">Lots in Twisting</div>
                  <div className="fw-bold">{inTwisting.length}</div>
                </div>
                <div className="col-6 py-2 border-start">
                  <div className="text-secondary">Kg in Twisting now</div>
                  <div className="fw-bold text-primary">{fmtKg(twistKg)}</div>
                </div>
              </div>
              {shownTwists.length === 0 ? (
                <div className="p-3 small text-secondary">Nothing in Twisting. Use “Add to Twisting” when raw yarn comes in for twisting.</div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-sm table-hover align-middle mb-0" style={{ fontSize: 13 }}>
                    <thead className="table-light">
                      <tr>
                        <th className="px-2 text-center">Date in</th>
                        <th className="px-2">Yarn in</th>
                        <th className="px-2 text-center">In</th>
                        <th className="px-2 text-center">Status</th>
                        <th className="px-2 text-center">Out to Inventory</th>
                        <th className="px-2 text-center">Loss</th>
                        <th className="px-2 text-end" style={{ width: 1 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {shownTwists.map((t) => {
                        const done = t.status === 'DONE'
                        const loss = done ? Math.round((t.inKg - (t.outKg || 0)) * 100) / 100 : 0
                        return (
                          <tr key={t.id} className={done ? 'text-secondary' : undefined}>
                            <td className="px-2 text-center text-nowrap">{shortDate(t.inDate)}</td>
                            <td className="px-2">
                              <div className="fw-semibold">{t.inYarnType}</div>
                              {t.supplierName && <div className="small">Supplier: {t.supplierName}</div>}
                              {t.note && <div className="small text-secondary">{t.note}</div>}
                            </td>
                            <td className="px-2 text-center font-monospace">
                              {fmtKg(t.inKg)}
                              <div className="small text-secondary">{bagsText(t.inBags)}</div>
                            </td>
                            <td className="px-2 text-center">
                              {done ? <span className="badge text-bg-success">In Inventory</span> : <span className="badge text-bg-warning">In Twisting</span>}
                            </td>
                            <td className="px-2 text-center small">
                              {done ? (
                                <>
                                  <div className="fw-semibold">{t.outYarnType}</div>
                                  <div className="font-monospace">
                                    {fmtKg(t.outKg)} · {bagsText(t.outBags)}
                                  </div>
                                  <div className="text-secondary">{shortDate(t.outDate)}</div>
                                  {t.outBagKg.length > 0 && <BagWeights list={t.outBagKg} />}
                                </>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className={`px-2 text-center font-monospace small ${loss > 0 ? 'text-danger' : ''}`}>{done ? fmtKg(loss) : '—'}</td>
                            <td className="px-2 text-end text-nowrap">
                              {canEdit && !done && (
                                <>
                                  <button type="button" className="btn btn-sm btn-success py-0 px-2 me-1" onClick={() => setTwistDone(t)}>
                                    Move to Inventory
                                  </button>
                                  <button type="button" className="btn btn-sm btn-outline-primary py-0 px-2 me-1" onClick={() => setDialog({ entry: null, twisting: t })}>
                                    Edit
                                  </button>
                                  <button type="button" className="btn btn-sm btn-outline-danger py-0 px-2" title="Delete" onClick={() => removeTwist(t)}>
                                    <i className="bi bi-trash" />
                                  </button>
                                </>
                              )}
                              {canEdit && done && (
                                <button type="button" className="btn btn-sm btn-outline-secondary py-0 px-2" onClick={() => undoTwist(t)}>
                                  Undo
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
              {twists.length > inTwisting.length && (
                <div className="px-3 py-2 border-top small">
                  <button type="button" className="btn btn-link btn-sm p-0" onClick={() => setShowDoneTwists((v) => !v)}>
                    {showDoneTwists ? 'Hide finished lots' : `Finished lots (${twists.length - inTwisting.length})`}
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="d-flex flex-wrap align-items-center gap-2 px-3 py-2 border-bottom small">
                <div className="btn-group btn-group-sm" role="group">
                  {(['ALL', 'SIZING', 'WARPING'] as const).map((k) => (
                    <button key={k} type="button" className={`btn ${deptFilter === k ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setDeptFilter(k)}>
                      {k === 'ALL' ? 'All' : DESTINATION_LABEL[k]}
                    </button>
                  ))}
                </div>
                <span className="text-secondary ms-auto">
                  Sizing: <b>{fmtKg(deptTotals.sizing)}</b> · Sectional Warping: <b>{fmtKg(deptTotals.warping)}</b>
                </span>
              </div>
              {dept.length === 0 ? (
                <div className="p-3 small text-secondary">Nothing sent to Sizing / Sectional Warping yet.</div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-sm table-hover align-middle mb-0" style={{ fontSize: 13 }}>
                    <thead className="table-light">
                      <tr>
                        <th className="px-2 text-center">Date</th>
                        <th className="px-2 text-center">To</th>
                        <th className="px-2">Yarn</th>
                        <th className="px-2 text-center">Bags</th>
                        <th className="px-2 text-center">Kg</th>
                        <th className="px-2 text-center">Challan / Lot</th>
                        <th className="px-2 text-end" style={{ width: 1 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {dept.map((d) => (
                        <tr key={d.id}>
                          <td className="px-2 text-nowrap text-center">{shortDate(d.sentDate)}</td>
                          <td className="px-2 text-center">
                            <span className={`badge ${d.destination === 'SIZING' ? 'text-bg-info' : 'text-bg-secondary'}`}>{DESTINATION_LABEL[d.destination]}</span>
                          </td>
                          <td className="px-2">
                            <div className="fw-semibold">{d.yarnType}</div>
                            {d.remarks && <div className="small text-secondary">{d.remarks}</div>}
                          </td>
                          <td className="px-2 text-center">{d.bags}</td>
                          <td className="px-2 text-center font-monospace">{fmtKg(d.weightKg)}</td>
                          <td className="px-2 small text-center">
                            {[d.challanNo && `Challan ${d.challanNo}`, d.lotNo && `Lot ${d.lotNo}`].filter(Boolean).join(' · ') || '—'}
                          </td>
                          <td className="px-2 text-end text-nowrap">
                            {canEdit && (
                              <>
                                <Link href={`/yarn-supply/send?id=${encodeURIComponent(d.id)}`} className="btn btn-sm btn-outline-primary py-0 px-2 me-1">
                                  Edit
                                </Link>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-danger py-0 px-2 me-1"
                                  title="Delete"
                                  onClick={() => removeDispatch(d.id, `${DESTINATION_LABEL[d.destination]} · ${d.yarnType} · ${fmtKg(d.weightKg)}`)}
                                >
                                  <i className="bi bi-trash" />
                                </button>
                              </>
                            )}
                            <Link href={`/yarn-supply/challan?id=${encodeURIComponent(d.id)}`} className="btn btn-sm btn-outline-secondary py-0 px-2" title="Print challan">
                              <i className="bi bi-printer" /> Challan
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {twistDone && (
        <TwistDoneDialog
          t={twistDone}
          yarnNames={yarnNames}
          onClose={() => setTwistDone(null)}
          onSaved={() => {
            setTwistDone(null)
            load()
            showSuccessSoon({ title: 'Moved', message: 'The twisted yarn is now in the Inventory.' })
          }}
        />
      )}
      {dialog && (
        <StockDialog
          entry={dialog.entry}
          twisting={dialog.twisting ?? null}
          forTwisting={dialog.forTwisting}
          yarnNames={yarnNames}
          supplierNames={supplierNames}
          onClose={() => setDialog(null)}
          onSaved={() => {
            const editing = dialog.entry || dialog.twisting
            const twist = dialog.forTwisting || dialog.twisting
            setDialog(null)
            load()
            showSuccessSoon({
              title: 'Saved',
              message: editing ? 'Entry changed.' : twist ? 'Added to Twisting.' : 'Added to the Inventory.',
            })
          }}
        />
      )}
    </>
  )
}
