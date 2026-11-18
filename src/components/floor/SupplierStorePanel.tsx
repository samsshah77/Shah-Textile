'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getCalendarToday } from '@/constants/productionCalendar'
import { longDateFromYmd } from '@/lib/longDate'
import { useAlertDialog } from '@/context/AlertDialogContext'
import { SectionLoader } from '@/components/shared/Loaders'
import { TrackingPeriodBar } from '@/components/floor/TrackingPeriodBar'
import { Pager, periodRange, usePaged } from '@/components/floor/YarnPeriodTools'
import {
  bagsText,
  fetchYarnSupply,
  fmtKg,
  formatTrackingPeriod,
  yarnSupplyAction,
  type TrackingPeriod,
  type SupplierStockEntry,
  type SupplierTwisting,
  type YarnSupplyList,
} from '@/lib/floor/yarnSupply'

export type StoreTab = 'stock'

const shortDate = (ymd: string | null) => (ymd ? longDateFromYmd(ymd) : '—')
const yarnKey = (s: string) => s.toLowerCase().replace(/[\s\-_.]+/g, '')

/** Each bag's kg, folded behind a small link so the table stays short. */
export function BagWeights({ list }: { list: number[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="small">
      <button type="button" className="btn btn-link btn-sm p-0" style={{ fontSize: 12 }} onClick={() => setOpen((v) => !v)}>
        {open ? 'Hide bag weights' : 'Bag weights'}
      </button>
      {open && (
        <div className="text-secondary sara-num" style={{ maxWidth: 260, whiteSpace: 'normal' }}>
          {list.map((w, i) => `${i + 1}: ${w.toFixed(2)}`).join(' · ')}
        </div>
      )}
    </div>
  )
}

/** Add / correct one Balance entry, or an old lot added straight to Twisting (`twisting`). */
export function StockDialog({
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
  /** Add to Twisting (not the Balance). */
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
  const initialBags = twisting ? twisting.inBags : entry ? entry.bags : 0
  const initialKg = twisting ? twisting.inKg : entry ? entry.kg : 0
  const [bagWeight, setBagWeight] = useState(
    initialBags > 0 ? (Math.round((initialKg / initialBags) * 100) / 100).toFixed(2) : ''
  )
  const bagCount = Number(bags) || 0
  const bagW = Math.round((parseFloat(bagWeight) || 0) * 100) / 100
  const totalKg = Math.round(bagCount * bagW * 100) / 100
  const ready = bagCount > 0 && bagW > 0
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
      bags: bagCount,
      kg: totalKg,
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
                  ? 'Correct Balance entry'
                  : 'Add stock to Balance'}</h5>
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
              <div className="col-12">
                <div id="ss-total" className="rounded border bg-light px-3 py-2 small">
                  Total: <b>{fmtKg(totalKg)}</b>
                  {bagCount > 0 && bagW > 0 && (
                    <span className="text-secondary">
                      {' '}
                      ({bagCount} {bagCount === 1 ? 'bag' : 'bags'} × {bagW.toFixed(2)} kg)
                    </span>
                  )}
                </div>
              </div>
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
              {busy ? 'Saving…' : entry || twisting ? 'Save' : isTwist ? 'Add to Twisting' : 'Add to Balance'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


/** Yarn names for suggestions: the Balance's yarns + Sara Textile's yarns (one spelling each). */
export function storeYarnNames(data: YarnSupplyList | null): string[] {
  const seen = new Map<string, string>()
  for (const n of [
    ...(data?.store ?? []).map((s) => s.yarnType),
    ...(data?.storeEntries ?? []).map((s) => s.yarnType),
    ...(data?.stock ?? []).map((s) => s.yarnType),
  ]) {
    if (!seen.has(yarnKey(n))) seen.set(yarnKey(n), n)
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}

/** Supplier names used before (suggestions). */
export function storeSupplierNames(data: YarnSupplyList | null): string[] {
  const seen = new Map<string, string>()
  for (const n of [...(data?.storeEntries ?? []).map((e) => e.supplierName), ...(data?.twisting ?? []).map((t) => t.supplierName)]) {
    const name = (n || '').trim()
    if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name)
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}

/** One kg figure with its bags under it; "—" when nothing. */
function KgCell({ kg, bags, sign, className = '' }: { kg: number; bags: number; sign?: '+' | '−'; className?: string }) {
  if (!kg && !bags) return <td className={`px-2 text-end text-body-secondary ${className}`}>—</td>
  return (
    <td className={`px-2 text-end sara-num text-nowrap ${className}`}>
      <div className="fw-semibold">
        {sign ?? ''}
        {fmtKg(kg)}
      </div>
      <div className="small text-body-secondary">{bagsText(bags)}</div>
    </td>
  )
}

const resetDate = (at: string) => {
  const d = new Date(at)
  return Number.isNaN(d.getTime())
    ? at
    : new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'long', year: 'numeric' }).format(d)
}

/**
 * Fazal Umer Balance (Yarn Supply):
 *  - Balance: his yarn per quality — added here or back from Twisting, taken out by every lot he
 *    sends (Sara Textile, Sizing, Sectional Warping) or issues to Twisting.
 * Twisting, Sizing and Sectional Warping have their own pages (/yarn-supply/twisting, /sizing, /warping).
 */
type BalanceRow = {
  yarnType: string
  openKg: number
  openBags: number
  addedKg: number
  addedBags: number
  fromTwistKg: number
  fromTwistBags: number
  toMillKg: number
  toMillBags: number
  toDeptKg: number
  toDeptBags: number
  toTwistKg: number
  toTwistBags: number
  inKg: number
  inBags: number
  outKg: number
  outBags: number
  closeKg: number
  closeBags: number
}

const emptyRow = (yarnType: string): BalanceRow => ({
  yarnType,
  openKg: 0,
  openBags: 0,
  addedKg: 0,
  addedBags: 0,
  fromTwistKg: 0,
  fromTwistBags: 0,
  toMillKg: 0,
  toMillBags: 0,
  toDeptKg: 0,
  toDeptBags: 0,
  toTwistKg: 0,
  toTwistBags: 0,
  inKg: 0,
  inBags: 0,
  outKg: 0,
  outBags: 0,
  closeKg: 0,
  closeBags: 0,
})

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Per yarn for one period: Opening (everything dated before it), Inward / Outward dated inside it,
 * Closing = Opening + Inward − Outward. "All" = since the reset, Closing = Balance now.
 */
function balanceRows(data: YarnSupplyList, from: string, to: string): BalanceRow[] {
  const map = new Map<string, BalanceRow>()
  for (const m of data.storeMoves) {
    if (m.date > to) continue
    const k = yarnKey(m.yarnType)
    const row = map.get(k) ?? emptyRow(m.yarnType)
    map.set(k, row)
    const sign = m.kind === 'added' || m.kind === 'fromTwist' ? 1 : -1
    if (m.date < from) {
      row.openKg += sign * m.kg
      row.openBags += sign * m.bags
      continue
    }
    row[`${m.kind}Kg`] += m.kg
    row[`${m.kind}Bags`] += m.bags
    if (sign > 0) {
      row.inKg += m.kg
      row.inBags += m.bags
    } else {
      row.outKg += m.kg
      row.outBags += m.bags
    }
  }
  return [...map.values()]
    .map((b) => ({
      ...b,
      openKg: r2(b.openKg),
      addedKg: r2(b.addedKg),
      fromTwistKg: r2(b.fromTwistKg),
      toMillKg: r2(b.toMillKg),
      toDeptKg: r2(b.toDeptKg),
      toTwistKg: r2(b.toTwistKg),
      inKg: r2(b.inKg),
      outKg: r2(b.outKg),
      closeKg: r2(b.openKg + b.inKg - b.outKg),
      closeBags: b.openBags + b.inBags - b.outBags,
    }))
    .filter((b) => b.openKg !== 0 || b.openBags !== 0 || b.inKg !== 0 || b.outKg !== 0 || b.inBags !== 0 || b.outBags !== 0)
    .sort((a, b) => a.yarnType.localeCompare(b.yarnType))
}

export function SupplierStorePanel({
  tab,
  period,
  date,
  today,
  onPeriodChange,
}: {
  tab: StoreTab
  period: TrackingPeriod
  date: string
  today: string
  onPeriodChange: (period: TrackingPeriod, date: string) => void
}) {
  const { showConfirm, showError, showSuccessSoon } = useAlertDialog()
  const [data, setData] = useState<YarnSupplyList | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ entry: SupplierStockEntry | null } | null>(null)
  const [showEntries, setShowEntries] = useState(false)
  const [showOld, setShowOld] = useState(false)

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
  const { from, to } = periodRange(period, date)
  const isAll = period === 'all'
  const periodText = isAll ? 'All dates' : formatTrackingPeriod(date, period)
  const rows = useMemo(() => (data ? balanceRows(data, from, to) : []), [data, from, to])
  const inPeriod = (ymd: string) => ymd >= from && ymd <= to
  const allEntries = (data?.storeEntries ?? []).filter((e) => inPeriod(e.date))
  const entries = allEntries.filter((e) => !e.beforeReset)
  const oldEntries = allEntries.filter((e) => e.beforeReset)
  const shownEntries = showOld ? allEntries : entries
  const entryPages = usePaged(shownEntries, `${period}|${date}|${showOld}`)
  const reset = data?.balanceReset ?? null
  const yarnNames = useMemo(() => storeYarnNames(data), [data])
  const supplierNames = useMemo(() => storeSupplierNames(data), [data])
  const t = rows.reduce((a, r) => {
    for (const key of Object.keys(a) as Array<keyof BalanceRow>) {
      if (key !== 'yarnType') (a[key] as number) += r[key] as number
    }
    return a
  }, emptyRow('Total'))
  for (const key of Object.keys(t) as Array<keyof BalanceRow>) {
    if (key.endsWith('Kg')) (t[key] as number) = r2(t[key] as number)
  }
  const closeLabel = isAll ? 'Balance now' : 'Closing balance'

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

  const resetBalance = () =>
    showConfirm({
      title: 'Reset Fazal Umer Balance to zero?',
      message:
        'Every yarn starts again from 0 kg. Old entries stay in the lists as history but no longer count. Lots sent to Sara Textile, Sizing, Sectional Warping and Twisting are not changed. After this, add the yarn Fazal Umer has now with “Add stock”.',
      type: 'confirm',
      confirmText: 'Yes, reset to zero',
      cancelText: 'Cancel',
      onConfirm: () =>
        yarnSupplyAction({ action: 'balanceReset' })
          .then(() => {
            load()
            showSuccessSoon({ title: 'Reset', message: 'Fazal Umer Balance is now 0. Add the opening stock with “Add stock”.' })
          })
          .catch((err: unknown) => showError({ title: 'Not reset', message: err instanceof Error ? err.message : 'Could not reset.' })),
    })

  const undoReset = () =>
    showConfirm({
      title: 'Undo the reset?',
      message: 'The Balance goes back to what it was before the reset.',
      type: 'confirm',
      confirmText: 'Yes, undo',
      cancelText: 'Cancel',
      onConfirm: () =>
        yarnSupplyAction({ action: 'balanceResetUndo' })
          .then(load)
          .catch((err: unknown) => showError({ title: 'Not undone', message: err instanceof Error ? err.message : 'Could not undo.' })),
    })

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div className="d-flex flex-wrap align-items-center gap-2 w-100">
            <h3 className="card-title mb-0 flex-grow-1" style={{ float: 'none' }}>
              Fazal Umer Stock
            </h3>
            {canEdit && tab === 'stock' && (
              <button type="button" className="btn btn-sm btn-primary" onClick={() => setDialog({ entry: null })}>
                <i className="bi bi-plus-lg me-1" /> Add stock
              </button>
            )}
            {data?.canReset && tab === 'stock' && (
              <button type="button" className="btn btn-sm btn-outline-danger" onClick={resetBalance}>
                <i className="bi bi-arrow-counterclockwise me-1" /> Reset Balance to zero
              </button>
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
          ) : (
            <>
              {reset && (
                <div className="d-flex flex-wrap align-items-center gap-2 px-3 py-2 border-bottom small text-dark" style={{ background: '#fff8e1' }}>
                  <i className="bi bi-info-circle text-warning-emphasis" />
                  <span>
                    Balance was reset to zero on <b>{resetDate(reset.at)}</b>
                    {reset.by ? ` by ${reset.by}` : ''}. Only entries after that are counted.
                  </span>
                  {data.canReset && reset.canUndo && (
                    <button type="button" className="btn btn-sm btn-outline-secondary py-0 px-2 ms-auto" onClick={undoReset}>
                      Undo reset
                    </button>
                  )}
                </div>
              )}
              <div className="px-3 py-2 border-bottom">
                <TrackingPeriodBar
                  period={period}
                  onPeriodChange={(p) => onPeriodChange(p, date)}
                  anchorDate={date}
                  onAnchorDateChange={(d) => onPeriodChange(period, d)}
                  maxDate={today}
                />
              </div>
              <div className="row g-2 p-3 border-bottom bg-light">
                <div className="col-12 col-md-4">
                  <div className="border rounded bg-white p-3 h-100 border-primary border-2">
                    <div className="small fw-semibold text-dark">{closeLabel}</div>
                    <div className="fs-4 fw-bold text-primary sara-num">{fmtKg(t.closeKg)}</div>
                    <div className="small text-body-secondary">
                      {isAll
                        ? `${bagsText(t.closeBags)} · yarn Fazal Umer has right now`
                        : `${bagsText(t.closeBags)} · end of ${periodText} · Opening ${fmtKg(t.openKg)}`}
                    </div>
                  </div>
                </div>
                <div className="col-6 col-md-4">
                  <div className="border rounded bg-white p-3 h-100">
                    <div className="small fw-semibold text-dark">Inward (+)</div>
                    <div className="fs-5 fw-bold text-success sara-num">{fmtKg(t.inKg)}</div>
                    <div className="small text-body-secondary">Stock added + back from Twisting{isAll ? '' : ` · ${periodText}`}</div>
                  </div>
                </div>
                <div className="col-6 col-md-4">
                  <div className="border rounded bg-white p-3 h-100">
                    <div className="small fw-semibold text-dark">Outward (−)</div>
                    <div className="fs-5 fw-bold text-danger sara-num">{fmtKg(t.outKg)}</div>
                    <div className="small text-body-secondary">
                      To Sara Textile, Sizing, Sectional Warping and Twisting{isAll ? '' : ` · ${periodText}`}
                    </div>
                  </div>
                </div>
              </div>
              {rows.length === 0 ? (
                <div className="p-3 small text-dark">
                  {isAll ? 'Nothing in the Balance yet. Use “Add stock” to enter the yarn Fazal Umer has.' : `Nothing in the Balance in ${periodText}.`}
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-bordered align-middle mb-0 sara-balance-table" style={{ fontSize: 14 }}>
                    <thead>
                      <tr className="text-center">
                        <th rowSpan={2} className="px-3 text-start align-middle table-light">
                          Yarn
                        </th>
                        {!isAll && (
                          <th rowSpan={2} className="px-3 align-middle table-light">
                            Opening balance
                          </th>
                        )}
                        <th colSpan={2} className="px-2 py-1" style={{ background: '#e8f5e9', color: '#1b5e20' }}>
                          Inward (+)
                        </th>
                        <th colSpan={3} className="px-2 py-1" style={{ background: '#fdecea', color: '#8e1c1c' }}>
                          Outward (−)
                        </th>
                        <th rowSpan={2} className="px-3 align-middle" style={{ background: '#e3edfb', color: '#0b3d91' }}>
                          {closeLabel}
                        </th>
                      </tr>
                      <tr className="text-center small">
                        <th className="px-2 fw-semibold" style={{ background: '#f1f8f2' }}>Stock added</th>
                        <th className="px-2 fw-semibold" style={{ background: '#f1f8f2' }}>Back from Twisting</th>
                        <th className="px-2 fw-semibold" style={{ background: '#fdf4f3' }}>To Sara Textile</th>
                        <th className="px-2 fw-semibold" style={{ background: '#fdf4f3' }}>To Sizing / Sectional Warping</th>
                        <th className="px-2 fw-semibold" style={{ background: '#fdf4f3' }}>To Twisting</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((s) => (
                        <tr key={s.yarnType}>
                          <td className="px-3 fw-semibold">
                            {s.yarnType}
                            {s.closeKg < 0 && <div className="small fw-normal text-danger">Outward is more than Inward — add the missing stock</div>}
                            {s.closeKg === 0 && <div className="small fw-normal text-body-secondary">Finished (0 kg)</div>}
                          </td>
                          {!isAll && <KgCell kg={s.openKg} bags={s.openBags} />}
                          <KgCell kg={s.addedKg} bags={s.addedBags} sign="+" className="text-success" />
                          <KgCell kg={s.fromTwistKg} bags={s.fromTwistBags} sign="+" className="text-success" />
                          <KgCell kg={s.toMillKg} bags={s.toMillBags} sign="−" className="text-danger" />
                          <KgCell kg={s.toDeptKg} bags={s.toDeptBags} sign="−" className="text-danger" />
                          <KgCell kg={s.toTwistKg} bags={s.toTwistBags} sign="−" className="text-danger" />
                          <td className="px-3 text-end sara-num text-nowrap" style={{ background: '#f4f8fe' }}>
                            <div className={`fw-bold fs-6 ${s.closeKg < 0 ? 'text-danger' : s.closeKg > 0 ? 'text-primary' : 'text-body-secondary'}`}>
                              {fmtKg(s.closeKg)}
                            </div>
                            <div className="small text-body-secondary">{bagsText(s.closeBags)}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {rows.length > 1 && (
                      <tfoot>
                        <tr className="table-light fw-bold">
                          <td className="px-3">Total</td>
                          {!isAll && <KgCell kg={t.openKg} bags={t.openBags} />}
                          <KgCell kg={t.addedKg} bags={t.addedBags} sign="+" className="text-success" />
                          <KgCell kg={t.fromTwistKg} bags={t.fromTwistBags} sign="+" className="text-success" />
                          <KgCell kg={t.toMillKg} bags={t.toMillBags} sign="−" className="text-danger" />
                          <KgCell kg={t.toDeptKg} bags={t.toDeptBags} sign="−" className="text-danger" />
                          <KgCell kg={t.toTwistKg} bags={t.toTwistBags} sign="−" className="text-danger" />
                          <td className="px-3 text-end sara-num text-nowrap text-primary" style={{ background: '#e3edfb' }}>
                            <div>{fmtKg(t.closeKg)}</div>
                            <div className="small fw-normal text-body-secondary">{bagsText(t.closeBags)}</div>
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                  <div className="px-3 py-2 small text-body-secondary border-top">
                    {isAll ? 'Balance now = ' : 'Closing balance = Opening balance + '}
                    Stock added + Back from Twisting − To Sara Textile − To Sizing / Sectional Warping − To Twisting
                  </div>
                </div>
              )}
              <div className="d-flex flex-wrap align-items-center gap-3 px-3 py-2 border-top small">
                <button type="button" className="btn btn-link btn-sm p-0" onClick={() => setShowEntries((v) => !v)}>
                  {showEntries ? 'Hide stock entries' : `Stock entries${isAll ? '' : ` in ${periodText}`} (${entries.length})`}
                </button>
                {showEntries && oldEntries.length > 0 && (
                  <button type="button" className="btn btn-link btn-sm p-0 text-secondary" onClick={() => setShowOld((v) => !v)}>
                    {showOld ? 'Hide entries from before the reset' : `Show entries from before the reset (${oldEntries.length})`}
                  </button>
                )}
              </div>
              {showEntries && shownEntries.length > 0 && (
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
                      {entryPages.shown.map((e) => (
                        <tr key={e.id} className={e.beforeReset ? 'text-body-secondary' : undefined}>
                          <td className="px-2 text-nowrap text-center">{shortDate(e.date)}</td>
                          <td className="px-2">
                            {e.yarnType}
                            {e.fromTwisting && <span className="badge text-bg-info ms-1">Back from Twisting</span>}
                            {e.beforeReset && <span className="badge text-bg-light border text-dark ms-1">Before reset</span>}
                          </td>
                          <td className="px-2 text-center">{e.supplierName || '—'}</td>
                          <td className="px-2 text-center">
                            {e.bags}
                            {e.bagKg.length === 0 && e.bags > 0 && (
                              <div className="small text-secondary">× {(Math.round((e.kg / e.bags) * 100) / 100).toFixed(2)} kg</div>
                            )}
                          </td>
                          <td className="px-2 text-center sara-num">
                            {fmtKg(e.kg)}
                            {e.bagKg.length > 0 && <BagWeights list={e.bagKg} />}
                          </td>
                          <td className="px-2 small text-secondary text-center">
                            {e.note}
                            {e.createdBy && <div>By {e.createdBy}</div>}
                          </td>
                          <td className="px-2 text-end text-nowrap">
                            {canEdit && !e.beforeReset && !e.fromTwisting && (
                              <>
                                <button type="button" className="btn btn-sm btn-outline-primary py-0 px-2 me-1" onClick={() => setDialog({ entry: e })}>
                                  Edit
                                </button>
                                <button type="button" className="btn btn-sm btn-outline-danger py-0 px-2" title="Delete" onClick={() => removeEntry(e)}>
                                  <i className="bi bi-trash" />
                                </button>
                              </>
                            )}
                            {canEdit && !e.beforeReset && e.fromTwisting && (
                              <Link href="/yarn-supply/twisting?show=done" className="btn btn-sm btn-outline-secondary py-0 px-2">
                                Change on Twisting
                              </Link>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {showEntries && (
                <Pager page={entryPages.page} pages={entryPages.pages} total={shownEntries.length} noun="entries" onPage={entryPages.setPage} />
              )}
              {showEntries && shownEntries.length === 0 && (
                <div className="px-3 pb-3 small text-dark">{isAll ? 'No stock entries yet.' : `No stock entries in ${periodText}.`}</div>
              )}
            </>
          )}
        </div>
      </div>

      {dialog && (
        <StockDialog
          entry={dialog.entry}
          yarnNames={yarnNames}
          supplierNames={supplierNames}
          onClose={() => setDialog(null)}
          onSaved={() => {
            const editing = dialog.entry
            setDialog(null)
            load()
            showSuccessSoon({ title: 'Saved', message: editing ? 'Entry changed.' : 'Added to the Balance.' })
          }}
        />
      )}
    </>
  )
}
