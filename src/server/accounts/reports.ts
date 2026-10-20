/**
 * Accounts reports — pure functions over already-loaded rows, so they are easy to test
 * and every page computes totals the same way.
 */
import type {
  Bill,
  CostInputs,
  CostStatement,
  LedgerRow,
  MonthLock,
  NamedAmount,
  Party,
  PartyLedger,
  PartySummary,
  Payment,
  PettyCashEntry,
  PettyCashStatement,
} from '@/lib/accounts/types'
import { costPeriodTitle, sum } from '@/lib/accounts/util'
import {
  employeeBelongsInMonth,
  findLinkedEmployee,
  normalizeName,
} from '@/services/payroll/payrollCalculations'
import { STORAGE_KEYS } from '@/services/payroll/payrollConstants'
import type { EmployeeProfile } from '@/types/payroll'

// ---------------------------------------------------------------- parties

export function partySummaries(parties: Party[], bills: Bill[], payments: Payment[]): PartySummary[] {
  const byParty = new Map<string, PartySummary>()
  for (const p of parties) {
    byParty.set(p.id, { party: p, bills: 0, items: 0, purchases: 0, paid: 0, balance: 0, lastDate: null })
  }
  const billNos = new Map<string, Set<string>>()
  for (const b of bills) {
    const row = byParty.get(b.partyId)
    if (!row) continue
    const set = billNos.get(b.partyId) || new Set<string>()
    set.add(b.billNo.trim().toLowerCase() || `#${b.id}`)
    billNos.set(b.partyId, set)
    row.items += sum(b.lines, (l) => l.quantity)
    row.purchases += b.total
    if (!row.lastDate || b.date > row.lastDate) row.lastDate = b.date
  }
  for (const p of payments) {
    const row = byParty.get(p.partyId)
    if (row) row.paid += p.amount
  }
  for (const [id, row] of byParty) {
    row.bills = billNos.get(id)?.size || 0
    row.balance = row.purchases - row.paid
  }
  return [...byParty.values()].sort((a, b) => b.purchases - a.purchases || a.party.name.localeCompare(b.party.name))
}

/**
 * Date-wise ledger: purchase lines and payments, with a running balance.
 * `opening` = everything owed before the period (0 when showing all months).
 */
export function partyLedger(
  party: Party,
  bills: Bill[],
  payments: Payment[],
  opening = 0
): PartyLedger {
  type Item = { date: string; order: number; row: Omit<LedgerRow, 'balance'> }
  const items: Item[] = []
  for (const b of bills) {
    for (const l of b.lines) {
      items.push({
        date: b.date,
        order: b.sortOrder * 1000 + l.lineNo,
        row: {
          kind: 'LINE',
          date: b.date,
          month: b.month,
          billId: b.id,
          billNo: b.billNo,
          inwardNo: b.inwardNo,
          description: l.description,
          machine: l.machine,
          quantity: l.quantity,
          rate: l.rate,
          amount: l.amount,
          paid: 0,
        },
      })
    }
  }
  for (const p of payments) {
    items.push({
      date: p.date,
      order: 1e9,
      row: {
        kind: 'PAYMENT',
        paymentId: p.id,
        paymentVersion: p.version,
        date: p.date,
        month: p.month,
        billNo: p.reference,
        inwardNo: '',
        description: `Payment (${p.mode.toLowerCase()})${p.remarks ? ` — ${p.remarks}` : ''}`,
        machine: '',
        quantity: 0,
        rate: 0,
        amount: 0,
        paid: p.amount,
      },
    })
  }
  items.sort((a, b) => (a.date === b.date ? a.order - b.order : a.date < b.date ? -1 : 1))
  let balance = opening
  const rows: LedgerRow[] = items.map(({ row }) => {
    balance += row.amount - row.paid
    return { ...row, balance }
  })
  const [summary] = partySummaries([party], bills, payments)
  return { party, opening, rows, summary, payments }
}

// ---------------------------------------------------------------- petty cash

export function pettyStatement(
  month: string,
  entries: PettyCashEntry[],
  opening: number,
  lock: MonthLock
): PettyCashStatement {
  let balance = opening
  const rows = entries.map((e) => {
    balance += e.debit - e.credit
    return { ...e, balance }
  })
  return {
    month,
    opening,
    entries: rows,
    totalIn: sum(entries, (e) => e.debit),
    totalOut: sum(entries, (e) => e.credit),
    closing: balance,
    expenseOut: sum(
      entries.filter((e) => e.kind === 'EXPENSE'),
      (e) => e.credit
    ),
    lock,
  }
}

// ---------------------------------------------------------------- payroll totals (server side)

type PayRow = Record<string, unknown> & { month?: string; fortnight?: string; employeeId?: string }

/**
 * Salary figures for the Cost Statement, read straight from the saved payroll sheets
 * (same rows the Salary pages show: deleted people and out-of-period rows left out).
 */
export function payrollTotals(store: Record<string, unknown>, month: string) {
  const meta = (store[STORAGE_KEYS.HR_META] || {}) as { deletedEmployeeIds?: string[]; deletedEmployeeNames?: string[] }
  const deletedIds = new Set(meta.deletedEmployeeIds || [])
  const deletedNames = new Set(meta.deletedEmployeeNames || [])
  const roster = (Array.isArray(store[STORAGE_KEYS.EMPLOYEES]) ? store[STORAGE_KEYS.EMPLOYEES] : []) as EmployeeProfile[]

  const rows = (key: string, nameKey: 'employeeName' | 'name', fortnights?: string[]): PayRow[] => {
    const list = (Array.isArray(store[key]) ? store[key] : []) as PayRow[]
    return list.filter((r) => {
      if (r.month !== month) return false
      if (fortnights && !fortnights.includes(String(r.fortnight || '1-15'))) return false
      const name = String(r[nameKey] || '')
      if ((r.employeeId && deletedIds.has(r.employeeId)) || deletedNames.has(normalizeName(name))) return false
      const emp = findLinkedEmployee(
        roster,
        name,
        String(r.designation || r.contractType || ''),
        r.employeeId
      )
      const half = r.fortnight === '1-15' || r.fortnight === '16-31' ? (r.fortnight as '1-15' | '16-31') : undefined
      return employeeBelongsInMonth(emp, month, half)
    })
  }
  const total = (list: PayRow[], field: string) => sum(list, (r) => Number(r[field]) || 0)

  const staff = rows(STORAGE_KEYS.STAFF, 'employeeName')
  const contract = rows(STORAGE_KEYS.CONTRACT, 'employeeName')
  const weavers = rows(STORAGE_KEYS.WEAVERS, 'employeeName', ['1-15', '16-31'])
  const helpers = rows(STORAGE_KEYS.HELPERS, 'employeeName', ['1-15', '16-31'])
  const contractors = rows(STORAGE_KEYS.CONTRACTORS, 'name')

  // One line per contractor for the month (1–15 + month end), at contract cost
  // (contract amount + incentive). Advances are a cash recovery, not a lower cost.
  const byName = new Map<string, NamedAmount>()
  for (const c of contractors) {
    const name = String(c.name || '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    const amount =
      Number(c.totalAmount) || (Number(c.contractualAmount) || 0) + (Number(c.extraIncentive) || 0)
    const prev = byName.get(key)
    if (prev) prev.amount += amount
    else byName.set(key, { name, role: String(c.contractType || 'Contractor'), amount })
  }

  return {
    staffSalary: Math.round(total(staff, 'basicSalary') + total(contract, 'basicSalary')),
    staffOvertime: Math.round(total(staff, 'otAmount') + total(contract, 'otAmount')),
    contractEmployeeEfficiency: Math.round(total(contract, 'efficiencyAmount')),
    weaverWages: Math.round(total(weavers, 'grossAmount')),
    weaverHolidays: Math.round(total(weavers, 'holidayAmount')),
    weaverEfficiency: Math.round(total(weavers, 'efficiencyAmount')),
    helperWages: Math.round(total(helpers, 'netAmount')),
    contractors: [...byName.values()].map((c) => ({ ...c, amount: Math.round(c.amount) })).sort((a, b) => b.amount - a.amount),
  }
}

// ---------------------------------------------------------------- cost statement

/** Manual lines that carry over to the next month until changed. */
export const RECURRING_COST_FIELDS = [
  'powerAndLight',
  'vehicleFuel',
  'generatorFuel',
  'waterSupplies',
  'guardSalary',
  'solarPanelSystem',
  'depreciationProduction',
  'adminExpenses',
] as const

/** The August 2026 Excel Cost Statement (manual lines), used when nothing was saved yet. */
export const EXCEL_AUG_2026_INPUTS: CostInputs = {
  powerAndLight: 1975726,
  vehicleFuel: 48000,
  generatorFuel: 0,
  waterSupplies: 60000,
  guardSalary: 60000,
  solarPanelSystem: 400000,
  depreciationProduction: 136677,
  adminExpenses: { salaries: 120000, overtime: 47333, telephoneInternet: 8070, depreciationAdmin: 9673 },
  storeInventory: [
    { name: 'Spocket Belt G-6200 (1 Pieces)', amount: 12600 },
    { name: 'Rapier Tape G-6200 (1 Pieces)', amount: 20000 },
  ],
  monthlyProductionMeters: 104183,
}

/**
 * Which manual inputs apply to `month`:
 * saved for this month → as saved; otherwise the recurring lines of the latest earlier
 * saved month (store issues and meters start empty); otherwise nothing.
 */
export function resolveCostInputs(
  saved: CostInputs | null,
  previous: { month: string; inputs: CostInputs } | null
): { inputs: CostInputs; from: CostStatement['sources']['manualFrom']; fromMonth?: string } {
  if (saved) return { inputs: saved, from: 'saved' }
  if (previous) {
    const carried: CostInputs = {}
    for (const f of RECURRING_COST_FIELDS) {
      if (previous.inputs[f] !== undefined) (carried as Record<string, unknown>)[f] = previous.inputs[f]
    }
    return { inputs: carried, from: 'previous-month', fromMonth: previous.month }
  }
  return { inputs: {}, from: 'none' }
}

export function buildCostStatement(args: {
  month: string
  payroll: ReturnType<typeof payrollTotals>
  parties: Party[]
  monthBills: Bill[]
  pettyExpense: number
  inputs: CostInputs
  inputsFrom: CostStatement['sources']['manualFrom']
  inputsFromMonth?: string
  inputsVersion: number
  productionMeters: number
  lock: MonthLock
}): CostStatement {
  const { payroll, inputs } = args
  const partyById = new Map(args.parties.map((p) => [p.id, p]))
  const buckets = { MACHINERY: new Map<string, number>(), ELECTRIC: new Map<string, number>(), REPAIR: new Map<string, number>() }
  for (const b of args.monthBills) {
    const p = partyById.get(b.partyId)
    if (!p) continue
    const m = buckets[p.costBucket] || buckets.MACHINERY
    m.set(p.name, (m.get(p.name) || 0) + b.total)
  }
  const list = (m: Map<string, number>): NamedAmount[] =>
    [...m.entries()].map(([name, amount]) => ({ name, amount: Math.round(amount) })).sort((a, b) => b.amount - a.amount)

  const salaries = {
    staffSalary: payroll.staffSalary,
    staffOvertime: payroll.staffOvertime,
    contractEmployeeEfficiency: payroll.contractEmployeeEfficiency,
    weaverWages: payroll.weaverWages,
    weaverHolidays: payroll.weaverHolidays,
    weaverEfficiency: payroll.weaverEfficiency,
    helperWages: payroll.helperWages,
    total: 0,
  }
  salaries.total =
    salaries.staffSalary +
    salaries.staffOvertime +
    salaries.contractEmployeeEfficiency +
    salaries.weaverWages +
    salaries.weaverHolidays +
    salaries.weaverEfficiency +
    salaries.helperWages

  const machineryParts = list(buckets.MACHINERY)
  const electricMaintenance = list(buckets.ELECTRIC)
  const repairDetails = list(buckets.REPAIR)
  const storeInventory = (inputs.storeInventory || []).map((s) => ({ name: s.name, amount: Number(s.amount) || 0 }))
  const v = (x: number | undefined) => Number(x) || 0
  const admin = {
    salaries: v(inputs.adminExpenses?.salaries),
    overtime: v(inputs.adminExpenses?.overtime),
    telephoneInternet: v(inputs.adminExpenses?.telephoneInternet),
    depreciationAdmin: v(inputs.adminExpenses?.depreciationAdmin),
  }
  const contractorsTotal = sum(payroll.contractors, (c) => c.amount)
  const machineryTotal = sum(machineryParts, (r) => r.amount)
  const electricTotal = sum(electricMaintenance, (r) => r.amount)
  const repairTotal = sum(repairDetails, (r) => r.amount)
  const storeInventoryTotal = sum(storeInventory, (r) => r.amount)
  const pettyCash = Math.round(args.pettyExpense)

  const totalCostOfProduction =
    salaries.total +
    contractorsTotal +
    v(inputs.powerAndLight) +
    v(inputs.vehicleFuel) +
    v(inputs.generatorFuel) +
    machineryTotal +
    electricTotal +
    repairTotal +
    storeInventoryTotal +
    v(inputs.waterSupplies) +
    pettyCash +
    v(inputs.guardSalary) +
    v(inputs.solarPanelSystem) +
    v(inputs.depreciationProduction)
  const adminTotal = admin.salaries + admin.overtime + admin.telephoneInternet + admin.depreciationAdmin
  const totalConversionCost = totalCostOfProduction + adminTotal
  const metersSaved = inputs.monthlyProductionMeters != null && inputs.monthlyProductionMeters > 0
  const meters = metersSaved ? Number(inputs.monthlyProductionMeters) : Math.round(args.productionMeters)

  return {
    month: args.month,
    period: inputs.period || costPeriodTitle(args.month),
    salariesAndWages: salaries,
    contractorsBills: payroll.contractors,
    contractorsTotal,
    powerAndLight: v(inputs.powerAndLight),
    vehicleFuel: v(inputs.vehicleFuel),
    generatorFuel: v(inputs.generatorFuel),
    machineryParts,
    machineryTotal,
    electricMaintenance,
    electricTotal,
    repairDetails,
    repairTotal,
    storeInventory,
    storeInventoryTotal,
    waterSupplies: v(inputs.waterSupplies),
    pettyCash,
    guardSalary: v(inputs.guardSalary),
    solarPanelSystem: v(inputs.solarPanelSystem),
    depreciationProduction: v(inputs.depreciationProduction),
    totalCostOfProduction,
    adminExpenses: admin,
    adminTotal,
    totalConversionCost,
    monthlyProductionMeters: meters,
    perMeterCost: meters > 0 ? totalConversionCost / meters : 0,
    sources: {
      manualFrom: args.inputsFrom,
      manualFromMonth: args.inputsFromMonth,
      meters: metersSaved ? 'saved' : 'production-ledger',
    },
    inputs,
    inputsVersion: args.inputsVersion,
    lock: args.lock,
  }
}
