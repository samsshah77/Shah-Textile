import { describe, it, expect } from 'vitest'
import {
  calculateStaffSalaryRow,
  calculateWeaverWageRow,
  calculateHelperWageRow,
  calculateContractorPaymentRow,
  calculateEfficiencyRow,
  employeeBelongsInMonth,
} from '@/services/payroll/payrollCalculations'
import {
  META_SHEET,
  diffSheet,
  ensureRowIds,
  sheetStateFrom,
  rowMonth,
} from '@/lib/payroll/sync'
import { lockedMonths, storeToRows, validateChangeSet } from '@/server/payroll/rows'
import {
  contractorBasis,
  contractorDefaults,
  contractorPaidMidMonth,
  contractorRowUntouched,
  contractorSheetsFor,
  isMonthEndContractorRow,
} from '@/services/payroll/contractorPlan'
import type { EmployeeProfile } from '@/types/payroll'

describe('Staff salary (Excel rules)', () => {
  it('full 30-day attendance pays the full salary', () => {
    const r = calculateStaffSalaryRow({ salary: 80000, attendanceDays: 30, month: '2026-10' }, 30, '2026-10')
    expect(r.basicSalary).toBe(80000)
    expect(r.grossAmount).toBe(80000)
  })

  it('partial attendance pays salary ÷ 30 per day', () => {
    const r = calculateStaffSalaryRow({ salary: 30000, attendanceDays: 20, month: '2026-10' }, 30, '2026-10')
    expect(r.ratePerDay).toBe(1000)
    expect(r.basicSalary).toBe(20000)
  })

  it('OT = hours × salary ÷ (30 × duty hours)  (Excel: 176 h × 40,000 ÷ 240 = 29,333)', () => {
    const r = calculateStaffSalaryRow({ salary: 40000, attendanceDays: 30, otHours: 176, month: '2026-10' }, 30, '2026-10')
    expect(r.otAmount).toBe(29333)
  })

  it('advance and cheque come off the cash amount, never below zero', () => {
    const r = calculateStaffSalaryRow(
      { salary: 30000, attendanceDays: 30, lessAdvance: 5000, chequeAmount: 40000, month: '2026-10' },
      30,
      '2026-10'
    )
    expect(r.synopsisAmount).toBe(25000)
    expect(r.netCashAmount).toBe(0)
  })
})

describe('Weaver wages', () => {
  it('days × wage + extra looms + attendance allowance (13+ days) + holiday + efficiency', () => {
    const r = calculateWeaverWageRow({
      wagePerDay: 1450, attendanceDays: 13, extraLooms: 4, rateLoom: 150,
      holidayAttendance: 1, holidayRate: 1750, efficiencyAmount: 500,
    })
    expect(r.basicSalary).toBe(18850)
    expect(r.extraLoomAmount).toBe(600)
    expect(r.attendanceAllowance).toBe(800)
    expect(r.grossAmount).toBe(20250)
    expect(r.netPay).toBe(20250 + 1750 + 500)
  })

  it('no attendance allowance below 13 days', () => {
    expect(calculateWeaverWageRow({ wagePerDay: 1450, attendanceDays: 12 }).attendanceAllowance).toBe(0)
  })
})

describe('Helper wages', () => {
  it('days × wage + holiday shifts × OT rate (Helper 1200, Winder 1400)', () => {
    expect(calculateHelperWageRow({ wagePerDay: 1050, attendanceDays: 15, holidayAttendance: 2 }).netAmount).toBe(15750 + 2400)
    expect(
      calculateHelperWageRow({ designation: 'Winder', wagePerDay: 1100, attendanceDays: 10, holidayAttendance: 1 }).netAmount
    ).toBe(11000 + 1400)
  })
})

describe('Contractor payments', () => {
  it('contract + incentive − advance', () => {
    const r = calculateContractorPaymentRow({ contractualAmount: 40000, extraIncentive: 500, lessAdvance: 5000 })
    expect(r.totalAmount).toBe(40500)
    expect(r.netPayment).toBe(35500)
  })
})

describe('Efficiency incentive', () => {
  it('pays (efficiency − 60)% of salary only from 70% efficiency', () => {
    expect(calculateEfficiencyRow({ efficiencyPercent: 75, salaryEarned: 20000 }).amount).toBe(3000)
    expect(calculateEfficiencyRow({ efficiencyPercent: 69, salaryEarned: 20000 }).amount).toBe(0)
  })
})

describe('Who belongs on which fortnight', () => {
  const emp = (extra: Partial<EmployeeProfile>) => ({ id: 'e', name: 'X', status: 'Active', ...extra }) as EmployeeProfile
  it('resigned on/before the 15th → not on 16–31 of that month', () => {
    const e = emp({ status: 'Resigned', resignedAt: '2026-10-12' })
    expect(employeeBelongsInMonth(e, '2026-10', '1-15')).toBe(true)
    expect(employeeBelongsInMonth(e, '2026-10', '16-31')).toBe(false)
    expect(employeeBelongsInMonth(e, '2026-11', '1-15')).toBe(false)
  })
  it('resigned after the 15th → on both halves of that month', () => {
    const e = emp({ status: 'Resigned', resignedAt: '2026-10-20' })
    expect(employeeBelongsInMonth(e, '2026-10', '16-31')).toBe(true)
  })
})

describe('Salary saves send only what changed', () => {
  const W = 'sara_payroll_weavers_v6'
  const rows = [
    { id: 'a', month: '2026-10', netPay: 100 },
    { id: 'b', month: '2026-10', netPay: 200 },
    { id: 'c', month: '2026-09', netPay: 300 },
  ]
  const state = () => sheetStateFrom(W, rows, { a: 3, b: 1, c: 7 })

  it('nothing changed → nothing sent', () => {
    expect(diffSheet(W, state(), structuredClone(rows))).toEqual({ ops: [] })
  })

  it('key order inside a row does not count as a change (database reorders keys)', () => {
    const shuffled = rows.map((r) => ({ netPay: r.netPay, month: r.month, id: r.id }))
    expect(diffSheet(W, state(), shuffled).ops).toEqual([])
  })

  it('one edited row → one put carrying the version it was based on', () => {
    const next = structuredClone(rows)
    next[0].netPay = 150
    expect(diffSheet(W, state(), next).ops).toEqual([{ op: 'put', sheet: W, id: 'a', base: 3, row: next[0] }])
  })

  it('removed row → delete with its version; new row → insert (base 0) at the end, no reorder', () => {
    const next = [rows[0], rows[2], { id: 'd', month: '2026-10', netPay: 50 }]
    const cs = diffSheet(W, state(), next)
    expect(cs.ops).toEqual([
      { op: 'put', sheet: W, id: 'd', base: 0, row: next[2] },
      { op: 'del', sheet: W, id: 'b', base: 1 },
    ])
    expect(cs.order).toBeUndefined()
  })

  it('moving a row up sends the new order', () => {
    const next = [rows[1], rows[0], rows[2]]
    const cs = diffSheet(W, state(), next)
    expect(cs.ops).toEqual([])
    expect(cs.order).toEqual({ [W]: ['b', 'a', 'c'] })
  })

  it('settings: a field left out is NOT deleted (month locks survive partial writes)', () => {
    const meta = { activeSalariedMonth: '2026-10', monthLocks: { '2026-09': { locked: true } }, deletedEmployeeIds: ['x'] }
    const st = sheetStateFrom(META_SHEET, meta, { activeSalariedMonth: 2, monthLocks: 5, deletedEmployeeIds: 1 })
    const cs = diffSheet(META_SHEET, st, { activeSalariedMonth: '2026-11', categories: [] })
    expect(cs.ops).toEqual([
      { op: 'put', sheet: META_SHEET, id: 'activeSalariedMonth', base: 2, row: '2026-11' },
      { op: 'put', sheet: META_SHEET, id: 'categories', base: 0, row: [] },
    ])
  })

  it('rows without an id (or with a repeated id) get their own id', () => {
    const list: Array<Record<string, unknown>> = [{ id: 'x' }, { id: 'x' }, { name: 'no id' }]
    const { rows: fixed, fixed: n } = ensureRowIds(list)
    expect(n).toBe(2)
    expect(new Set(fixed.map((r) => r.id)).size).toBe(3)
    expect(list[0].id).toBe('x')
  })

  it('month of a row is read only from a real YYYY-MM value', () => {
    expect(rowMonth({ month: '2026-10' })).toBe('2026-10')
    expect(rowMonth({ month: 'October' })).toBeNull()
    expect(rowMonth({})).toBeNull()
  })
})

describe('Salary storage (server)', () => {
  it('reads locked months from the monthLocks setting', () => {
    expect([...lockedMonths({ '2026-09': { locked: true }, '2026-10': { locked: false } })]).toEqual(['2026-09'])
    expect([...lockedMonths(undefined)]).toEqual([])
  })

  it('copies an old store into rows, keeping row order and every settings field', () => {
    const { rows, counts } = storeToRows({
      sara_payroll_weavers_v6: [{ id: 'w2', month: '2026-10' }, { id: 'w1', month: '2026-10' }],
      sara_payroll_hr_meta_v1: { monthLocks: { '2026-09': { locked: true } }, activeSalariedMonth: '2026-10' },
    })
    const weavers = rows.filter((r) => r.sheet === 'sara_payroll_weavers_v6')
    expect(weavers.map((r) => [r.id, r.position, r.month])).toEqual([['w2', 0, '2026-10'], ['w1', 1, '2026-10']])
    expect(counts.sara_payroll_hr_meta_v1).toBe(2)
    expect(counts.sara_payroll_staff_v6).toBe(0)
  })

  it('refuses malformed change sets', () => {
    expect(() => validateChangeSet({ ops: [{ op: 'put', sheet: 'nope', id: 'a', base: 0, row: { id: 'a' } }] })).toThrow()
    expect(() => validateChangeSet({ ops: [{ op: 'put', sheet: 'sara_payroll_staff_v6', id: 'a', base: 0, row: { id: 'b' } }] })).toThrow()
    expect(() =>
      validateChangeSet({
        ops: [
          { op: 'del', sheet: 'sara_payroll_staff_v6', id: 'a', base: 1 },
          { op: 'del', sheet: 'sara_payroll_staff_v6', id: 'a', base: 1 },
        ],
      })
    ).toThrow()
    expect(validateChangeSet({ ops: [{ op: 'del', sheet: 'sara_payroll_staff_v6', id: 'a', base: 1 }] }).ops).toHaveLength(1)
  })
})

describe('Contractor sheets (1–15 + 1–30/31 month end)', () => {
  const c = (extra: Partial<EmployeeProfile>) =>
    ({ id: 'c1', name: 'Rehbar', status: 'Active', salary: 70000, ...extra }) as EmployeeProfile

  it('everyone is on the month-end sheet; only ticked people on 1–15 too', () => {
    expect(contractorSheetsFor(c({ paidMidMonth: true }), '2026-10')).toEqual(['1-15', '1-31'])
    expect(contractorSheetsFor(c({ paidMidMonth: false }), '2026-10')).toEqual(['1-31'])
  })

  it('old profiles: FORTNIGHTLY (or unset) = also 1–15, MONTHLY = month end only', () => {
    expect(contractorPaidMidMonth(c({}))).toBe(true)
    expect(contractorPaidMidMonth(c({ payCycle: 'MONTHLY' }))).toBe(false)
    expect(contractorBasis(c({ payCycle: 'MONTHLY' }))).toBe('SALARY')
  })

  it('joined after the 15th → month end only', () => {
    expect(contractorSheetsFor(c({ paidMidMonth: true, doj: '20-Oct-2026' }), '2026-10')).toEqual(['1-31'])
  })

  it('fix salary starts at the profile salary; bill starts at 0', () => {
    expect(contractorDefaults(c({ contractorBasis: 'SALARY' }), '1-31')).toEqual({
      contractualAmount: 70000,
      remarks: 'Fix Salary (70000)',
    })
    expect(contractorDefaults(c({ contractorBasis: 'BILL' }), '1-31').contractualAmount).toBe(0)
  })

  it('a row with a typed bill amount is never treated as empty', () => {
    const emp = c({ contractorBasis: 'BILL', paidMidMonth: false })
    const row = { id: 'r', serialNo: 1, name: 'Rehbar', contractType: '', contractualAmount: 35555,
      extraIncentive: 0, totalAmount: 35555, lessAdvance: 0, netPayment: 35555, remarks: 'Bill Payment',
      fortnight: '1-15' as const, month: '2026-10' }
    expect(contractorRowUntouched(row, emp, '1-15')).toBe(false)
    expect(contractorRowUntouched({ ...row, contractualAmount: 0 }, emp, '1-15')).toBe(true)
    expect(contractorRowUntouched({ ...row, contractualAmount: 70000 }, emp, '1-15')).toBe(true)
  })

  it('old 16-31 rows count as month end', () => {
    expect(isMonthEndContractorRow({ fortnight: '16-31' })).toBe(true)
    expect(isMonthEndContractorRow({ fortnight: '1-15' })).toBe(false)
  })
})

describe('Contractor row checks ignore the automatic advance', () => {
  it('an advance filled in from the Advance sheet does not make a row "typed"', () => {
    const emp = { id: 'c1', name: 'Amir', status: 'Active', salary: 70000, contractorBasis: 'SALARY', paidMidMonth: false } as EmployeeProfile
    const row = { id: 'r', serialNo: 1, name: 'Amir', contractType: '', contractualAmount: 0, extraIncentive: 0,
      totalAmount: 0, lessAdvance: 30000, netPayment: -30000, remarks: '', fortnight: '1-15' as const, month: '2026-10' }
    expect(contractorRowUntouched(row, emp, '1-15')).toBe(true)
  })
})
