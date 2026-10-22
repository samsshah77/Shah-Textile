import { describe, expect, it } from 'vitest'
import { buildFortnightSynopsis, buildMonthlyGrandSummary, type PayrollReportContext } from '@/services/payroll/payrollReports'

/** September 2026 totals from "(09) Salary Sep.2026.xlsx" — Synopsis 16 to 31 + Monthly Summery sheets. */
const M = '2026-09'
const ctx = {
  getAdvances: () => [{ amount: 317000 }],
  getWeaversWages: (_m: string, f: string) =>
    f === '1-15'
      ? [{ grossAmount: 353700, holidayAmount: 55650, efficiencyAmount: 48729 }]
      : [{ grossAmount: 364200, holidayAmount: 59150, efficiencyAmount: 52645 }],
  getHelpersWages: (_m: string, f: string) => [{ netAmount: f === '1-15' ? 158950 : 149350 }],
  getContractorsPayments: (_m: string, f: string) =>
    f === '1-15' ? [{ netPayment: 59055, lessAdvance: 0 }] : f === '16-31' ? [{ netPayment: 277169, lessAdvance: 55000 }] : [],
  // Staff: Javed 80,000 synopsis of which 60,000 by cheque; Liaquat 59,333.33.
  getStaffSalaries: () => [
    { synopsisAmount: 80000, chequeAmount: 60000, lessAdvance: 20000, netCashAmount: 20000, grossAmount: 100000 },
    { synopsisAmount: 59333.333333333336, chequeAmount: 0, lessAdvance: 10000, netCashAmount: 59333.333333333336, grossAmount: 69333.33 },
  ],
  // Net basic 401,825 = basic − advance 232,000 − ticket 75.
  getContractSalaries: () => [
    { basicSalary: 401825 + 232000 + 75, advanceDeduction: 232000, ticketCharges: 75, otAmount: 105492.22, efficiencyAmount: 31450 },
  ],
  getPettyCashInflow: (_m: string, f: string) => (f === '1-15' ? 76916 : 79310),
} as unknown as PayrollReportContext

describe('synopsis matches the September Excel', () => {
  it('1st half: 993,084 + petty 76,916 = 1,070,000', () => {
    const f1 = buildFortnightSynopsis(M, '1-15', ctx)
    expect(f1.totalPayrollCash).toBe(993084)
    expect(f1.totalBankCheque).toBe(1070000)
  })

  it('2nd half: paise kept, cheque rounds to 1,600,000; advances like Excel (317,000)', () => {
    const f2 = buildFortnightSynopsis(M, '16-31', ctx)
    expect(f2.totalPayrollCash).toBeCloseTo(1520689.55, 2)
    expect(f2.totalBankCheque).toBe(1600000)
    expect(f2.items.reduce((s, i) => s + (i.advance || 0), 0)).toBe(317000)
    expect(f2.items.reduce((s, i) => s + (i.chequeAmount || 0), 0)).toBe(60000)
  })

  it('Monthly Summery: staff 139,333 (with cheque), 16–31 = 1,660,000, month = 2,730,000', () => {
    const g = buildMonthlyGrandSummary(M, ctx)
    expect(Math.round(g.fortnight2Items[0].amount)).toBe(139333)
    expect(Math.round(g.fortnight2SalaryTotal)).toBe(1580690)
    expect(g.fortnight2MonthTotal).toBe(1660000)
    expect(g.fortnight1Cheque).toBe(1070000)
    expect(g.monthlyTotalSalary).toBe(2730000)
    // Head-wise table: cash + cheque columns add up to the month total.
    const cash = g.grandSynopsisItems.reduce((s, i) => s + i.amount, 0)
    const cheque = g.grandSynopsisItems.reduce((s, i) => s + (i.chequeAmount || 0), 0)
    expect(Math.round(cash + cheque)).toBe(2730000)
    expect(g.grandSynopsisItems.reduce((s, i) => s + (i.advance || 0), 0)).toBe(317000)
  })
})
