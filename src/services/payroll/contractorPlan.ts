import type { ContractorPaymentRecord, EmployeeProfile } from '@/types/payroll'
import { employeeBelongsInMonth } from '@/services/payroll/payrollCalculations'

/**
 * Contractor sheets (same as the Excel):
 *  - 1–30/31 "month end" sheet: EVERY contractor — fix-salary people and the 16–end bill.
 *  - 1–15 sheet: only contractors whose profile says they are also paid mid-month.
 * Old months may still hold "16-31" rows; they count as month-end rows.
 */
export type ContractorSheet = '1-15' | '1-31'

export function isMonthEndContractorRow(r: Pick<ContractorPaymentRecord, 'fortnight'>): boolean {
  return r.fortnight === '1-31' || r.fortnight === '16-31'
}

/** Also paid in 1–15? New field first; old profiles: FORTNIGHTLY (or unset) = yes. */
export function contractorPaidMidMonth(emp: EmployeeProfile | null | undefined): boolean {
  if (!emp) return false
  if (typeof emp.paidMidMonth === 'boolean') return emp.paidMidMonth
  return emp.payCycle !== 'MONTHLY'
}

/** Bill or fixed salary. Old profiles: paid mid-month → Bill, otherwise Fix Salary. */
export function contractorBasis(emp: EmployeeProfile | null | undefined): 'BILL' | 'SALARY' {
  if (emp?.contractorBasis === 'BILL' || emp?.contractorBasis === 'SALARY') return emp.contractorBasis
  return contractorPaidMidMonth(emp) ? 'BILL' : 'SALARY'
}

/** Which sheets this contractor belongs on in `month`. */
export function contractorSheetsFor(emp: EmployeeProfile, month: string): ContractorSheet[] {
  if (!employeeBelongsInMonth(emp, month)) return []
  const sheets: ContractorSheet[] = []
  if (contractorPaidMidMonth(emp) && employeeBelongsInMonth(emp, month, '1-15')) sheets.push('1-15')
  sheets.push('1-31')
  return sheets
}

/**
 * Starting values for a new row. Fix salary: month end = profile salary.
 * Bill: amount is entered from the bill, so it starts at 0.
 */
export function contractorDefaults(
  emp: EmployeeProfile,
  sheet: ContractorSheet
): { contractualAmount: number; remarks: string } {
  const salary = Number(emp.salary) || 0
  if (contractorBasis(emp) === 'SALARY') {
    return sheet === '1-31'
      ? { contractualAmount: salary, remarks: `Fix Salary (${salary})` }
      : { contractualAmount: 0, remarks: '' }
  }
  return { contractualAmount: 0, remarks: sheet === '1-15' ? 'Bill Payment' : 'Bill' }
}

/** True when nobody has typed anything on this row (safe to remove when the profile changes). */
export function contractorRowUntouched(
  r: ContractorPaymentRecord,
  emp: EmployeeProfile,
  sheet: ContractorSheet
): boolean {
  const d = contractorDefaults(emp, sheet)
  const remark = String(r.remarks || '').trim()
  return (
    !(Number(r.extraIncentive) || 0) &&
    !(Number(r.lessAdvance) || 0) &&
    // Starting amount: today's default, or the profile salary that older rows started with.
    [d.contractualAmount, Number(emp.salary) || 0].includes(Number(r.contractualAmount) || 0) &&
    (remark === '' || remark === d.remarks) &&
    Object.values(r.customFields || {}).every((v) => v === '' || v == null)
  )
}
