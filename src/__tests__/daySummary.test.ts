import { describe, expect, it } from 'vitest'
import { summarizeProductionDay } from '@/lib/floor/daySummary'
import type { DailyLoomProductionEntry } from '@/types/production'

const row = (p: Partial<DailyLoomProductionEntry>) => ({ loomNumber: 1, status: 'RUNNING', qualityName: 'Q1', shiftAMeters: 0, shiftBMeters: 0, totalMeters: 0, runningTheoretical: 0, theoretical24h: 0, ...p }) as DailyLoomProductionEntry

describe('dashboard day summary', () => {
  it('efficiency is Σ A+B ÷ Σ 100% (like the sheet footer), not an average of %', () => {
    const s = summarizeProductionDay([
      row({ loomNumber: 1, shiftAMeters: 50, shiftBMeters: 50, totalMeters: 100, runningTheoretical: 200, theoretical24h: 250, weightKg: 30 }),
      row({ loomNumber: 2, shiftAMeters: 90, shiftBMeters: 90, totalMeters: 180, runningTheoretical: 200, theoretical24h: 250, qualityName: 'Q2' }),
      row({ loomNumber: 3, status: 'MECH_FAULT' as DailyLoomProductionEntry['status'], remarks: 'motor' }),
    ])
    expect(s.meters).toBe(280)
    expect(Math.round(s.efficiency)).toBe(70) // 280 / 400 — the average of 50% and 90% would also be 70, so check 24h
    expect(Math.round(s.efficiency24)).toBe(56) // 280 / 500
    expect(s.lossRunning).toBe(120)
    expect(s.weightKg).toBe(30)
    expect(s.running).toBe(2)
    expect(s.stopped.map((x) => x.loom)).toEqual([3])
    expect(s.lowLooms[0]).toMatchObject({ loom: 1, efficiency: 50 })
    expect(s.byQuality[0]).toMatchObject({ quality: 'Q2', meters: 180 })
  })
})
