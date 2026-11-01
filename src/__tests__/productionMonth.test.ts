import { describe, expect, it } from 'vitest'
import { productionMonthBounds, productionMonthDates, productionMonthOf } from '@/constants/productionCalendar'

describe('production month (2nd → 1st of next month)', () => {
  it('puts the 1st in the previous month', () => {
    expect(productionMonthOf('2026-11-01')).toBe('2026-10')
    expect(productionMonthOf('2026-11-02')).toBe('2026-11')
    expect(productionMonthOf('2026-10-31')).toBe('2026-10')
    expect(productionMonthOf('2027-01-01')).toBe('2026-12')
  })
  it('keeps the first production day in September', () => {
    expect(productionMonthOf('2026-09-01')).toBe('2026-09')
    expect(productionMonthBounds('2026-09')).toEqual({ from: '2026-09-01', to: '2026-10-01' })
  })
  it('runs the 2nd to the 1st of the next month', () => {
    expect(productionMonthBounds('2026-10')).toEqual({ from: '2026-10-02', to: '2026-11-01' })
    expect(productionMonthBounds('2026-12')).toEqual({ from: '2026-12-02', to: '2027-01-01' })
  })
  it('lists the days up to today', () => {
    const oct = productionMonthDates('2026-10', '2026-11-01')
    expect(oct[0]).toBe('2026-10-02')
    expect(oct[oct.length - 1]).toBe('2026-11-01')
    expect(oct.length).toBe(31)
    expect(productionMonthDates('2026-11', '2026-11-01')).toEqual([])
    expect(productionMonthDates('2026-11', '2026-11-05')).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'])
  })
})
