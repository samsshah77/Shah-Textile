import { describe, expect, it } from 'vitest'
import { normalizeScan } from '@/server/floor/registerScan'

describe('register photo rows', () => {
  it('keeps good lines, cleans numbers, drops lines without a loom', () => {
    const rows = normalizeScan({
      rows: [
        { loom: 2, weightKg: 64.5, shiftA: 97, shiftB: 89, total: 186, note: '', unsure: false },
        { loom: '19', weightKg: '16.90', shiftA: null, shiftB: 80, total: 80, note: 'Shift did not run', unsure: true },
        { loom: null, weightKg: 1, shiftA: 1, shiftB: 1, total: 2, note: '', unsure: false },
        { loom: 7, weightKg: 34.5, shiftA: 105, shiftB: 9999, total: 224, note: '', unsure: false },
      ],
    })
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({ loom: 2, weightKg: 64.5, shiftA: 97, shiftB: 89 })
    expect(rows[1]).toMatchObject({ loom: 19, weightKg: 16.9, shiftA: null, shiftB: 80, unsure: true, note: 'Shift did not run' })
    // 9999 m in a shift is a misread → left empty for the person to fill
    expect(rows[2].shiftB).toBeNull()
  })

  it('anything that is not the expected shape gives no rows', () => {
    expect(normalizeScan(null)).toEqual([])
    expect(normalizeScan({ rows: 'x' })).toEqual([])
  })
})
