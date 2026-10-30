'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { PageHeader } from '@/components/shared/PageHeader'
import { MetricCard } from '@/components/shared/MetricCard'
import { ExportPdfButton } from '@/components/shared/ExportPdfButton'
import { SimpleBarChart, SimpleHBarList, SimpleLineChart } from '@/components/shared/MiniCharts'
import { TablePanScroll } from '@/components/shared/TablePanScroll'
import { ProductionReportSkeleton } from '@/components/floor/ProductionSkeleton'
import { ServerMonthCheck } from '@/components/floor/ServerMonthCheck'
import {
  hydrateFloorFromDb,
  preloadMonthSheets,
  preloadAllFloorSheets,
  productionMastersService,
  qualityRunOwnsSheetEntry,
} from '@/services/productionMastersService'
import { formatNumber } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import {
  getProductionTodayMonth,
  PRODUCTION_START,
} from '@/constants/productionCalendar'
import type { DailyLoomProductionEntry, MonthlyMatrixDay } from '@/types/production'
import type { QualityMaster } from '@/services/productionMastersService'

function buildMonthOptions(): { value: string; label: string }[] {
  const end = getProductionTodayMonth()
  const start = PRODUCTION_START.slice(0, 7)
  const out: { value: string; label: string }[] = []
  let cursor = start
  while (cursor <= end) {
    const [y, m] = cursor.split('-').map(Number)
    out.push({
      value: cursor,
      label: new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    })
    cursor =
      m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  }
  return out.length > 0 ? out : [{ value: '2026-09', label: 'September 2026' }]
}

const MONTH_OPTIONS = buildMonthOptions()

function initialTrackMonth(fromParam: string | null): string {
  // Quality deep-link: open the run's month when provided.
  if (fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam)) {
    const m = fromParam.slice(0, 7)
    if (MONTH_OPTIONS.some((o) => o.value === m)) return m
  }
  // Default = current production month; older months stay available in the dropdown.
  const todayM = getProductionTodayMonth()
  if (MONTH_OPTIONS.some((o) => o.value === todayM)) return todayM
  return MONTH_OPTIONS[MONTH_OPTIONS.length - 1]?.value || '2026-09'
}

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

function resolveTrackedQuality(
  qualityId: string | null,
  qualityNameParam: string | null,
  qualityFromParam: string | null
): { master: QualityMaster; catalog: QualityMaster[] } | null {
  if (!qualityId && !qualityNameParam) return null
  const masters = productionMastersService.getQualities()
  const master = qualityId
    ? masters.find((q) => q.id === qualityId)
    : masters.find((q) => cleanQualityName(q.name) === cleanQualityName(qualityNameParam || ''))
  if (!master) return null
  const createdOn =
    (master.createdOn ? String(master.createdOn).slice(0, 10) : null) ||
    (qualityFromParam ? String(qualityFromParam).slice(0, 10) : null)
  const masterForRun =
    createdOn && !master.createdOn ? { ...master, createdOn } : master
  const catalog = masters.map((q) =>
    q.id === masterForRun.id && !q.createdOn && createdOn ? { ...q, createdOn } : q
  )
  return { master: masterForRun, catalog }
}

/** Quality track counts only rows this run owns. Mill track counts every loom. */
function trackOwnsEntry(
  qualityId: string | null,
  qualityNameParam: string | null,
  qualityFromParam: string | null
): ((entry: DailyLoomProductionEntry, dateStr: string) => boolean) | undefined {
  if (!qualityId && !qualityNameParam) return undefined
  const tracked = resolveTrackedQuality(qualityId, qualityNameParam, qualityFromParam)
  if (!tracked) return () => false
  return (entry, dateStr) =>
    qualityRunOwnsSheetEntry(
      tracked.master,
      { ...entry, date: dateStr },
      tracked.catalog,
      dateStr
    )
}

/** Dates a quality run covers: from its start day to its end day (or open-ended while running). */
function trackedRunRange(
  qualityId: string | null,
  qualityNameParam: string | null,
  qualityFromParam: string | null
): { from: string | null; to: string | null } | null {
  const tracked = resolveTrackedQuality(qualityId, qualityNameParam, qualityFromParam)
  if (!tracked) return null
  const q = tracked.master
  const from = q.createdOn ? String(q.createdOn).slice(0, 10) : null
  const to = q.status === 'ENDED' && q.endedOn ? String(q.endedOn).slice(0, 10) : null
  return { from, to }
}

/**
 * A quality run started from zero is tracked on its own: days before it started (or after it
 * ended) are dropped instead of showing as zero columns.
 */
function limitMatrixToRun(m: MatrixState, range: { from: string | null; to: string | null } | null, efficiency: boolean): MatrixState {
  if (!range || (!range.from && !range.to)) return m
  const keep = m.days.map((d) => {
    if (!d.date) return true
    if (range.from && d.date < range.from) return false
    if (range.to && d.date > range.to) return false
    return true
  })
  const days = m.days.filter((_, i) => keep[i])
  const dayActual = m.dayActual.filter((_, i) => keep[i])
  const dayTarget = m.dayTarget.filter((_, i) => keep[i])
  const daysWithSheet = days.filter((d) => d.hasSheet).length
  let grandTotalMeters: number
  let avgPerDay: number
  if (efficiency) {
    const actual = dayActual.reduce((s, n) => s + n, 0)
    const target = dayTarget.reduce((s, n) => s + n, 0)
    grandTotalMeters = target > 0 ? Math.round((actual / target) * 100) : 0
    avgPerDay = grandTotalMeters
  } else {
    grandTotalMeters = days.reduce((s, d) => s + (d.totalMeters || 0), 0)
    avgPerDay = daysWithSheet > 0 ? grandTotalMeters / daysWithSheet : 0
  }
  return { ...m, days, dayActual, dayTarget, grandTotalMeters, avgPerDay }
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

  const [month, setMonth] = useState(() => initialTrackMonth(qualityFromParam))
  const [matrix, setMatrix] = useState<MatrixState>(EMPTY_MATRIX)
  const [shiftBMatrix, setShiftBMatrix] = useState<MatrixState>(EMPTY_MATRIX)
  const [shiftChartMode, setShiftChartMode] = useState<'COMBINED' | 'SHIFT_A' | 'SHIFT_B'>('COMBINED')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setMatrix(EMPTY_MATRIX)
      setShiftBMatrix(EMPTY_MATRIX)
      try {
        await hydrateFloorFromDb()
        // Keep prior months available for Overall / quality jump + dropdown history.
        await preloadAllFloorSheets()
        if (cancelled) return
        await preloadMonthSheets(month)
        if (cancelled) return
        const primary =
          view === 'shifts' ? 'shiftA' : view === 'efficiency' ? 'efficiency' : view === 'active' ? 'active' : 'meters'
        const owns = trackOwnsEntry(qualityId, qualityNameParam, qualityFromParam)
        const runRange = trackedRunRange(qualityId, qualityNameParam, qualityFromParam)
        setMatrix(
          limitMatrixToRun(productionMastersService.buildMonthlyMatrix(month, primary, owns), runRange, primary === 'efficiency')
        )
        if (view === 'shifts') {
          setShiftBMatrix(
            limitMatrixToRun(productionMastersService.buildMonthlyMatrix(month, 'shiftB', owns), runRange, false)
          )
        }
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
  }, [month, view, qualityId, qualityNameParam, qualityFromParam])

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
    if (view === 'shifts') {
      return matrix.days.map((d, i) => {
        const a = d.totalMeters || 0
        const b = shiftBMatrix.days[i]?.totalMeters || 0
        const value =
          shiftChartMode === 'SHIFT_A'
            ? a
            : shiftChartMode === 'SHIFT_B'
              ? b
              : a + b
        return { label: String(d.day), value }
      })
    }
    return (
      qualityDaySeries ??
      matrix.days.map((d) => ({
        label: String(d.day),
        value: d.totalMeters || 0,
      }))
    )
  }, [matrix.days, shiftBMatrix.days, qualityDaySeries, isQualityDeepLink, view, shiftChartMode])

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
    const loomMap: Record<number, number> = {}
    if (view === 'shifts') {
      const allLooms = new Set([
        ...Object.keys(matrix.loomTotals || {}).map(Number),
        ...Object.keys(shiftBMatrix.loomTotals || {}).map(Number),
      ])
      allLooms.forEach((loom) => {
        const a = Number(matrix.loomTotals?.[loom]) || 0
        const b = Number(shiftBMatrix.loomTotals?.[loom]) || 0
        loomMap[loom] =
          shiftChartMode === 'SHIFT_A'
            ? a
            : shiftChartMode === 'SHIFT_B'
              ? b
              : a + b
      })
    } else {
      Object.entries(matrix.loomTotals || {}).forEach(([loom, meters]) => {
        loomMap[Number(loom)] = Number(meters) || 0
      })
    }

    const entries = Object.entries(loomMap).map(([loom, meters]) => ({
      label: `Loom ${loom}`,
      value: Number(meters) || 0,
      loom: Number(loom),
    }))
    const filtered = qualityLoomSet
      ? entries.filter((e) => qualityLoomSet.has(e.loom))
      : entries
    filtered.sort((a, b) => b.value - a.value)
    return filtered.map(({ label, value }) => ({ label, value }))
  }, [matrix.loomTotals, shiftBMatrix.loomTotals, qualityLoomSet, view, shiftChartMode])

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
          : productionMastersService.buildMonthlyMatrix(
              month,
              'efficiency',
              trackOwnsEntry(qualityId, qualityNameParam, qualityFromParam)
            )
      // Same as the Excel "Monthly Efficiency" block: each day's model efficiency
      // (that day's meters ÷ that day's 100% running target), then the plain average of
      // those days. Days with no entry for the model (no target) are left out.
      const daySum: Record<string, number> = { G6200: 0, G6300: 0, PU: 0 }
      const dayCount: Record<string, number> = { G6200: 0, G6300: 0, PU: 0 }
      for (const d of source.days) {
        const actual: Record<string, number> = { G6200: 0, G6300: 0, PU: 0 }
        const target: Record<string, number> = { G6200: 0, G6300: 0, PU: 0 }
        for (const [loomStr, t] of Object.entries(d.loomTarget || {})) {
          const loom = Number(loomStr)
          if (qualityLoomSet && !qualityLoomSet.has(loom)) continue
          const cat = catOf(loom)
          target[cat] += Number(t) || 0
          actual[cat] += Number(d.loomActual?.[loom]) || 0
        }
        for (const cat of ['G6200', 'G6300', 'PU']) {
          if (target[cat] > 0) {
            daySum[cat] += (actual[cat] / target[cat]) * 100
            dayCount[cat] += 1
          }
        }
      }
      return (['G6200', 'G6300', 'PU'] as const).map((label) => ({
        label,
        value: dayCount[label] > 0 ? Math.round(daySum[label] / dayCount[label]) : 0,
        color: colors[label],
      }))
    }

    if (view === 'shifts') {
      const totals: Record<string, number> = { G6200: 0, G6300: 0, PU: 0 }
      const allLooms = new Set([
        ...Object.keys(matrix.loomTotals || {}).map(Number),
        ...Object.keys(shiftBMatrix.loomTotals || {}).map(Number),
      ])
      allLooms.forEach((loom) => {
        if (qualityLoomSet && !qualityLoomSet.has(loom)) return
        const cat = catOf(loom)
        const a = Number(matrix.loomTotals?.[loom]) || 0
        const b = Number(shiftBMatrix.loomTotals?.[loom]) || 0
        const val =
          shiftChartMode === 'SHIFT_A'
            ? a
            : shiftChartMode === 'SHIFT_B'
              ? b
              : a + b
        totals[cat] = (totals[cat] || 0) + val
      })
      return (['G6200', 'G6300', 'PU'] as const).map((label) => ({
        label,
        value: totals[label] || 0,
        color: colors[label],
      }))
    }

    const metersMatrix =
      view === 'meters'
        ? matrix
        : productionMastersService.buildMonthlyMatrix(
            month,
            'meters',
            trackOwnsEntry(qualityId, qualityNameParam, qualityFromParam)
          )
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
  }, [matrix, shiftBMatrix, month, view, shiftChartMode, qualityLoomSet, loading, qualityId, qualityNameParam, qualityFromParam])

  const modelBarSuffix = view === 'efficiency' ? '%' : ' m'
  const modelBarTitle =
    view === 'efficiency'
      ? 'By model — Efficiency'
      : view === 'shifts'
        ? shiftChartMode === 'SHIFT_A'
          ? 'By model — Shift A'
          : shiftChartMode === 'SHIFT_B'
            ? 'By model — Shift B'
            : 'By model — Production (A+B)'
        : 'By model — Production'

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

  /** Mill calendar fortnights:
   * 1st Fortnight = Days 2 to 16 (15 days: 2nd through 16th).
   * 2nd Fortnight = Days 17 to end of month, plus Day 1 of the month (17 se 1 cycle).
   * Sum of 1st FN + 2nd FN perfectly equals Monthly Total without overlap or omission.
   */
  const dayNum = (d: { day?: number | string }, fallbackIndex: number) => {
    const n = Number(d.day)
    return Number.isFinite(n) && n > 0 ? n : fallbackIndex + 1
  }
  const inFortnight = (d: { day?: number | string }, index: number, half: 1 | 2) => {
    const n = dayNum(d, index)
    return half === 1 ? (n >= 2 && n <= 16) : (n === 1 || n > 16)
  }
  const weightedFortnight = (half: 1 | 2, source: MatrixState = matrix) => {
    let actual = 0
    let target = 0
    source.days.forEach((d, i) => {
      if (!inFortnight(d, i, half)) return
      actual += Number(source.dayActual[i]) || 0
      target += Number(source.dayTarget[i]) || 0
    })
    return target > 0 ? Math.round((actual / target) * 100) : 0
  }
  const sumFortnightMeters = (half: 1 | 2, source: MatrixState = matrix) => {
    if (isQualityDeepLink) {
      return daySeries.reduce((s, d, i) => {
        if (!inFortnight({ day: d.label }, i, half)) return s
        return s + (d.value || 0)
      }, 0)
    }
    return source.days.reduce((s, d, i) => {
      if (!inFortnight(d, i, half)) return s
      return s + (d.totalMeters || 0)
    }, 0)
  }

  const shiftAFortnight1 = sumFortnightMeters(1, matrix)
  const shiftAFortnight2 = sumFortnightMeters(2, matrix)
  const shiftBFortnight1 = sumFortnightMeters(1, shiftBMatrix)
  const shiftBFortnight2 = sumFortnightMeters(2, shiftBMatrix)

  const fortnight1 =
    view === 'efficiency'
      ? weightedFortnight(1)
      : view === 'shifts'
        ? shiftAFortnight1 + shiftBFortnight1
        : sumFortnightMeters(1, matrix)
  const fortnight2 =
    view === 'efficiency'
      ? weightedFortnight(2)
      : view === 'shifts'
        ? shiftAFortnight2 + shiftBFortnight2
        : sumFortnightMeters(2, matrix)

  const loomFortnight = (loom: number, half: 1 | 2, source: MatrixState = matrix) => {
    if (view === 'efficiency') {
      let actual = 0
      let target = 0
      source.days.forEach((d, i) => {
        if (!inFortnight(d, i, half)) return
        actual += Number(d.loomActual?.[loom]) || 0
        target += Number(d.loomTarget?.[loom]) || 0
      })
      return target > 0 ? Math.round((actual / target) * 100) : 0
    }
    return source.days.reduce((s, d, i) => {
      if (!inFortnight(d, i, half)) return s
      return s + (Number(d.loomMeters?.[loom]) || 0)
    }, 0)
  }

  const monthLabel = (() => {
    try {
      const [y, m] = month.split('-').map(Number)
      return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    } catch {
      return month
    }
  })()

  const cellOwned = (d: MonthlyMatrixDay, loom: number) => {
    if (!d.hasSheet) return false
    if (d.loomCounted && !d.loomCounted[loom]) return false
    return true
  }

  const cellText = (d: MonthlyMatrixDay, loom: number) => {
    if (!cellOwned(d, loom)) return '—'
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

  const backHref =
    qualityFocus || isQualityDeepLink
      ? '/floor/production?tab=quality'
      : '/dashboard'
  const backLabel =
    qualityFocus || isQualityDeepLink ? '← Back to Quality' : '← Back to Dashboard'

  return (
    <div className="pb-4">
      <PageHeader
        title={pageTitle}
        showBreadcrumbs={false}
        actions={
          <>
            <select
              className="form-select form-select-sm"
              style={{ width: 'auto', minWidth: 150 }}
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              disabled={loading}
              aria-label="Tracking month"
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

      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3 print:hidden">
        <Link
          href={backHref}
          className="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-1"
        >
          <i className="bi bi-arrow-left" aria-hidden />
          {backLabel.replace(/^←\s*/, '')}
        </Link>
      </div>

      {(qualityFocus || (isQualityDeepLink && focusName)) && (
        <div className="alert alert-info d-flex flex-wrap align-items-center gap-2 py-2 mb-3">
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
        </div>
      )}

      {loading ? (
        <ProductionReportSkeleton />
      ) : (
        <>
      {view === 'meters' && !qualityFocus && (
        <ServerMonthCheck month={month} pageTotal={matrix.grandTotalMeters} />
      )}
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
            subValue={view === 'shifts' ? 'Days 2–16 · Shift A + B' : 'Days 2–16'}
            biIcon="bi-1-circle"
            colorVariant="info"
          />
        </div>
        <div className="col-6 col-lg-3">
          <MetricCard
            title="2nd Fortnight"
            value={formatTotal(fortnight2)}
            subValue={view === 'shifts' ? 'Days 17–1 · Shift A + B' : 'Days 17–1'}
            biIcon="bi-2-circle"
            colorVariant="warning"
          />
        </div>
      </div>

      <div className="row g-3 mb-3">
        <div className="col-lg-7">
          <div className="card h-100">
            <div className="card-header d-flex flex-wrap align-items-center justify-content-between gap-2">
              <h3 className="card-title mb-0">
                {view === 'shifts'
                  ? shiftChartMode === 'SHIFT_A'
                    ? 'Shift A daily meters (m)'
                    : shiftChartMode === 'SHIFT_B'
                      ? 'Shift B daily meters (m)'
                      : 'Daily mill output — Shift A + B (m)'
                  : view === 'efficiency'
                    ? 'Daily efficiency (%)'
                    : view === 'active'
                      ? 'Looms running each day'
                      : qualityFocus
                        ? `Daily output — ${qualityFocus.name} (m)`
                        : 'Daily mill output (m)'}
              </h3>
              {view === 'shifts' && (
                <div className="btn-group btn-group-sm" role="group" aria-label="Shift graph selector">
                  <button
                    type="button"
                    className={`btn ${shiftChartMode === 'COMBINED' ? 'btn-primary' : 'btn-outline-secondary'}`}
                    onClick={() => setShiftChartMode('COMBINED')}
                  >
                    Combined (A+B)
                  </button>
                  <button
                    type="button"
                    className={`btn ${shiftChartMode === 'SHIFT_A' ? 'btn-primary' : 'btn-outline-secondary'}`}
                    onClick={() => setShiftChartMode('SHIFT_A')}
                  >
                    Shift A
                  </button>
                  <button
                    type="button"
                    className={`btn ${shiftChartMode === 'SHIFT_B' ? 'btn-primary' : 'btn-outline-secondary'}`}
                    onClick={() => setShiftChartMode('SHIFT_B')}
                  >
                    Shift B
                  </button>
                </div>
              )}
            </div>
            <div className="card-body">
              <SimpleBarChart
                data={daySeries}
                height={180}
                valueSuffix={
                  view === 'efficiency' ? '%' : view === 'active' ? '' : ' m'
                }
                barColor={
                  view === 'shifts'
                    ? shiftChartMode === 'SHIFT_A'
                      ? '#0d6efd'
                      : shiftChartMode === 'SHIFT_B'
                        ? '#198754'
                        : '#0284c7'
                    : view === 'efficiency'
                      ? '#0d9488'
                      : '#0d6efd'
                }
              />
              <div className="mt-3">
                <SimpleLineChart
                  data={daySeries}
                  height={120}
                  valueSuffix={
                    view === 'efficiency' ? '%' : view === 'active' ? '' : ' m'
                  }
                  stroke={
                    view === 'shifts'
                      ? shiftChartMode === 'SHIFT_A'
                        ? '#0d6efd'
                        : shiftChartMode === 'SHIFT_B'
                          ? '#198754'
                          : '#0284c7'
                      : view === 'efficiency'
                        ? '#0d9488'
                        : '#0d6efd'
                  }
                />
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
                {qualityFocus
                  ? 'Looms — this quality'
                  : view === 'shifts'
                    ? shiftChartMode === 'SHIFT_A'
                      ? 'Top looms — Shift A'
                      : shiftChartMode === 'SHIFT_B'
                        ? 'Top looms — Shift B'
                        : 'Top looms this month (A+B)'
                    : 'Top looms this month'}
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
        <TablePanScroll className="card-body p-0">
          <table className="table table-sm table-bordered mb-0 align-middle text-nowrap">
            <thead className="table-light">
              <tr>
                <th className="px-2 sticky-start bg-light">L/#</th>
                {matrix.days.map((d) => (
                  <th key={d.date || d.day} className="px-1 text-center" style={{ fontSize: 11 }}>
                    {d.day}
                  </th>
                ))}
                <th className="px-2 text-end" title="1st Fortnight (Days 2–16)">1st FN (2–16)</th>
                <th className="px-2 text-end" title="2nd Fortnight (Days 17–1)">2nd FN (17–1)</th>
                <th className="px-2 text-end">Monthly</th>
                <th className="px-2 text-end">Avg/Day</th>
              </tr>
            </thead>
            <tbody>
              {loomNumbers.map((loom) => {
                const monthly = Number(matrix.loomTotals?.[loom]) || 0
                const daysWith = matrix.days.filter(
                  (d) =>
                    cellOwned(d, loom) && (Number(d.loomMeters?.[loom]) || 0) > 0
                ).length
                const sheetDays = matrix.days.filter((d) => cellOwned(d, loom)).length
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
                      const owned = cellOwned(d, loom)
                      const v = Number(d.loomMeters?.[loom]) || 0
                      const empty = !owned
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
                  {view === 'efficiency'
                    ? `${fortnight1}%`
                    : view === 'shifts'
                      ? formatNumber(shiftAFortnight1, 0)
                      : formatNumber(fortnight1, 0)}
                </td>
                <td className="text-end px-2">
                  {view === 'efficiency'
                    ? `${fortnight2}%`
                    : view === 'shifts'
                      ? formatNumber(shiftAFortnight2, 0)
                      : formatNumber(fortnight2, 0)}
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
        </TablePanScroll>
      </div>

      {view === 'shifts' && (
        <div className="card mt-3">
          <div className="card-header">
            <h3 className="card-title mb-0">Shift B — Loom × Day (meters)</h3>
          </div>
          <TablePanScroll className="card-body p-0">
            <table className="table table-sm table-bordered mb-0 align-middle text-nowrap">
              <thead className="table-light">
                <tr>
                  <th className="px-2">L/#</th>
                  {shiftBMatrix.days.map((d) => (
                    <th key={d.date || d.day} className="px-1 text-center" style={{ fontSize: 11 }}>
                      {d.day}
                    </th>
                  ))}
                  <th className="px-2 text-end" title="1st Fortnight (Days 2–16)">1st FN (2–16)</th>
                  <th className="px-2 text-end" title="2nd Fortnight (Days 17–1)">2nd FN (17–1)</th>
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
                        const owned = cellOwned(d, loom)
                        const v = Number(d.loomMeters?.[loom]) || 0
                        return (
                          <td
                            key={`b-${loom}-${d.date || d.day}`}
                            className="text-end px-1"
                            style={{
                              fontSize: 11,
                              backgroundColor: !owned || v === 0 ? '#f8f9fa' : undefined,
                            }}
                          >
                            {owned ? formatNumber(v, 0) : '—'}
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
                      shiftBMatrix.days.reduce(
                        (s, d, i) => s + (inFortnight(d, i, 1) ? d.totalMeters || 0 : 0),
                        0
                      ),
                      0
                    )}
                  </td>
                  <td className="text-end px-2">
                    {formatNumber(
                      shiftBMatrix.days.reduce(
                        (s, d, i) => s + (inFortnight(d, i, 2) ? d.totalMeters || 0 : 0),
                        0
                      ),
                      0
                    )}
                  </td>
                  <td className="text-end px-2">{formatNumber(shiftBMatrix.grandTotalMeters, 0)}</td>
                  <td className="text-end px-2">{formatNumber(shiftBMatrix.avgPerDay, 0)}</td>
                </tr>
              </tfoot>
            </table>
          </TablePanScroll>
        </div>
      )}
        </>
      )}
    </div>
  )
}

export default function ProductionTotalTrackingPage() {
  const { user, canView } = useAuth()
  // Administration → Permissions: Tracking can be hidden for a person.
  if (user && !canView('tracking')) {
    return <div className="alert alert-secondary m-3">Tracking dekhne ki ijazat nahi.</div>
  }
  return (
    <Suspense
      fallback={
        <div className="p-3">
          <ProductionReportSkeleton />
        </div>
      }
    >
      <ProductionTotalTrackingContent />
    </Suspense>
  )
}
