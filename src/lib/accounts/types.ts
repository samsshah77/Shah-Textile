/**
 * Accounts — shared shapes (server + browser).
 *
 * One purchase lives in exactly one place: a Bill with its Lines. Daily Inward, party
 * ledgers, Monthly Purchases and the Cost Statement are all views of the same bills.
 * Months are always "YYYY-MM" (the sheet / accounting month a bill belongs to; usually
 * the bill date's month, but Excel sometimes files a 28 Feb bill in March).
 */

export type PartyKind = 'TRADER' | 'WORKSHOP'
/** Which Cost Statement block a party's purchases go to. */
export type CostBucket = 'MACHINERY' | 'ELECTRIC' | 'REPAIR'
export type PettyCashKind = 'OPENING' | 'CASH_IN' | 'EXPENSE' | 'SALARY'
export type PaymentMode = 'CASH' | 'CHEQUE' | 'OTHER'
/** Which money pays a supplier: Sara Textile's own account, or FOI. */
export type PayAccount = 'SARA' | 'FOI'
/**
 * Entries on a supplier's payable ledger besides bills:
 *  - PAYMENT    money paid to the supplier (reduces what we owe)
 *  - OPENING    balance brought forward from the old ledger (positive = we owe them)
 *  - ADJUSTMENT set-off / discount / return (positive reduces what we owe; negative adds)
 */
export type PaymentKind = 'PAYMENT' | 'OPENING' | 'ADJUSTMENT'

export const MACHINE_OPTIONS = ['G-6200', 'G-6300', 'PU', 'Electronic', 'ALL'] as const

export interface Party {
  id: string
  name: string
  slug: string
  kind: PartyKind
  category: string
  costBucket: CostBucket
  remarks: string
  active: boolean
  /** Whose payable this is (A/P Synopsis column). */
  account: PayAccount
  version: number
}

export interface BillLine {
  id: string
  lineNo: number
  description: string
  machine: string
  quantity: number
  rate: number
  /** round(quantity × rate) — always computed on the server. */
  amount: number
}

export interface Bill {
  id: string
  partyId: string
  month: string
  date: string
  billNo: string
  inwardNo: string
  remarks: string
  sortOrder: number
  version: number
  lines: BillLine[]
  total: number
  /** Pictures of the paper bill (/uploads/bills/…). */
  attachments: string[]
}

export interface Payment {
  id: string
  partyId: string
  month: string
  date: string
  amount: number
  kind: PaymentKind
  mode: PaymentMode
  /** Account the money came from (payments only). */
  paidFrom: PayAccount
  reference: string
  remarks: string
  version: number
}

export interface PettyCashEntry {
  id: string
  month: string
  date: string
  description: string
  kind: PettyCashKind
  debit: number
  credit: number
  sortOrder: number
  version: number
}

export interface MonthLock {
  month: string
  locked: boolean
  lockedBy?: string | null
  lockedAt?: string | null
}

/** Everything the Daily Inward page needs for one month. */
export interface MonthBook {
  month: string
  bills: Bill[]
  parties: Party[]
  lock: MonthLock
  total: number
}

export interface PartySummary {
  party: Party
  bills: number
  items: number
  /** Balance brought forward from the old ledger. */
  opening: number
  purchases: number
  paid: number
  /** Set-offs / discounts / returns (positive = reduces payable). */
  adjusted: number
  /** opening + purchases − paid − adjusted */
  balance: number
  lastDate: string | null
}

export interface LedgerRow {
  kind: 'LINE' | 'PAYMENT' | 'OPENING' | 'ADJUSTMENT'
  /** Set on payment rows (to delete one). */
  paymentId?: string
  paymentVersion?: number
  date: string
  month: string
  billId?: string
  billNo: string
  inwardNo: string
  /** Bill pictures — on the bill's first line only. */
  attachments?: string[]
  description: string
  machine: string
  quantity: number
  rate: number
  amount: number
  paid: number
  balance: number
}

export interface PartyLedger {
  party: Party
  /** Purchases − payments before the period (0 for "all months"). */
  opening: number
  rows: LedgerRow[]
  summary: PartySummary
  payments: Payment[]
}

export interface PettyCashStatement {
  month: string
  opening: number
  entries: (PettyCashEntry & { balance: number })[]
  totalIn: number
  totalOut: number
  closing: number
  /** Credits counted as mill expense in the Cost Statement. */
  expenseOut: number
  lock: MonthLock
}

export interface NamedAmount {
  name: string
  amount: number
  role?: string
}

/** Manual Cost Statement lines (typed in by the accountant, per month). */
export interface CostInputs {
  period?: string
  powerAndLight?: number
  vehicleFuel?: number
  generatorFuel?: number
  waterSupplies?: number
  guardSalary?: number
  solarPanelSystem?: number
  depreciationProduction?: number
  adminExpenses?: {
    salaries?: number
    overtime?: number
    telephoneInternet?: number
    depreciationAdmin?: number
  }
  /** Items issued from the store this month (not purchases). */
  storeInventory?: NamedAmount[]
  /** Leave empty to use the production ledger's meters. */
  monthlyProductionMeters?: number | null
}

export interface CostStatement {
  month: string
  period: string
  salariesAndWages: {
    staffSalary: number
    staffOvertime: number
    contractEmployeeEfficiency: number
    weaverWages: number
    weaverHolidays: number
    weaverEfficiency: number
    helperWages: number
    total: number
  }
  contractorsBills: NamedAmount[]
  contractorsTotal: number
  powerAndLight: number
  vehicleFuel: number
  generatorFuel: number
  machineryParts: NamedAmount[]
  machineryTotal: number
  electricMaintenance: NamedAmount[]
  electricTotal: number
  repairDetails: NamedAmount[]
  repairTotal: number
  storeInventory: NamedAmount[]
  storeInventoryTotal: number
  waterSupplies: number
  pettyCash: number
  guardSalary: number
  solarPanelSystem: number
  depreciationProduction: number
  totalCostOfProduction: number
  adminExpenses: { salaries: number; overtime: number; telephoneInternet: number; depreciationAdmin: number }
  adminTotal: number
  totalConversionCost: number
  monthlyProductionMeters: number
  perMeterCost: number
  /** Where each figure came from, shown as small badges on the page. */
  sources: {
    manualFrom: 'saved' | 'previous-month' | 'none'
    manualFromMonth?: string
    meters: 'saved' | 'production-ledger'
  }
  inputs: CostInputs
  inputsVersion: number
  lock: MonthLock
}

/** One supplier on the A/P Synopsis (what we owe, as of a date). */
export interface PayableRow {
  party: Party
  opening: number
  purchases: number
  paid: number
  adjusted: number
  balance: number
  lastBill: string | null
  lastPayment: string | null
}

export interface PayablesReport {
  asOf: string
  rows: PayableRow[]
  totals: { sara: number; foi: number; total: number }
}
