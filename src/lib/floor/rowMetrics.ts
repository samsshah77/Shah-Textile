/**
 * The figures of a day-sheet row that follow from what was typed (roller hours, RPM,
 * pick, shift A / B meters): theoretical meters, total, efficiency and loss.
 *
 * The server applies this to every hand-edited row it saves, so the stored figures (and
 * the reports built from them) never depend on which browser version did the sum. The
 * Daily Entry edit uses the same function, so the screen and the server always agree.
 */
import { calculateProductionMetrics, type DailyLoomProductionEntry } from '@/types/production'

const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export type RowMetrics = {
  rollerHours: number
  runningHours: number
  runningTheoretical: number
  totalMeters: number
  efficiencyPercentage: number
  stopLossMeters: number
  theoretical24h: number
  efficiency24h: number
  loss24h: number
}

export function withRowMetrics<T extends Partial<DailyLoomProductionEntry>>(e: T): T & RowMetrics {
  const rollerHours = num(e.rollerHours ?? e.runningHours ?? 0)
  const a = num(e.shiftAMeters)
  const b = num(e.shiftBMeters)
  // No pick on the row: a loom that made cloth is counted at 60 picks (as the Daily Entry
  // always did); a loom with no quality and no meters has no theoretical output.
  const pick = num(e.pick) || (a + b > 0 ? 60 : 0)
  const m = calculateProductionMetrics({
    rpm: num(e.rpm),
    runningHours: rollerHours,
    pick,
    shiftAMeters: a,
    shiftBMeters: b,
    loomNumber: num(e.loomNumber),
  })
  return {
    ...e,
    rollerHours,
    runningHours: rollerHours,
    runningTheoretical: m.theoreticalMeters,
    totalMeters: m.totalMeters,
    efficiencyPercentage: m.efficiencyPercentage,
    stopLossMeters: m.stopLossMeters,
    theoretical24h: m.theoretical24h,
    efficiency24h: m.efficiency24h,
    loss24h: m.loss24h,
  }
}
