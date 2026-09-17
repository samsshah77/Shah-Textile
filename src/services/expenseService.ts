import {
  InventoryPurchaseEntry,
  PettyCashEntry,
  MachineExpenseCategory,
} from '@/types/expense'
import {
  accountsData,
  TraderLedger,
  WorkshopLedger,
  TraderSynopsisItem,
  WorkshopSynopsisItem,
  DailyInwardItem,
  PettyCashTransaction,
  MonthlyInventorySheet,
} from '@/data/accountsData'

const STORAGE_KEY_PETTY_CASH = 'sara_textile_petty_cash_v4'
const STORAGE_KEY_INVENTORY_PURCHASE = 'sara_textile_inventory_purchase_v4'
const STORAGE_KEY_COST_STATEMENT = 'sara_textile_cost_statement_v4'

export interface TraderSummary {
  partyName: string
  slug: string
  type: 'Trader' | 'Workshop / Engineering' | 'Petroleum & Oil' | 'Electronics' | 'Safety / Fire'
  totalBills: number
  totalItems: number
  totalPurchases: number
  paidAmount: number
  currentBalance: number
  lastDate: string
  entries: InventoryPurchaseEntry[]
}

export interface MonthlyCostStatement {
  id: string
  month: string // e.g. '2026-08'
  monthTitle: string // 'For The Month of Aug-2026'

  // 1. Salaries & Wages
  salariesAndWages: {
    staffSalary: number
    staffOvertime: number
    contractEmployeeEfficiency: number
    weaverWages: number
    weaverHolidays: number
    weaverEfficiency: number
    helperWages: number
  }

  // 2. Contractors Bill Amount
  contractorsBills: {
    name: string
    role: string
    amount: number
  }[]

  // 3. Power, Fuel & Energy
  powerAndLight: number
  vehicleFuel: number
  generatorFuel: number

  // 4. Overheads
  waterSupplies: number
  pettyCashOutflow: number
  guardSalary: number
  solarPanelSystem: number
  depreciationProduction: number

  // 5. Store Inventory Direct
  storeInventoryDirect: {
    item: string
    amount: number
  }[]

  // 6. Admin & Selling Expenses
  adminExpenses: {
    salaries: number
    overtime: number
    telephoneInternet: number
    depreciationAdmin: number
  }

  // Monthly Produced meters
  monthlyProductionMeters: number
}

// Map the authentic August 2026 Petty Cash transactions from the Excel file
const INITIAL_PETTY_CASH: PettyCashEntry[] = accountsData.dailyExpense.pettyCash.map((item, idx) => ({
  id: `pc-${item.sNo || idx + 1}`,
  date: item.date || '2026-08-01',
  description: item.description,
  debitAmount: item.debit || 0,
  creditAmount: item.credit || 0,
  balance: item.balance || 0,
}))

// Map the authentic August 2026 Daily Inward items (60 line items) from the Excel file
const INITIAL_INVENTORY_PURCHASES: InventoryPurchaseEntry[] = accountsData.dailyExpense.inward.map((item, idx) => {
  let cat: MachineExpenseCategory = 'All'
  const desc = (item.itemDescription || '').toLowerCase()
  const party = (item.partyName || '').toLowerCase()

  if (desc.includes('pu') || party.includes('marhaba') || party.includes('vip')) cat = 'PU'
  else if (desc.includes('g-6200') || desc.includes('g6200')) cat = 'G6200'
  else if (desc.includes('g-6300') || desc.includes('g6300')) cat = 'G6300'
  else if (desc.includes('ic') || desc.includes('relay') || desc.includes('card') || party.includes('smd') || party.includes('electronic') || party.includes('janjoha')) cat = 'Electronic'

  return {
    id: `inw-${item.sNo || idx + 1}`,
    date: item.date || '2026-08-01',
    billNo: item.billNo || '',
    inwardNo: item.inwardNo || '',
    partyName: item.partyName,
    itemDescription: item.itemDescription,
    machineCategory: cat,
    quantity: item.quantity || 1,
    costPerItem: item.rate || item.saraAp || item.totalAmount,
    totalPrice: item.saraAp || item.totalAmount || (item.quantity * item.rate),
  }
})

// Default Cost Statement transcribed directly from the Sara Textile Excel Cost Statement sheet
const INITIAL_COST_STATEMENT_AUG_2026: MonthlyCostStatement = {
  id: 'cs-2026-08',
  month: '2026-08',
  monthTitle: accountsData.costStatement.period || 'For The Month of Aug-2026',
  salariesAndWages: {
    staffSalary: 584280,
    staffOvertime: 80353,
    contractEmployeeEfficiency: 43865,
    weaverWages: 718950,
    weaverHolidays: 87850,
    weaverEfficiency: 108246,
    helperWages: 347200,
  },
  contractorsBills: [
    { name: 'Amir', role: 'PU Technician', amount: 70000 },
    { name: 'Basit', role: 'Electronics Contractor', amount: 70000 },
    { name: 'Naseer', role: 'Reed Repair', amount: 5500 },
    { name: 'Nawab', role: 'Gitta Winder', amount: 30000 },
    { name: 'Zafar Gul', role: 'Chowkidar', amount: 32000 },
    { name: 'Shoaib', role: 'Electrical Helper', amount: 25000 },
    { name: 'Rehbar Ali', role: 'Hand Knotting', amount: 83549 },
    { name: 'Shahid', role: 'Machine Knotting', amount: 34100 },
    { name: 'Nazim Hussain', role: 'Sarning', amount: 28200 },
  ],
  powerAndLight: 1975726,
  vehicleFuel: 48000,
  generatorFuel: 0,
  waterSupplies: 60000,
  pettyCashOutflow: 167145,
  guardSalary: 60000,
  solarPanelSystem: 400000,
  depreciationProduction: 136677,
  storeInventoryDirect: [
    { item: 'Spocket Belt G-6200 (1 Pieces)', amount: 12600 },
    { item: 'Rapier Tape G-6200 (1 Pieces)', amount: 20000 },
  ],
  adminExpenses: {
    salaries: 120000,
    overtime: 47333,
    telephoneInternet: 8070,
    depreciationAdmin: 9673,
  },
  monthlyProductionMeters: 104183,
}

export function slugifyPartyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
}

class ExpenseService {
  private isClient(): boolean {
    return typeof window !== 'undefined'
  }

  // --- Petty Cash ---
  getPettyCashEntries(): PettyCashEntry[] {
    if (this.isClient()) {
      try {
        const stored = localStorage.getItem(STORAGE_KEY_PETTY_CASH)
        if (stored) return JSON.parse(stored)
      } catch (err) {
        console.error(err)
      }
    }
    return INITIAL_PETTY_CASH
  }

  savePettyCashEntries(entries: PettyCashEntry[]): void {
    if (this.isClient()) {
      localStorage.setItem(STORAGE_KEY_PETTY_CASH, JSON.stringify(entries))
    }
  }

  addPettyCashEntry(entry: Omit<PettyCashEntry, 'id' | 'balance'>): PettyCashEntry {
    const list = this.getPettyCashEntries()
    const lastBalance = list.length > 0 ? list[list.length - 1].balance : 0
    const debit = entry.debitAmount || 0
    const credit = entry.creditAmount || 0
    const newBalance = lastBalance + debit - credit

    const newEntry: PettyCashEntry = {
      ...entry,
      id: `pc-${Date.now()}`,
      balance: newBalance,
    }

    list.push(newEntry)
    this.savePettyCashEntries(list)
    return newEntry
  }

  getMonthlyPettyCashStatements(): { month: string; entries: PettyCashEntry[]; totalDr: number; totalCr: number; closingBalance: number }[] {
    const all = this.getPettyCashEntries()
    const groups: Record<string, PettyCashEntry[]> = {}

    all.forEach((entry) => {
      const monthKey = entry.date.slice(0, 7)
      if (!groups[monthKey]) groups[monthKey] = []
      groups[monthKey].push(entry)
    })

    return Object.entries(groups)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, entries]) => {
        const totalDr = entries.reduce((s, e) => s + (e.debitAmount || 0), 0)
        const totalCr = entries.reduce((s, e) => s + (e.creditAmount || 0), 0)
        const closingBalance = entries.length > 0 ? entries[entries.length - 1].balance : 0
        return {
          month,
          entries,
          totalDr,
          totalCr,
          closingBalance,
        }
      })
  }

  // --- Inventory Purchases & Inward ---
  getInventoryPurchases(): InventoryPurchaseEntry[] {
    if (this.isClient()) {
      try {
        const stored = localStorage.getItem(STORAGE_KEY_INVENTORY_PURCHASE)
        if (stored) return JSON.parse(stored)
      } catch (err) {
        console.error(err)
      }
    }
    return INITIAL_INVENTORY_PURCHASES
  }

  addInventoryPurchase(purchase: Omit<InventoryPurchaseEntry, 'id' | 'totalPrice'>): InventoryPurchaseEntry {
    const list = this.getInventoryPurchases()
    const totalPrice = purchase.quantity * purchase.costPerItem
    const newRecord: InventoryPurchaseEntry = {
      ...purchase,
      id: `inw-${Date.now()}`,
      totalPrice,
    }

    list.unshift(newRecord)
    if (this.isClient()) {
      localStorage.setItem(STORAGE_KEY_INVENTORY_PURCHASE, JSON.stringify(list))
    }
    return newRecord
  }

  getTradersList(): TraderSummary[] {
    // Combine traders and workshops with their exact ledger items from accountsData
    const traders: TraderSummary[] = accountsData.traders.ledgers.map((t) => {
      const syn = accountsData.traders.synopsis.find((s) => s.traderName.toLowerCase() === t.partyName.toLowerCase() || t.partyName.toLowerCase().startsWith(s.traderName.toLowerCase().slice(0, 5)))
      const totalPurchases = syn ? syn.saraPayable : t.totalPayable
      const totalItems = t.items.reduce((sum, item) => sum + (item.quantity || 1), 0)
      const uniqueBills = syn ? syn.noOfBills : (t.billsCount || new Set(t.items.map((i) => i.billNo).filter(Boolean)).size)

      let type: TraderSummary['type'] = 'Trader'
      const name = t.partyName.toLowerCase()
      if (name.includes('engineering')) type = 'Workshop / Engineering'
      else if (name.includes('petroleum') || name.includes('oil')) type = 'Petroleum & Oil'
      else if (name.includes('smd') || name.includes('electronic')) type = 'Electronics'
      else if (name.includes('fire')) type = 'Safety / Fire'

      const entries: InventoryPurchaseEntry[] = t.items.map((it, idx) => ({
        id: `tr-${t.slug}-${idx + 1}`,
        date: it.date || '2026-08-01',
        billNo: it.billNo,
        inwardNo: it.inwardNo,
        partyName: t.partyName,
        itemDescription: it.itemName,
        machineCategory: 'All',
        quantity: it.quantity,
        costPerItem: it.rate,
        totalPrice: it.amount,
      }))

      const lastDate = entries.length > 0 ? entries[entries.length - 1].date : '2026-08-31'

      return {
        partyName: t.partyName,
        slug: t.slug,
        type,
        totalBills: uniqueBills,
        totalItems,
        totalPurchases,
        paidAmount: 0,
        currentBalance: totalPurchases,
        lastDate,
        entries,
      }
    })

    // Also include workshops
    accountsData.workshops.ledgers.forEach((w) => {
      const syn = accountsData.workshops.synopsis.find((s) => s.workshopName.toLowerCase() === w.workshopName.toLowerCase())
      const totalPurchases = syn ? syn.saraPayable : w.totalPayable
      const totalItems = w.items.reduce((sum, item) => sum + (item.quantity || 1), 0)
      const uniqueBills = syn ? syn.noOfBills : (w.billsCount || new Set(w.items.map((i) => i.billNo).filter(Boolean)).size)

      const entries: InventoryPurchaseEntry[] = w.items.map((it, idx) => ({
        id: `ws-${w.slug}-${idx + 1}`,
        date: it.date || '2026-08-01',
        billNo: it.billNo,
        inwardNo: it.inwardNo,
        partyName: w.workshopName,
        itemDescription: it.itemName,
        machineCategory: 'PU',
        quantity: it.quantity,
        costPerItem: it.rate,
        totalPrice: it.amount,
      }))

      traders.push({
        partyName: w.workshopName,
        slug: w.slug,
        type: 'Workshop / Engineering',
        totalBills: uniqueBills,
        totalItems,
        totalPurchases,
        paidAmount: 0,
        currentBalance: totalPurchases,
        lastDate: entries.length > 0 ? entries[entries.length - 1].date : '2026-08-31',
        entries,
      })
    })

    return traders.sort((a, b) => b.totalPurchases - a.totalPurchases)
  }

  getTraderBySlug(slug: string): TraderSummary | null {
    const traders = this.getTradersList()
    const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9]/g, '')
    return traders.find((t) => 
      t.slug === slug || 
      t.slug.replace(/[^a-z0-9]/g, '') === cleanSlug || 
      slugifyPartyName(t.partyName) === slug ||
      t.partyName.toLowerCase().replace(/[^a-z0-9]/g, '').includes(cleanSlug)
    ) || null
  }

  getMonthlyPurchasesSummary(): { month: string; totalAmount: number; totalEntries: number; uniqueParties: number; entries: InventoryPurchaseEntry[] }[] {
    // Return the complete 9-month inventory control sheets from accountsData
    const months = accountsData.inventoryControl.months
    return Object.entries(months).map(([monthName, sheet]) => {
      const entries: InventoryPurchaseEntry[] = sheet.items.map((it, idx) => ({
        id: `ic-${monthName}-${idx + 1}`,
        date: it.date || `2026-${monthName}`,
        billNo: it.billNo,
        inwardNo: it.inwardNo,
        partyName: it.companyName,
        itemDescription: it.itemDescription,
        machineCategory: (it.machineName || 'All') as MachineExpenseCategory,
        quantity: it.quantity,
        costPerItem: it.costPerItem,
        totalPrice: it.totalPrice,
      }))

      return {
        month: monthName,
        totalAmount: sheet.totalAmount,
        totalEntries: sheet.itemsCount,
        uniqueParties: new Set(sheet.items.map((i) => i.companyName).filter(Boolean)).size,
        entries,
      }
    })
  }

  // --- Monthly Cost Statement & Conversion Cost ---
  getCostStatement(monthStr: string = '2026-08'): MonthlyCostStatement {
    if (this.isClient()) {
      try {
        const stored = localStorage.getItem(`${STORAGE_KEY_COST_STATEMENT}_${monthStr}`)
        if (stored) return JSON.parse(stored)
      } catch (err) {
        console.error(err)
      }
    }
    return INITIAL_COST_STATEMENT_AUG_2026
  }

  saveCostStatement(statement: MonthlyCostStatement): void {
    if (this.isClient()) {
      localStorage.setItem(`${STORAGE_KEY_COST_STATEMENT}_${statement.month}`, JSON.stringify(statement))
    }
  }
}

export const expenseService = new ExpenseService()
