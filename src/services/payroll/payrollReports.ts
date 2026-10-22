// src/services/payroll/payrollReports.ts
import type {
  FortnightSynopsis,
  MonthlyGrandSalarySynopsis,
  AdvanceRecord,
  WeaverWageRecord,
  HelperWageRecord,
  ContractorPaymentRecord,
  StaffSalaryRecord,
  ContractSalaryRecord,
} from '@/types/payroll'

export interface PayrollReportContext {
  getAdvances(month?: string): AdvanceRecord[]
  getWeaversWages(month?: string, fortnight?: '1-15' | '16-31'): WeaverWageRecord[]
  getHelpersWages(month?: string, fortnight?: '1-15' | '16-31'): HelperWageRecord[]
  getContractorsPayments(month?: string, fortnight?: '1-15' | '16-31' | '1-31'): ContractorPaymentRecord[]
  getStaffSalaries(month?: string): StaffSalaryRecord[]
  getContractSalaries(month?: string): ContractSalaryRecord[]
  getPettyCashInflow(month: string, fortnight: '1-15' | '16-31'): number
}

/** Rupees kept to paise (2 decimals) — totals are rounded only where a cheque is written. */
const paise = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function buildFortnightSynopsis(
  month: string = '2026-08',
  fortnight: '1-15' | '16-31',
  ctx: PayrollReportContext
): FortnightSynopsis {
  if (fortnight === '1-15') {
    const advances = ctx.getAdvances(month)
    const totalAdvance = advances.reduce((s, a) => s + (a.amount || 0), 0)

    const weavers1 = ctx.getWeaversWages(month, '1-15')
    const totalWeaverWages = weavers1.reduce((s, w) => s + (w.grossAmount || 0), 0)
    const totalWeaverHol = weavers1.reduce((s, w) => s + (w.holidayAmount || 0), 0)
    const totalWeaverEff = weavers1.reduce((s, w) => s + (w.efficiencyAmount || 0), 0)

    const helpers1 = ctx.getHelpersWages(month, '1-15')
    const totalHelperWages = helpers1.reduce((s, h) => s + (h.netAmount || 0), 0)

    const contractors1 = ctx.getContractorsPayments(month, '1-15')
    const totalContractor1 = contractors1.reduce((s, c) => s + (c.netPayment || 0), 0)

    const totalPayrollCash =
      totalAdvance +
      totalWeaverWages +
      totalWeaverHol +
      totalWeaverEff +
      totalHelperWages +
      totalContractor1
    const pettyCashInflow = ctx.getPettyCashInflow(month, '1-15')
    const totalBankCheque = Math.round(totalPayrollCash + pettyCashInflow)

    return {
      fortnight: '1-15',
      month,
      title: `Salary Expense 1 to 15 (${month}) - 1st Fortnight Disbursal Voucher`,
      items: [
        { serialNo: 1, description: 'ADVANCE (Peshgi)', amount: totalAdvance },
        {
          serialNo: 2,
          description: 'WEAVERS WAGES (Basic + Extra Looms + Allowance)',
          amount: totalWeaverWages,
        },
        { serialNo: 3, description: 'WEAVERS OVERTIME / HOLIDAYS', amount: totalWeaverHol },
        { serialNo: 4, description: 'WEAVER EFFICIENCY BONUS', amount: totalWeaverEff },
        { serialNo: 5, description: `HELPERS WAGES (${helpers1.length} Helpers)`, amount: totalHelperWages },
        {
          serialNo: 6,
          description: `CONTRACTORS PAYMENT (${contractors1.length} Contractors)`,
          amount: totalContractor1,
        },
      ],
      totalPayrollCash,
      pettyCashInflow,
      totalBankCheque,
    }
  }

  // Fortnight 2 (16-31 & Month End)
  const staff = ctx.getStaffSalaries(month)
  const totalStaffSynopsis = staff.reduce((s, st) => s + (st.synopsisAmount || 0), 0)
  const totalStaffCheque = staff.reduce((s, st) => s + (st.chequeAmount || 0), 0)
  const totalStaffAdvance = staff.reduce((s, st) => s + (st.lessAdvance || 0), 0)

  const contract = ctx.getContractSalaries(month)
  const totalContractBasic = contract.reduce((s, c) => s + (c.basicSalary || 0), 0)
  const totalContractAdv = contract.reduce((s, c) => s + (c.advanceDeduction || 0), 0)
  const totalContractOT = contract.reduce((s, c) => s + (c.otAmount || 0), 0)
  const totalContractEff = contract.reduce((s, c) => s + (c.efficiencyAmount || 0), 0)
  const totalTicket = contract.reduce((s, c) => s + (c.ticketCharges || 0), 0)
  // Ticket amount contract salary se cut hoti hai (row 10 pe alag show hoti hai)
  const netContractBasic = Math.max(0, totalContractBasic - totalContractAdv - totalTicket)

  const weavers2 = ctx.getWeaversWages(month, '16-31')
  const totalWeaverWages2 = weavers2.reduce((s, w) => s + (w.grossAmount || 0), 0)
  const totalWeaverHol2 = weavers2.reduce((s, w) => s + (w.holidayAmount || 0), 0)
  const totalWeaverEff2 = weavers2.reduce((s, w) => s + (w.efficiencyAmount || 0), 0)

  const helpers2 = ctx.getHelpersWages(month, '16-31')
  const totalHelperWages2 = helpers2.reduce((s, h) => s + (h.netAmount || 0), 0)

  const contractors2 = [
    // Monthly contractors (1–30/31) are paid with the second half.
    ...ctx.getContractorsPayments(month, '16-31'),
    ...ctx.getContractorsPayments(month, '1-31'),
  ]
  const totalContractor2 = contractors2.reduce((s, c) => s + (c.netPayment || 0), 0)

  const totalContractorAdv2 = contractors2.reduce((s, c) => s + (c.lessAdvance || 0), 0)

  // Like the Excel: add the exact amounts (paise included) and round only the cheque.
  const totalPayrollCash = paise(
    totalStaffSynopsis -
      totalStaffCheque +
      netContractBasic +
      totalContractOT +
      totalContractEff +
      totalWeaverWages2 +
      totalWeaverHol2 +
      totalWeaverEff2 +
      totalHelperWages2 +
      totalContractor2 +
      totalTicket
  )
  const pettyCashInflow = ctx.getPettyCashInflow(month, '16-31')
  const totalBankCheque = Math.round(totalPayrollCash + pettyCashInflow)

  return {
    fortnight: '16-31',
    month,
    title: `Salary Expense 16 to 31 (${month}) - 2nd Fortnight & Settlement`,
    items: [
      {
        serialNo: 1,
        description: 'Staff Salaries & Overtime (Net Cash)',
        amount: paise(totalStaffSynopsis - totalStaffCheque),
        chequeAmount: totalStaffCheque,
        advance: totalStaffAdvance,
      },
      {
        serialNo: 2,
        description: 'Contract Employees Salaries (Net Basic)',
        amount: paise(netContractBasic),
        advance: totalContractAdv,
      },
      { serialNo: 3, description: 'Contract Employees Overtime', amount: paise(totalContractOT) },
      {
        serialNo: 4,
        description: 'Contract Employees Efficiency',
        amount: paise(totalContractEff),
      },
      { serialNo: 5, description: 'Weavers Wages (2nd Half)', amount: totalWeaverWages2 },
      { serialNo: 6, description: 'Weavers Overtime / Holidays (2nd Half)', amount: totalWeaverHol2 },
      { serialNo: 7, description: 'Weaver Efficiency Bonus (2nd Half)', amount: totalWeaverEff2 },
      { serialNo: 8, description: `Helpers Wages (${helpers2.length} Helpers)`, amount: totalHelperWages2 },
      {
        serialNo: 9,
        description: `Contractors Bill Payments (${contractors2.length} Contractors)`,
        amount: totalContractor2,
        advance: totalContractorAdv2,
      },
      { serialNo: 10, description: 'Ticket amount', amount: totalTicket },
    ],
    totalPayrollCash,
    pettyCashInflow,
    totalBankCheque,
  }
}

export function buildMonthlyGrandSummary(
  month: string = '2026-08',
  ctx: PayrollReportContext
): MonthlyGrandSalarySynopsis {
  const f1 = buildFortnightSynopsis(month, '1-15', ctx)
  const f2 = buildFortnightSynopsis(month, '16-31', ctx)

  const staff = ctx.getStaffSalaries(month)
  const contract = ctx.getContractSalaries(month)
  const weavers1 = ctx.getWeaversWages(month, '1-15')
  const weavers2 = ctx.getWeaversWages(month, '16-31')
  const helpers1 = ctx.getHelpersWages(month, '1-15')
  const helpers2 = ctx.getHelpersWages(month, '16-31')
  const contractors1 = ctx.getContractorsPayments(month, '1-15')
  const contractors2 = [
    // Monthly contractors (1–30/31) are paid with the second half.
    ...ctx.getContractorsPayments(month, '16-31'),
    ...ctx.getContractorsPayments(month, '1-31'),
  ]

  const totalStaffGross = staff.reduce((s, st) => s + (st.grossAmount || 0), 0)
  const totalStaffCheque = staff.reduce((s, st) => s + (st.chequeAmount || 0), 0)
  const totalStaffAdv = staff.reduce((s, st) => s + (st.lessAdvance || 0), 0)
  const totalStaffCash = staff.reduce((s, st) => s + (st.netCashAmount || 0), 0)

  const totalContractBasic = contract.reduce((s, c) => s + (c.basicSalary || 0), 0)
  const totalContractAdv = contract.reduce((s, c) => s + (c.advanceDeduction || 0), 0)
  const totalContractOT = contract.reduce((s, c) => s + (c.otAmount || 0), 0)
  const totalContractEff = contract.reduce((s, c) => s + (c.efficiencyAmount || 0), 0)

  const totalWeaverWages =
    weavers1.reduce((s, w) => s + (w.grossAmount || 0), 0) +
    weavers2.reduce((s, w) => s + (w.grossAmount || 0), 0)
  const totalWeaverHol =
    weavers1.reduce((s, w) => s + (w.holidayAmount || 0), 0) +
    weavers2.reduce((s, w) => s + (w.holidayAmount || 0), 0)
  const totalWeaverEff =
    weavers1.reduce((s, w) => s + (w.efficiencyAmount || 0), 0) +
    weavers2.reduce((s, w) => s + (w.efficiencyAmount || 0), 0)

  const totalHelperWages =
    helpers1.reduce((s, h) => s + (h.netAmount || 0), 0) +
    helpers2.reduce((s, h) => s + (h.netAmount || 0), 0)
  const totalContractorPayments =
    contractors1.reduce((s, c) => s + (c.netPayment || 0), 0) +
    contractors2.reduce((s, c) => s + (c.netPayment || 0), 0)
  const totalTicket = contract.reduce((s, c) => s + (c.ticketCharges || 0), 0)
  const totalContractorAdv =
    contractors1.reduce((s, c) => s + (c.lessAdvance || 0), 0) +
    contractors2.reduce((s, c) => s + (c.lessAdvance || 0), 0)
  const totalAdvance1 = f1.items[0]?.amount || 0

  // Excel "Monthly Summery": 16–31 staff line is the full synopsis amount (cash + bank cheque),
  // so the month total = 1st half + 2nd half + staff cheque.
  const fortnight2Items = f2.items.map((item) =>
    item.serialNo === 1
      ? { ...item, description: 'Staff Salaries & Overtime', amount: paise(item.amount + (item.chequeAmount || 0)) }
      : item
  )
  const fortnight2SalaryTotal = paise(f2.totalPayrollCash + totalStaffCheque)
  const fortnight2MonthTotal = Math.round(fortnight2SalaryTotal + f2.pettyCashInflow)
  const monthlyExact = f1.totalPayrollCash + f1.pettyCashInflow + fortnight2SalaryTotal + f2.pettyCashInflow

  return {
    month,
    monthTitle: `Grand Monthly Salary & Wages Synopsis (${month})`,
    fortnight1Total: f1.totalPayrollCash,
    fortnight1PettyCash: f1.pettyCashInflow,
    fortnight1Cheque: f1.totalBankCheque,
    fortnight2Total: f2.totalPayrollCash,
    fortnight2PettyCash: f2.pettyCashInflow,
    fortnight2Cheque: f2.totalBankCheque,
    staffChequeAmount: totalStaffCheque,
    fortnight1Items: f1.items,
    fortnight2Items,
    fortnight2SalaryTotal,
    fortnight2MonthTotal,
    monthlyTotalSalary: Math.round(monthlyExact),
    grandSynopsisItems: [
      {
        serialNo: 1,
        description: 'Advance / Peshgi (1st half, salaries se wapas katti)',
        amount: totalAdvance1,
        chequeAmount: 0,
        advance: 0,
        totalGrossHead: 0,
      },
      {
        serialNo: 2,
        description: 'Staff Salaries & Overtime',
        amount: paise(totalStaffCash),
        chequeAmount: totalStaffCheque,
        advance: totalStaffAdv,
        totalGrossHead: totalStaffGross,
      },
      {
        serialNo: 3,
        description: 'Contract Employees Salaries',
        amount: paise(Math.max(0, totalContractBasic - totalContractAdv - totalTicket)),
        chequeAmount: 0,
        advance: totalContractAdv,
        totalGrossHead: totalContractBasic,
      },
      {
        serialNo: 4,
        description: 'Contract Employee Overtime',
        amount: paise(totalContractOT),
        chequeAmount: 0,
        advance: 0,
        totalGrossHead: totalContractOT,
      },
      {
        serialNo: 5,
        description: 'Contract Employee Efficiency',
        amount: paise(totalContractEff),
        chequeAmount: 0,
        advance: 0,
        totalGrossHead: totalContractEff,
      },
      {
        serialNo: 6,
        description: 'Weavers Wages (Total Fortnight 1 + 2)',
        amount: paise(totalWeaverWages),
        chequeAmount: 0,
        advance: 0,
        totalGrossHead: totalWeaverWages,
      },
      {
        serialNo: 7,
        description: 'Weavers Holy Days / OT Amount',
        amount: paise(totalWeaverHol),
        chequeAmount: 0,
        advance: 0,
        totalGrossHead: totalWeaverHol,
      },
      {
        serialNo: 8,
        description: 'Weaver Efficiency Bonus',
        amount: paise(totalWeaverEff),
        chequeAmount: 0,
        advance: 0,
        totalGrossHead: totalWeaverEff,
      },
      {
        serialNo: 9,
        description: 'Helpers Wages (Total Fortnight 1 + 2)',
        amount: paise(totalHelperWages),
        chequeAmount: 0,
        advance: 0,
        totalGrossHead: totalHelperWages,
      },
      {
        serialNo: 10,
        description: 'Contractors Bill Payments',
        amount: paise(totalContractorPayments),
        chequeAmount: 0,
        advance: totalContractorAdv,
        totalGrossHead: totalContractorPayments,
      },
      {
        serialNo: 11,
        description: 'Ticket Charges',
        amount: totalTicket,
        chequeAmount: 0,
        advance: 0,
        totalGrossHead: totalTicket,
      },
      {
        serialNo: 12,
        description: 'Petty Cash (1st half + 2nd half cheque ke saath)',
        amount: f1.pettyCashInflow + f2.pettyCashInflow,
        chequeAmount: 0,
        advance: 0,
        totalGrossHead: f1.pettyCashInflow + f2.pettyCashInflow,
      },
    ],
  }
}
