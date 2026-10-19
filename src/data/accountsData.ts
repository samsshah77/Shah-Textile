import accountsJson from './accountsExcelData.json'

export interface CostStatementCategoryItem {
  name: string
  amount: number
}

export interface CostStatementCategory {
  name: string
  amount: number
  breakdown: CostStatementCategoryItem[]
}

export interface CostStatementData {
  companyName: string
  title: string
  period: string
  costOfProduction: {
    total: number
    categories: CostStatementCategory[]
  }
  adminAndSellingExp: {
    total: number
    categories: CostStatementCategoryItem[]
  }
  totalConversionCost: number
  monthlyProductionMeters: number
  perMeterCost: number
}

export interface TraderSynopsisItem {
  sNo: number
  noOfBills: number
  traderName: string
  saraPayable: number
  foiPayable: number
  remarks: string
}

export interface LedgerItem {
  sNo: number
  date: string
  billNo: string
  inwardNo: string
  itemName: string
  quantity: number
  rate: number
  amount: number
}

export interface TraderLedger {
  slug: string
  partyName: string
  billsCount: number
  totalPayable: number
  items: LedgerItem[]
}

export interface WorkshopSynopsisItem {
  sNo: number
  noOfBills: number
  workshopName: string
  saraPayable: number
  foiPayable: number
  remarks: string
}

export interface WorkshopLedger {
  slug: string
  workshopName: string
  billsCount: number
  totalPayable: number
  items: LedgerItem[]
}

export interface DailyInwardItem {
  sNo: number
  date: string
  billNo: string
  inwardNo: string
  partyName: string
  itemDescription: string
  quantity: number
  rate: number
  totalAmount: number
  saraAp: number
  foiCashCheque: number
  balance: number
}

export interface PettyCashTransaction {
  sNo: number
  date: string
  description: string
  debit: number
  credit: number
  balance: number
}

export interface InventoryItem {
  id?: string
  sNo: number
  date: string
  billNo: string
  inwardNo: string
  itemDescription: string
  companyName: string
  partyName?: string
  partyType?: 'Trader' | 'Workshop'
  machineName: string
  quantity: number
  costPerItem: number
  rate?: number
  totalPrice: number
  totalAmount?: number
  saraAp?: number
  foiCashCheque?: number
  balance?: number
  remarks?: string
}

export interface MonthlyInventorySheet {
  month: string
  totalAmount: number
  itemsCount: number
  items: InventoryItem[]
}

export interface AccountsDataset {
  costStatement: CostStatementData
  traders: {
    synopsis: TraderSynopsisItem[]
    totalPayable: number
    totalBills: number
    ledgers: TraderLedger[]
  }
  workshops: {
    synopsis: WorkshopSynopsisItem[]
    totalPayable: number
    totalBills: number
    ledgers: WorkshopLedger[]
  }
  dailyExpense: {
    inward: DailyInwardItem[]
    inwardTotal: number
    pettyCash: PettyCashTransaction[]
    pettyCashTotalDr: number
    pettyCashTotalCr: number
    closingBalance: number
  }
  inventoryControl: {
    months: Record<string, MonthlyInventorySheet>
    grandTotal: number
    totalItems: number
  }
}

export const accountsData: AccountsDataset = accountsJson as unknown as AccountsDataset

// Typed helper getters
export function getCostStatement(): CostStatementData {
  return accountsData.costStatement
}

export function getTradersSynopsis(): TraderSynopsisItem[] {
  return accountsData.traders.synopsis
}

export function getTradersLedgers(): TraderLedger[] {
  return accountsData.traders.ledgers
}

export function getTraderBySlug(slug: string): TraderLedger | undefined {
  return accountsData.traders.ledgers.find((t) => t.slug === slug || t.partyName.toLowerCase().replace(/[^a-z0-9]/g, '-').includes(slug))
}

export function getWorkshopsSynopsis(): WorkshopSynopsisItem[] {
  return accountsData.workshops.synopsis
}

export function getWorkshopsLedgers(): WorkshopLedger[] {
  return accountsData.workshops.ledgers
}

export function getWorkshopBySlug(slug: string): WorkshopLedger | undefined {
  return accountsData.workshops.ledgers.find((w) => w.slug === slug || w.workshopName.toLowerCase().replace(/[^a-z0-9]/g, '-').includes(slug))
}

export function getDailyInwardExpenses(): DailyInwardItem[] {
  return accountsData.dailyExpense.inward
}

export function getPettyCashTransactions(): PettyCashTransaction[] {
  return accountsData.dailyExpense.pettyCash
}

export function getInventoryControlMonths(): Record<string, MonthlyInventorySheet> {
  return accountsData.inventoryControl.months
}

export function getInventoryMonth(monthName: string): MonthlyInventorySheet | undefined {
  return accountsData.inventoryControl.months[monthName]
}
