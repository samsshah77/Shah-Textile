import { describe, it, expect } from 'vitest'
import { lotForDay } from '@/lib/floor/dayBuilder'
import { beamChangeDay } from '@/server/floor/beamHistory'
import { normalizeBeam } from '@/services/production/loomBeamHelpers'

const beam = (p: Record<string, unknown>) => normalizeBeam({ beamNo: 'B1', warp: '', ...p } as never)

describe('lotForDay — a beam paints the sheet only from its mount date', () => {
  const b = beam({ usedInLoom: '5', mountedOn: '2026-10-27', swLot: 'Sw # 340' })

  it('shows the lot on and after the mount day', () => {
    expect(lotForDay(5, '2026-10-27', [b], '')).toBe('Sw # 340')
    expect(lotForDay(5, '2026-10-28', [b], '')).toBe('Sw # 340')
  })

  it('keeps the earlier beam lot saved on a day before the mount', () => {
    expect(lotForDay(5, '2026-10-25', [b], 'Sw # 331')).toBe('Sw # 331')
  })

  it('drops the new lot from an earlier day that was saved with it', () => {
    expect(lotForDay(5, '2026-10-25', [b], 'Sw # 340')).toBe('')
  })

  it('twin beam: only the beam already on the loom counts on an earlier day', () => {
    const a = beam({ beamNo: 'A', usedInLoom: '5', mountedOn: '2026-10-10', swLot: 'Wp # 12' })
    expect(lotForDay(5, '2026-10-20', [a, b], 'Wp # 12 + Sw # 340')).toBe('Wp # 12')
    expect(lotForDay(5, '2026-10-27', [a, b], '')).toBe('Wp # 12 + Sw # 340')
  })

  it('a past day keeps its saved lot after the beam came off the loom', () => {
    expect(lotForDay(5, '2026-10-20', [], 'Sw # 331')).toBe('Sw # 331')
  })
})

describe('beamChangeDay — which day a beam change belongs to', () => {
  const today = '2026-10-27'
  const store = beam({ location: 'STORE' })

  it('mount → mount date (also when back-dated)', () => {
    expect(beamChangeDay(store, beam({ usedInLoom: '3', mountedOn: '2026-10-24' }), today)).toBe('2026-10-24')
  })

  it('Sw# typed on a mounted beam belongs to its whole time on that loom', () => {
    const on = beam({ usedInLoom: '3', mountedOn: '2026-10-20' })
    expect(beamChangeDay(on, { ...on, swLot: 'Sw # 9' }, today)).toBe('2026-10-20')
  })

  it('off the loom → the day it ended', () => {
    const on = beam({ usedInLoom: '3', mountedOn: '2026-10-20' })
    expect(beamChangeDay(on, beam({ location: 'SIZING', beamEndedOn: '2026-10-26' }), today)).toBe('2026-10-26')
  })

  it('a future mount date or a store edit falls on today', () => {
    expect(beamChangeDay(store, beam({ usedInLoom: '3', mountedOn: '2026-11-02' }), today)).toBe(today)
    expect(beamChangeDay(store, { ...store, length: 900 }, today)).toBe(today)
    expect(beamChangeDay(store, null, today)).toBe(today)
  })
})
