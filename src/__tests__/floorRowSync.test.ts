import { describe, it, expect } from 'vitest'
import { canonical, checkRowBase, diffRows, sheetRowId, rowIdOf, FLOOR_KEYS } from '@/lib/floor/rowSync'
import { deriveYarnTotals, planYarnCorrection, totalsFromKg } from '@/lib/floor/yarn'
import { sheetChangesSchema, yarnCorrectSchema, loomRowSchema } from '@/lib/floor/schemas'

describe('row-level floor saving', () => {
  it('canonical ignores key order and empty fields', () => {
    expect(canonical({ b: 1, a: { y: null, x: 2 } })).toBe(canonical({ a: { x: 2 }, b: 1, c: undefined }))
    expect(canonical({ a: 1 })).not.toBe(canonical({ a: 2 }))
  })

  it('only changed and new rows are sent, with the hash they started from', () => {
    const base = [
      { loomNumber: 1, name: 'L1' },
      { loomNumber: 2, name: 'L2' },
    ]
    const canon = new Map(base.map((r) => [String(r.loomNumber), canonical(r)]))
    const hash = new Map([
      ['1', 'h1'],
      ['2', 'h2'],
    ])
    const next = [
      { loomNumber: 1, name: 'L1' },
      { loomNumber: 2, name: 'L2 changed' },
      { loomNumber: 3, name: 'new' },
    ]
    const { upserts, deletes } = diffRows(next, (r) => rowIdOf(FLOOR_KEYS.LOOMS, r), canon, hash)
    expect(upserts.map((u) => [u.row.loomNumber, u.base])).toEqual([
      [2, 'h2'],
      [3, null],
    ])
    expect(deletes).toEqual([])
    const gone = diffRows([next[0]], (r) => rowIdOf(FLOOR_KEYS.LOOMS, r), canon, hash, (r) => r, { allowDeletes: true })
    expect(gone.deletes).toEqual([{ id: '2', base: 'h2' }])
  })

  it('a row someone else changed is a conflict; untouched rows are fine', () => {
    expect(checkRowBase('1', 'h1', 'h1', 'upsert')).toBeNull()
    expect(checkRowBase('1', 'h1', 'h9', 'upsert')).toEqual({ id: '1', reason: 'changed' })
    expect(checkRowBase('1', null, 'h9', 'upsert')).toEqual({ id: '1', reason: 'exists' })
    expect(checkRowBase('1', 'h1', null, 'upsert')).toEqual({ id: '1', reason: 'deleted' })
    expect(checkRowBase('1', null, null, 'upsert')).toBeNull()
    expect(checkRowBase('1', 'h1', null, 'delete')).toBeNull()
  })

  it('sheet row id is loom + part', () => {
    expect(sheetRowId({ loomNumber: 7 })).toBe('7:1')
    expect(sheetRowId({ loomNumber: 7, segmentIndex: 2 })).toBe('7:2')
  })
})

describe('yarn stock from movements', () => {
  const mv = [
    { yarnId: 'a', type: 'INWARD', weightKg: 100, bags: 4 },
    { yarnId: 'a', type: 'OUTWARD', weightKg: 30 },
    { yarnId: 'a', type: 'INWARD', weightKg: -5, bags: -1 }, // correction
    { yarnId: 'b', type: 'INWARD', weightKg: 10, bags: 1 },
  ]
  it('received − issued = balance', () => {
    const t = deriveYarnTotals(['a', 'b', 'c'], mv)
    expect(t.get('a')).toMatchObject({ receivedKg: 95, issuedKg: 30, balanceKg: 65, bags: 3 })
    expect(t.get('c')).toMatchObject({ receivedKg: 0, balanceKg: 0, bags: 0 })
    expect(totalsFromKg(10, 2.5, 1).balanceLbs).toBeCloseTo(7.5 * 2.2046, 1)
  })
  it('a typed total becomes a movement of the difference', () => {
    expect(planYarnCorrection({ receivedKg: 500, issuedKg: 0, bags: 10 }, { receivedKg: 45, bags: 4 })).toEqual([
      { type: 'INWARD', weightKg: -455, bags: -6 },
    ])
    expect(planYarnCorrection({ receivedKg: 50, issuedKg: 10, bags: 2 }, { issuedKg: 12.5 })).toEqual([
      { type: 'OUTWARD', weightKg: 2.5, bags: 0 },
    ])
    expect(planYarnCorrection({ receivedKg: 50, issuedKg: 10, bags: 2 }, { receivedKg: 50 })).toEqual([])
  })
})

describe('floor API input checks', () => {
  it('rejects bad payloads', () => {
    expect(sheetChangesSchema.safeParse({ date: '2026-13-01', rows: [{ entry: { loomNumber: 1 }, base: null }] }).success).toBe(false)
    expect(sheetChangesSchema.safeParse({ date: '2026-10-05', rows: [{ entry: { loomNumber: 1, shiftAMeters: -4 }, base: null }] }).success).toBe(false)
    expect(sheetChangesSchema.safeParse({ date: '2026-10-05', rows: [{ entry: { loomNumber: 1, shiftAMeters: 40, extra: 'kept' }, base: null }] }).success).toBe(true)
    expect(yarnCorrectSchema.safeParse({ yarnId: 'a', date: '2026-10-05' }).success).toBe(false)
    expect(loomRowSchema.safeParse({ loomNumber: 0, name: 'x', model: 'y' }).success).toBe(false)
  })
})
