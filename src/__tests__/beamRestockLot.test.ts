import { describe, it, expect } from 'vitest'
import { lotForDay } from '@/lib/floor/dayBuilder'
import { normalizeBeam } from '@/services/production/loomBeamHelpers'

const beam = (p: Record<string, unknown>) => normalizeBeam({ beamNo: 'G333', warp: '', ...p } as never)

/**
 * Beam G333 ran on loom 5 with Sw # 333 (1–15 Oct), came off, was re-filled at sizing as
 * Sw # 334 and mounted on loom 5 again on 20 Oct. The days it ran with Sw # 333 must keep
 * Sw # 333 whenever they are rebuilt.
 */
describe('restocked beam — past days keep the Sw# they were made with', () => {
  const again = beam({ usedInLoom: '5', mountedOn: '2026-10-20', swLot: 'Sw # 334' })

  it('a day of the first run keeps Sw # 333', () => {
    expect(lotForDay(5, '2026-10-10', [again], 'Sw # 333')).toBe('Sw # 333')
  })

  it('a day between the runs keeps what it saved', () => {
    expect(lotForDay(5, '2026-10-17', [again], '')).toBe('')
  })

  it('days of the second run get Sw # 334', () => {
    expect(lotForDay(5, '2026-10-20', [again], '')).toBe('Sw # 334')
    expect(lotForDay(5, '2026-10-25', [again], 'Sw # 334')).toBe('Sw # 334')
  })

  // Raw beam rows (normalizeBeam would fill a default mount date).
  const raw = (p: Record<string, unknown>) => ({ beamNo: 'G333', warp: '', location: '5', ...p }) as never

  it('a beam with no mount date never rewrites a lot a past day saved', () => {
    const noDate = raw({ usedInLoom: '5', mountedOn: null, swLot: 'Sw # 334' })
    expect(lotForDay(5, '2026-10-10', [noDate], 'Sw # 333')).toBe('Sw # 333')
    expect(lotForDay(5, '2026-10-10', [noDate], 'Sw # 334')).toBe('Sw # 334')
  })

  it('a beam with no mount date still fills a day that has no lot yet', () => {
    const noDate = raw({ usedInLoom: '5', mountedOn: null, swLot: 'Sw # 334' })
    expect(lotForDay(5, '2026-10-31', [noDate], '')).toBe('Sw # 334')
  })
})
