'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/shared/PageHeader'
import { MetricCard } from '@/components/shared/MetricCard'
import { SimpleBarChart, SimpleHBarList, SimpleLineChart } from '@/components/shared/MiniCharts'
import { productionService, type FloorWeeklyReport } from '@/services/productionService'
import { formatNumber } from '@/lib/utils'
import {
  PRODUCTION_TODAY,
  PRODUCTION_TODAY_MONTH,
  formatProductionDayLabel,
} from '@/constants/productionCalendar'
import { LOOM_STATUS_LABEL, resolveLoomCondition } from '@/constants/loomConditions'
import type { LoomStatus } from '@/types/loom'

type Period = 'day' | 'week' | 'lastWeek' | 'month' | 'lastMonth'

function prevMonth(monthStr: string): string {
  const [y, m] = monthStr.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(monthStr: string): string {
  try {
    const [y, m] = monthStr.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  } catch {
    return monthStr
  }
}

export default function DashboardPage() {
  const [period, setPeriod] = useState<Period>('day')
  const [day, setDay] = useState({
    meters: 0,
    efficiency: 0,
    running: 0,
    totalLooms: 34,
    shiftA: 0,
    shiftB: 0,
    conditions: {} as Partial<Record<LoomStatus, number>>,
  })
  const [weeks, setWeeks] = useState<FloorWeeklyReport[]>([])
  const [monthMeters, setMonthMeters] = useState(0)
  const [avgPerDay, setAvgPerDay] = useState(0)
  const [daySeries, setDaySeries] = useState<{ label: string; value: number }[]>([])
  const [modelBars, setModelBars] = useState<{ label: string; value: number; color: string }[]>([])
  const [lastMonthMeters, setLastMonthMeters] = useState(0)
  const [lastMonthAvg, setLastMonthAvg] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const summary = await productionService.getFloorSummary(PRODUCTION_TODAY)
        const weekly = await productionService.getWeeklyRollups()
        const matrix = productionService.getMonthlyMatrix(PRODUCTION_TODAY_MONTH)
        const lastMatrix = productionService.getMonthlyMatrix(prevMonth(PRODUCTION_TODAY_MONTH))
        const live = await productionService.getAllEntries(PRODUCTION_TODAY)

        const conditionCounts: Partial<Record<LoomStatus, number>> = {}
        live.forEach((e) => {
          const c = resolveLoomCondition(e.status, e.remarks)
          conditionCounts[c] = (conditionCounts[c] || 0) + 1
        })
        if (Object.keys(conditionCounts).length === 0) {
          conditionCounts.RUNNING = summary.runningLooms
          conditionCounts.STOPPED = summary.stoppedLooms
          conditionCounts.KNOTTING = summary.knottingLooms
          conditionCounts.BREAKDOWN = summary.breakdownLooms
          conditionCounts.BEAM_END = summary.beamEndLooms
        }

        if (cancelled) return

        setDay({
          meters: summary.grandTotalMeters,
          efficiency: summary.averageEfficiency,
          running: summary.runningLooms,
          totalLooms: summary.totalLooms || 34,
          shiftA: summary.totalShiftAMeters,
          shiftB: summary.totalShiftBMeters,
          conditions: conditionCounts,
        })
        setWeeks(weekly)
        setMonthMeters(matrix.grandTotalMeters || summary.monthlyProduction || 0)
        setAvgPerDay(matrix.avgPerDay || 0)
        setLastMonthMeters(lastMatrix.grandTotalMeters || 0)
        setLastMonthAvg(lastMatrix.avgPerDay || 0)
        setDaySeries(
          matrix.days.map((d) => ({
            label: String(d.day),
            value: d.totalMeters || 0,
          }))
        )
        setModelBars([
          {
            label: 'G6200',
            value: summary.modelBreakdown?.G6200?.production || 0,
            color: '#0d6efd',
          },
          {
            label: 'G6300',
            value: summary.modelBreakdown?.G6300?.production || 0,
            color: '#198754',
          },
          {
            label: 'PU',
            value: summary.modelBreakdown?.PU?.production || 0,
            color: '#fd7e14',
          },
        ])
      } catch {
        // keep zeros / defaults
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const thisWeek = weeks[0] || null
  const lastWeek = weeks[1] || null

  const overview = useMemo(() => {
    switch (period) {
      case 'week':
        return {
          title: 'This Week',
          meters: thisWeek?.totalMeters || 0,
          sub: thisWeek?.weekLabel || 'Weekly rollup',
          shiftA: thisWeek?.shiftAMeters || 0,
          shiftB: thisWeek?.shiftBMeters || 0,
          efficiency: thisWeek?.averageEfficiency || 0,
          chart: daySeries.slice(0, 7),
          chartTitle: 'This week (days)',
        }
      case 'lastWeek':
        return {
          title: 'Last Week',
          meters: lastWeek?.totalMeters || 0,
          sub: lastWeek?.weekLabel || 'Previous week',
          shiftA: lastWeek?.shiftAMeters || 0,
          shiftB: lastWeek?.shiftBMeters || 0,
          efficiency: lastWeek?.averageEfficiency || 0,
          chart: daySeries.slice(7, 14),
          chartTitle: 'Last week (days)',
        }
      case 'month':
        return {
          title: monthLabel(PRODUCTION_TODAY_MONTH),
          meters: monthMeters,
          sub: `Avg ${formatNumber(avgPerDay, 0)} m / day`,
          shiftA: 0,
          shiftB: 0,
          efficiency: day.efficiency,
          chart: daySeries,
          chartTitle: 'Daily trend (this month)',
        }
      case 'lastMonth':
        return {
          title: monthLabel(prevMonth(PRODUCTION_TODAY_MONTH)),
          meters: lastMonthMeters,
          sub: `Avg ${formatNumber(lastMonthAvg, 0)} m / day`,
          shiftA: 0,
          shiftB: 0,
          efficiency: 0,
          chart: [],
          chartTitle: 'Previous month',
        }
      default:
        return {
          title: 'Today',
          meters: day.meters,
          sub: formatProductionDayLabel(PRODUCTION_TODAY),
          shiftA: day.shiftA,
          shiftB: day.shiftB,
          efficiency: day.efficiency,
          chart: daySeries.slice(-7),
          chartTitle: 'Last 7 days',
        }
    }
  }, [
    period,
    thisWeek,
    lastWeek,
    monthMeters,
    avgPerDay,
    lastMonthMeters,
    lastMonthAvg,
    day,
    daySeries,
  ])

  const conditionBars = useMemo(() => {
    return (Object.entries(day.conditions) as [LoomStatus, number][])
      .filter(([, n]) => n > 0)
      .map(([status, n]) => ({
        label: LOOM_STATUS_LABEL[status] || status,
        value: n,
      }))
      .sort((a, b) => b.value - a.value)
  }, [day.conditions])

  const weekCompare = useMemo(() => {
    const w = period === 'lastWeek' ? lastWeek : thisWeek
    if (!w) return []
    return [
      { label: 'Shift A', value: w.shiftAMeters, color: '#0d6efd' },
      { label: 'Shift B', value: w.shiftBMeters, color: '#6610f2' },
      { label: 'Total', value: w.totalMeters, color: '#198754' },
    ]
  }, [period, thisWeek, lastWeek])

  const trackingHref = '/floor/reports/total'

  return (
    <>
      <PageHeader title="Dashboard" showBreadcrumbs={false} />

      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <h2 className="h6 mb-0 text-secondary text-uppercase">Production overview</h2>
        <div className="d-flex flex-wrap align-items-center gap-2">
          <select
            className="form-select form-select-sm"
            style={{ width: 'auto', minWidth: 160 }}
            value={period}
            aria-label="Period filter"
            onChange={(e) => setPeriod(e.target.value as Period)}
          >
            <option value="day">Today (Day)</option>
            <option value="week">This Week</option>
            <option value="lastWeek">Last Week</option>
            <option value="month">This Month</option>
            <option value="lastMonth">Last Month</option>
          </select>
          <Link href={trackingHref} className="btn btn-sm btn-outline-primary">
            More info — Total tracking
            <i className="bi bi-arrow-right-short ms-1" />
          </Link>
        </div>
      </div>

      <div className="row g-3 mb-3">
        <div className="col-6 col-lg-3">
          <MetricCard
            title={overview.title}
            value={`${formatNumber(overview.meters, 0)} m`}
            subValue={overview.sub}
            biIcon="bi-speedometer2"
            colorVariant="primary"
            href={trackingHref}
            footerLabel="More info"
          />
        </div>
        <div className="col-6 col-lg-3">
          <MetricCard
            title="Shift A / B"
            value={
              overview.shiftA || overview.shiftB
                ? `${formatNumber(overview.shiftA, 0)} / ${formatNumber(overview.shiftB, 0)}`
                : '—'
            }
            subValue="Meters"
            biIcon="bi-columns-gap"
            colorVariant="success"
            href={trackingHref}
            footerLabel="More info"
          />
        </div>
        <div className="col-6 col-lg-3">
          <MetricCard
            title="Efficiency"
            value={overview.efficiency ? `${overview.efficiency.toFixed(1)}%` : '—'}
            subValue={period === 'day' ? 'Today' : 'Period'}
            biIcon="bi-percent"
            colorVariant="warning"
            href={trackingHref}
            footerLabel="More info"
          />
        </div>
        <div className="col-6 col-lg-3">
          <MetricCard
            title="Active Looms"
            value={`${day.running} / ${day.totalLooms}`}
            subValue="Running now"
            biIcon="bi-gear-wide-connected"
            colorVariant="info"
            href={trackingHref}
            footerLabel="More info"
          />
        </div>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-lg-7">
          <div className="card h-100">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h3 className="card-title mb-0">{overview.chartTitle}</h3>
              <Link href={trackingHref} className="small">
                Total tracking
              </Link>
            </div>
            <div className="card-body">
              {overview.chart.length > 0 ? (
                <>
                  <SimpleBarChart data={overview.chart} height={150} />
                  <div className="mt-2">
                    <SimpleLineChart data={overview.chart} height={100} />
                  </div>
                </>
              ) : (
                <p className="text-secondary small mb-0">
                  Open{' '}
                  <Link href={trackingHref}>Total tracking</Link> to see the full matrix for this
                  period.
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="col-lg-5">
          {period === 'day' && (
            <div className="card mb-3">
              <div className="card-header">
                <h3 className="card-title mb-0">Today by model</h3>
              </div>
              <div className="card-body">
                <SimpleHBarList data={modelBars} maxBars={3} />
              </div>
            </div>
          )}
          {(period === 'week' || period === 'lastWeek') && (
            <div className="card mb-3">
              <div className="card-header">
                <h3 className="card-title mb-0">Week shifts</h3>
              </div>
              <div className="card-body">
                <SimpleBarChart data={weekCompare} height={120} />
              </div>
            </div>
          )}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title mb-0">Floor conditions (today)</h3>
            </div>
            <div className="card-body">
              <SimpleHBarList data={conditionBars} maxBars={8} />
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
            Filter day / week / month above.{' '}
            <Link href={trackingHref}>Total tracking</Link> opens the loom×day matrix (Excel Total
            tab style).
          </p>
        </div>
      </div>
    </>
  )
}
