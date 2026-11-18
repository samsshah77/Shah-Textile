'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pager, usePaged } from '@/components/floor/YarnPeriodTools'
import { useAlertDialog } from '@/context/AlertDialogContext'
import { SectionLoader } from '@/components/shared/Loaders'
import { TrackingPeriodBar } from '@/components/floor/TrackingPeriodBar'
import { BagWeights } from '@/components/floor/SupplierStorePanel'
import { longDateFromYmd } from '@/lib/longDate'
import {
  DESTINATION_LABEL,
  bagsText,
  fetchYarnSupply,
  fmtKg,
  formatTrackingPeriod,
  matchesTrackingPeriod,
  yarnSupplyAction,
  type TrackingPeriod,
  type YarnDispatch,
  type YarnSupplyList,
} from '@/lib/floor/yarnSupply'

export type DeptDestination = 'SIZING' | 'WARPING'

const shortDate = (ymd: string | null) => (ymd ? longDateFromYmd(ymd) : '—')
const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Yarn Supply → Sizing / Sectional Warping (one page each): lots Fazal Umer sent from his Balance
 * to his own department — record only. Daily / weekly / monthly view, page by page.
 */
export function SupplierDeptPanel({
  dest,
  period,
  date,
  today,
  onPeriodChange,
}: {
  dest: DeptDestination
  period: TrackingPeriod
  date: string
  today: string
  onPeriodChange: (period: TrackingPeriod, date: string) => void
}) {
  const { showConfirm, showError } = useAlertDialog()
  const [data, setData] = useState<YarnSupplyList | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

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

  const label = DESTINATION_LABEL[dest]
  const canEdit = Boolean(data?.canSend)
  const lots = useMemo(
    () => (data?.deptDispatches ?? []).filter((d) => d.destination === dest && matchesTrackingPeriod(d.sentDate, period, date)),
    [data, dest, period, date]
  )
  const totalKg = r2(lots.reduce((a, d) => a + d.weightKg, 0))
  const totalBags = lots.reduce((a, d) => a + d.bags, 0)
  const byYarn = useMemo(() => {
    const m = new Map<string, { yarnType: string; lots: number; bags: number; kg: number }>()
    for (const d of lots) {
      const k = d.yarnType.trim().toLowerCase()
      const row = m.get(k) ?? { yarnType: d.yarnType, lots: 0, bags: 0, kg: 0 }
      row.lots += 1
      row.bags += d.bags
      row.kg = r2(row.kg + d.weightKg)
      m.set(k, row)
    }
    return [...m.values()].sort((a, b) => b.kg - a.kg)
  }, [lots])

  const { page, pages, shown, setPage } = usePaged(lots, `${dest}|${period}|${date}`)
  const periodText = period === 'all' ? 'All dates' : formatTrackingPeriod(date, period)

  const remove = (d: YarnDispatch) =>
    showConfirm({
      title: 'Delete this lot?',
      message: `${label} · ${d.yarnType} · ${fmtKg(d.weightKg)} — the yarn goes back into the Balance.`,
      type: 'confirm',
      confirmText: 'Yes, delete',
      cancelText: 'Cancel',
      onConfirm: () =>
        yarnSupplyAction({ action: 'delete', id: d.id })
          .then(load)
          .catch((err: unknown) => showError({ title: 'Not deleted', message: err instanceof Error ? err.message : 'Could not delete.' })),
    })

  return (
    <div className="card">
      <div className="card-header">
        <div className="d-flex flex-wrap align-items-center gap-2 w-100">
          <h3 className="card-title mb-0 flex-grow-1" style={{ float: 'none' }}>
            {label}
          </h3>
          {canEdit && (
            <Link href={`/yarn-supply/send?to=${dest}`} className="btn btn-sm btn-primary">
              <i className="bi bi-send me-1" /> Send to {label}
            </Link>
          )}
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={load} title="Refresh" aria-label="Refresh">
            <i className="bi bi-arrow-clockwise" />
          </button>
        </div>
      </div>
      <div className="card-body p-0">
        <div className="px-3 py-2 border-bottom">
          <TrackingPeriodBar
            period={period}
            onPeriodChange={(p) => onPeriodChange(p, date)}
            anchorDate={date}
            onAnchorDateChange={(d) => onPeriodChange(period, d)}
            maxDate={today}
          />
        </div>
        {loadError ? (
          <div className="p-3 text-danger small">{loadError}</div>
        ) : !data ? (
          <SectionLoader compact />
        ) : (
          <>
            <div className="row g-2 p-3 border-bottom bg-light">
              <div className="col-12 col-md-4">
                <div className="border rounded bg-white p-3 h-100 border-primary border-2">
                  <div className="small fw-semibold text-dark">Sent to {label}</div>
                  <div className="fs-4 fw-bold text-primary sara-num">{fmtKg(totalKg)}</div>
                  <div className="small text-body-secondary">
                    {periodText} · {lots.length} {lots.length === 1 ? 'lot' : 'lots'} · {bagsText(totalBags)}
                  </div>
                </div>
              </div>
              {byYarn.length > 0 && (
                <div className="col-12 col-md-8">
                  <div className="border rounded bg-white h-100 overflow-hidden">
                    <table className="table table-sm align-middle mb-0" style={{ fontSize: 13 }}>
                      <thead className="table-light">
                        <tr>
                          <th className="px-2">Yarn</th>
                          <th className="px-2 text-center">Lots</th>
                          <th className="px-2 text-center">Bags</th>
                          <th className="px-2 text-center">Kg</th>
                        </tr>
                      </thead>
                      <tbody>
                        {byYarn.map((y) => (
                          <tr key={y.yarnType}>
                            <td className="px-2 fw-semibold">{y.yarnType}</td>
                            <td className="px-2 text-center">{y.lots}</td>
                            <td className="px-2 text-center">{y.bags}</td>
                            <td className="px-2 text-center sara-num">{fmtKg(y.kg)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            {lots.length === 0 ? (
              <div className="p-3 small text-dark">
                Nothing sent to {label} {period === 'all' ? 'yet' : `in ${periodText}`}.
              </div>
            ) : (
              <>
                <div className="table-responsive">
                  <table className="table table-sm table-hover align-middle mb-0" style={{ fontSize: 13 }}>
                    <thead className="table-light">
                      <tr>
                        <th className="px-2 text-center">Date</th>
                        <th className="px-2">Yarn</th>
                        <th className="px-2 text-center">Bags</th>
                        <th className="px-2 text-center">Kg</th>
                        <th className="px-2 text-center">Challan / Lot</th>
                        <th className="px-2 text-end" style={{ width: 1 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((d) => (
                        <tr key={d.id}>
                          <td className="px-2 text-nowrap text-center">{shortDate(d.sentDate)}</td>
                          <td className="px-2">
                            <div className="fw-semibold">{d.yarnType}</div>
                            {d.remarks && <div className="small text-secondary">{d.remarks}</div>}
                          </td>
                          <td className="px-2 text-center">{d.bags}</td>
                          <td className="px-2 text-center sara-num">
                            {fmtKg(d.weightKg)}
                            {d.bagKg.length > 0 && <BagWeights list={d.bagKg} />}
                          </td>
                          <td className="px-2 small text-center">
                            {[d.challanNo && `Challan ${d.challanNo}`, d.lotNo && `Lot ${d.lotNo}`].filter(Boolean).join(' · ') || '—'}
                          </td>
                          <td className="px-2 text-end text-nowrap">
                            {canEdit && (
                              <>
                                <Link href={`/yarn-supply/send?id=${encodeURIComponent(d.id)}`} className="btn btn-sm btn-outline-primary py-0 px-2 me-1">
                                  Edit
                                </Link>
                                <button type="button" className="btn btn-sm btn-outline-danger py-0 px-2 me-1" title="Delete" onClick={() => remove(d)}>
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
                <Pager page={page} pages={pages} total={lots.length} noun="lots" onPage={setPage} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
