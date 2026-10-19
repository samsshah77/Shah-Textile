import { describe, it, expect } from 'vitest'
import {
  analyzeSheetOverwrite,
  assertSafeSheetOverwrite,
  assertSafeListReplace,
  keepStoredApproval,
  keepStoredApprovalForSheet,
  sheetIsApproved,
  rowMeters,
  FloorGuardError,
} from '@/server/floorGuards'
import type { DailyLoomProductionEntry } from '@/types/production'

function row(
  loomNumber: number,
  a: number,
  b: number,
  qualityName = 'PAKEEZA',
  extra: Partial<DailyLoomProductionEntry> = {}
): DailyLoomProductionEntry {
  return {
    id: `r${loomNumber}`,
    date: '2026-10-10',
    loomNumber,
    segmentIndex: 1,
    qualityName,
    shiftAMeters: a,
    shiftBMeters: b,
    ...extra,
  } as DailyLoomProductionEntry
}

/** A realistic stored day: 34 looms with production. */
const storedDay = Array.from({ length: 34 }, (_, i) => row(i + 1, 60 + i, 55 + i))

describe('Sheet overwrite guard', () => {
  it('blocks the 16-Oct failure: a rebuilt blank day saved over real meters', () => {
    const blankRebuild = storedDay.map((e) => ({ ...e, shiftAMeters: 0, shiftBMeters: 0 }))
    expect(() => assertSafeSheetOverwrite('2026-10-10', storedDay, blankRebuild)).toThrow(
      FloorGuardError
    )
  })

  it('blocks a save that wipes quality names on many looms', () => {
    const wiped = storedDay.map((e) => ({ ...e, qualityName: '—' }))
    expect(() => assertSafeSheetOverwrite('2026-10-10', storedDay, wiped)).toThrow(/lose their quality/)
  })

  it('blocks a save that halves the day total', () => {
    const halved = storedDay.map((e) => ({ ...e, shiftAMeters: 10, shiftBMeters: 10 }))
    expect(() => assertSafeSheetOverwrite('2026-10-10', storedDay, halved)).toThrow(/day total/)
  })

  it('allows normal editing: one loom corrected, even to zero', () => {
    const edited = storedDay.map((e) => (e.loomNumber === 7 ? { ...e, shiftAMeters: 0, shiftBMeters: 0 } : e))
    expect(() => assertSafeSheetOverwrite('2026-10-10', storedDay, edited)).not.toThrow()
  })

  it('allows normal editing: meters changed on every loom', () => {
    const edited = storedDay.map((e) => ({ ...e, shiftAMeters: (e.shiftAMeters || 0) + 3 }))
    expect(() => assertSafeSheetOverwrite('2026-10-10', storedDay, edited)).not.toThrow()
  })

  it('allows an intentional Hold/End clear of one loom', () => {
    const edited = storedDay.map((e) =>
      e.loomNumber === 3 ? ({ ...e, qualityName: '—', _clearQuality: true } as DailyLoomProductionEntry) : e
    )
    expect(() => assertSafeSheetOverwrite('2026-10-10', storedDay, edited)).not.toThrow()
  })

  it('allows creating a brand-new day', () => {
    expect(() => assertSafeSheetOverwrite('2026-10-20', null, storedDay)).not.toThrow()
  })

  it('counts rows not in the payload as unchanged', () => {
    const partial = storedDay.slice(0, 5).map((e) => ({ ...e, shiftAMeters: (e.shiftAMeters || 0) + 1 }))
    const r = analyzeSheetOverwrite(storedDay, partial)
    expect(r.zeroedRows).toEqual([])
    expect(r.resultingTotal).toBeGreaterThan(r.storedTotal)
  })

  it('reads totalMeters when present', () => {
    expect(rowMeters({ totalMeters: 120, shiftAMeters: 1, shiftBMeters: 1 } as DailyLoomProductionEntry)).toBe(120)
    expect(rowMeters({ shiftAMeters: 40, shiftBMeters: 50 } as DailyLoomProductionEntry)).toBe(90)
  })
})

describe('List replace guard (yarn ledger, issuances, beams)', () => {
  const ids = Array.from({ length: 50 }, (_, i) => `m${i}`)

  it('allows adding and deleting one or two records', () => {
    expect(() => assertSafeListReplace('yarn movement', ids, [...ids, 'new1'])).not.toThrow()
    expect(() => assertSafeListReplace('yarn movement', ids, ids.slice(1))).not.toThrow()
    expect(() => assertSafeListReplace('yarn movement', ids, ids.slice(2))).not.toThrow()
  })

  it('blocks a stale/partial list wiping many records', () => {
    expect(() => assertSafeListReplace('yarn movement', ids, ids.slice(0, 20))).toThrow(FloorGuardError)
  })

  it('blocks emptying a stored list', () => {
    expect(() => assertSafeListReplace('beam', ids, [])).toThrow(/emptied/)
  })

  it('allows anything when nothing is stored yet (first seed)', () => {
    expect(() => assertSafeListReplace('beam', [], [])).not.toThrow()
  })
})

describe('Approval fields cannot be forged by normal saves', () => {
  it('strips a forged APPROVED flag on a draft row', () => {
    const stored = row(1, 50, 50)
    const forged = { ...stored, approvalStatus: 'APPROVED', approvedBy: 'Me' } as DailyLoomProductionEntry
    const safe = keepStoredApproval(forged, stored)
    expect(safe.approvalStatus).toBeUndefined()
    expect(safe.approvedBy).toBeUndefined()
  })

  it('keeps the stored approval even if the client drops it', () => {
    const stored = row(1, 50, 50, 'PAKEEZA', { approvalStatus: 'APPROVED', approvedBy: 'Javed Sir' })
    const incoming = { ...stored, approvalStatus: undefined, approvedBy: undefined }
    const safe = keepStoredApproval(incoming as DailyLoomProductionEntry, stored)
    expect(safe.approvalStatus).toBe('APPROVED')
    expect(safe.approvedBy).toBe('Javed Sir')
  })

  it('works across a whole sheet and detects approval', () => {
    const stored = [row(1, 1, 1, 'A', { approvalStatus: 'APPROVED' }), row(2, 1, 1)]
    const incoming = [row(1, 2, 2, 'A'), row(2, 2, 2, 'A', { approvalStatus: 'APPROVED' })]
    const safe = keepStoredApprovalForSheet(incoming, stored)
    expect(safe[0].approvalStatus).toBe('APPROVED')
    expect(safe[1].approvalStatus).toBeUndefined()
    expect(sheetIsApproved(stored)).toBe(true)
    expect(sheetIsApproved([row(1, 1, 1)])).toBe(false)
  })
})

describe('Confirmed Quality End', () => {
  const ended = new Map([['pakeeza', '2026-10-09']])
  const endStub = (e: DailyLoomProductionEntry) =>
    ({ ...e, shiftAMeters: 0, shiftBMeters: 0, totalMeters: 0, pick: 0, remarks: 'Quality Ended' }) as DailyLoomProductionEntry

  it('allows the zeros a confirmed End writes on later days', () => {
    const wiped = storedDay.map(endStub)
    expect(() => assertSafeSheetOverwrite('2026-10-10', storedDay, wiped, ended)).not.toThrow()
  })

  it('still blocks if the quality is not actually ended before that day', () => {
    const wiped = storedDay.map(endStub)
    expect(() => assertSafeSheetOverwrite('2026-10-10', storedDay, wiped)).toThrow(FloorGuardError)
    const endedLater = new Map([['pakeeza', '2026-10-12']])
    expect(() => assertSafeSheetOverwrite('2026-10-10', storedDay, wiped, endedLater)).toThrow(FloorGuardError)
  })

  it('still blocks zeros without the "Quality Ended" stub', () => {
    const blank = storedDay.map((e) => ({ ...e, shiftAMeters: 0, shiftBMeters: 0, totalMeters: 0 }))
    expect(() => assertSafeSheetOverwrite('2026-10-10', storedDay, blank, ended)).toThrow(FloorGuardError)
  })
})

