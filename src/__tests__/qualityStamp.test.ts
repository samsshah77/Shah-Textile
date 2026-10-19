import { describe, it, expect } from 'vitest'
import { resolveQualityIdForRow, stampQualityIds, type QualityRef } from '@/server/qualityStamp'
import type { DailyLoomProductionEntry } from '@/types/production'

const Q: QualityRef[] = [
  { id: 'parco', name: 'Parco', pick: 60, createdOn: '2026-10-02', endedOn: null },
  { id: 'parcopu', name: 'Parco Pu', pick: 60, createdOn: '2026-10-02', endedOn: null },
  { id: 'gul-old', name: 'Gul Ahmed (1x1)', pick: 92, createdOn: '2026-10-02', endedOn: '2026-10-10' },
  { id: 'gul-new', name: 'Gul Ahmed (1x1)', pick: 92, createdOn: '2026-10-11', endedOn: null },
]

describe('qualityId on sheet rows', () => {
  it('matches the exact name, never a look-alike', () => {
    expect(resolveQualityIdForRow({ qualityName: 'Parco', pick: 60 }, '2026-10-05', Q)).toBe('parco')
    expect(resolveQualityIdForRow({ qualityName: 'PARCO PU', pick: 60 }, '2026-10-05', Q)).toBe('parcopu')
  })

  it('ignores spacing/brackets like the app does', () => {
    expect(resolveQualityIdForRow({ qualityName: 'Gul Ahmed(1x1)', pick: 92 }, '2026-10-05', Q)).toBe('gul-old')
  })

  it('picks the run whose dates cover the day when a name is reused', () => {
    expect(resolveQualityIdForRow({ qualityName: 'Gul Ahmed (1x1)', pick: 92 }, '2026-10-08', Q)).toBe('gul-old')
    expect(resolveQualityIdForRow({ qualityName: 'Gul Ahmed (1x1)', pick: 92 }, '2026-10-14', Q)).toBe('gul-new')
  })

  it('keeps the same run after a mid-run pick change', () => {
    expect(resolveQualityIdForRow({ qualityName: 'Parco', pick: 64 }, '2026-10-15', Q)).toBe('parco')
  })

  it('keeps a stored id while the name still matches, replaces it when the quality changed', () => {
    expect(resolveQualityIdForRow({ qualityName: 'Gul Ahmed (1x1)', pick: 92, qualityId: 'gul-old' }, '2026-10-14', Q)).toBe('gul-old')
    expect(resolveQualityIdForRow({ qualityName: 'Parco Pu', pick: 60, qualityId: 'parco' }, '2026-10-14', Q)).toBe('parcopu')
  })

  it('gives no id to empty / ended rows and removes stale ones', () => {
    expect(resolveQualityIdForRow({ qualityName: '—' }, '2026-10-14', Q)).toBeNull()
    const [row] = stampQualityIds('2026-10-14', [{ qualityName: '—', qualityId: 'parco' } as DailyLoomProductionEntry], Q)
    expect(row.qualityId).toBeUndefined()
  })
})
