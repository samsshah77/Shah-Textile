import type { DailyLoomProductionEntry } from '@/types/production'
import { calculateProductionMetrics } from '@/types/production'
import { LOOM_STATUS_LABEL, resolveLoomCondition } from '@/constants/loomConditions'
import { fabricFaultPreview } from '@/components/floor/FabricFaultShiftDialog'

/**
 * One day's production sheet in a few numbers — the same formulas as the sheet footer
 * (efficiency = Σ A+B ÷ Σ 100%, not an average of %). Used by the dashboard and WhatsApp text.
 */
export interface DaySummary {
  meters: number
  shiftA: number
  shiftB: number
  weightKg: number
  runningTheo: number
  theo24: number
  lossRunning: number
  loss24: number
  efficiency: number
  efficiency24: number
  looms: number
  running: number
  /** Looms whose condition is not Running (same count as "Active looms"): status, remark, meters made. */
  stopped: Array<{ loom: number; status: string; remarks: string; quality: string; meters: number }>
  /** Running looms with the lowest efficiency. */
  lowLooms: Array<{ loom: number; quality: string; efficiency: number; meters: number }>
  byQuality: Array<{ quality: string; meters: number; looms: number }>
  faultLooms: number
}

const metersOf = (e: DailyLoomProductionEntry) =>
  e.totalMeters != null ? Number(e.totalMeters) || 0 : (Number(e.shiftAMeters) || 0) + (Number(e.shiftBMeters) || 0)

function theoOf(e: DailyLoomProductionEntry) {
  const run = Number(e.runningTheoretical) || 0
  const t24 = Number(e.theoretical24h) || 0
  if (run > 0 && t24 > 0) return { run, t24 }
  const m = calculateProductionMetrics({
    rpm: e.rpm || 0,
    runningHours: e.rollerHours ?? e.runningHours ?? 0,
    pick: e.pick || 0,
    shiftAMeters: e.shiftAMeters || 0,
    shiftBMeters: e.shiftBMeters || 0,
    loomNumber: e.loomNumber,
  })
  return { run: run || m.theoreticalMeters || 0, t24: t24 || m.theoretical24h || 0 }
}

export function summarizeProductionDay(rows: DailyLoomProductionEntry[]): DaySummary {
  let meters = 0
  let shiftA = 0
  let shiftB = 0
  let weightKg = 0
  let runningTheo = 0
  let theo24 = 0
  const loomSet = new Set<number>()
  const runningSet = new Set<number>()
  const stopped = new Map<number, DaySummary['stopped'][number]>()
  const perLoom = new Map<number, { quality: string; meters: number; theo: number }>()
  const quality = new Map<string, { meters: number; looms: Set<number> }>()
  const faults = new Set<number>()

  for (const e of rows) {
    const m = metersOf(e)
    const t = theoOf(e)
    meters += m
    shiftA += Number(e.shiftAMeters) || 0
    shiftB += Number(e.shiftBMeters) || 0
    weightKg += Number(e.weightKg) || 0
    runningTheo += t.run
    theo24 += t.t24
    loomSet.add(e.loomNumber)
    const cond = resolveLoomCondition(e.status, e.remarks)
    if (cond === 'RUNNING') runningSet.add(e.loomNumber)
    else {
      const st = stopped.get(e.loomNumber) || {
        loom: e.loomNumber,
        status: LOOM_STATUS_LABEL[cond] || String(cond),
        remarks: (e.remarks || '').trim(),
        quality: (e.qualityName || '').trim(),
        meters: 0,
      }
      st.meters += m
      stopped.set(e.loomNumber, st)
    }
    const pl = perLoom.get(e.loomNumber) || { quality: (e.qualityName || '').trim(), meters: 0, theo: 0 }
    pl.meters += m
    pl.theo += t.run
    perLoom.set(e.loomNumber, pl)
    const qn = (e.qualityName || '').trim() || '—'
    const q = quality.get(qn) || { meters: 0, looms: new Set<number>() }
    q.meters += m
    if (m > 0) q.looms.add(e.loomNumber)
    quality.set(qn, q)
    if (fabricFaultPreview(e).trim()) faults.add(e.loomNumber)
  }
  // A loom with a running part (two qualities in a day) counts as running.
  for (const n of runningSet) stopped.delete(n)
  for (const st of stopped.values()) st.meters = Math.round(st.meters)

  const lowLooms = [...perLoom.entries()]
    .filter(([, l]) => l.meters > 0 && l.theo > 0)
    .map(([loom, l]) => ({ loom, quality: l.quality, meters: Math.round(l.meters), efficiency: (l.meters / l.theo) * 100 }))
    .sort((a, b) => a.efficiency - b.efficiency)
    .slice(0, 5)

  return {
    meters: Math.round(meters),
    shiftA: Math.round(shiftA),
    shiftB: Math.round(shiftB),
    weightKg: Math.round(weightKg * 10) / 10,
    runningTheo: Math.round(runningTheo),
    theo24: Math.round(theo24),
    lossRunning: Math.round(runningTheo - meters),
    loss24: Math.round(theo24 - meters),
    efficiency: runningTheo > 0 ? (meters / runningTheo) * 100 : 0,
    efficiency24: theo24 > 0 ? (meters / theo24) * 100 : 0,
    looms: loomSet.size,
    running: runningSet.size,
    stopped: [...stopped.values()].sort((a, b) => a.loom - b.loom),
    lowLooms,
    byQuality: [...quality.entries()]
      .filter(([, q]) => q.meters > 0)
      .map(([name, q]) => ({ quality: name, meters: Math.round(q.meters), looms: q.looms.size }))
      .sort((a, b) => b.meters - a.meters),
    faultLooms: faults.size,
  }
}
