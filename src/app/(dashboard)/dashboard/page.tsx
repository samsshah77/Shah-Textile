'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { PrintBrandHeader } from '@/components/shared/PrintBrandHeader'
import { MetricCard } from '@/components/shared/MetricCard'
import { SimpleBarChart, SimpleHBarList, SimpleLineChart } from '@/components/shared/MiniCharts'
import {
  hydrateFloorFromDb,
  listPersistedSheetDates,
  preloadFloorSheet,
  productionMastersService,
} from '@/services/productionMastersService'
import { formatNumber, cn } from '@/lib/utils'
import {
  PRODUCTION_START,
  getProductionToday,
  getProductionYesterday,
  formatProductionDayLabel,
  shiftProductionDate,
} from '@/constants/productionCalendar'
import { LOOM_STATUS_LABEL, resolveLoomCondition } from '@/constants/loomConditions'
import type { LoomStatus } from '@/types/loom'
import type { LoomCategory } from '@/types/loom'
import type { DailyLoomProductionEntry } from '@/types/production'
import { calculateProductionMetrics } from '@/types/production'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/** Same as Production sheet footer / Excel: Σ(A+B) ÷ Σ(100% Running) × 100 — not avg of %. */
function dayRunningEfficiency(live: DailyLoomProductionEntry[]) {
  let actual = 0
  let target = 0
  for (const e of live) {
    const meters =
      e.totalMeters != null
        ? Number(e.totalMeters) || 0
        : (Number(e.shiftAMeters) || 0) + (Number(e.shiftBMeters) || 0)
    actual += meters
    let theo = Number(e.runningTheoretical) || 0
    if (theo <= 0) {
      theo =
        calculateProductionMetrics({
          rpm: e.rpm || 0,
          runningHours: e.rollerHours ?? e.runningHours ?? 0,
          pick: e.pick || 0,
          shiftAMeters: e.shiftAMeters || 0,
          shiftBMeters: e.shiftBMeters || 0,
          loomNumber: e.loomNumber,
        }).theoreticalMeters || 0
    }
    target += theo
  }
  if (target <= 0) return 0
  return (actual / target) * 100
}

function summarizeDay(live: DailyLoomProductionEntry[]) {
  const totalLooms = live.length || 0
  const shiftA = live.reduce((s, e) => s + (e.shiftAMeters || 0), 0)
  const shiftB = live.reduce((s, e) => s + (e.shiftBMeters || 0), 0)
  const meters = live.reduce((s, e) => s + (e.totalMeters || 0), 0)
  const efficiency = dayRunningEfficiency(live)
  const running = live.filter((e) => resolveLoomCondition(e.status, e.remarks) === 'RUNNING').length

  const conditions: Partial<Record<LoomStatus, number>> = {}
  live.forEach((e) => {
    const c = resolveLoomCondition(e.status, e.remarks)
    conditions[c] = (conditions[c] || 0) + 1
  })

  const modelTotals: Record<string, number> = { G6200: 0, G6300: 0, PU: 0 }
  live.forEach((e) => {
    const cat = (e.category || e.model || 'G6200') as LoomCategory
    modelTotals[cat] = (modelTotals[cat] || 0) + (e.totalMeters || 0)
  })

  return {
    meters,
    efficiency,
    running,
    totalLooms: totalLooms || 34,
    shiftA,
    shiftB,
    conditions,
    modelBars: [
      { label: 'G6200', value: modelTotals.G6200 || 0, color: '#0d6efd' },
      { label: 'G6300', value: modelTotals.G6300 || 0, color: '#198754' },
      { label: 'PU', value: modelTotals.PU || 0, color: '#fd7e14' },
    ],
  }
}

function shortDay(dateStr: string) {
  try {
    return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    })
  } catch {
    return dateStr
  }
}

export default function DashboardPage() {
  const productionToday = getProductionToday()
  const productionYesterday = getProductionYesterday()
  /** Open on Today — yesterday user khud select karega. */
  const [selectedDate, setSelectedDate] = useState(() => getProductionToday())
  const [loading, setLoading] = useState(true)
  const [day, setDay] = useState({
    meters: 0,
    efficiency: 0,
    running: 0,
    totalLooms: 34,
    shiftA: 0,
    shiftB: 0,
    conditions: {} as Partial<Record<LoomStatus, number>>,
  })
  const [modelBars, setModelBars] = useState<{ label: string; value: number; color: string }[]>([])
  const [daySeries, setDaySeries] = useState<{ label: string; value: number }[]>([])
  const [availableDates, setAvailableDates] = useState<string[]>([])

  const loadDate = useCallback(async (dateStr: string) => {
    setLoading(true)
    try {
      await hydrateFloorFromDb()
      await preloadFloorSheet(dateStr)
      // Also preload known neighbour days for the mini chart (real sheets only)
      const dates = listPersistedSheetDates()
      setAvailableDates(dates)
      await Promise.all(dates.map((d) => preloadFloorSheet(d)))

      const live = productionMastersService.hasPersistedSheet(dateStr)
        ? productionMastersService.buildSheetForDate(dateStr)
        : []
      const summary = summarizeDay(live)
      setDay({
        meters: summary.meters,
        efficiency: summary.efficiency,
        running: summary.running,
        totalLooms: summary.totalLooms,
        shiftA: summary.shiftA,
        shiftB: summary.shiftB,
        conditions: summary.conditions,
      })
      setModelBars(summary.modelBars)

      const refreshed = listPersistedSheetDates()
      setAvailableDates(refreshed)
      setDaySeries(
        refreshed.map((d) => {
          const rows = productionMastersService.hasPersistedSheet(d)
            ? productionMastersService.buildSheetForDate(d)
            : []
          const m = rows.reduce((s, e) => s + (e.totalMeters || 0), 0)
          return { label: shortDay(d), value: m }
        })
      )
    } catch {
      setDay({
        meters: 0,
        efficiency: 0,
        running: 0,
        totalLooms: 34,
        shiftA: 0,
        shiftB: 0,
        conditions: {},
      })
      setModelBars([])
      setDaySeries([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDate(selectedDate)
  }, [selectedDate, loadDate])

  const conditionBars = useMemo(() => {
    return (Object.entries(day.conditions) as [LoomStatus, number][])
      .filter(([, n]) => n > 0)
      .map(([status, n]) => ({
        label: LOOM_STATUS_LABEL[status] || status,
        value: n,
      }))
      .sort((a, b) => b.value - a.value)
  }, [day.conditions])

  const isYesterday = selectedDate === productionYesterday
  const isToday = selectedDate === productionToday
  const hasSheet = availableDates.includes(selectedDate)

  const shiftDay = (delta: number) => {
    try {
      const next = shiftProductionDate(selectedDate, delta)
      if (next < PRODUCTION_START || next > productionToday) return
      setSelectedDate(next)
    } catch {
      // ignore
    }
  }

  const sheetHref = '/floor/production?tab=sheet'
  const trackingHref = '/floor/reports/total'
  const shiftTrackingHref = '/floor/reports/total?view=shifts'
  const efficiencyTrackingHref = '/floor/reports/total?view=efficiency'
  const activeTrackingHref = '/floor/reports/total?view=active'

  return (
    <>
      <PrintBrandHeader sheetTitle="Dashboard" />

      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <h2 className="h6 mb-0 text-secondary text-uppercase">Production overview</h2>
        <div className="d-flex flex-wrap align-items-center gap-2">
          <div className="d-flex align-items-center gap-1">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary px-2"
              title="Previous day"
              onClick={() => shiftDay(-1)}
              disabled={selectedDate <= PRODUCTION_START}
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <input
              type="date"
              className="form-control form-control-sm fw-semibold"
              style={{ width: 'auto', minWidth: 140 }}
              value={selectedDate}
              min={PRODUCTION_START}
              max={productionToday}
              aria-label="Production date"
              onChange={(e) => setSelectedDate(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary px-2"
              title="Next day"
              onClick={() => shiftDay(1)}
              disabled={selectedDate >= productionToday}
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>

          <div className="btn-group btn-group-sm" role="group" aria-label="Quick day">
            <button
              type="button"
              className={cn('btn btn-sm', isYesterday ? 'btn-primary' : 'btn-outline-secondary')}
              onClick={() => setSelectedDate(productionYesterday)}
            >
              Yesterday
              <span className="d-none d-md-inline"> ({shortDay(productionYesterday)})</span>
            </button>
            <button
              type="button"
              className={cn('btn btn-sm', isToday ? 'btn-primary' : 'btn-outline-secondary')}
              onClick={() => setSelectedDate(productionToday)}
            >
              Today
              <span className="d-none d-md-inline"> ({shortDay(productionToday)})</span>
            </button>
          </div>

          <Link href={sheetHref} className="btn btn-sm btn-outline-primary">
            Open Production Sheet
            <i className="bi bi-arrow-right-short ms-1" />
          </Link>
        </div>
      </div>

      {!loading && !hasSheet && (
        <div className="alert alert-light border py-2 mb-3 small" role="status">
          Is date ki production sheet abhi enter nahi hui — zeros dikh rahe hain. Pehle{' '}
          <Link href="/floor/production">Production</Link> se data bharo.
        </div>
      )}

      <div className="row g-3 mb-3">
        <div className="col-6 col-lg-3">
          <MetricCard
            title="Production"
            value={`${formatNumber(day.meters, 0)} m`}
            subValue={formatProductionDayLabel(selectedDate)}
            biIcon="bi-speedometer2"
            colorVariant="primary"
            href={trackingHref}
            footerLabel="Total Tracking"
          />
        </div>
        <div className="col-6 col-lg-3">
          <MetricCard
            title="Shift A / B"
            value={
              day.shiftA || day.shiftB
                ? `${formatNumber(day.shiftA, 0)} / ${formatNumber(day.shiftB, 0)}`
                : '—'
            }
            subValue="Meters"
            biIcon="bi-columns-gap"
            colorVariant="success"
            href={shiftTrackingHref}
            footerLabel="Total Tracking"
          />
        </div>
        <div className="col-6 col-lg-3">
          <MetricCard
            title="Efficiency"
            value={day.efficiency ? `${Math.round(day.efficiency)}%` : '—'}
            subValue="Running H (sheet)"
            biIcon="bi-percent"
            colorVariant="warning"
            href={efficiencyTrackingHref}
            footerLabel="Total Tracking"
          />
        </div>
        <div className="col-6 col-lg-3">
          <MetricCard
            title="Active Looms"
            value={`${day.running} / ${day.totalLooms}`}
            subValue="On selected day"
            biIcon="bi-gear-wide-connected"
            colorVariant="info"
            href={activeTrackingHref}
            footerLabel="Total Tracking"
          />
        </div>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-lg-7">
          <div className="card h-100">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h3 className="card-title mb-0">Entered days (real sheets)</h3>
              <Link href={sheetHref} className="small">
                Production Sheet
              </Link>
            </div>
            <div className="card-body">
              {daySeries.length > 0 ? (
                <>
                  <SimpleBarChart data={daySeries} height={150} />
                  <div className="mt-2">
                    <SimpleLineChart data={daySeries} height={100} />
                  </div>
                </>
              ) : (
                <p className="text-secondary small mb-0">
                  Abhi koi entered production day chart ke liye available nahi.
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="col-lg-5">
          <div className="card mb-3">
            <div className="card-header">
              <h3 className="card-title mb-0">By model</h3>
            </div>
            <div className="card-body">
              <SimpleHBarList data={modelBars} maxBars={3} />
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title mb-0">Floor conditions</h3>
            </div>
            <div className="card-body">
              {conditionBars.length > 0 ? (
                <SimpleHBarList data={conditionBars} maxBars={8} />
              ) : (
                <p className="text-secondary small mb-0">No loom conditions for this date.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-header">
          <h3 className="card-title mb-0">Mill Status</h3>
        </div>
        <div className="card-body">
          <p className="mb-2">
            <strong>Sara Textile</strong> — 34 Rapier &amp; PU looms
          </p>
          <p className="text-body-secondary mb-0 small">
            Dashboard sirf floor production sheets se data leta hai (dummy history nahi). Date
            calendar se koi bhi entered din dekho — default{' '}
            <strong>{shortDay(productionToday)}</strong> (Today).
          </p>
        </div>
      </div>
    </>
  )
}
