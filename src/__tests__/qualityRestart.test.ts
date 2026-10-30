import { describe, it, expect } from 'vitest'
import { buildDayRows } from '@/lib/floor/dayBuilder'

const loom = { loomNumber: 5, qualityId: 'q-new', defaultRpm: 340, status: 'RUNNING', category: 'Airjet', model: 'G-6200' } as never
const catalog = [
  { id: 'q-end-1', name: 'Parco', status: 'ENDED', createdOn: '2026-10-01', endedOn: '2026-10-10', pick: 60, reed: 120 },
  { id: 'q-other', name: 'Bunny', status: 'ENDED', createdOn: '2026-10-11', endedOn: '2026-10-14', pick: 56, reed: 110 },
  { id: 'q-new', name: 'Parco', status: 'ACTIVE', createdOn: '2026-10-15', pick: 60, reed: 120 },
] as never[]
const prior17 = { date: '2026-10-17', loomNumber: 5, segmentIndex: 1, qualityName: 'Parco', qualityId: 'q-new', pick: 60, reed: 120, rpm: 340, shiftAMeters: 100, shiftBMeters: 90, rollerHours: 24, status: 'RUNNING', remarks: '' } as never
const build = (loaded: unknown[], today = '2026-10-21') =>
  buildDayRows({ dateStr: '2026-10-18', today, looms: [loom], catalog, beams: [], loaded: loaded as never, prior: () => prior17, recipe: () => ({ qualityName: 'Parco', pick: 60, reed: 120, rpm: 340 }) })[0]

describe('quality restarted from zero in the same month', () => {
  it('a day without production after the restart still shows the running quality', () => {
    const r = build([])
    expect(r.qualityName).toBe('Parco')
    expect(r.remarks).not.toMatch(/quality\s*ended/i)
    expect(r.pick).toBe(60)
  })
  it('a wrongly saved "Quality Ended" row on that day is corrected on rebuild', () => {
    const stub = { date: '2026-10-18', loomNumber: 5, segmentIndex: 1, qualityName: 'Parco', pick: 0, reed: 0, rpm: 340, shiftAMeters: 0, shiftBMeters: 0, rollerHours: 0, status: 'RUNNING', remarks: 'Quality Ended' }
    const r = build([stub])
    expect(r.remarks).not.toMatch(/quality\s*ended/i)
    expect(r.pick).toBe(60)
  })
})

import { qualityRunThatOwnsSheetEntry } from '@/services/production/qualityRuns'

describe('same quality run 3 times in one month — each run keeps its own meters', () => {
  const runs = [
    { id: 'r1', name: 'Parco', status: 'ENDED', createdOn: '2026-10-02', endedOn: '2026-10-10', pick: 60 },
    { id: 'r2', name: 'Parco', status: 'ENDED', createdOn: '2026-10-11', endedOn: '2026-10-20', pick: 60 },
    { id: 'r3', name: 'Parco', status: 'ACTIVE', createdOn: '2026-10-23', pick: 60 },
  ] as never[]
  const own = (date: string, qualityId?: string) =>
    (qualityRunThatOwnsSheetEntry({ date, loomNumber: 5, qualityName: 'Parco', pick: 60, qualityId }, runs) as { id: string } | null)?.id ?? null
  it('rows without a run id go to the run that was open that day', () => {
    expect(own('2026-10-05')).toBe('r1')
    expect(own('2026-10-10')).toBe('r1')
    expect(own('2026-10-11')).toBe('r2') // restarted the very next day
    expect(own('2026-10-18')).toBe('r2')
    expect(own('2026-10-21')).toBe('r2') // end-day grace, no restart yet
    expect(own('2026-10-24')).toBe('r3')
  })
  it('rows stamped with a run id stay with that run', () => {
    expect(own('2026-10-11', 'r1')).toBe('r1')
    expect(own('2026-10-24', 'r2')).toBe('r2')
  })
})

import { qualityActiveOnSheetDate } from '@/services/production/qualityRuns'

describe('quality ended and restarted from zero — past days show only the ended run', () => {
  const oldRun = { id: 'd-old', name: 'Decatize', status: 'ENDED', createdOn: '2026-10-02', endedOn: '2026-10-27', pick: 290 }
  const newRun = { id: 'd-new', name: 'Decatize', status: 'ACTIVE', createdOn: '2026-10-28', pick: 290 }
  const catalog = [oldRun, newRun] as never[]
  const row = (qualityId?: string) =>
    [{ date: '2026-10-25', loomNumber: 13, segmentIndex: 1, qualityName: 'Decatize', pick: 290, qualityId }] as never[]
  it('the restarted run is not listed on a day of the old run', () => {
    expect(qualityActiveOnSheetDate(newRun as never, '2026-10-25', row(), catalog)).toBe(false)
    expect(qualityActiveOnSheetDate(newRun as never, '2026-10-25', row('d-old'), catalog)).toBe(false)
  })
  it('the ended run is still listed on its own days', () => {
    expect(qualityActiveOnSheetDate(oldRun as never, '2026-10-25', row('d-old'), catalog)).toBe(true)
  })
  it('the restarted run is listed from its start day', () => {
    expect(qualityActiveOnSheetDate(newRun as never, '2026-10-28', row(), catalog)).toBe(true)
  })
  it('a single quality created after its (imported) rows still shows on those days', () => {
    const only = { id: 'x', name: 'Mellina', status: 'ACTIVE', createdOn: '2026-10-20', pick: 66 }
    const rows = [{ date: '2026-10-10', loomNumber: 26, segmentIndex: 1, qualityName: 'Mellina', pick: 66 }] as never[]
    expect(qualityActiveOnSheetDate(only as never, '2026-10-10', rows, [only] as never[])).toBe(true)
  })
})
