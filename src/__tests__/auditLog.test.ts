import { describe, it, expect } from 'vitest'
import { summarizeChange, rowIdentity } from '@/server/auditLog'
import { sameJson } from '@/server/stableJson'

describe('Audit change summary', () => {
  it('records only changed fields, plus full added/removed rows', () => {
    const before = [
      { id: '1', name: 'Ali', ot: 10 },
      { id: '2', name: 'Bilal', ot: 5 },
    ]
    const after = [
      { id: '1', name: 'Ali', ot: 12, lastEditedAt: 'x' },
      { id: '3', name: 'Dawood', ot: 0 },
    ]
    const s = summarizeChange(before, after)
    expect(s.kind).toBe('rows')
    if (s.kind !== 'rows') return
    expect(s.changed).toEqual([{ id: '1', fields: { ot: [10, 12] } }])
    expect(s.added).toEqual([{ id: '3', name: 'Dawood', ot: 0 }])
    expect(s.removed).toEqual([{ id: '2', name: 'Bilal', ot: 5 }])
  })

  it('ignores key order (Postgres JSONB reorders keys)', () => {
    expect(sameJson({ a: 1, b: { x: 1, y: 2 } }, { b: { y: 2, x: 1 }, a: 1 })).toBe(true)
    expect(summarizeChange([{ month: 'x', id: 'a' }], [{ id: 'a', month: 'x' }]).kind).toBe('none')
  })

  it('identifies floor rows by natural keys', () => {
    expect(rowIdentity({ beamNo: 'B-12' })).toBe('beam:B-12')
    expect(rowIdentity({ loomNumber: 7 })).toBe('loom:7:1')
    expect(rowIdentity({ loomNumber: 7, segmentIndex: 2 })).toBe('loom:7:2')
  })

  it('falls back to a full snapshot when rows have no identity', () => {
    expect(summarizeChange([1, 2], [1, 3])).toEqual({ kind: 'snapshot', before: [1, 2], after: [1, 3] })
  })
})
