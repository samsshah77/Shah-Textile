import { describe, it, expect } from 'vitest'
import { planImport, sheetKeyToMonth, billFingerprints } from '@/server/accounts/migrate'
import {
  buildCostStatement,
  partyLedger,
  partySummaries,
  pettyStatement,
  resolveCostInputs,
  EXCEL_AUG_2026_INPUTS,
  payablesReport,
} from '@/server/accounts/reports'
import { defaultCostBucket, pettySides } from '@/server/accounts/repo'
import { lineAmount, monthLabel, shiftMonth, slugifyPartyName } from '@/lib/accounts/util'
import type { Bill, Party } from '@/lib/accounts/types'

const party = (id: string, name: string, extra: Partial<Party> = {}): Party => ({
  id, name, slug: slugifyPartyName(name), kind: 'TRADER', category: '', costBucket: 'MACHINERY', remarks: '', active: true, account: 'SARA', version: 1, ...extra,
})
const bill = (id: string, partyId: string, month: string, date: string, lines: [string, number, number][], billNo = id): Bill => {
  const ls = lines.map(([description, quantity, rate], i) => ({ id: `${id}-${i}`, lineNo: i + 1, description, machine: '', quantity, rate, amount: lineAmount(quantity, rate) }))
  return { id, partyId, month, date, billNo, inwardNo: '', remarks: '', sortOrder: 1, version: 1, lines: ls, total: ls.reduce((s, l) => s + l.amount, 0) }
}

describe('helpers', () => {
  it('months', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(monthLabel('2026-10')).toBe('October 2026')
    expect(lineAmount(3, 33.335)).toBe(100)
  })
  it('old sheet names → YYYY-MM (typo and year suffix too)', () => {
    expect(sheetKeyToMonth('September')).toBe('2026-09')
    expect(sheetKeyToMonth('Febraury')).toBe('2026-02')
    expect(sheetKeyToMonth('March 2027')).toBe('2027-03')
    expect(sheetKeyToMonth('Sept')).toBeNull()
  })
  it('cost block defaults follow the Excel Cost Statement', () => {
    expect(defaultCostBucket('SMD Traders', 'TRADER')).toBe('ELECTRIC')
    expect(defaultCostBucket('JAB Electronics', 'WORKSHOP')).toBe('ELECTRIC')
    expect(defaultCostBucket('Marhaba Engineering Works', 'WORKSHOP')).toBe('REPAIR')
    expect(defaultCostBucket('Fahad Traders', 'TRADER')).toBe('MACHINERY')
  })
  it('petty cash sides', () => {
    expect(pettySides('CASH_IN', 5)).toEqual({ debit: 5, credit: 0 })
    expect(pettySides('SALARY', 5)).toEqual({ debit: 0, credit: 5 })
  })
})

describe('copying the old data', () => {
  const plan = planImport({})
  it('seed sheets become bills with the same monthly totals as the Excel sheets', () => {
    const byMonth: Record<string, number> = {}
    for (const b of plan.bills.filter((b) => b.source.startsWith('inventory:')))
      for (const l of b.lines) byMonth[b.month] = (byMonth[b.month] || 0) + lineAmount(l.quantity, l.rate)
    expect(byMonth['2026-01']).toBe(467681)
    expect(byMonth['2026-08']).toBe(674551)
  })
  it('a continuation row without date / bill no. joins the bill above', () => {
    const p = planImport({
      sara_textile_inventory_control_v2: {
        September: {
          items: [
            { date: '2026-09-02', billNo: '7', inwardNo: '1', itemDescription: 'A', companyName: 'X Traders', quantity: 1, costPerItem: 10 },
            { date: '', billNo: '7', inwardNo: '1', itemDescription: 'B', companyName: 'X Traders', quantity: 2, costPerItem: 10 },
            { date: '2026-09-03', billNo: '', itemDescription: 'C', companyName: 'X Traders', quantity: 1, costPerItem: 5 },
          ],
        },
      },
    })
    const sep = p.bills.filter((b) => b.month === '2026-09')
    expect(sep.map((b) => b.lines.length)).toEqual([2, 1])
    expect(sep[0].date).toBe('2026-09-02')
  })
  it('the Trader / Workshop switch saved on a row beats the name guess', () => {
    const p = planImport({
      sara_textile_inventory_control_v2: {
        September: {
          items: [
            { date: '2026-09-02', billNo: '1', companyName: 'Ali Engineering', partyType: 'Trader', quantity: 1, costPerItem: 10 },
            { date: '2026-09-02', billNo: '2', companyName: 'Bilal Store', partyType: 'Workshop', quantity: 1, costPerItem: 10 },
            { date: '2026-09-02', billNo: '3', companyName: 'Asif Workshop', quantity: 1, costPerItem: 10 },
          ],
        },
      },
    })
    expect(p.bills.filter((b) => b.month === '2026-09').map((b) => b.partyKind)).toEqual(['TRADER', 'WORKSHOP', 'WORKSHOP'])
  })
  it('two different items with the same amount on one bill are both kept', () => {
    const a = billFingerprints('fahad', '7001', [{ description: 'Gripper Left', quantity: 2, rate: 10500 }])
    const b = billFingerprints('fahad', '7001', [{ description: 'Gripper Right', quantity: 2, rate: 10500 }])
    expect(a[0]).not.toBe(b[0])
  })
  it('petty "Balance b/f" becomes the opening, salary pass-through is not an expense', () => {
    const p = planImport({
      sara_textile_petty_cash_v4: [
        { date: '2026-08-01', description: 'Balance b/f', debitAmount: 0, creditAmount: 0, balance: 4714 },
        { date: '2026-08-05', description: 'Paid Salaries and Contracter', debitAmount: 0, creditAmount: 100, balance: 4614 },
      ],
    })
    expect(p.petty.map((e) => [e.kind, e.amount])).toEqual([['OPENING', 4714], ['SALARY', 100]])
  })
  it("Aug 2026's 104,183 m copied into other months by the old page is dropped", () => {
    const p = planImport({ 'sara_textile_cost_statement_overrides_v1__2026-09': { powerAndLight: 5, monthlyProductionMeters: 104183 } })
    const sep = p.costInputs.find((c) => c.month === '2026-09')!
    expect(sep.inputs.powerAndLight).toBe(5)
    expect(sep.inputs.monthlyProductionMeters).toBeUndefined()
    expect(p.costInputs.find((c) => c.month === '2026-08')!.inputs).toEqual(EXCEL_AUG_2026_INPUTS)
  })
})

describe('party reports', () => {
  const p1 = party('p1', 'Fahad Traders')
  const bills = [bill('b1', 'p1', '2026-09', '2026-09-02', [['Left', 2, 10500], ['Right', 2, 10500]]), bill('b2', 'p1', '2026-09', '2026-09-09', [['Frame', 24, 100]])]
  const pay = [{ id: 'y', partyId: 'p1', month: '2026-09', date: '2026-09-05', amount: 20000, kind: 'PAYMENT' as const, mode: 'CASH' as const, paidFrom: 'SARA' as const, reference: '', remarks: '', version: 1 }]
  it('summary: purchases, bills, items, paid, balance', () => {
    const [s] = partySummaries([p1], bills, pay)
    expect(s).toMatchObject({ purchases: 44400, bills: 2, items: 28, paid: 20000, balance: 24400, lastDate: '2026-09-09' })
  })
  it('ledger runs a balance in date order with payments in between', () => {
    const l = partyLedger(p1, bills, pay, 1000)
    expect(l.rows.map((r) => r.balance)).toEqual([22000, 43000, 23000, 25400])
  })
  it('payables: opening balance + bills − payments − set-offs, split Sara / FOI (like the Excel A/P Synopsis)', () => {
    const p2 = party('p2', 'Merab Traders', { account: 'FOI' })
    const entries = [
      ...pay,
      { ...pay[0], id: 'o1', date: '2026-01-01', month: '2026-01', amount: 81900, kind: 'OPENING' as const },
      { ...pay[0], id: 'a1', date: '2026-09-20', amount: 400, kind: 'ADJUSTMENT' as const },
      { ...pay[0], id: 'o2', partyId: 'p2', date: '2026-01-01', month: '2026-01', amount: 17000, kind: 'OPENING' as const },
      { ...pay[0], id: 'f1', partyId: 'p2', date: '2026-10-01', month: '2026-10', amount: 17000, paidFrom: 'FOI' as const },
    ]
    const r = payablesReport('2026-09-30', [p1, p2], bills, entries)
    expect(r.rows.find((x) => x.party.id === 'p1')).toMatchObject({ opening: 81900, purchases: 44400, paid: 20000, adjusted: 400, balance: 105900 })
    expect(r.totals).toEqual({ sara: 105900, foi: 17000, total: 122900 })
    expect(payablesReport('2026-10-31', [p1, p2], bills, entries).totals.foi).toBe(0)
    const l = partyLedger(p1, bills, entries.filter((e) => e.partyId === 'p1'))
    expect(l.rows[0]).toMatchObject({ kind: 'OPENING', amount: 81900, balance: 81900 })
    expect(l.rows[l.rows.length - 1].balance).toBe(105900)
  })
  it('petty statement carries the balance b/f', () => {
    const s = pettyStatement('2026-09', [
      { id: 'a', month: '2026-09', date: '2026-09-01', description: 'in', kind: 'CASH_IN', debit: 1000, credit: 0, sortOrder: 1, version: 1 },
      { id: 'b', month: '2026-09', date: '2026-09-02', description: 'out', kind: 'EXPENSE', debit: 0, credit: 300, sortOrder: 2, version: 1 },
      { id: 'c', month: '2026-09', date: '2026-09-03', description: 'wages', kind: 'SALARY', debit: 0, credit: 500, sortOrder: 3, version: 1 },
    ], 200, { month: '2026-09', locked: false })
    expect([s.closing, s.expenseOut, s.entries[0].balance]).toEqual([400, 300, 1200])
  })
})

describe('Cost Statement', () => {
  it('reproduces the August 2026 Excel (Total 6,091,868 · 58.47 per meter)', () => {
    const parties = [
      party('m', 'Machinery'),
      party('e', 'Electric', { costBucket: 'ELECTRIC' }),
      party('r', 'Marhaba', { costBucket: 'REPAIR', kind: 'WORKSHOP' }),
    ]
    const cs = buildCostStatement({
      month: '2026-08',
      payroll: {
        staffSalary: 584280, staffOvertime: 80353, contractEmployeeEfficiency: 43865, weaverWages: 718950,
        weaverHolidays: 87850, weaverEfficiency: 108246, helperWages: 347200,
        contractors: [{ name: 'All contractors', amount: 378349 }],
      },
      parties,
      monthBills: [bill('1', 'm', '2026-08', '2026-08-01', [['x', 1, 577306]]), bill('2', 'e', '2026-08', '2026-08-01', [['x', 1, 97245]]), bill('3', 'r', '2026-08', '2026-08-01', [['x', 1, 3000]])],
      pettyExpense: 167145,
      inputs: EXCEL_AUG_2026_INPUTS,
      inputsFrom: 'saved',
      inputsVersion: 1,
      productionMeters: 99999,
      lock: { month: '2026-08', locked: false },
    })
    expect(cs.salariesAndWages.total).toBe(1970744)
    expect(cs.totalCostOfProduction).toBe(5906792)
    expect(cs.adminTotal).toBe(185076)
    expect(cs.totalConversionCost).toBe(6091868)
    expect(cs.monthlyProductionMeters).toBe(104183)
    expect(cs.perMeterCost).toBeCloseTo(58.4728, 3)
  })
  it('a month with nothing saved carries the recurring lines from the last saved month only', () => {
    const r = resolveCostInputs(null, { month: '2026-08', inputs: EXCEL_AUG_2026_INPUTS })
    expect(r.from).toBe('previous-month')
    expect(r.inputs.powerAndLight).toBe(1975726)
    expect(r.inputs.storeInventory).toBeUndefined()
    expect(r.inputs.monthlyProductionMeters).toBeUndefined()
  })
})

describe('copying odd old data never throws', () => {
  it('garbage shapes are skipped, real rows kept', () => {
    const p = planImport({
      sara_textile_inventory_control_v2: { September: { items: [null, 5, 'x', { date: '2026-02-30', billNo: '1', itemDescription: 'A', companyName: 'Q', quantity: 'abc', costPerItem: '10', totalPrice: 10 }] }, Junk: 7 },
      sara_textile_traders_v2: { not: 'an array' },
      sara_textile_petty_cash_v4: 'oops',
      sara_textile_deleted_traders_v1: [1, null, 'q'],
      'sara_textile_cost_statement_overrides_v1__2026-09': { powerAndLight: 'abc', vehicleFuel: 5, storeInventory: [null, { item: 'Belt', amount: '7' }] },
    })
    const sep = p.bills.filter((b) => b.month === '2026-09')
    expect(sep).toHaveLength(1)
    expect(sep[0].date).toBe('2026-09-01') // impossible date → start of the sheet month
    expect(sep[0].lines[0]).toMatchObject({ quantity: 1, rate: 10 }) // total kept when qty unreadable
    expect(p.petty).toEqual([])
    const sepCost = p.costInputs.find((c) => c.month === '2026-09')!.inputs
    expect(sepCost.powerAndLight).toBeUndefined()
    expect(sepCost.vehicleFuel).toBe(5)
    expect(sepCost.storeInventory).toEqual([{ name: 'Belt', amount: 7 }])
  })
})
