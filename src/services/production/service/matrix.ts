/** Monthly matrix report (meters per loom per day). (Part of productionMastersService — no behaviour change.) */
import {
  DailyLoomProductionEntry,
  type MonthlyMatrixDay,
} from '@/types/production'
import {
  getExcelDailyLoomsForDate,
} from '@/data/productionData'
import {
  PRODUCTION_TODAY_MONTH,
  PRODUCTION_YESTERDAY,
  productionMonthDates,
} from '@/constants/productionCalendar'
import {
  resolveLoomCondition,
} from '@/constants/loomConditions'
import type { ProductionMastersService } from '@/services/productionMastersService'

export const matrixMethods = {
  buildMonthlyMatrix(
    this: ProductionMastersService,
    monthStr: string = PRODUCTION_TODAY_MONTH,
    metric: 'meters' | 'shiftA' | 'shiftB' | 'efficiency' | 'active' = 'meters',
    ownsEntry?: (entry: DailyLoomProductionEntry, dateStr: string) => boolean
  ): {
    days: MonthlyMatrixDay[]
    loomTotals: Record<number, number>
    grandTotalMeters: number
    avgPerDay: number
    /** Sum of actual meters and running target, used to weight efficiency. */
    loomActual: Record<number, number>
    loomTarget: Record<number, number>
    dayActual: number[]
    dayTarget: number[]
  } {
    // Production month: the 2nd → the 1st of the next month (the 1st's entry is the
    // previous day's production), up to today.
    const monthDates = productionMonthDates(monthStr)

    const loomNumbers = this.getLooms()
      .filter((l) => l.isActive)
      .map((l) => l.loomNumber)
      .sort((a, b) => a - b)

    const loomTotals: Record<number, number> = {}
    const loomActual: Record<number, number> = {}
    const loomTarget: Record<number, number> = {}
    loomNumbers.forEach((n) => {
      loomTotals[n] = 0
      loomActual[n] = 0
      loomTarget[n] = 0
    })

    const days: MonthlyMatrixDay[] = []
    const dayActual: number[] = []
    const dayTarget: number[] = []
    for (const dateStr of monthDates) {
      const day = Number(dateStr.slice(8, 10))
      const peeked = this.peekSheetDay(dateStr)
      const loomMeters: Record<number, number> = {}
      const dayLoomActual: Record<number, number> = {}
      const dayLoomTarget: Record<number, number> = {}
      const loomCounted: Record<number, boolean> = {}
      loomNumbers.forEach((n) => {
        loomMeters[n] = 0
      })
      let totalMeters = 0
      let actualSum = 0
      let targetSum = 0
      let entries = peeked
      let hasSheet = peeked != null && peeked.length > 0

      // Seeded yesterday sheet: allow Excel dailyHistory if DB sheet not hydrated yet
      if (!hasSheet && dateStr === PRODUCTION_YESTERDAY) {
        const excel = getExcelDailyLoomsForDate(dateStr)
        const anyMeters = excel.some(
          (e) =>
            (Number(e.totalMeters) || 0) > 0 ||
            (Number(e.shiftAMeters) || 0) + (Number(e.shiftBMeters) || 0) > 0
        )
        if (anyMeters) {
          entries = excel
          hasSheet = true
        }
      }

      if (hasSheet && entries) {
        for (const e of entries) {
          if (ownsEntry && !ownsEntry(e, dateStr)) continue
          if (ownsEntry) loomCounted[e.loomNumber] = true
          const meters =
            e.totalMeters != null
              ? Number(e.totalMeters) || 0
              : (Number(e.shiftAMeters) || 0) + (Number(e.shiftBMeters) || 0)
          const target = Number(e.runningTheoretical) || 0
          actualSum += meters
          targetSum += target
          loomActual[e.loomNumber] = (loomActual[e.loomNumber] || 0) + meters
          loomTarget[e.loomNumber] = (loomTarget[e.loomNumber] || 0) + target
          // Same-day dual segments: sum meters/target per loom (do not overwrite).
          dayLoomActual[e.loomNumber] = (dayLoomActual[e.loomNumber] || 0) + meters
          dayLoomTarget[e.loomNumber] = (dayLoomTarget[e.loomNumber] || 0) + target

          let value = meters
          if (metric === 'shiftA') value = Number(e.shiftAMeters) || 0
          else if (metric === 'shiftB') value = Number(e.shiftBMeters) || 0
          else if (metric === 'active') {
            value = resolveLoomCondition(e.status, e.remarks) === 'RUNNING' ? 1 : 0
            loomMeters[e.loomNumber] = Math.max(loomMeters[e.loomNumber] || 0, value)
            continue
          } else if (metric === 'efficiency') {
            // Defer % until dayLoomActual/Target are fully summed for the loom.
            continue
          }
          loomMeters[e.loomNumber] = (loomMeters[e.loomNumber] || 0) + value
          loomTotals[e.loomNumber] = (loomTotals[e.loomNumber] || 0) + value
          totalMeters += value
        }
        if (metric === 'efficiency') {
          for (const n of loomNumbers) {
            const a = dayLoomActual[n] || 0
            const t = dayLoomTarget[n] || 0
            loomMeters[n] = t > 0 ? Math.round((a / t) * 100) : 0
          }
        }
        if (metric === 'active') {
          totalMeters = 0
          for (const n of loomNumbers) {
            const v = loomMeters[n] || 0
            loomTotals[n] = (loomTotals[n] || 0) + v
            totalMeters += v
          }
        }
      }

      if (metric === 'efficiency') {
        totalMeters = targetSum > 0 ? Math.round((actualSum / targetSum) * 100) : 0
      }

      dayActual.push(actualSum)
      dayTarget.push(targetSum)
      days.push({
        day,
        date: dateStr,
        totalMeters,
        loomMeters,
        hasSheet,
        loomCounted: ownsEntry ? loomCounted : undefined,
        loomActual: metric === 'efficiency' ? dayLoomActual : undefined,
        loomTarget: metric === 'efficiency' ? dayLoomTarget : undefined,
      })
    }

    if (metric === 'efficiency') {
      for (const n of loomNumbers) {
        const target = loomTarget[n] || 0
        loomTotals[n] = target > 0 ? Math.round(((loomActual[n] || 0) / target) * 100) : 0
      }
    }

    const daysWithSheet = days.filter((d) => d.hasSheet).length
    const grandTotalMeters =
      metric === 'efficiency'
        ? (() => {
            const actual = dayActual.reduce((s, n) => s + n, 0)
            const target = dayTarget.reduce((s, n) => s + n, 0)
            return target > 0 ? Math.round((actual / target) * 100) : 0
          })()
        : days.reduce((s, d) => s + (d.totalMeters || 0), 0)
    const avgPerDay =
      metric === 'efficiency'
        ? grandTotalMeters
        : daysWithSheet > 0
          ? grandTotalMeters / daysWithSheet
          : 0
    return {
      days,
      loomTotals,
      grandTotalMeters,
      avgPerDay,
      loomActual,
      loomTarget,
      dayActual,
      dayTarget,
    }
  },
}

export type MatrixMethods = typeof matrixMethods
