import { describe, it, expect } from 'vitest'
import { calculateContractSalaryRow, calculateEfficiencyRow } from '@/services/payroll/payrollCalculations'

/**
 * September 2026 "Company Contract" sheets from the Excel file: OT and Net Payment totals
 * must match (the Excel keeps paise inside and shows whole rupees).
 */
const SEP = [
  // name, designation, salary, attn, dutyHrs, otHrs, avail% (efficiency), advance
  ['Tufail ur Rehman', 'Accountant', 50000, 30, 9, 60, 0, 25000],
  ['Kamran', 'Quality Controller', 50000, 30, 12, 72, 0, 20000],
  ['Ahmer', 'Quality Controller', 40000, 26, 9, 61.5, 0, 20000],
  ['Abdul Waheed', 'Sr.Technician', 62000, 29, 10, 48.5, 0, 5000],
  ['Ameen Ullah Khan', 'Electrician', 55000, 28, 10, 12, 14, 30000],
  ['Ubaid', 'Electrician', 35000, 30, 12, 0, 0, 0],
  ['Zulfiqar', 'Asst Technician', 45000, 29, 12, 72, 18, 15000],
  ['Maqsood', 'Asst Technician', 38000, 29, 12, 72, 0, 20000],
  ['Israr', 'Oil Man', 35000, 30, 12, 60, 0, 10000],
  ['Salman', 'Jeckquard', 50000, 28, 10, 54, 14, 20000],
  ['Hasnain', 'Jeckquard', 42000, 29, 10, 72, 0, 10000],
  ['Muhammad Arif', 'Technician', 55000, 30, 12, 72, 18, 30000],
  ['Mushtaq Ahmed', 'Folding', 40000, 30, 12, 66, 0, 15000],
  ['Dawood', 'Sweeper', 32000, 22, 8, 12, 0, 5000],
  ['Ali Zar', 'Sweeper', 32000, 30, 8, 12, 0, 7000],
] as const

describe('Company Contract matches the September Excel', () => {
  const rows = SEP.map(([name, designation, salary, attn, dutyHrs, otHours, avail, adv], i) => {
    const base = calculateContractSalaryRow(
      { id: `c${i}`, employeeName: name, designation, salary, attendanceDays: attn, otHours, advanceDeduction: adv, ticketCharges: 5, month: '2026-09' },
      30,
      '2026-09',
      { id: `e${i}`, name, designation, salary, dutyHrs } as never
    )
    const eff = avail
      ? calculateEfficiencyRow({ efficiencyPercent: 60 + avail, salaryEarned: base.basicSalary }).amount
      : 0
    return calculateContractSalaryRow(
      { ...base, efficiencyAmount: eff },
      30,
      '2026-09',
      { id: `e${i}`, name, designation, salary, dutyHrs } as never
    )
  })
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((t, r) => t + f(r), 0)
  it('OT total 105,492 and each person as the sheet shows', () => {
    expect(Math.round(sum((r) => r.otAmount))).toBe(105492)
    expect(rows.map((r) => Math.round(r.otAmount))).toEqual([11111, 10000, 9111, 10023, 2200, 0, 9000, 7600, 5833, 9000, 10080, 11000, 7333, 1600, 1600])
  })
  it('Net Payment total 538,767 and each person as the sheet shows', () => {
    expect(Math.round(sum((r) => r.netAmount))).toBe(538767)
    expect(rows.map((r) => Math.round(r.netAmount))).toEqual([36106, 39995, 23773, 64952, 30715, 34995, 45325, 24328, 30828, 42195, 40675, 45895, 32328, 20062, 26595])
    expect(Math.round(sum((r) => r.basicSalary))).toBe(633900)
    expect(Math.round(sum((r) => r.efficiencyAmount))).toBe(31450)
  })
})
