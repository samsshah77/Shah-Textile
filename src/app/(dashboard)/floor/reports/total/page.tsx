'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/shared/PageHeader'
import { MetricCard } from '@/components/shared/MetricCard'
import { ExportPdfButton } from '@/components/shared/ExportPdfButton'
import { SimpleBarChart, SimpleHBarList, SimpleLineChart } from '@/components/shared/MiniCharts'
import { productionService } from '@/services/productionService'
import { formatNumber } from '@/lib/utils'
import { PRODUCTION_TODAY_MONTH } from '@/constants/productionCalendar'

const MONTH_OPTIONS = [
  { value: '2026-09', label: 'September 2026' },
  { value: '2026-08', label: 'August 2026' },
]

/** Excel “Total” tab — day×loom meters matrix + fortnight / monthly rollups + charts. */
export default function ProductionTotalTrackingPage() {
  const [month, setMonth] = useState(PRODUCTION_TODAY_MONTH)
  const [matrix, setMatrix] = useState(() => productionService.getMonthlyMatrix(month))

  useEffect(() => {
    setMatrix(productionService.getMonthlyMatrix(month))
  }, [month])

  const daySeries = useMemo(
    () =>
      matrix.days.map((d) => ({
        label: String(d.day),
        value: d.totalMeters || 0,
      })),
    [matrix.days]
  )

  const loomSeries = useMemo(() => {
    const entries = Object.entries(matrix.loomTotals || {}).map(([loom, meters]) => ({
      label: `Loom ${loom}`,
      value: Number(meters) || 0,
    }))
    entries.sort((a, b) => b.value - a.value)
    return entries
  }, [matrix.loomTotals])

  const loomNumbers = useMemo(() => {
    const set = new Set<number>()
    matrix.days.forEach((d) => {
      Object.keys(d.loomMeters || {}).forEach((k) => set.add(Number(k)))
    })
    Object.keys(matrix.loomTotals || {}).forEach((k) => set.add(Number(k)))
    return Array.from(set).sort((a, b) => a - b)
  }, [matrix])

  const mid = Math.ceil(matrix.days.length / 2) || 1
  const fortnight1 = matrix.days.slice(0, mid).reduce((s, d) => s + (d.totalMeters || 0), 0)
  const fortnight2 = matrix.days.slice(mid).reduce((s, d) => s + (d.totalMeters || 0), 0)

  const loomFortnight = (loom: number, half: 1 | 2) => {
    const slice = half === 1 ? matrix.days.slice(0, mid) : matrix.days.slice(mid)
    return slice.reduce((s, d) => s + (Number(d.loomMeters?.[loom]) || 0), 0)
  }

  const monthLabel = (() => {
    try {
      const [y, m] = month.split('-').map(Number)
      return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    } catch {
      return month
    }
  })()

  return (
    <div className="pb-4">
      <PageHeader
        title="Production Total Tracking"
        showBreadcrumbs={false}
        actions={
          <>
            <select
              className="form-select form-select-sm"
              style={{ width: 'auto' }}
              value={month}
              aria-label="Month"
              onChange={(e) => setMonth(e.target.value)}
            >
              {MONTH_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ExportPdfButton filename={`Production-Total-${month}`} sheetLabel="Total Tracking" />
          </>
        }
      />

      <div className="row g-3 mb-3">
        <div className="col-6 col-lg-3">
          <MetricCard
            title="Monthly Grand Total"
            value={`${formatNumber(matrix.grandTotalMeters, 0)} m`}
            subValue={monthLabel}
            biIcon="bi-graph-up-arrow"
            colorVariant="primary"
          />
        </div>
        <div className="col-6 col-lg-3">
          <MetricCard
            title="Avg Per Day"
            value={`${formatNumber(matrix.avgPerDay, 0)} m`}
            subValue={`${matrix.days.length} days logged`}
            biIcon="bi-calendar3"
            colorVariant="success"
          />
        </div>
        <div className="col-6 col-lg-3">
          <MetricCard
            title="1st Fortnight"
            value={`${formatNumber(fortnight1, 0)} m`}
            subValue={`Days 1–${mid}`}
            biIcon="bi-1-circle"
            colorVariant="info"
          />
        </div>
        <div className="col-6 col-lg-3">
          <MetricCard
            title="2nd Fortnight"
            value={`${formatNumber(fortnight2, 0)} m`}
            subValue={`Days ${mid + 1}+`}
            biIcon="bi-2-circle"
            colorVariant="warning"
          />
        </div>
      </div>

      <div className="row g-3 mb-3">
        <div className="col-lg-7">
          <div className="card h-100">
            <div className="card-header">
              <h3 className="card-title mb-0">Daily mill output (m)</h3>
            </div>
            <div className="card-body">
              <SimpleBarChart data={daySeries} height={180} />
              <div className="mt-3">
                <SimpleLineChart data={daySeries} height={120} stroke="#0d6efd" />
              </div>
            </div>
          </div>
        </div>
        <div className="col-lg-5">
          <div className="card h-100">
            <div className="card-header">
              <h3 className="card-title mb-0">Top looms this month</h3>
            </div>
            <div className="card-body">
              <SimpleHBarList data={loomSeries} maxBars={12} />
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
          <h3 className="card-title mb-0">Total matrix — Loom × Day (meters)</h3>
          <Link href="/floor/production" className="btn btn-sm btn-outline-primary">
            Open Production Sheet
          </Link>
        </div>
        <div className="card-body p-0" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table className="table table-sm table-bordered mb-0 align-middle text-nowrap">
            <thead className="table-light">
              <tr>
                <th className="px-2 sticky-start bg-light">L/#</th>
                {matrix.days.map((d) => (
                  <th key={d.date || d.day} className="px-1 text-center" style={{ fontSize: 11 }}>
                    {d.day}
                  </th>
                ))}
                <th className="px-2 text-end">1st FN</th>
                <th className="px-2 text-end">2nd FN</th>
                <th className="px-2 text-end">Monthly</th>
                <th className="px-2 text-end">Avg/Day</th>
              </tr>
            </thead>
            <tbody>
              {loomNumbers.map((loom) => {
                const monthly = Number(matrix.loomTotals?.[loom]) || 0
                const daysWith = matrix.days.filter(
                  (d) => (Number(d.loomMeters?.[loom]) || 0) > 0
                ).length
                const avg = daysWith > 0 ? monthly / daysWith : 0
                return (
                  <tr key={loom}>
                    <td className="fw-semibold px-2">{loom}</td>
                    {matrix.days.map((d) => {
                      const v = Number(d.loomMeters?.[loom]) || 0
                      return (
                        <td
                          key={`${loom}-${d.date || d.day}`}
                          className="text-end px-1"
                          style={{
                            fontSize: 11,
                            backgroundColor: v === 0 ? '#f8f9fa' : undefined,
                          }}
                        >
                          {v || '—'}
                        </td>
                      )
                    })}
                    <td className="text-end px-2 fw-semibold">
                      {formatNumber(loomFortnight(loom, 1), 0)}
                    </td>
                    <td className="text-end px-2 fw-semibold">
                      {formatNumber(loomFortnight(loom, 2), 0)}
                    </td>
                    <td className="text-end px-2 fw-bold">{formatNumber(monthly, 0)}</td>
                    <td className="text-end px-2 text-secondary">{formatNumber(avg, 1)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="table-light fw-semibold">
              <tr>
                <td className="px-2">Day Total</td>
                {matrix.days.map((d) => (
                  <td key={`t-${d.date || d.day}`} className="text-end px-1" style={{ fontSize: 11 }}>
                    {formatNumber(d.totalMeters || 0, 0)}
                  </td>
                ))}
                <td className="text-end px-2">{formatNumber(fortnight1, 0)}</td>
                <td className="text-end px-2">{formatNumber(fortnight2, 0)}</td>
                <td className="text-end px-2">{formatNumber(matrix.grandTotalMeters, 0)}</td>
                <td className="text-end px-2">{formatNumber(matrix.avgPerDay, 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
