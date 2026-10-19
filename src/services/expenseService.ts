import { InventoryPurchaseEntry, PettyCashEntry, MachineExpenseCategory } from '@/types/expense'
import { accountsData } from '@/data/accountsData'
import { accountsRead, accountsWrite } from '@/services/accountsStore'
import { ACCOUNTS_KEYS } from '@/lib/accountsKeys'
import {
  STORAGE_KEY_PETTY_CASH,
  STORAGE_KEY_INVENTORY_PURCHASE,
} from '@/services/accounts/expenseKeys'
export * from '@/services/accounts/expenseTypes'
export * from '@/services/accounts/expenseSeeds'
export * from '@/services/accounts/accountsMonths'
import {
  INITIAL_PETTY_CASH,
  INITIAL_INVENTORY_PURCHASES,
  slugifyPartyName,
} from '@/services/accounts/expenseSeeds'

import { traderMethods, type TraderMethods } from '@/services/accounts/service/traders'
import { workshopMethods, type WorkshopMethods } from '@/services/accounts/service/workshops'
import {
  costStatementMethods,
  type CostStatementMethods,
} from '@/services/accounts/service/costStatement'

export class ExpenseService {
  isClient(): boolean {
    return typeof window !== 'undefined'
  }

  notifyDataChanged(month?: string): void {
    if (!this.isClient()) return
    try {
      window.dispatchEvent(new CustomEvent('accounts_synced', { detail: { month } }))
    } catch (err) {
      console.error('Error dispatching accounts sync event', err)
    }
  }

  // --- Petty Cash ---
  getPettyCashEntries(): PettyCashEntry[] {
    return accountsRead(STORAGE_KEY_PETTY_CASH, INITIAL_PETTY_CASH)
  }

  savePettyCashEntries(entries: PettyCashEntry[]): void {
    if (!this.isClient()) return
    accountsWrite(STORAGE_KEY_PETTY_CASH, entries)
    this.notifyDataChanged()
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

  /** Operational mill expenses (excludes salary/contractor pass-through credits). */
  getPettyCashOperationalOutflow(monthStr: string = '2026-08'): number {
    return this.getPettyCashEntries()
      .filter((e) => (e.date || '').startsWith(monthStr))
      .filter((e) => !(e.description || '').toLowerCase().includes('paid salaries'))
      .reduce((sum, e) => sum + (Number(e.creditAmount) || 0), 0)
  }

  getMonthlyPettyCashStatements(): {
    month: string
    entries: PettyCashEntry[]
    totalDr: number
    totalCr: number
    closingBalance: number
  }[] {
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
    return accountsRead(STORAGE_KEY_INVENTORY_PURCHASE, INITIAL_INVENTORY_PURCHASES)
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
      accountsWrite(STORAGE_KEY_INVENTORY_PURCHASE, list)
      this.notifyDataChanged()
    }
    return newRecord
  }

  recordUnifiedMasterBill(params: {
    date: string
    partyName: string
    billNo: string
    inwardNo: string
    items: Array<{
      description: string
      machineName: string
      quantity: number
      rate: number
      totalAmount: number
    }>
    foiPaid?: number
    remarks?: string
    isWorkshop?: boolean
  }): void {
    const partyName = params.partyName.trim()
    const isWorkshop =
      params.isWorkshop ||
      partyName.toLowerCase().includes('engineering') ||
      partyName.toLowerCase().includes('workshop') ||
      partyName.toLowerCase().includes('repair') ||
      partyName.toLowerCase().includes('lathe') ||
      accountsData.workshops.synopsis.some(
        (w) => slugifyPartyName(w.workshopName) === slugifyPartyName(partyName)
      )

    // Ensure vendor exists in directory synopsis with category and remarks
    if (isWorkshop) {
      this.addNewWorkshop(partyName, 'Workshop / Engineering', params.remarks)
    } else {
      this.addNewTrader(partyName, 'Trader', params.remarks)
    }

    this.notifyDataChanged(params.date.slice(0, 7))
  }

  getMonthlyPurchasesSummary(): {
    month: string
    totalAmount: number
    totalEntries: number
    uniqueParties: number
    entries: InventoryPurchaseEntry[]
  }[] {
    const months = accountsRead<Record<string, any>>(
      ACCOUNTS_KEYS.INVENTORY_CONTROL,
      accountsData.inventoryControl.months
    )
    return Object.entries(months).map(([monthName, sheet]) => {
      const itemsList = sheet?.items || []
      const entries: InventoryPurchaseEntry[] = itemsList.map((it: any, idx: number) => ({
        id: `ic-${monthName}-${idx + 1}`,
        date: it.date || `2026-${monthName}`,
        billNo: it.billNo || '',
        inwardNo: it.inwardNo || '',
        partyName: it.companyName || it.partyName || '',
        itemDescription: it.itemDescription || '',
        machineCategory: (it.machineName || 'All') as MachineExpenseCategory,
        quantity: Number(it.quantity) || 1,
        costPerItem: Number(it.costPerItem || it.rate) || 0,
        totalPrice: Number(it.totalPrice || it.totalAmount) || 0,
      }))

      return {
        month: monthName,
        totalAmount: Number(sheet?.totalAmount) || entries.reduce((s, e) => s + e.totalPrice, 0),
        totalEntries: Number(sheet?.itemsCount) || entries.length,
        uniqueParties: new Set(entries.map((i) => i.partyName).filter(Boolean)).size,
        entries,
      }
    })
  }
}

// Methods live in ./payroll/service/* and are attached here, so callers keep using expenseService.X().
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface ExpenseService extends TraderMethods, WorkshopMethods, CostStatementMethods {}
Object.assign(ExpenseService.prototype, traderMethods, workshopMethods, costStatementMethods)

export const expenseService = new ExpenseService()
