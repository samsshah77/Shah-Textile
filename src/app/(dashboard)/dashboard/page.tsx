'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { PrintBrandHeader } from '@/components/shared/PrintBrandHeader'
import { MetricCard } from '@/components/shared/MetricCard'
import { SimpleBarChart, SimpleHBarList, SimpleLineChart } from '@/components/shared/MiniCharts'
import { ProductionReportSkeleton } from '@/components/floor/ProductionSkeleton'
import {
  hydrateFloorFromDb,
  listPersistedSheetDates,
  preloadFloorSheet,
  productionMastersService,
} from '@/services/productionMastersService'
import { formatNumber } from '@/lib/utils'
import {
  getProductionToday,
  getProductionYesterday,
  formatProductionDayLabel,
} from '@/constants/productionCalendar'
import { LOOM_STATUS_LABEL, resolveLoomCondition } from '@/constants/loomConditions'
import type { LoomStatus } from '@/types/loom'
import type { LoomCategory } from '@/types/loom'
import type { DailyLoomProductionEntry } from '@/types/production'
import { calculateProductionMetrics } from '@/types/production'
import { fetchProductionReport } from '@/services/floorReportsClient'
import { DateNav } from '@/components/shared/DateNav'
import { useAuth } from '@/context/AuthContext'

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

/** YYYY-MM-DD plus / minus days (calendar days). */
function shiftDays(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** The chart shows the last 30 entered days. */
const CHART_DAYS = 30
const recentDays = (dates: string[]) => [...dates].sort().slice(-CHART_DAYS)

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
  // "Monthly Tracking" links only for people who may open Tracking (Administration → Permissions).
  const { canView } = useAuth()
  const trackingOk = canView('tracking')
  const productionToday = getProductionToday()
  const productionYesterday = getProductionYesterday()
  /** Open on Today — yesterday user khud select karega. */
  // Opens on yesterday — the last full day whose sheet is entered.
  const [selectedDate, setSelectedDate] = useState(() => getProductionYesterday())
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
      const fromDate = shiftDays(dateStr, -CHART_DAYS - 15)
      const reportPromise = fetchProductionReport(fromDate, dateStr, { summaryOnly: true }).catch(() => null)
      const floorPromise = Promise.all([
        hydrateFloorFromDb(),
        preloadFloorSheet(dateStr),
      ])

      const [, report] = await Promise.all([floorPromise, reportPromise])

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

      setAvailableDates(listPersistedSheetDates())

      setDaySeries(
        recentDays((report?.byDay || []).filter((d) => d.meters > 0).map((d) => d.date)).map((d) => ({
          label: shortDay(d),
          value: Math.round(report!.byDay.find((x) => x.date === d)!.meters),
        }))
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

  const hasSheet = availableDates.includes(selectedDate)


  const sheetHref = '/floor/production?tab=sheet'
  const trackingHref = trackingOk ? '/floor/reports/total' : undefined
  const shiftTrackingHref = trackingOk ? '/floor/reports/total?view=shifts' : undefined
  const efficiencyTrackingHref = trackingOk ? '/floor/reports/total?view=efficiency' : undefined
  const activeTrackingHref = trackingOk ? '/floor/reports/total?view=active' : undefined

  return (
    <>
      <PrintBrandHeader sheetTitle="Dashboard" />

      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3 mt-3 pt-1">
        <DateNav value={selectedDate} onChange={setSelectedDate} max={productionToday} />

        <Link href={sheetHref} className="btn btn-sm btn-primary ms-auto">
          Open Production Sheet
          <i className="bi bi-arrow-right-short ms-1" />
        </Link>
      </div>

      {!loading && !hasSheet && (
        <div className="alert alert-light border py-2 mb-3 small" role="status">
          Is date ki production sheet abhi enter nahi hui — zeros dikh rahe hain. Pehle{' '}
          <Link href="/floor/production">Production</Link> se data bharo.
        </div>
      )}

      {loading ? (
        <ProductionReportSkeleton />
      ) : (
        <>
      <div className="row g-3 mb-3">
        <div className="col-6 col-lg-3">
          <MetricCard
            title="Production"
            value={`${formatNumber(day.meters, 0)} m`}
            subValue={formatProductionDayLabel(selectedDate)}
            biIcon="bi-speedometer2"
            colorVariant="primary"
            href={trackingHref}
            footerLabel={trackingOk ? 'Monthly Tracking' : ' '}
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
            footerLabel={trackingOk ? 'Monthly Tracking' : ' '}
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
            footerLabel={trackingOk ? 'Monthly Tracking' : ' '}
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
            footerLabel={trackingOk ? 'Monthly Tracking' : ' '}
          />
        </div>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-lg-7">
          <div className="card h-100">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h3 className="card-title mb-0">Production — aakhri {CHART_DAYS} din</h3>
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
                <p className="text-dark small mb-0">
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
                <SimpleHBarList data={conditionBars} maxBars={8} valueSuffix=" looms" />
              ) : (
                <p className="text-dark small mb-0">No loom conditions for this date.</p>
              )}
            </div>
          </div>
        </div>
      </div>
        </>
      )}

      <div className="card mb-4">
        <div className="card-header">
          <h3 className="card-title mb-0">Mill Status</h3>
        </div>
        <div className="card-body">
          <p className="mb-2">
            <strong>Shah Textile</strong> — 34 Rapier &amp; PU looms
          </p>
          <p className="text-dark mb-0 small">
            Dashboard sirf floor production sheets se data leta hai (dummy history nahi). Date
            calendar se koi bhi entered din dekho — default{' '}
            <strong>{shortDay(productionYesterday)}</strong> (Yesterday).
          </p>
        </div>
      </div>
    </>
  )
}
