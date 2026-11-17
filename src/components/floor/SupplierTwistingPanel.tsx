'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getCalendarToday } from '@/constants/productionCalendar'
import { longDateFromYmd } from '@/lib/longDate'
import { useAlertDialog } from '@/context/AlertDialogContext'
import { SectionLoader } from '@/components/shared/Loaders'
import { BagWeights, StockDialog, storeSupplierNames, storeYarnNames } from '@/components/floor/SupplierStorePanel'
import { bagsText, fetchYarnSupply, fmtKg, yarnSupplyAction, type SupplierTwisting, type YarnSupplyList } from '@/lib/floor/yarnSupply'

const MAX_BAGS = 200
const shortDate = (ymd: string | null) => (ymd ? longDateFromYmd(ymd) : '—')

export type TwistFilter = 'in' | 'done' | 'all'

/**
 * Twisting done: the twisted yarn goes back into the Balance (its own name and each bag's kg).
 * For a lot already back (`t.status === 'DONE'`) it corrects what came back.
 */
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
  const editing = t.status === 'DONE'
  const [yarnType, setYarnType] = useState(editing ? t.outYarnType : t.inYarnType)
  const [date, setDate] = useState(editing && t.outDate ? t.outDate : getCalendarToday())
  const startBags = Math.min(MAX_BAGS, Math.max(1, (editing ? t.outBagKg.length || t.outBags : t.inBags) || 1))
  const [bagCountText, setBagCountText] = useState(String(startBags))
  const [bagKg, setBagKg] = useState<string[]>(() => {
    if (editing && t.outBagKg.length > 0) return t.outBagKg.map((w) => w.toFixed(2))
    if (editing && t.outKg && t.outBags) return Array(startBags).fill((Math.round((t.outKg / t.outBags) * 100) / 100).toFixed(2))
    return Array(startBags).fill('')
  })
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
    const out = { yarnType: yarnType.trim(), date, bagKg: weights }
    yarnSupplyAction(editing ? { action: 'twistEdit', id: t.id, out } : { action: 'twistDone', id: t.id, out })
      .then(onSaved)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not save.'))
      .finally(() => setBusy(false))
  }

  return (
    <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true" style={{ backgroundColor: 'rgba(15, 23, 42, 0.65)' }}>
      <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg" role="document">
        <div className="modal-content border-0 shadow-lg" style={{ borderRadius: 14, overflow: 'hidden' }}>
          <div className="modal-header bg-light py-3 px-4">
            <h5 className="modal-title fs-6 fw-bold mb-0">{editing ? 'Correct yarn back from Twisting' : 'Twisting done — move to Balance'}</h5>
            <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
          </div>
          <div className="modal-body p-4">
            {error && <div className="alert alert-danger py-2 px-3 small">{error}</div>}
            <div className="rounded border bg-light px-3 py-2 small mb-3">
              <b>Issued to Twisting:</b> {t.inYarnType} · {shortDate(t.inDate)} · {bagsText(t.inBags)} · {fmtKg(t.inKg)}
              {t.supplierName && <> · Supplier: {t.supplierName}</>}
            </div>
            <div className="row g-3">
              <div className="col-12">
                <label className="form-label small fw-semibold mb-1" htmlFor="td-yarn">
                  Twisted yarn (name in the Balance)
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
              {busy ? 'Saving…' : editing ? 'Save' : 'Move to Balance'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Yarn Supply → Twisting (its own page). Flow: Fazal Umer Balance → "Issue to Twisting" (taken out
 * of the Balance) → shows here → "Move to Balance" with each bag's kg (back into the Balance).
 */
export function SupplierTwistingPanel({ filter, onFilterChange }: { filter: TwistFilter; onFilterChange: (f: TwistFilter) => void }) {
  const { showConfirm, showError, showSuccessSoon } = useAlertDialog()
  const [data, setData] = useState<YarnSupplyList | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [moving, setMoving] = useState<SupplierTwisting | null>(null)
  const [oldEdit, setOldEdit] = useState<SupplierTwisting | null>(null)

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
  const yarnNames = useMemo(() => storeYarnNames(data), [data])
  const supplierNames = useMemo(() => storeSupplierNames(data), [data])
  const twists = data?.twisting ?? []
  const inTwisting = twists.filter((t) => t.status === 'IN_TWISTING')
  const done = twists.filter((t) => t.status === 'DONE')
  const shown = filter === 'in' ? inTwisting : filter === 'done' ? done : twists
  const twistKg = inTwisting.reduce((a, t) => a + t.inKg, 0)
  const twistBags = inTwisting.reduce((a, t) => a + t.inBags, 0)
  const backKg = done.reduce((a, t) => a + (t.outKg || 0), 0)
  const dispatchOf = (t: SupplierTwisting) => (data?.deptDispatches ?? []).find((d) => d.id === t.dispatchId) || null

  const remove = (t: SupplierTwisting) =>
    showConfirm({
      title: 'Delete this Twisting lot?',
      message: `${t.inYarnType} · ${shortDate(t.inDate)} · ${bagsText(t.inBags)} · ${fmtKg(t.inKg)}${t.dispatchId ? ' — the yarn goes back into the Balance.' : ''}`,
      type: 'confirm',
      confirmText: 'Yes, delete',
      cancelText: 'Cancel',
      onConfirm: () =>
        yarnSupplyAction(t.dispatchId ? { action: 'delete', id: t.dispatchId } : { action: 'twistDelete', id: t.id })
          .then(load)
          .catch((err: unknown) => showError({ title: 'Not deleted', message: err instanceof Error ? err.message : 'Could not delete.' })),
    })

  const undo = (t: SupplierTwisting) =>
    showConfirm({
      title: 'Undo "moved to Balance"?',
      message: `${t.outYarnType} · ${fmtKg(t.outKg)} is taken out of the Balance and the lot is back in Twisting.`,
      type: 'confirm',
      confirmText: 'Yes, undo',
      cancelText: 'Cancel',
      onConfirm: () =>
        yarnSupplyAction({ action: 'twistUndo', id: t.id })
          .then(load)
          .catch((err: unknown) => showError({ title: 'Not undone', message: err instanceof Error ? err.message : 'Could not undo.' })),
    })

  const filters: Array<[TwistFilter, string, number]> = [
    ['in', 'In Twisting', inTwisting.length],
    ['done', 'Back in Balance', done.length],
    ['all', 'All', twists.length],
  ]

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div className="d-flex flex-wrap align-items-center gap-2 w-100">
            <h3 className="card-title mb-0 flex-grow-1" style={{ float: 'none' }}>
              Twisting
            </h3>
            {canEdit && (
              <Link href="/yarn-supply/send?to=TWISTING" className="btn btn-sm btn-primary">
                <i className="bi bi-arrow-repeat me-1" /> Issue to Twisting
              </Link>
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
              <div className="d-flex flex-wrap align-items-center gap-2 px-3 py-2 border-bottom small text-dark bg-light">
                <span className="badge text-bg-primary">1</span> Issue from Balance
                <i className="bi bi-arrow-right text-secondary" />
                <span className="badge text-bg-warning">2</span> In Twisting
                <i className="bi bi-arrow-right text-secondary" />
                <span className="badge text-bg-success">3</span> Move back to Balance
              </div>
              <div className="row g-2 p-3 border-bottom bg-light">
                <div className="col-12 col-md-4">
                  <div className="border rounded bg-white p-3 h-100 border-warning border-2">
                    <div className="small fw-semibold text-dark">In Twisting now</div>
                    <div className="fs-4 fw-bold text-warning-emphasis sara-num">{fmtKg(twistKg)}</div>
                    <div className="small text-body-secondary">
                      {inTwisting.length} {inTwisting.length === 1 ? 'lot' : 'lots'} · {bagsText(twistBags)}
                    </div>
                  </div>
                </div>
                <div className="col-6 col-md-4">
                  <div className="border rounded bg-white p-3 h-100">
                    <div className="small fw-semibold text-dark">Back in Balance</div>
                    <div className="fs-5 fw-bold text-success sara-num">{fmtKg(backKg)}</div>
                    <div className="small text-body-secondary">
                      {done.length} {done.length === 1 ? 'lot' : 'lots'} finished
                    </div>
                  </div>
                </div>
                <div className="col-6 col-md-4">
                  <div className="border rounded bg-white p-3 h-100">
                    <div className="small fw-semibold text-dark">Twisting loss</div>
                    <div className="fs-5 fw-bold text-danger sara-num">{fmtKg(done.reduce((a, t) => a + t.inKg - (t.outKg || 0), 0))}</div>
                    <div className="small text-body-secondary">Issued − came back (finished lots)</div>
                  </div>
                </div>
              </div>
              <div className="px-3 py-2 border-bottom">
                <div className="btn-group btn-group-sm" role="group" aria-label="Show">
                  {filters.map(([k, label, n]) => (
                    <button key={k} type="button" className={`btn ${filter === k ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => onFilterChange(k)}>
                      {label} <span className={`badge ms-1 ${filter === k ? 'bg-white text-primary' : 'text-bg-light border text-dark'}`}>{n}</span>
                    </button>
                  ))}
                </div>
              </div>
              {shown.length === 0 ? (
                <div className="p-3 small text-dark">
                  {filter === 'done' ? 'No lot has come back from Twisting yet.' : 'Nothing in Twisting. Use “Issue to Twisting” to send yarn from the Balance.'}
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-sm table-hover align-middle mb-0" style={{ fontSize: 13 }}>
                    <thead className="table-light">
                      <tr>
                        <th className="px-2 text-center">Date issued</th>
                        <th className="px-2">Yarn issued</th>
                        <th className="px-2 text-center">Issued</th>
                        <th className="px-2 text-center">Status</th>
                        <th className="px-2 text-center">Came back to Balance</th>
                        <th className="px-2 text-center">Loss</th>
                        <th className="px-2 text-end" style={{ width: 1 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((t) => {
                        const isDone = t.status === 'DONE'
                        const loss = isDone ? Math.round((t.inKg - (t.outKg || 0)) * 100) / 100 : 0
                        const d = dispatchOf(t)
                        return (
                          <tr key={t.id}>
                            <td className="px-2 text-center text-nowrap">{shortDate(t.inDate)}</td>
                            <td className="px-2">
                              <div className="fw-semibold">{t.inYarnType}</div>
                              {t.supplierName && <div className="small text-secondary">Supplier: {t.supplierName}</div>}
                              {d?.lotNo && <div className="small text-secondary">Lot {d.lotNo}</div>}
                              {t.note && <div className="small text-secondary">{t.note}</div>}
                            </td>
                            <td className="px-2 text-center sara-num">
                              {fmtKg(t.inKg)}
                              <div className="small text-secondary">{bagsText(t.inBags)}</div>
                              {d && d.bagKg.length > 0 && <BagWeights list={d.bagKg} />}
                            </td>
                            <td className="px-2 text-center">
                              {isDone ? <span className="badge text-bg-success">Back in Balance</span> : <span className="badge text-bg-warning">In Twisting</span>}
                            </td>
                            <td className="px-2 text-center small">
                              {isDone ? (
                                <>
                                  <div className="fw-semibold">{t.outYarnType}</div>
                                  <div className="sara-num">
                                    {fmtKg(t.outKg)} · {bagsText(t.outBags)}
                                  </div>
                                  <div className="text-secondary">{shortDate(t.outDate)}</div>
                                  {t.outBagKg.length > 0 && <BagWeights list={t.outBagKg} />}
                                </>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className={`px-2 text-center sara-num small ${loss > 0 ? 'text-danger' : ''}`}>{isDone ? fmtKg(loss) : '—'}</td>
                            <td className="px-2 text-end text-nowrap">
                              {canEdit && !isDone && (
                                <>
                                  <button type="button" className="btn btn-sm btn-success py-0 px-2 me-1" onClick={() => setMoving(t)}>
                                    Move to Balance
                                  </button>
                                  {t.dispatchId ? (
                                    <Link href={`/yarn-supply/send?id=${encodeURIComponent(t.dispatchId)}`} className="btn btn-sm btn-outline-primary py-0 px-2 me-1">
                                      Edit
                                    </Link>
                                  ) : (
                                    <button type="button" className="btn btn-sm btn-outline-primary py-0 px-2 me-1" onClick={() => setOldEdit(t)}>
                                      Edit
                                    </button>
                                  )}
                                  <button type="button" className="btn btn-sm btn-outline-danger py-0 px-2 me-1" title="Delete" onClick={() => remove(t)}>
                                    <i className="bi bi-trash" />
                                  </button>
                                </>
                              )}
                              {canEdit && isDone && (
                                <>
                                  <button type="button" className="btn btn-sm btn-outline-primary py-0 px-2 me-1" onClick={() => setMoving(t)}>
                                    Edit
                                  </button>
                                  <button type="button" className="btn btn-sm btn-outline-secondary py-0 px-2 me-1" onClick={() => undo(t)}>
                                    Undo
                                  </button>
                                </>
                              )}
                              {t.dispatchId && (
                                <Link href={`/yarn-supply/challan?id=${encodeURIComponent(t.dispatchId)}`} className="btn btn-sm btn-outline-secondary py-0 px-2" title="Print challan">
                                  <i className="bi bi-printer" />
                                </Link>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {moving && (
        <TwistDoneDialog
          t={moving}
          yarnNames={yarnNames}
          onClose={() => setMoving(null)}
          onSaved={() => {
            const wasDone = moving.status === 'DONE'
            setMoving(null)
            load()
            showSuccessSoon(
              wasDone
                ? { title: 'Saved', message: 'The yarn back in the Balance is changed.' }
                : { title: 'Moved', message: 'The twisted yarn is back in the Balance.' }
            )
          }}
        />
      )}
      {oldEdit && (
        <StockDialog
          entry={null}
          twisting={oldEdit}
          yarnNames={yarnNames}
          supplierNames={supplierNames}
          onClose={() => setOldEdit(null)}
          onSaved={() => {
            setOldEdit(null)
            load()
            showSuccessSoon({ title: 'Saved', message: 'Entry changed.' })
          }}
        />
      )}
    </>
  )
}
