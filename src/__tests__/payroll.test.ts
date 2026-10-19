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
  assertFreshVersion,
  changedLockedMonths,
  keepLockedMonths,
  lockedMonthsFromMeta,
  PayrollGuardError,
} from '@/server/payrollGuards'
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

describe('Salary save guards', () => {
  const meta = { monthLocks: { '2026-09': { locked: true }, '2026-10': { locked: false } } }

  it('reads locked months from HR meta', () => {
    expect([...lockedMonthsFromMeta(meta)]).toEqual(['2026-09'])
  })

  it('keeps locked-month rows as stored and saves the rest', () => {
    const before = [
      { id: 'a', month: '2026-09', netPay: 100 },
      { id: 'b', month: '2026-10', netPay: 200 },
    ]
    const after = [
      { id: 'a', month: '2026-09', netPay: 999 }, // change inside a locked month
      { id: 'b', month: '2026-10', netPay: 250 }, // normal change
    ]
    const { value, keptMonths } = keepLockedMonths(before, after, meta, false)
    expect(keptMonths).toEqual(['2026-09'])
    expect(value).toEqual([
      { id: 'a', month: '2026-09', netPay: 100 },
      { id: 'b', month: '2026-10', netPay: 250 },
    ])
  })

  it('a locked month cannot be emptied by a save either', () => {
    const before = [{ id: 'a', month: '2026-09', netPay: 100 }]
    expect(changedLockedMonths(before, [], lockedMonthsFromMeta(meta))).toEqual(['2026-09'])
    expect(keepLockedMonths(before, [], meta, false).value).toEqual(before)
  })

  it('HR meta itself (lock / unlock) is never filtered', () => {
    expect(keepLockedMonths({}, { monthLocks: {} }, meta, true).keptMonths).toEqual([])
  })

  it('refuses a save built on an older copy', () => {
    expect(() => assertFreshVersion('2026-10-19T10:00:00.000Z', '2026-10-19T10:05:00.000Z')).toThrow(PayrollGuardError)
    expect(() => assertFreshVersion('2026-10-19T10:05:00.000Z', '2026-10-19T10:05:00.000Z')).not.toThrow()
    expect(() => assertFreshVersion(undefined, '2026-10-19T10:05:00.000Z')).not.toThrow()
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
