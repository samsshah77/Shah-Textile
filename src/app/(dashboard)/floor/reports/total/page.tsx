'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { PageHeader } from '@/components/shared/PageHeader'
import { MetricCard } from '@/components/shared/MetricCard'
import { ExportPdfButton } from '@/components/shared/ExportPdfButton'
import { SimpleBarChart, SimpleHBarList, SimpleLineChart } from '@/components/shared/MiniCharts'
import {
  hydrateFloorFromDb,
  preloadMonthSheets,
  productionMastersService,
  qualityRunOwnsSheetEntry,
} from '@/services/productionMastersService'
import { formatNumber } from '@/lib/utils'
import { PRODUCTION_TODAY_MONTH } from '@/constants/productionCalendar'
import type { MonthlyMatrixDay } from '@/types/production'

const MONTH_OPTIONS = [{ value: '2026-09', label: 'September 2026' }]

type TrackView = 'meters' | 'shifts' | 'efficiency' | 'active'

function readTrackView(raw: string | null): TrackView {
  if (raw === 'shifts' || raw === 'efficiency' || raw === 'active') return raw
  return 'meters'
}

type MatrixState = {
  days: MonthlyMatrixDay[]
  loomTotals: Record<number, number>
  grandTotalMeters: number
  avgPerDay: number
  loomActual: Record<number, number>
  loomTarget: Record<number, number>
  dayActual: number[]
  dayTarget: number[]
}

const EMPTY_MATRIX: MatrixState = {
  days: [],
  loomTotals: {},
  grandTotalMeters: 0,
  avgPerDay: 0,
  loomActual: {},
  loomTarget: {},
  dayActual: [],
  dayTarget: [],
}

function cleanQualityName(s: string) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function entryMeters(e: { totalMeters?: number | null; shiftAMeters?: number; shiftBMeters?: number }) {
  if (e.totalMeters != null) return Number(e.totalMeters) || 0
  return (Number(e.shiftAMeters) || 0) + (Number(e.shiftBMeters) || 0)
}

function formatShortDate(dateStr?: string | null) {
  if (!dateStr) return ''
  try {
    const d = new Date(`${dateStr}T12:00:00`)
    return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return dateStr
  }
}

/** Excel “Total” tab — day×loom meters matrix + fortnight / monthly rollups + charts. */
function ProductionTotalTrackingContent() {
  const searchParams = useSearchParams()
  const qualityId = searchParams.get('quality')
  const qualityNameParam = searchParams.get('name')
  const qualityFromParam = searchParams.get('from')
  const view = readTrackView(searchParams.get('view'))
  const isQualityDeepLink = Boolean(qualityId || qualityNameParam)

  const [month, setMonth] = useState(PRODUCTION_TODAY_MONTH)
  const [matrix, setMatrix] = useState<MatrixState>(EMPTY_MATRIX)
  const [shiftBMatrix, setShiftBMatrix] = useState<MatrixState>(EMPTY_MATRIX)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setMatrix(EMPTY_MATRIX)
      setShiftBMatrix(EMPTY_MATRIX)
      try {
        await hydrateFloorFromDb()
        await preloadMonthSheets(month)
        if (cancelled) return
        const primary =
          view === 'shifts' ? 'shiftA' : view === 'efficiency' ? 'efficiency' : view === 'active' ? 'active' : 'meters'
        // One paint only after hydrate + month sheets — avoids 0 m flash then real data.
        setMatrix(productionMastersService.buildMonthlyMatrix(month, primary))
        if (view === 'shifts') setShiftBMatrix(productionMastersService.buildMonthlyMatrix(month, 'shiftB'))
      } catch (err) {
        console.error('[total tracking] load failed', err)
        if (!cancelled) setMatrix(EMPTY_MATRIX)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [month, view])

  const qualityFocus = useMemo(() => {
    if (!qualityId && !qualityNameParam) return null
    const masters = productionMastersService.getQualities()
    const master = qualityId
      ? masters.find((q) => q.id === qualityId)
      : masters.find((q) => cleanQualityName(q.name) === cleanQualityName(qualityNameParam || ''))
    const name = qualityNameParam || master?.name || ''
    if (!name && !master) return null
    const createdOn =
      (master?.createdOn ? String(master.createdOn).slice(0, 10) : null) ||
      (qualityFromParam ? String(qualityFromParam).slice(0, 10) : null)
    // Ensure run boundary exists even if DB lagged on createdOn.
    const masterForRun: typeof master =
      master && createdOn && !master.createdOn
        ? { ...master, createdOn }
        : master
          ? { ...master, createdOn: master.createdOn || createdOn }
          : master
    return {
      id: master?.id || qualityId || '',
      name: name || master?.name || '',
      createdOn,
      endedOn:
        master && (master.status === 'ENDED' || master.status === 'HOLD')
          ? master.endedOn
            ? String(master.endedOn).slice(0, 10)
            : null
          : null,
      status: master?.status ?? 'ACTIVE',
      pick: master?.pick,
      master: masterForRun || null,
    }
  }, [qualityId, qualityNameParam, qualityFromParam, loading, matrix])

  const qualityCatalog = useMemo(() => {
    const list = productionMastersService.getQualities()
    if (!qualityFocus?.id || !qualityFocus.createdOn) return list
    // Patch focused quality createdOn into catalog so ownership never falls back to full history.
    return list.map((q) =>
      q.id === qualityFocus.id && !q.createdOn
        ? { ...q, createdOn: qualityFocus.createdOn }
        : q
    )
  }, [loading, matrix, qualityFocus?.id, qualityFocus?.createdOn])

  const qualityDaySeries = useMemo(() => {
    // Quality deep-link: never fall back to full-mill series (that caused the old-production flash).
    if (isQualityDeepLink && !qualityFocus?.master) {
      return matrix.days.map((d) => ({ label: String(d.day), value: 0 }))
    }
    if (!qualityFocus?.master) return null
    const q = qualityFocus.master
    return matrix.days.map((d) => {
      if (!d.date || !productionMastersService.hasPersistedSheet(d.date)) {
        return { label: String(d.day), value: 0 }
      }
      const entries = productionMastersService.buildSheetForDate(d.date)
      const value = entries
        .filter((e) => qualityRunOwnsSheetEntry(q, { ...e, date: d.date }, qualityCatalog, d.date))
        .reduce((s, e) => s + entryMeters(e), 0)
      return { label: String(d.day), value }
    })
  }, [matrix.days, qualityFocus, qualityCatalog, isQualityDeepLink])

  const daySeries = useMemo(() => {
    if (isQualityDeepLink) {
      return (
        qualityDaySeries ??
        matrix.days.map((d) => ({ label: String(d.day), value: 0 }))
      )
    }
    return (
      qualityDaySeries ??
      matrix.days.map((d) => ({
        label: String(d.day),
        value: d.totalMeters || 0,
      }))
    )
  }, [matrix.days, qualityDaySeries, isQualityDeepLink])

  const qualityLoomSet = useMemo(() => {
    if (isQualityDeepLink && !qualityFocus?.master) return new Set<number>()
    if (!qualityFocus?.master) return null
    const q = qualityFocus.master
    const set = new Set<number>()
    for (const d of matrix.days) {
      if (!d.date || !d.hasSheet) continue
      const entries = productionMastersService.buildSheetForDate(d.date)
      for (const e of entries) {
        if (
          qualityRunOwnsSheetEntry(q, { ...e, date: d.date }, qualityCatalog, d.date) &&
          entryMeters(e) > 0
        ) {
          set.add(e.loomNumber)
        }
      }
    }
    return set
  }, [matrix.days, qualityFocus, qualityCatalog, isQualityDeepLink])

  const loomSeries = useMemo(() => {
    const entries = Object.entries(matrix.loomTotals || {}).map(([loom, meters]) => ({
      label: `Loom ${loom}`,
      value: Number(meters) || 0,
      loom: Number(loom),
    }))
    const filtered = qualityLoomSet
      ? entries.filter((e) => qualityLoomSet.has(e.loom))
      : entries
    filtered.sort((a, b) => b.value - a.value)
    return filtered.map(({ label, value }) => ({ label, value }))
  }, [matrix.loomTotals, qualityLoomSet])

  /** By model: meters on Production tracking, sheet-weighted efficiency on Efficiency tracking. */
  const modelBars = useMemo(() => {
    const looms = productionMastersService.getLooms()
    const catOf = (n: number) => {
      const l = looms.find((x) => x.loomNumber === n)
      const c = (l?.category || l?.model || 'G6200') as string
      return c === 'G6300' || c === 'PU' ? c : 'G6200'
    }
    const colors: Record<string, string> = {
      G6200: '#0d6efd',
      G6300: '#198754',
      PU: '#fd7e14',
    }

    if (view === 'efficiency') {
      const source =
        matrix.loomActual && Object.keys(matrix.loomActual).length > 0
          ? matrix
          : productionMastersService.buildMonthlyMatrix(month, 'efficiency')
      const actual: Record<string, number> = { G6200: 0, G6300: 0, PU: 0 }
      const target: Record<string, number> = { G6200: 0, G6300: 0, PU: 0 }
      for (const [loomStr, meters] of Object.entries(source.loomActual || {})) {
        const loom = Number(loomStr)
        if (qualityLoomSet && !qualityLoomSet.has(loom)) continue
        const cat = catOf(loom)
        actual[cat] += Number(meters) || 0
        target[cat] += Number(source.loomTarget?.[loom] || 0)
      }
      return (['G6200', 'G6300', 'PU'] as const).map((label) => ({
        label,
        value: target[label] > 0 ? Math.round((actual[label] / target[label]) * 100) : 0,
        color: colors[label],
      }))
    }

    const metersMatrix =
      view === 'meters'
        ? matrix
        : productionMastersService.buildMonthlyMatrix(month, 'meters')
    const totals: Record<string, number> = { G6200: 0, G6300: 0, PU: 0 }
    for (const [loomStr, meters] of Object.entries(metersMatrix.loomTotals || {})) {
      const loom = Number(loomStr)
      if (qualityLoomSet && !qualityLoomSet.has(loom)) continue
      const cat = catOf(loom)
      totals[cat] = (totals[cat] || 0) + (Number(meters) || 0)
    }
    return (['G6200', 'G6300', 'PU'] as const).map((label) => ({
      label,
      value: totals[label] || 0,
      color: colors[label],
    }))
  }, [matrix, month, view, qualityLoomSet, loading])

  const modelBarSuffix = view === 'efficiency' ? '%' : ' m'
  const modelBarTitle = view === 'efficiency' ? 'By model — Efficiency' : 'By model — Production'

  const loomNumbers = useMemo(() => {
    const set = new Set<number>()
    matrix.days.forEach((d) => {
      Object.keys(d.loomMeters || {}).forEach((k) => set.add(Number(k)))
    })
    Object.keys(matrix.loomTotals || {}).forEach((k) => set.add(Number(k)))
    let list = Array.from(set).sort((a, b) => a - b)
    if (qualityLoomSet) {
      list = list.filter((n) => qualityLoomSet.has(n))
    }
    return list
  }, [matrix, qualityLoomSet])

  const mid = Math.ceil(matrix.days.length / 2) || 1
  const weightedSlice = (from: number, to: number, source: MatrixState = matrix) => {
    const actual = source.dayActual.slice(from, to).reduce((s, n) => s + n, 0)
    const target = source.dayTarget.slice(from, to).reduce((s, n) => s + n, 0)
    return target > 0 ? Math.round((actual / target) * 100) : 0
  }
  const fortnight1 =
    view === 'efficiency'
      ? weightedSlice(0, mid)
      : isQualityDeepLink
        ? daySeries.slice(0, mid).reduce((s, d) => s + (d.value || 0), 0)
        : matrix.days.slice(0, mid).reduce((s, d) => s + (d.totalMeters || 0), 0)
  const fortnight2 =
    view === 'efficiency'
      ? weightedSlice(mid, matrix.days.length)
      : isQualityDeepLink
        ? daySeries.slice(mid).reduce((s, d) => s + (d.value || 0), 0)
        : matrix.days.slice(mid).reduce((s, d) => s + (d.totalMeters || 0), 0)

  const loomFortnight = (loom: number, half: 1 | 2, source: MatrixState = matrix) => {
    const slice = half === 1 ? source.days.slice(0, mid) : source.days.slice(mid)
    if (view === 'efficiency') {
      const actual = slice.reduce((s, d) => s + (Number(d.loomActual?.[loom]) || 0), 0)
      const target = slice.reduce((s, d) => s + (Number(d.loomTarget?.[loom]) || 0), 0)
      return target > 0 ? Math.round((actual / target) * 100) : 0
    }
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

  const cellText = (d: MonthlyMatrixDay, loom: number) => {
    if (!d.hasSheet) return '—'
    const v = Number(d.loomMeters?.[loom]) || 0
    if (view === 'efficiency') return `${Math.round(v)}%`
    if (view === 'active') return v > 0 ? '1' : '0'
    return formatNumber(v, 0)
  }

  const pageTitle =
    view === 'shifts'
      ? 'Shift A / B Monthly Tracking'
      : view === 'efficiency'
        ? 'Efficiency Monthly Tracking'
        : view === 'active'
          ? 'Active Looms Monthly Tracking'
          : 'Production Total Tracking'

  const formatTotal = (n: number) =>
    view === 'efficiency' ? `${Math.round(n)}%` : view === 'active' ? formatNumber(n, 0) : `${formatNumber(n, 0)} m`

  const qualityMonthTotal = useMemo(
    () =>
      loading || !qualityDaySeries
        ? null
        : qualityDaySeries.reduce((s, p) => s + p.value, 0),
    [qualityDaySeries, loading]
  )

  const focusName = qualityFocus?.name || qualityNameParam || ''

  return (
    <div className="pb-4">
      <PageHeader
        title={pageTitle}
        showBreadcrumbs={false}
        actions={
          <>
            <select
              className="form-select form-select-sm"
              style={{ width: 'auto' }}
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              disabled={loading}
            >
              {MONTH_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ExportPdfButton filename="Total-Production-Report" />
          </>
        }
      />

      {(qualityFocus || (isQualityDeepLink && focusName)) && (
        <div className="alert alert-info d-flex flex-wrap align-items-center justify-content-between gap-2 py-2 mb-3">
          <div>
            <strong>Quality run:</strong> {focusName || qualityFocus?.name}
            {!loading && qualityFocus?.createdOn && (
              <span className="ms-2 text-secondary">
                (From {formatShortDate(qualityFocus.createdOn)}
                {qualityFocus.endedOn ? ` → ${formatShortDate(qualityFocus.endedOn)}` : ''})
              </span>
            )}
            {!loading && !qualityFocus?.createdOn && qualityFocus?.endedOn && (
              <span className="ms-2 text-secondary">
                (Ended {formatShortDate(qualityFocus.endedOn)})
              </span>
            )}
            {loading && (
              <span className="ms-2 badge text-bg-light border">Loading…</span>
            )}
            {!loading && qualityMonthTotal != null && (
              <span className="ms-2 badge text-bg-light border">
                {formatNumber(qualityMonthTotal, 0)} m this run / month
              </span>
            )}
            {!loading && qualityMonthTotal === 0 && (
              <span className="ms-2 small text-warning">Abhi is run pe production start nahi hui.</span>
            )}
          </div>
          <Link href="/floor/production?tab=quality" className="btn btn-sm btn-outline-secondary">
            ← Back to Quality
          </Link>
        </div>
      )}

      {loading ? (
        <div className="card">
          <div className="card-body text-center py-5">
            <div className="spinner-border text-primary" role="status" aria-label="Loading" />
            <div className="mt-3 text-secondary">
              {focusName
                ? `${focusName} ka production data load ho raha hai…`
                : 'Production data load ho raha hai…'}
            </div>
          </div>
        </div>
      ) : (
        <>
      <div className="row g-3 mb-3">
        <div className="col-6 col-lg-3">
          <MetricCard
            title={view === 'shifts' ? 'Shift A month' : 'Month total'}
            value={formatTotal(qualityMonthTotal ?? matrix.grandTotalMeters)}
            subValue={qualityFocus ? `${qualityFocus.name} · ${monthLabel}` : monthLabel}
            biIcon="bi-calendar3"
            colorVariant="primary"
          />
        </div>
        <div className="col-6 col-lg-3">
          <MetricCard
            title={view === 'shifts' ? 'Shift B month' : 'Avg / day'}
            value={view === 'shifts' ? formatTotal(shiftBMatrix.grandTotalMeters) : formatTotal(matrix.avgPerDay)}
            subValue={loading ? 'Loading…' : view === 'shifts' ? monthLabel : 'Sheet days only'}
            biIcon="bi-graph-up"
            colorVariant="success"
          />
        </div>
        <div className="col-6 col-lg-3">
          <MetricCard
            title="1st Fortnight"
            value={formatTotal(fortnight1)}
            subValue={`Days 1–${mid}`}
            biIcon="bi-1-circle"
            colorVariant="info"
          />
        </div>
        <div className="col-6 col-lg-3">
          <MetricCard
            title="2nd Fortnight"
            value={formatTotal(fortnight2)}
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
              <h3 className="card-title mb-0">
                {view === 'shifts'
                  ? 'Shift A daily meters'
                  : view === 'efficiency'
                    ? 'Daily efficiency (%)'
                    : view === 'active'
                      ? 'Looms running each day'
                      : qualityFocus
                        ? `Daily output — ${qualityFocus.name} (m)`
                        : 'Daily mill output (m)'}
              </h3>
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
          <div className="card mb-3">
            <div className="card-header">
              <h3 className="card-title mb-0">{modelBarTitle}</h3>
            </div>
            <div className="card-body">
              <SimpleHBarList data={modelBars} maxBars={3} valueSuffix={modelBarSuffix} />
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title mb-0">
                {qualityFocus ? 'Looms — this quality' : 'Top looms this month'}
              </h3>
            </div>
            <div className="card-body">
              <SimpleHBarList
                data={loomSeries}
                maxBars={12}
                valueSuffix={view === 'efficiency' ? '%' : view === 'active' ? '' : ' m'}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
          <h3 className="card-title mb-0">
            {view === 'shifts'
              ? 'Shift A — Loom × Day (meters)'
              : view === 'efficiency'
                ? 'Efficiency — Loom × Day (%)'
                : view === 'active'
                  ? 'Active looms — Loom × Day'
                  : 'Total matrix — Loom × Day (meters)'}
          </h3>
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
                  (d) => d.hasSheet && (Number(d.loomMeters?.[loom]) || 0) > 0
                ).length
                const sheetDays = matrix.days.filter((d) => d.hasSheet).length
                const avg =
                  view === 'efficiency'
                    ? monthly
                    : view === 'active'
                      ? sheetDays > 0
                        ? monthly / sheetDays
                        : 0
                      : daysWith > 0
                        ? monthly / daysWith
                        : 0
                return (
                  <tr key={loom}>
                    <td className="fw-semibold px-2">{loom}</td>
                    {matrix.days.map((d) => {
                      const v = Number(d.loomMeters?.[loom]) || 0
                      const empty = !d.hasSheet
                      return (
                        <td
                          key={`${loom}-${d.date || d.day}`}
                          className="text-end px-1"
                          style={{
                            fontSize: 11,
                            backgroundColor: empty || v === 0 ? '#f8f9fa' : undefined,
                          }}
                        >
                          {cellText(d, loom)}
                        </td>
                      )
                    })}
                    <td className="text-end px-2 fw-semibold">
                      {view === 'efficiency'
                        ? `${loomFortnight(loom, 1)}%`
                        : formatNumber(loomFortnight(loom, 1), 0)}
                    </td>
                    <td className="text-end px-2 fw-semibold">
                      {view === 'efficiency'
                        ? `${loomFortnight(loom, 2)}%`
                        : formatNumber(loomFortnight(loom, 2), 0)}
                    </td>
                    <td className="text-end px-2 fw-bold">
                      {view === 'efficiency' ? `${Math.round(monthly)}%` : formatNumber(monthly, 0)}
                    </td>
                    <td className="text-end px-2 text-secondary">
                      {view === 'efficiency' ? `${Math.round(avg)}%` : formatNumber(avg, view === 'active' ? 1 : 1)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="table-light fw-semibold">
              <tr>
                <td className="px-2">Day Total</td>
                {matrix.days.map((d) => (
                  <td key={`t-${d.date || d.day}`} className="text-end px-1" style={{ fontSize: 11 }}>
                    {d.hasSheet
                      ? view === 'efficiency'
                        ? `${Math.round(d.totalMeters || 0)}%`
                        : formatNumber(
                            view === 'meters' && qualityDaySeries
                              ? qualityDaySeries.find((p) => p.label === String(d.day))?.value ?? 0
                              : d.totalMeters || 0,
                            0
                          )
                      : '—'}
                  </td>
                ))}
                <td className="text-end px-2">
                  {view === 'efficiency' ? `${fortnight1}%` : formatNumber(fortnight1, 0)}
                </td>
                <td className="text-end px-2">
                  {view === 'efficiency' ? `${fortnight2}%` : formatNumber(fortnight2, 0)}
                </td>
                <td className="text-end px-2">
                  {view === 'efficiency'
                    ? `${Math.round(qualityMonthTotal ?? matrix.grandTotalMeters)}%`
                    : formatNumber(qualityMonthTotal ?? matrix.grandTotalMeters, 0)}
                </td>
                <td className="text-end px-2">
                  {view === 'efficiency'
                    ? `${Math.round(matrix.avgPerDay)}%`
                    : formatNumber(matrix.avgPerDay, 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {view === 'shifts' && (
        <div className="card mt-3">
          <div className="card-header">
            <h3 className="card-title mb-0">Shift B — Loom × Day (meters)</h3>
          </div>
          <div className="card-body p-0" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table className="table table-sm table-bordered mb-0 align-middle text-nowrap">
              <thead className="table-light">
                <tr>
                  <th className="px-2">L/#</th>
                  {shiftBMatrix.days.map((d) => (
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
                  const monthly = Number(shiftBMatrix.loomTotals?.[loom]) || 0
                  const daysWith = shiftBMatrix.days.filter(
                    (d) => d.hasSheet && (Number(d.loomMeters?.[loom]) || 0) > 0
                  ).length
                  const avg = daysWith > 0 ? monthly / daysWith : 0
                  return (
                    <tr key={loom}>
                      <td className="fw-semibold px-2">{loom}</td>
                      {shiftBMatrix.days.map((d) => {
                        const v = Number(d.loomMeters?.[loom]) || 0
                        return (
                          <td
                            key={`b-${loom}-${d.date || d.day}`}
                            className="text-end px-1"
                            style={{
                              fontSize: 11,
                              backgroundColor: !d.hasSheet || v === 0 ? '#f8f9fa' : undefined,
                            }}
                          >
                            {d.hasSheet ? formatNumber(v, 0) : '—'}
                          </td>
                        )
                      })}
                      <td className="text-end px-2 fw-semibold">
                        {formatNumber(loomFortnight(loom, 1, shiftBMatrix), 0)}
                      </td>
                      <td className="text-end px-2 fw-semibold">
                        {formatNumber(loomFortnight(loom, 2, shiftBMatrix), 0)}
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
                  {shiftBMatrix.days.map((d) => (
                    <td key={`bt-${d.date || d.day}`} className="text-end px-1" style={{ fontSize: 11 }}>
                      {d.hasSheet ? formatNumber(d.totalMeters || 0, 0) : '—'}
                    </td>
                  ))}
                  <td className="text-end px-2">
                    {formatNumber(
                      shiftBMatrix.days.slice(0, mid).reduce((s, d) => s + (d.totalMeters || 0), 0),
                      0
                    )}
                  </td>
                  <td className="text-end px-2">
                    {formatNumber(
                      shiftBMatrix.days.slice(mid).reduce((s, d) => s + (d.totalMeters || 0), 0),
                      0
                    )}
                  </td>
                  <td className="text-end px-2">{formatNumber(shiftBMatrix.grandTotalMeters, 0)}</td>
                  <td className="text-end px-2">{formatNumber(shiftBMatrix.avgPerDay, 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  )
}

export default function ProductionTotalTrackingPage() {
  return (
    <Suspense
      fallback={
        <div className="p-4">
          <div className="spinner-border text-primary" role="status" />
        </div>
      }
    >
      <ProductionTotalTrackingContent />
    </Suspense>
  )
}
