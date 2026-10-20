/**
 * Production data check (read-only): finds saved day rows whose figures cannot be right,
 * so they can be looked at and corrected by hand. Nothing is changed by this check.
 */
import type { DailyLoomProductionEntry } from '@/types/production'
import { withRowMetrics } from '@/lib/floor/rowMetrics'
import { isQualityEndedSheetRow, namedQualityOnRow } from '@/services/production/qualityRuns'

export type FloorProblem = {
  kind: 'false-loss' | 'figures' | 'meters-no-quality' | 'not-approved'
  date: string
  loomNumber?: number
  part?: number
  detail: string
}

const meters = (e: Partial<DailyLoomProductionEntry>) => (Number(e.shiftAMeters) || 0) + (Number(e.shiftBMeters) || 0)

export function findFloorProblems(days: Array<{ date: string; rows: DailyLoomProductionEntry[] }>, today: string): FloorProblem[] {
  const out: FloorProblem[] = []
  for (const { date, rows } of days) {
    for (const e of rows) {
      const m = meters(e)
      const part = Math.max(1, Number(e.segmentIndex) || 1)
      const where = { date, loomNumber: e.loomNumber, part }
      const loss = Number(e.loss24h) || 0
      const noQuality = !namedQualityOnRow(e.qualityName) || isQualityEndedSheetRow(e) || !(Number(e.pick) > 0)
      if (m === 0 && noQuality && loss > 0) {
        out.push({
          kind: 'false-loss',
          ...where,
          detail: `Quality nahi / khatam (${e.qualityName || '—'}${isQualityEndedSheetRow(e) ? ', Quality Ended' : ''}) aur meters 0 — phir bhi loss ${loss} m likha hai (report mein jhoothi loss).`,
        })
      }
      if (m > 0 && !namedQualityOnRow(e.qualityName)) {
        out.push({ kind: 'meters-no-quality', ...where, detail: `${m} m likhe hain magar quality ka naam nahi.` })
      }
      if (m > 0) {
        const want = withRowMetrics(e)
        const off: string[] = []
        if (Math.abs((Number(e.totalMeters) || 0) - want.totalMeters) > 1) off.push(`total ${e.totalMeters ?? '-'} (hona chahiye ${want.totalMeters})`)
        if (Math.abs((Number(e.efficiencyPercentage) || 0) - want.efficiencyPercentage) > 1)
          off.push(`efficiency ${e.efficiencyPercentage ?? '-'}% (hona chahiye ${want.efficiencyPercentage}%)`)
        if (off.length) out.push({ kind: 'figures', ...where, detail: `Hisaab nahi milta: ${off.join(', ')}.` })
      }
    }
    if (date < today && rows.length && !rows.some((e) => e.approvalStatus === 'APPROVED')) {
      const withMeters = rows.filter((e) => meters(e) > 0).length
      if (withMeters) out.push({ kind: 'not-approved', date, detail: `Din approve nahi hua (${withMeters} looms par meters).` })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.loomNumber || 0) - (b.loomNumber || 0))
}
