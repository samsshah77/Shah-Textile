import {
  InventoryPurchaseEntry,
  PettyCashEntry,
  MachineExpenseCategory,
} from '@/types/expense'
import {
  accountsData,
  TraderSynopsisItem,
  WorkshopSynopsisItem,
  DailyInwardItem,
} from '@/data/accountsData'
import { payrollService } from '@/services/payrollService'
import { accountsRead, accountsRemove, accountsWrite } from '@/services/accountsStore'
import { ACCOUNTS_KEYS } from '@/lib/accountsKeys'

const STORAGE_KEY_PETTY_CASH = ACCOUNTS_KEYS.PETTY_CASH
const STORAGE_KEY_INVENTORY_PURCHASE = ACCOUNTS_KEYS.INVENTORY_PURCHASE
const STORAGE_KEY_COST_STATEMENT = ACCOUNTS_KEYS.COST_STATEMENT_PREFIX.slice(0, -1)
const STORAGE_KEY_COST_OVERRIDES = ACCOUNTS_KEYS.COST_OVERRIDES_PREFIX.slice(0, -1)

export interface NamedCostItem {
  name: string
  amount: number
  role?: string
}

export interface StoreCostItem {
  item: string
  amount: number
}

/** UI Cost Statement model (Excel Cost Statement sheet). */
export interface CostStatementModel {
  companyName: string
  title: string
  period: string
  month: string
  salariesAndWages: {
    staffSalary: number
    staffOvertime: number
    contractEmployeeEfficiency: number
    weaverWages: number
    weaverHolidays: number
    weaverEfficiency: number
    helperWages: number
  }
  contractorsBills: NamedCostItem[]
  powerAndLight: number
  vehicleFuel: number
  generatorFuel: number
  machineryParts: NamedCostItem[]
  electricMaintenance: NamedCostItem[]
  repairExpense: number
  repairDetails: NamedCostItem[]
  storeInventory: StoreCostItem[]
  waterSupplies: number
  pettyCash: number
  guardSalary: number
  solarPanelSystem: number
  depreciationProduction: number
  adminExpenses: {
    salaries: number
    overtime: number
    telephoneInternet: number
    depreciationAdmin: number
  }
  monthlyProductionMeters: number
  /** Which blocks were pulled live from upstream sheets */
  derivedFrom?: {
    salaries: 'payroll'
    contractors: 'payroll'
    pettyCash: 'accounts-petty-cash'
    traders: 'traders-ledgers'
  }
}

export interface TraderSummary {
  partyName: string
  slug: string
  type: string
  totalBills: number
  totalItems: number
  totalPurchases: number
  paidAmount: number
  currentBalance: number
  lastDate: string
  remarks?: string
  entries: InventoryPurchaseEntry[]
}

export interface WorkshopSummary {
  workshopName: string
  slug: string
  type: string
  totalBills: number
  totalItems: number
  totalPurchases: number
  paidAmount: number
  currentBalance: number
  lastDate: string
  remarks?: string
  entries: InventoryPurchaseEntry[]
}

export interface RecordTraderBillInput {
  date: string
  partyName: string
  billNo: string
  inwardNo?: string
  itemName: string
  machineCategory?: MachineExpenseCategory
  quantity: number
  rate: number
  totalAmount?: number
  saraPayable?: number
  foiPaid?: number
  remarks?: string
}

export interface RecordWorkshopJobInput {
  date: string
  workshopName: string
  billNo: string
  inwardNo?: string
  machineName?: string
  jobDescription: string
  quantity: number
  rate: number
  totalAmount?: number
  saraPayable?: number
  foiPaid?: number
  remarks?: string
}

export interface MonthlyCostStatement {
  id: string
  month: string
  monthTitle: string
  salariesAndWages: CostStatementModel['salariesAndWages']
  contractorsBills: { name: string; role: string; amount: number }[]
  powerAndLight: number
  vehicleFuel: number
  generatorFuel: number
  waterSupplies: number
  pettyCashOutflow: number
  guardSalary: number
  solarPanelSystem: number
  depreciationProduction: number
  storeInventoryDirect: { item: string; amount: number }[]
  adminExpenses: CostStatementModel['adminExpenses']
  monthlyProductionMeters: number
}

/** Manual / semi-manual fields that stay editable after live rollups. */
export type CostStatementOverrides = Partial<
  Pick<
    CostStatementModel,
    | 'powerAndLight'
    | 'vehicleFuel'
    | 'generatorFuel'
    | 'waterSupplies'
    | 'guardSalary'
    | 'solarPanelSystem'
    | 'depreciationProduction'
    | 'adminExpenses'
    | 'monthlyProductionMeters'
    | 'machineryParts'
    | 'electricMaintenance'
    | 'repairDetails'
    | 'storeInventory'
    | 'period'
  >
>

function monthTitle(month: string): string {
  try {
    const [y, m] = month.split('-').map(Number)
    const label = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    return `For The Month of ${label}`
  } catch {
    return accountsData.costStatement.period || `For The Month of ${month}`
  }
}

function classifyTraderBucket(
  partyName: string,
  type: TraderSummary['type']
): 'machinery' | 'electric' | 'repair' {
  const n = partyName.toLowerCase()
  if (
    n.includes('smd') ||
    n.includes('jab') ||
    n.includes('electronic') ||
    n.includes('textile engineering') ||
    type === 'Electronics'
  ) {
    return 'electric'
  }
  if (n.includes('marhaba') || n.includes('repair')) return 'repair'
  return 'machinery'
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

  private getDeletedTraders(): string[] {
    const primary = accountsRead<string[]>(ACCOUNTS_KEYS.DELETED_TRADERS, [])
    const legacy = accountsRead<string[]>('sara_deleted_traders_v1', [])
    return Array.from(new Set([...primary, ...legacy]))
  }

  private saveDeletedTraders(list: string[]): void {
    accountsWrite(ACCOUNTS_KEYS.DELETED_TRADERS, list)
    if (this.isClient()) {
      try {
        localStorage.removeItem('sara_deleted_traders_v1')
      } catch {}
    }
  }

  getTradersList(monthFilter?: string): TraderSummary[] {
    const synList = accountsRead<TraderSynopsisItem[]>(
      ACCOUNTS_KEYS.TRADERS_STORE,
      accountsData.traders.synopsis
    )

    const map = new Map<string, TraderSummary>()

    // 1. Process from synopsis list
    synList.forEach((syn) => {
      const slug = slugifyPartyName(syn.traderName)
      const storageKey = `${ACCOUNTS_KEYS.TRADER_PREFIX}${slug}`
      const customEntries = accountsRead<InventoryPurchaseEntry[] | null>(storageKey, null)

      let type: TraderSummary['type'] = 'Trader'
      const name = syn.traderName.toLowerCase()
      if (name.includes('petroleum') || name.includes('oil')) type = 'Petroleum & Oil'
      else if (name.includes('smd') || name.includes('electronic') || name.includes('textile engineering')) type = 'Electronics'
      else if (name.includes('fire')) type = 'Safety / Fire'

      if (customEntries && customEntries.length > 0) {
        // Deduplicate legacy duplicate clones
        const cleanCustomEntries = customEntries.filter((entry, idx, arr) => {
          return !arr.slice(0, idx).some((prev) =>
            (prev.id && entry.id && prev.id === entry.id) ||
            (prev.billNo && entry.billNo && prev.billNo.trim().toLowerCase() === entry.billNo.trim().toLowerCase() &&
             prev.inwardNo && entry.inwardNo && prev.inwardNo.trim().toLowerCase() === entry.inwardNo.trim().toLowerCase() &&
             prev.itemDescription.trim().toLowerCase() === entry.itemDescription.trim().toLowerCase() &&
             prev.totalPrice === entry.totalPrice)
          )
        })

        const totalPurchases = cleanCustomEntries.reduce((s, e) => s + (Number(e.totalPrice) || 0), 0)
        const totalItems = cleanCustomEntries.reduce((s, e) => s + (Number(e.quantity) || 1), 0)
        const billSet = new Set(cleanCustomEntries.map((e) => e.billNo).filter(Boolean))
        const paidAmount = syn.foiPayable || 0
        const lastDate = cleanCustomEntries[cleanCustomEntries.length - 1].date || '2026-08-31'

        map.set(slug, {
          partyName: syn.traderName,
          slug,
          type,
          totalBills: billSet.size || syn.noOfBills,
          totalItems,
          totalPurchases,
          paidAmount,
          currentBalance: totalPurchases - paidAmount,
          lastDate,
          remarks: syn.remarks,
          entries: cleanCustomEntries,
        })
      } else {
        // Fall back to seed ledger
        const seed = accountsData.traders.ledgers.find(
          (l) =>
            l.slug === slug ||
            slugifyPartyName(l.partyName) === slug ||
            l.partyName.toLowerCase() === syn.traderName.toLowerCase()
        )

        const entries: InventoryPurchaseEntry[] = seed
          ? seed.items.map((it, idx) => ({
              id: `tr-${seed.slug}-${idx + 1}`,
              date: it.date || '2026-08-01',
              billNo: it.billNo,
              inwardNo: it.inwardNo,
              partyName: seed.partyName,
              itemDescription: it.itemName,
              machineCategory: 'All',
              quantity: it.quantity,
              costPerItem: it.rate,
              totalPrice: it.amount,
            }))
          : []

        const totalPurchases = syn.saraPayable || (seed ? seed.totalPayable : 0)
        const totalItems = seed ? seed.items.reduce((s, i) => s + (Number(i.quantity) || 1), 0) : 0
        const paidAmount = syn.foiPayable || 0
        const lastDate = entries.length > 0 ? entries[entries.length - 1].date : '2026-08-31'

        map.set(slug, {
          partyName: syn.traderName,
          slug,
          type,
          totalBills: syn.noOfBills || (seed ? seed.billsCount : 0),
          totalItems,
          totalPurchases,
          paidAmount,
          currentBalance: totalPurchases - paidAmount,
          lastDate,
          remarks: syn.remarks,
          entries,
        })
      }
    })

    // 2. Check any seed ledgers not in synopsis
    accountsData.traders.ledgers.forEach((seed) => {
      const slug = seed.slug || slugifyPartyName(seed.partyName)
      if (!map.has(slug)) {
        const storageKey = `${ACCOUNTS_KEYS.TRADER_PREFIX}${slug}`
        const customEntries = accountsRead<InventoryPurchaseEntry[] | null>(storageKey, null)
        const entries = customEntries || seed.items.map((it, idx) => ({
          id: `tr-${seed.slug}-${idx + 1}`,
          date: it.date || '2026-08-01',
          billNo: it.billNo,
          inwardNo: it.inwardNo,
          partyName: seed.partyName,
          itemDescription: it.itemName,
          machineCategory: 'All' as MachineExpenseCategory,
          quantity: it.quantity,
          costPerItem: it.rate,
          totalPrice: it.amount,
        }))

        const totalPurchases = customEntries
          ? customEntries.reduce((s, e) => s + (Number(e.totalPrice) || 0), 0)
          : seed.totalPayable
        const totalItems = entries.reduce((s, e) => s + (Number(e.quantity) || 1), 0)
        const lastDate = entries.length > 0 ? entries[entries.length - 1].date : '2026-08-31'

        map.set(slug, {
          partyName: seed.partyName,
          slug,
          type: 'Trader',
          totalBills: seed.billsCount || new Set(entries.map((e) => e.billNo).filter(Boolean)).size,
          totalItems,
          totalPurchases,
          paidAmount: 0,
          currentBalance: totalPurchases,
          lastDate,
          entries,
        })
      }
    })

    // 3. Scan Store Inward / Expense master entries (INVENTORY_CONTROL) for trader bills
    const storedInventoryMonths = accountsRead<Record<string, { items?: any[] }> | null>(
      ACCOUNTS_KEYS.INVENTORY_CONTROL,
      null
    )
    if (storedInventoryMonths) {
      Object.entries(storedInventoryMonths).forEach(([mKey, sheet]) => {
        if (!sheet?.items) return
        sheet.items.forEach((it: any, itIdx: number) => {
          const party = (it.companyName || it.partyName || '').trim()
          if (!party) return
          const isWs =
            party.toLowerCase().includes('engineering') ||
            party.toLowerCase().includes('workshop') ||
            party.toLowerCase().includes('repair') ||
            party.toLowerCase().includes('lathe') ||
            party.toLowerCase().includes('rewind') ||
            accountsData.workshops.synopsis.some(
              (w) => slugifyPartyName(w.workshopName) === slugifyPartyName(party)
            )
          if (isWs) return

          const s = slugifyPartyName(party)
          const existing = map.get(s)
          const entryId = it.id || `inv-${mKey}-${it.sNo || itIdx + 1}`
          const entry: InventoryPurchaseEntry = {
            id: entryId,
            date: it.date || '2026-09-01',
            billNo: it.billNo || '',
            inwardNo: it.inwardNo || '',
            partyName: party,
            itemDescription: it.itemDescription || '',
            machineCategory: (it.machineName || 'All') as MachineExpenseCategory,
            quantity: Number(it.quantity) || 1,
            costPerItem: Number(it.costPerItem || it.rate) || 0,
            totalPrice: Number(it.totalPrice || it.totalAmount) || 0,
          }

          if (existing) {
            const existingIdx = existing.entries.findIndex(
              (e) =>
                e.id === entryId ||
                (e.billNo && entry.billNo &&
                  e.billNo.trim().toLowerCase() === entry.billNo.trim().toLowerCase() &&
                  (e.inwardNo === entry.inwardNo || e.itemDescription.trim().toLowerCase() === entry.itemDescription.trim().toLowerCase()) &&
                  e.totalPrice === entry.totalPrice)
            )
            if (existingIdx >= 0) {
              existing.entries[existingIdx] = entry
            } else {
              existing.entries.push(entry)
            }
            existing.totalPurchases = existing.entries.reduce((sum, e) => sum + (Number(e.totalPrice) || 0), 0)
            existing.totalItems = existing.entries.reduce((sum, e) => sum + (Number(e.quantity) || 1), 0)
            existing.currentBalance = existing.totalPurchases - existing.paidAmount
            existing.totalBills = new Set(existing.entries.map((e) => e.billNo).filter(Boolean)).size
            if (entry.date) existing.lastDate = entry.date
          } else {
            map.set(s, {
              partyName: party,
              slug: s,
              type: 'Trader',
              totalBills: entry.billNo ? 1 : 0,
              totalItems: entry.quantity,
              totalPurchases: entry.totalPrice,
              paidAmount: Number(it.foiCashCheque || 0),
              currentBalance: entry.totalPrice - Number(it.foiCashCheque || 0),
              lastDate: entry.date || '2026-09-01',
              entries: [entry],
            })
          }
        })
      })
    }

    const deletedTraders = this.getDeletedTraders()
    const allTraders = Array.from(map.values()).filter((t) => !deletedTraders.includes(t.slug))

    if (!monthFilter || monthFilter === 'ALL' || monthFilter.toLowerCase() === 'all months') {
      return allTraders.sort((a, b) => b.totalPurchases - a.totalPurchases)
    }

    const mFilterLower = monthFilter.toLowerCase().replace(' 2026', '').trim()
    const monthNum =
      mFilterLower.includes('jan') ? '01' :
      mFilterLower.includes('feb') ? '02' :
      mFilterLower.includes('mar') ? '03' :
      mFilterLower.includes('apr') ? '04' :
      mFilterLower.includes('may') ? '05' :
      mFilterLower.includes('jun') ? '06' :
      mFilterLower.includes('jul') ? '07' :
      mFilterLower.includes('aug') ? '08' :
      mFilterLower.includes('sep') ? '09' :
      mFilterLower.includes('oct') ? '10' :
      mFilterLower.includes('nov') ? '11' :
      mFilterLower.includes('dec') ? '12' : ''

    const scopedTraders = allTraders.map((t) => {
      const monthEntries = t.entries.filter((e) => {
        if (!e.date) return false
        if (monthNum && e.date.includes(`-${monthNum}-`)) return true
        if (e.date.toLowerCase().includes(mFilterLower)) return true
        return false
      })
      const totalPurchases = monthEntries.reduce((s, e) => s + (Number(e.totalPrice) || 0), 0)
      const totalItems = monthEntries.reduce((s, e) => s + (Number(e.quantity) || 1), 0)
      const billCount = new Set(monthEntries.map((e) => e.billNo).filter(Boolean)).size
      const lastDate = monthEntries.length > 0 ? monthEntries[monthEntries.length - 1].date : t.lastDate

      return {
        ...t,
        totalBills: billCount,
        totalItems,
        totalPurchases,
        paidAmount: 0,
        currentBalance: totalPurchases,
        lastDate,
        entries: monthEntries,
      }
    })

    return scopedTraders.sort((a, b) => b.totalPurchases - a.totalPurchases)
  }

  addNewTrader(partyName: string, category: string = 'Trader', remarks?: string): TraderSummary {
    const trimmed = partyName.trim()
    const slug = slugifyPartyName(trimmed)
    const currentSynopsis = accountsRead<TraderSynopsisItem[]>(
      ACCOUNTS_KEYS.TRADERS_STORE,
      accountsData.traders.synopsis
    )
    const deleted = this.getDeletedTraders()
    const updatedDeleted = deleted.filter((d) => d !== slug)
    this.saveDeletedTraders(updatedDeleted)

    const existingIdx = currentSynopsis.findIndex((s) => slugifyPartyName(s.traderName) === slug)
    if (existingIdx >= 0) {
      currentSynopsis[existingIdx] = {
        ...currentSynopsis[existingIdx],
        traderName: trimmed,
        remarks: remarks || currentSynopsis[existingIdx].remarks,
      }
    } else {
      currentSynopsis.push({
        sNo: currentSynopsis.length + 1,
        noOfBills: 0,
        traderName: trimmed,
        saraPayable: 0,
        foiPayable: 0,
        remarks: remarks || category || '',
      })
    }
    accountsWrite(ACCOUNTS_KEYS.TRADERS_STORE, currentSynopsis)
    this.notifyDataChanged()
    return this.getTraderBySlug(slug) || {
      partyName: trimmed,
      slug,
      type: category,
      totalBills: 0,
      totalItems: 0,
      totalPurchases: 0,
      paidAmount: 0,
      currentBalance: 0,
      lastDate: new Date().toISOString().slice(0, 10),
      remarks: remarks || category || '',
      entries: [],
    }
  }

  deleteTrader(slug: string): boolean {
    const s = slugifyPartyName(slug)
    const deleted = this.getDeletedTraders()
    if (!deleted.includes(s)) {
      deleted.push(s)
      this.saveDeletedTraders(deleted)
    }

    const currentSynopsis = accountsRead<TraderSynopsisItem[]>(
      ACCOUNTS_KEYS.TRADERS_STORE,
      accountsData.traders.synopsis
    )
    const filtered = currentSynopsis.filter((syn) => slugifyPartyName(syn.traderName) !== s)
    accountsWrite(ACCOUNTS_KEYS.TRADERS_STORE, filtered)
    accountsRemove(`${ACCOUNTS_KEYS.TRADER_PREFIX}${s}`)
    this.notifyDataChanged()
    return true
  }

  getTraderBySlug(slug: string, monthFilter?: string): TraderSummary | null {
    const traders = this.getTradersList(monthFilter)
    const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9]/g, '')
    return (
      traders.find(
        (t) =>
          t.slug === slug ||
          t.slug.replace(/[^a-z0-9]/g, '') === cleanSlug ||
          slugifyPartyName(t.partyName) === slug ||
          t.partyName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .includes(cleanSlug)
      ) || null
    )
  }

  recordTraderBill(params: RecordTraderBillInput): { entry: InventoryPurchaseEntry; trader: TraderSummary } {
    const partyName = params.partyName.trim()
    const slug = slugifyPartyName(partyName)
    const total = params.totalAmount ?? Math.round(params.quantity * params.rate)
    const saraAp = params.saraPayable ?? total
    const foiPaid = params.foiPaid || 0

    // 1. Update party ledger
    const storageKey = `${ACCOUNTS_KEYS.TRADER_PREFIX}${slug}`
    const existingTrader = this.getTraderBySlug(slug)
    const currentEntries: InventoryPurchaseEntry[] = existingTrader ? [...existingTrader.entries] : []

    const newEntry: InventoryPurchaseEntry = {
      id: `tr-${slug}-${Date.now()}`,
      date: params.date,
      billNo: params.billNo || '',
      inwardNo: params.inwardNo || '',
      partyName,
      itemDescription: params.itemName,
      machineCategory: params.machineCategory || 'All',
      quantity: params.quantity,
      costPerItem: params.rate,
      totalPrice: total,
    }
    currentEntries.push(newEntry)
    if (this.isClient()) {
      accountsWrite(storageKey, currentEntries)
    }

    // 2. Update Traders Synopsis Store
    const currentSynopsis = accountsRead<TraderSynopsisItem[]>(
      ACCOUNTS_KEYS.TRADERS_STORE,
      accountsData.traders.synopsis
    )
    const synIndex = currentSynopsis.findIndex(
      (s) => slugifyPartyName(s.traderName) === slug || s.traderName.toLowerCase() === partyName.toLowerCase()
    )

    if (synIndex >= 0) {
      const syn = currentSynopsis[synIndex]
      currentSynopsis[synIndex] = {
        ...syn,
        saraPayable: (syn.saraPayable || 0) + saraAp,
        foiPayable: (syn.foiPayable || 0) + foiPaid,
        noOfBills: (syn.noOfBills || 0) + (params.billNo ? 1 : 0),
        remarks: params.remarks || syn.remarks || '',
      }
    } else {
      currentSynopsis.push({
        sNo: currentSynopsis.length + 1,
        noOfBills: 1,
        traderName: partyName,
        saraPayable: saraAp,
        foiPayable: foiPaid,
        remarks: params.remarks || '',
      })
    }
    if (this.isClient()) {
      accountsWrite(ACCOUNTS_KEYS.TRADERS_STORE, currentSynopsis)
    }

    // 3. Mirror into Daily Inward Expenses
    const dailyInward = accountsRead<DailyInwardItem[]>(
      ACCOUNTS_KEYS.DAILY_INWARD,
      accountsData.dailyExpense.inward
    )
    const newDailyItem: DailyInwardItem = {
      sNo: dailyInward.length + 1,
      date: params.date,
      billNo: params.billNo || '',
      inwardNo: params.inwardNo || '',
      partyName,
      itemDescription: params.itemName,
      quantity: params.quantity,
      rate: params.rate,
      totalAmount: total,
      saraAp,
      foiCashCheque: foiPaid,
      balance: 0,
    }
    dailyInward.push(newDailyItem)
    if (this.isClient()) {
      accountsWrite(ACCOUNTS_KEYS.DAILY_INWARD, dailyInward)
      this.notifyDataChanged(params.date.slice(0, 7))
    }

    const updatedTrader = this.getTraderBySlug(slug) || {
      partyName,
      slug,
      type: 'Trader',
      totalBills: 1,
      totalItems: params.quantity,
      totalPurchases: saraAp,
      paidAmount: foiPaid,
      currentBalance: saraAp - foiPaid,
      lastDate: params.date,
      remarks: params.remarks,
      entries: currentEntries,
    }

    return { entry: newEntry, trader: updatedTrader }
  }

  private getDeletedWorkshops(): string[] {
    const primary = accountsRead<string[]>(ACCOUNTS_KEYS.DELETED_WORKSHOPS, [])
    const legacy = accountsRead<string[]>('sara_deleted_workshops_v1', [])
    return Array.from(new Set([...primary, ...legacy]))
  }

  private saveDeletedWorkshops(list: string[]): void {
    accountsWrite(ACCOUNTS_KEYS.DELETED_WORKSHOPS, list)
    if (this.isClient()) {
      try {
        localStorage.removeItem('sara_deleted_workshops_v1')
      } catch {}
    }
  }

  // --- Workshops & Engineering ---
  getWorkshopsList(monthFilter?: string): WorkshopSummary[] {
    const synList = accountsRead<WorkshopSynopsisItem[]>(
      ACCOUNTS_KEYS.WORKSHOPS_STORE,
      accountsData.workshops.synopsis
    )

    const map = new Map<string, WorkshopSummary>()

    synList.forEach((syn) => {
      const slug = slugifyPartyName(syn.workshopName)
      const storageKey = `${ACCOUNTS_KEYS.WORKSHOP_PREFIX}${slug}`
      const customEntries = accountsRead<InventoryPurchaseEntry[] | null>(storageKey, null)

      let type: WorkshopSummary['type'] = 'Workshop / Engineering'
      const name = syn.workshopName.toLowerCase()
      if (name.includes('lathe') || name.includes('turning')) type = 'Lathe / Turning'
      else if (name.includes('weld')) type = 'Welding'
      else if (name.includes('motor') || name.includes('rewind')) type = 'Motor Rewinding'
      else if (name.includes('repair')) type = 'General Repair'

      if (customEntries && customEntries.length > 0) {
        // Deduplicate legacy duplicate clones
        const cleanCustomEntries = customEntries.filter((entry, idx, arr) => {
          return !arr.slice(0, idx).some((prev) =>
            (prev.id && entry.id && prev.id === entry.id) ||
            (prev.billNo && entry.billNo && prev.billNo.trim().toLowerCase() === entry.billNo.trim().toLowerCase() &&
             prev.inwardNo && entry.inwardNo && prev.inwardNo.trim().toLowerCase() === entry.inwardNo.trim().toLowerCase() &&
             prev.itemDescription.trim().toLowerCase() === entry.itemDescription.trim().toLowerCase() &&
             prev.totalPrice === entry.totalPrice)
          )
        })

        const totalPurchases = cleanCustomEntries.reduce((s, e) => s + (Number(e.totalPrice) || 0), 0)
        const totalItems = cleanCustomEntries.reduce((s, e) => s + (Number(e.quantity) || 1), 0)
        const billSet = new Set(cleanCustomEntries.map((e) => e.billNo).filter(Boolean))
        const paidAmount = syn.foiPayable || 0
        const lastDate = cleanCustomEntries[cleanCustomEntries.length - 1].date || '2026-08-31'

        map.set(slug, {
          workshopName: syn.workshopName,
          slug,
          type,
          totalBills: billSet.size || syn.noOfBills,
          totalItems,
          totalPurchases,
          paidAmount,
          currentBalance: totalPurchases - paidAmount,
          lastDate,
          remarks: syn.remarks,
          entries: cleanCustomEntries,
        })
      } else {
        const seed = accountsData.workshops.ledgers.find(
          (l) =>
            l.slug === slug ||
            slugifyPartyName(l.workshopName) === slug ||
            l.workshopName.toLowerCase() === syn.workshopName.toLowerCase()
        )

        const entries: InventoryPurchaseEntry[] = seed
          ? seed.items.map((it, idx) => ({
              id: `ws-${seed.slug}-${idx + 1}`,
              date: it.date || '2026-08-01',
              billNo: it.billNo,
              inwardNo: it.inwardNo,
              partyName: seed.workshopName,
              itemDescription: it.itemName,
              machineCategory: 'PU',
              quantity: it.quantity,
              costPerItem: it.rate,
              totalPrice: it.amount,
            }))
          : []

        const totalPurchases = syn.saraPayable || (seed ? seed.totalPayable : 0)
        const totalItems = seed ? seed.items.reduce((s, i) => s + (Number(i.quantity) || 1), 0) : 0
        const paidAmount = syn.foiPayable || 0
        const lastDate = entries.length > 0 ? entries[entries.length - 1].date : '2026-08-31'

        map.set(slug, {
          workshopName: syn.workshopName,
          slug,
          type,
          totalBills: syn.noOfBills || (seed ? seed.billsCount : 0),
          totalItems,
          totalPurchases,
          paidAmount,
          currentBalance: totalPurchases - paidAmount,
          lastDate,
          remarks: syn.remarks,
          entries,
        })
      }
    })

    // 2. Check seed ledgers not in synopsis
    accountsData.workshops.ledgers.forEach((seed) => {
      const slug = seed.slug || slugifyPartyName(seed.workshopName)
      if (!map.has(slug)) {
        const storageKey = `${ACCOUNTS_KEYS.WORKSHOP_PREFIX}${slug}`
        const customEntries = accountsRead<InventoryPurchaseEntry[] | null>(storageKey, null)
        const entries = customEntries || seed.items.map((it, idx) => ({
          id: `ws-${seed.slug}-${idx + 1}`,
          date: it.date || '2026-08-01',
          billNo: it.billNo,
          inwardNo: it.inwardNo,
          partyName: seed.workshopName,
          itemDescription: it.itemName,
          machineCategory: 'PU' as MachineExpenseCategory,
          quantity: it.quantity,
          costPerItem: it.rate,
          totalPrice: it.amount,
        }))

        const totalPurchases = customEntries
          ? customEntries.reduce((s, e) => s + (Number(e.totalPrice) || 0), 0)
          : seed.totalPayable
        const totalItems = entries.reduce((s, e) => s + (Number(e.quantity) || 1), 0)
        const lastDate = entries.length > 0 ? entries[entries.length - 1].date : '2026-08-31'

        map.set(slug, {
          workshopName: seed.workshopName,
          slug,
          type: 'Workshop / Engineering',
          totalBills: seed.billsCount || new Set(entries.map((e) => e.billNo).filter(Boolean)).size,
          totalItems,
          totalPurchases,
          paidAmount: 0,
          currentBalance: totalPurchases,
          lastDate,
          entries,
        })
      }
    })

    // 3. Scan Store Inward / Expense master entries (INVENTORY_CONTROL) for workshop jobs
    const storedInventoryMonths = accountsRead<Record<string, { items?: any[] }> | null>(
      ACCOUNTS_KEYS.INVENTORY_CONTROL,
      null
    )
    if (storedInventoryMonths) {
      Object.entries(storedInventoryMonths).forEach(([mKey, sheet]) => {
        if (!sheet?.items) return
        sheet.items.forEach((it: any, itIdx: number) => {
          const party = (it.companyName || it.partyName || '').trim()
          if (!party) return
          const isWs =
            party.toLowerCase().includes('engineering') ||
            party.toLowerCase().includes('workshop') ||
            party.toLowerCase().includes('repair') ||
            party.toLowerCase().includes('lathe') ||
            party.toLowerCase().includes('rewind') ||
            accountsData.workshops.synopsis.some(
              (w) => slugifyPartyName(w.workshopName) === slugifyPartyName(party)
            )
          if (!isWs) return

          const s = slugifyPartyName(party)
          const existing = map.get(s)
          const entryId = it.id || `ws-inv-${mKey}-${it.sNo || itIdx + 1}`
          const entry: InventoryPurchaseEntry = {
            id: entryId,
            date: it.date || '2026-09-01',
            billNo: it.billNo || '',
            inwardNo: it.inwardNo || '',
            partyName: party,
            itemDescription: it.itemDescription || '',
            machineCategory: (it.machineName || 'PU') as MachineExpenseCategory,
            quantity: Number(it.quantity) || 1,
            costPerItem: Number(it.costPerItem || it.rate) || 0,
            totalPrice: Number(it.totalPrice || it.totalAmount) || 0,
          }

          if (existing) {
            const existingIdx = existing.entries.findIndex(
              (e) =>
                e.id === entryId ||
                (e.billNo && entry.billNo &&
                  e.billNo.trim().toLowerCase() === entry.billNo.trim().toLowerCase() &&
                  (e.inwardNo === entry.inwardNo || e.itemDescription.trim().toLowerCase() === entry.itemDescription.trim().toLowerCase()) &&
                  e.totalPrice === entry.totalPrice)
            )
            if (existingIdx >= 0) {
              existing.entries[existingIdx] = entry
            } else {
              existing.entries.push(entry)
            }
            existing.totalPurchases = existing.entries.reduce((sum, e) => sum + (Number(e.totalPrice) || 0), 0)
            existing.totalItems = existing.entries.reduce((sum, e) => sum + (Number(e.quantity) || 1), 0)
            existing.currentBalance = existing.totalPurchases - existing.paidAmount
            existing.totalBills = new Set(existing.entries.map((e) => e.billNo).filter(Boolean)).size
            if (entry.date) existing.lastDate = entry.date
          } else {
            map.set(s, {
              workshopName: party,
              slug: s,
              type: 'Workshop / Engineering',
              totalBills: entry.billNo ? 1 : 0,
              totalItems: entry.quantity,
              totalPurchases: entry.totalPrice,
              paidAmount: Number(it.foiCashCheque || 0),
              currentBalance: entry.totalPrice - Number(it.foiCashCheque || 0),
              lastDate: entry.date || '2026-09-01',
              entries: [entry],
            })
          }
        })
      })
    }

    const deletedWorkshops = this.getDeletedWorkshops()
    const allWorkshops = Array.from(map.values()).filter((w) => !deletedWorkshops.includes(w.slug))

    if (!monthFilter || monthFilter === 'ALL' || monthFilter.toLowerCase() === 'all months') {
      return allWorkshops.sort((a, b) => b.totalPurchases - a.totalPurchases)
    }

    const mFilterLower = monthFilter.toLowerCase().replace(' 2026', '').trim()
    const monthNum =
      mFilterLower.includes('jan') ? '01' :
      mFilterLower.includes('feb') ? '02' :
      mFilterLower.includes('mar') ? '03' :
      mFilterLower.includes('apr') ? '04' :
      mFilterLower.includes('may') ? '05' :
      mFilterLower.includes('jun') ? '06' :
      mFilterLower.includes('jul') ? '07' :
      mFilterLower.includes('aug') ? '08' :
      mFilterLower.includes('sep') ? '09' :
      mFilterLower.includes('oct') ? '10' :
      mFilterLower.includes('nov') ? '11' :
      mFilterLower.includes('dec') ? '12' : ''

    const scopedWorkshops = allWorkshops.map((w) => {
      const monthEntries = w.entries.filter((e) => {
        if (!e.date) return false
        if (monthNum && e.date.includes(`-${monthNum}-`)) return true
        if (e.date.toLowerCase().includes(mFilterLower)) return true
        return false
      })
      const totalPurchases = monthEntries.reduce((s, e) => s + (Number(e.totalPrice) || 0), 0)
      const totalItems = monthEntries.reduce((s, e) => s + (Number(e.quantity) || 1), 0)
      const billCount = new Set(monthEntries.map((e) => e.billNo).filter(Boolean)).size
      const lastDate = monthEntries.length > 0 ? monthEntries[monthEntries.length - 1].date : w.lastDate

      return {
        ...w,
        totalBills: billCount,
        totalItems,
        totalPurchases,
        paidAmount: 0,
        currentBalance: totalPurchases,
        lastDate,
        entries: monthEntries,
      }
    })

    return scopedWorkshops.sort((a, b) => b.totalPurchases - a.totalPurchases)
  }

  addNewWorkshop(
    workshopName: string,
    specialization: string = 'Workshop / Engineering',
    remarks?: string
  ): WorkshopSummary {
    const trimmed = workshopName.trim()
    const slug = slugifyPartyName(trimmed)
    const currentSynopsis = accountsRead<WorkshopSynopsisItem[]>(
      ACCOUNTS_KEYS.WORKSHOPS_STORE,
      accountsData.workshops.synopsis
    )
    const deleted = this.getDeletedWorkshops()
    const updatedDeleted = deleted.filter((d) => d !== slug)
    this.saveDeletedWorkshops(updatedDeleted)

    const existingIdx = currentSynopsis.findIndex((s) => slugifyPartyName(s.workshopName) === slug)
    if (existingIdx >= 0) {
      currentSynopsis[existingIdx] = {
        ...currentSynopsis[existingIdx],
        workshopName: trimmed,
        remarks: remarks || currentSynopsis[existingIdx].remarks,
      }
    } else {
      currentSynopsis.push({
        sNo: currentSynopsis.length + 1,
        noOfBills: 0,
        workshopName: trimmed,
        saraPayable: 0,
        foiPayable: 0,
        remarks: remarks || specialization || '',
      })
    }
    accountsWrite(ACCOUNTS_KEYS.WORKSHOPS_STORE, currentSynopsis)
    this.notifyDataChanged()
    return this.getWorkshopBySlug(slug) || {
      workshopName: trimmed,
      slug,
      type: specialization,
      totalBills: 0,
      totalItems: 0,
      totalPurchases: 0,
      paidAmount: 0,
      currentBalance: 0,
      lastDate: new Date().toISOString().slice(0, 10),
      remarks: remarks || specialization || '',
      entries: [],
    }
  }

  deleteWorkshop(slug: string): boolean {
    const s = slugifyPartyName(slug)
    const deleted = this.getDeletedWorkshops()
    if (!deleted.includes(s)) {
      deleted.push(s)
      this.saveDeletedWorkshops(deleted)
    }

    const currentSynopsis = accountsRead<WorkshopSynopsisItem[]>(
      ACCOUNTS_KEYS.WORKSHOPS_STORE,
      accountsData.workshops.synopsis
    )
    const filtered = currentSynopsis.filter((syn) => slugifyPartyName(syn.workshopName) !== s)
    accountsWrite(ACCOUNTS_KEYS.WORKSHOPS_STORE, filtered)
    accountsRemove(`${ACCOUNTS_KEYS.WORKSHOP_PREFIX}${s}`)
    this.notifyDataChanged()
    return true
  }

  getWorkshopBySlug(slug: string, monthFilter?: string): WorkshopSummary | null {
    const workshops = this.getWorkshopsList(monthFilter)
    const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9]/g, '')
    return (
      workshops.find(
        (w) =>
          w.slug === slug ||
          w.slug.replace(/[^a-z0-9]/g, '') === cleanSlug ||
          slugifyPartyName(w.workshopName) === slug ||
          w.workshopName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .includes(cleanSlug)
      ) || null
    )
  }

  recordWorkshopBill(params: RecordWorkshopJobInput): { entry: InventoryPurchaseEntry; workshop: WorkshopSummary } {
    const workshopName = params.workshopName.trim()
    const slug = slugifyPartyName(workshopName)
    const total = params.totalAmount ?? Math.round(params.quantity * params.rate)
    const saraAp = params.saraPayable ?? total
    const foiPaid = params.foiPaid || 0

    // 1. Update workshop ledger
    const storageKey = `${ACCOUNTS_KEYS.WORKSHOP_PREFIX}${slug}`
    const existingWs = this.getWorkshopBySlug(slug)
    const currentEntries: InventoryPurchaseEntry[] = existingWs ? [...existingWs.entries] : []

    const itemDesc = params.machineName
      ? `${params.jobDescription} (${params.machineName})`
      : params.jobDescription

    const newEntry: InventoryPurchaseEntry = {
      id: `ws-${slug}-${Date.now()}`,
      date: params.date,
      billNo: params.billNo || '',
      inwardNo: params.inwardNo || '',
      partyName: workshopName,
      itemDescription: itemDesc,
      machineCategory: 'PU',
      quantity: params.quantity,
      costPerItem: params.rate,
      totalPrice: total,
    }
    currentEntries.push(newEntry)
    if (this.isClient()) {
      accountsWrite(storageKey, currentEntries)
    }

    // 2. Update Workshops Synopsis Store
    const currentSynopsis = accountsRead<WorkshopSynopsisItem[]>(
      ACCOUNTS_KEYS.WORKSHOPS_STORE,
      accountsData.workshops.synopsis
    )
    const synIndex = currentSynopsis.findIndex(
      (s) => slugifyPartyName(s.workshopName) === slug || s.workshopName.toLowerCase() === workshopName.toLowerCase()
    )

    if (synIndex >= 0) {
      const syn = currentSynopsis[synIndex]
      currentSynopsis[synIndex] = {
        ...syn,
        saraPayable: (syn.saraPayable || 0) + saraAp,
        foiPayable: (syn.foiPayable || 0) + foiPaid,
        noOfBills: (syn.noOfBills || 0) + (params.billNo ? 1 : 0),
        remarks: params.remarks || syn.remarks || '',
      }
    } else {
      currentSynopsis.push({
        sNo: currentSynopsis.length + 1,
        noOfBills: 1,
        workshopName,
        saraPayable: saraAp,
        foiPayable: foiPaid,
        remarks: params.remarks || '',
      })
    }
    if (this.isClient()) {
      accountsWrite(ACCOUNTS_KEYS.WORKSHOPS_STORE, currentSynopsis)
    }

    // 3. Mirror into Daily Inward Expenses
    const dailyInward = accountsRead<DailyInwardItem[]>(
      ACCOUNTS_KEYS.DAILY_INWARD,
      accountsData.dailyExpense.inward
    )
    const newDailyItem: DailyInwardItem = {
      sNo: dailyInward.length + 1,
      date: params.date,
      billNo: params.billNo || '',
      inwardNo: params.inwardNo || '',
      partyName: workshopName,
      itemDescription: itemDesc,
      quantity: params.quantity,
      rate: params.rate,
      totalAmount: total,
      saraAp,
      foiCashCheque: foiPaid,
      balance: 0,
    }
    dailyInward.push(newDailyItem)
    if (this.isClient()) {
      accountsWrite(ACCOUNTS_KEYS.DAILY_INWARD, dailyInward)
      this.notifyDataChanged(params.date.slice(0, 7))
    }

    const updatedWorkshop = this.getWorkshopBySlug(slug) || {
      workshopName,
      slug,
      type: 'Workshop / Engineering',
      totalBills: 1,
      totalItems: params.quantity,
      totalPurchases: saraAp,
      paidAmount: foiPaid,
      currentBalance: saraAp - foiPaid,
      lastDate: params.date,
      remarks: params.remarks,
      entries: currentEntries,
    }

    return { entry: newEntry, workshop: updatedWorkshop }
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

  // ==========================================
  // COST STATEMENT — live Excel-style rollups
  // ==========================================

  getCostStatementOverrides(monthStr: string = '2026-08'): CostStatementOverrides {
    return accountsRead(`${STORAGE_KEY_COST_OVERRIDES}_${monthStr}`, {})
  }

  saveCostStatementOverrides(monthStr: string, overrides: CostStatementOverrides): void {
    if (!this.isClient()) return
    accountsWrite(`${STORAGE_KEY_COST_OVERRIDES}_${monthStr}`, overrides)
    this.notifyDataChanged(monthStr)
  }

  /** Store inventory lines from Inventory Control sheet (live edits) or seed data. */
  getStoreInventoryLines(monthStr: string = '2026-08'): StoreCostItem[] {
    const monthName = (() => {
      try {
        const [y, m] = monthStr.split('-').map(Number)
        return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long' })
      } catch {
        return 'August'
      }
    })()
    // Inventory page uses "Febraury" typo key — try both
    const candidates = [monthName, monthName === 'February' ? 'Febraury' : monthName]

    const storedMonths = accountsRead<Record<
      string,
      { items?: { itemDescription?: string; quantity?: number; totalPrice?: number }[] }
    > | null>(ACCOUNTS_KEYS.INVENTORY_CONTROL, null)
    if (storedMonths) {
      try {
        for (const key of candidates) {
          const sheet = storedMonths[key]
          if (sheet?.items?.length) {
            return sheet.items.slice(0, 12).map((it) => ({
              item: `${it.itemDescription || 'Item'}${it.quantity ? ` (${it.quantity} Pieces)` : ''}`,
              amount: Math.round(it.totalPrice || 0),
            }))
          }
        }
      } catch (err) {
        console.error(err)
      }
    }

    for (const key of candidates) {
      const sheet = accountsData.inventoryControl.months[key as keyof typeof accountsData.inventoryControl.months]
      if (sheet?.items?.length) {
        return sheet.items.slice(0, 12).map((it) => ({
          item: `${it.itemDescription}${it.quantity ? ` (${it.quantity} Pieces)` : ''}`,
          amount: Math.round(it.totalPrice || 0),
        }))
      }
    }

    return INITIAL_COST_STATEMENT_AUG_2026.storeInventoryDirect.map((s) => ({
      item: s.item,
      amount: s.amount,
    }))
  }

  /**
   * Build Cost Statement like linked Excel workbooks:
   * - Salaries / OT / Efficiency / Weavers / Helpers ← payrollService
   * - Contractors bills ← payroll contractors
   * - Petty cash ← accounts petty cash operational Cr
   * - Machinery / Electric / Repair ← traders & workshop ledgers
   * - Store inventory ← August inventory control (or purchases)
   * - Power, solar, admin, meters ← manual overrides (Excel-manual lines)
   */
  buildCostStatement(monthStr: string = '2026-08'): CostStatementModel {
    const staff = payrollService.getStaffSalaries(monthStr)
    const contract = payrollService.getContractSalaries(monthStr)
    const weavers1 = payrollService.getWeaversWages(monthStr, '1-15')
    const weavers2 = payrollService.getWeaversWages(monthStr, '16-31')
    const helpers1 = payrollService.getHelpersWages(monthStr, '1-15')
    const helpers2 = payrollService.getHelpersWages(monthStr, '16-31')
    const contractors1 = payrollService.getContractorsPayments(monthStr, '1-15')
    const contractors2 = payrollService.getContractorsPayments(monthStr, '16-31')

    const staffBasic = staff.reduce((s, st) => s + (st.basicSalary || 0), 0)
    const staffOt = staff.reduce((s, st) => s + (st.otAmount || 0), 0)
    const contractBasic = contract.reduce((s, c) => s + (c.basicSalary || 0), 0)
    const contractOt = contract.reduce((s, c) => s + (c.otAmount || 0), 0)
    const contractEff = contract.reduce((s, c) => s + (c.efficiencyAmount || 0), 0)

    const weaverWages =
      weavers1.reduce((s, w) => s + (w.grossAmount || 0), 0) +
      weavers2.reduce((s, w) => s + (w.grossAmount || 0), 0)
    const weaverHolidays =
      weavers1.reduce((s, w) => s + (w.holidayAmount || 0), 0) +
      weavers2.reduce((s, w) => s + (w.holidayAmount || 0), 0)
    const weaverEfficiency =
      weavers1.reduce((s, w) => s + (w.efficiencyAmount || 0), 0) +
      weavers2.reduce((s, w) => s + (w.efficiencyAmount || 0), 0)
    const helperWages =
      helpers1.reduce((s, h) => s + (h.netAmount || 0), 0) +
      helpers2.reduce((s, h) => s + (h.netAmount || 0), 0)

    // Merge contractor payments by name across fortnights
    const contractorMap = new Map<string, NamedCostItem>()
    ;[...contractors1, ...contractors2].forEach((c) => {
      const key = (c.name || '').trim().toLowerCase()
      if (!key) return
      const prev = contractorMap.get(key)
      if (prev) {
        prev.amount += Number(c.netPayment) || 0
      } else {
        contractorMap.set(key, {
          name: c.name,
          role: c.contractType || 'Contractor',
          amount: Number(c.netPayment) || 0,
        })
      }
    })
    const contractorsBills = Array.from(contractorMap.values()).sort((a, b) => b.amount - a.amount)

    const machineryParts: NamedCostItem[] = []
    const electricMaintenance: NamedCostItem[] = []
    const repairDetails: NamedCostItem[] = []
    this.getTradersList().forEach((t) => {
      const bucket = classifyTraderBucket(t.partyName, t.type)
      const row = { name: t.partyName, amount: Math.round(t.totalPurchases || 0) }
      if (bucket === 'electric') electricMaintenance.push(row)
      else if (bucket === 'repair') repairDetails.push(row)
      else machineryParts.push(row)
    })
    this.getWorkshopsList().forEach((w) => {
      if (w.totalPurchases > 0 || w.totalBills > 0) {
        repairDetails.push({ name: w.workshopName, amount: Math.round(w.totalPurchases || 0) })
      }
    })

    // Prefer live inventory control (localStorage) → August sheet → Excel defaults
    const storeInventory = this.getStoreInventoryLines(monthStr)

    const overrides = this.getCostStatementOverrides(monthStr)
    const baseManual = INITIAL_COST_STATEMENT_AUG_2026

    const model: CostStatementModel = {
      companyName: 'SARA TEXTILE',
      title: 'COST STATEMENT',
      period: overrides.period || monthTitle(monthStr),
      month: monthStr,
      salariesAndWages: {
        staffSalary: Math.round(staffBasic + contractBasic),
        staffOvertime: Math.round(staffOt + contractOt),
        contractEmployeeEfficiency: Math.round(contractEff),
        weaverWages: Math.round(weaverWages),
        weaverHolidays: Math.round(weaverHolidays),
        weaverEfficiency: Math.round(weaverEfficiency),
        helperWages: Math.round(helperWages),
      },
      contractorsBills:
        contractorsBills.length > 0
          ? contractorsBills
          : baseManual.contractorsBills.map((c) => ({ ...c })),
      powerAndLight: overrides.powerAndLight ?? baseManual.powerAndLight,
      vehicleFuel: overrides.vehicleFuel ?? baseManual.vehicleFuel,
      generatorFuel: overrides.generatorFuel ?? baseManual.generatorFuel,
      machineryParts: overrides.machineryParts ?? machineryParts,
      electricMaintenance: overrides.electricMaintenance ?? electricMaintenance,
      repairDetails: overrides.repairDetails ?? repairDetails,
      repairExpense: (overrides.repairDetails ?? repairDetails).reduce(
        (s, r) => s + (Number(r.amount) || 0),
        0
      ),
      storeInventory: overrides.storeInventory ?? storeInventory,
      waterSupplies: overrides.waterSupplies ?? baseManual.waterSupplies,
      pettyCash: this.getPettyCashOperationalOutflow(monthStr) || baseManual.pettyCashOutflow,
      guardSalary: overrides.guardSalary ?? baseManual.guardSalary,
      solarPanelSystem: overrides.solarPanelSystem ?? baseManual.solarPanelSystem,
      depreciationProduction:
        overrides.depreciationProduction ?? baseManual.depreciationProduction,
      adminExpenses: {
        ...baseManual.adminExpenses,
        ...(overrides.adminExpenses || {}),
      },
      monthlyProductionMeters:
        overrides.monthlyProductionMeters ?? baseManual.monthlyProductionMeters,
      derivedFrom: {
        salaries: 'payroll',
        contractors: 'payroll',
        pettyCash: 'accounts-petty-cash',
        traders: 'traders-ledgers',
      },
    }

    return model
  }

  /** Persist editable manual fields; salaries/contractors/petty stay live. */
  saveCostStatementModel(
    model: CostStatementModel,
    options: { persistTraderLists?: boolean } = {}
  ): void {
    const monthStr = model.month || '2026-08'
    const existing = this.getCostStatementOverrides(monthStr)
    const overrides: CostStatementOverrides = {
      ...existing,
      period: model.period,
      powerAndLight: model.powerAndLight,
      vehicleFuel: model.vehicleFuel,
      generatorFuel: model.generatorFuel,
      waterSupplies: model.waterSupplies,
      guardSalary: model.guardSalary,
      solarPanelSystem: model.solarPanelSystem,
      depreciationProduction: model.depreciationProduction,
      adminExpenses: model.adminExpenses,
      monthlyProductionMeters: model.monthlyProductionMeters,
    }
    // Only freeze trader/store lines when user explicitly edited them
    if (options.persistTraderLists) {
      overrides.machineryParts = model.machineryParts
      overrides.electricMaintenance = model.electricMaintenance
      overrides.repairDetails = model.repairDetails
      overrides.storeInventory = model.storeInventory
    }
    this.saveCostStatementOverrides(monthStr, overrides)

    // Legacy shape for any older readers
    const legacy: MonthlyCostStatement = {
      id: `cs-${monthStr}`,
      month: monthStr,
      monthTitle: model.period,
      salariesAndWages: model.salariesAndWages,
      contractorsBills: model.contractorsBills.map((c) => ({
        name: c.name,
        role: c.role || 'Contractor',
        amount: c.amount,
      })),
      powerAndLight: model.powerAndLight,
      vehicleFuel: model.vehicleFuel,
      generatorFuel: model.generatorFuel,
      waterSupplies: model.waterSupplies,
      pettyCashOutflow: model.pettyCash,
      guardSalary: model.guardSalary,
      solarPanelSystem: model.solarPanelSystem,
      depreciationProduction: model.depreciationProduction,
      storeInventoryDirect: model.storeInventory.map((s) => ({
        item: s.item,
        amount: s.amount,
      })),
      adminExpenses: model.adminExpenses,
      monthlyProductionMeters: model.monthlyProductionMeters,
    }
    this.saveCostStatement(legacy)
  }

  getCostStatement(monthStr: string = '2026-08'): MonthlyCostStatement {
    const stored = accountsRead<MonthlyCostStatement | null>(
      `${STORAGE_KEY_COST_STATEMENT}_${monthStr}`,
      null
    )
    if (stored) return stored
    const live = this.buildCostStatement(monthStr)
    return {
      id: `cs-${monthStr}`,
      month: monthStr,
      monthTitle: live.period,
      salariesAndWages: live.salariesAndWages,
      contractorsBills: live.contractorsBills.map((c) => ({
        name: c.name,
        role: c.role || 'Contractor',
        amount: c.amount,
      })),
      powerAndLight: live.powerAndLight,
      vehicleFuel: live.vehicleFuel,
      generatorFuel: live.generatorFuel,
      waterSupplies: live.waterSupplies,
      pettyCashOutflow: live.pettyCash,
      guardSalary: live.guardSalary,
      solarPanelSystem: live.solarPanelSystem,
      depreciationProduction: live.depreciationProduction,
      storeInventoryDirect: live.storeInventory,
      adminExpenses: live.adminExpenses,
      monthlyProductionMeters: live.monthlyProductionMeters,
    }
  }

  saveCostStatement(statement: MonthlyCostStatement): void {
    if (!this.isClient()) return
    accountsWrite(`${STORAGE_KEY_COST_STATEMENT}_${statement.month}`, statement)
    this.notifyDataChanged(statement.month)
  }

  resetCostStatement(monthStr: string = '2026-08'): CostStatementModel {
    if (this.isClient()) {
      accountsRemove(`${STORAGE_KEY_COST_OVERRIDES}_${monthStr}`)
      accountsRemove(`${STORAGE_KEY_COST_STATEMENT}_${monthStr}`)
      accountsRemove('sara_textile_cost_statement_editable_v1')
    }
    const model = this.buildCostStatement(monthStr)
    this.notifyDataChanged(monthStr)
    return model
  }
}

export const expenseService = new ExpenseService()

const MONTH_ORDER_MAP: Record<string, number> = {
  january: 1,
  february: 2,
  febraury: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
}

const MONTH_NUMBER_MAP: Record<string, string> = {
  january: '01',
  february: '02',
  febraury: '02',
  march: '03',
  april: '04',
  may: '05',
  june: '06',
  july: '07',
  august: '08',
  september: '09',
  october: '10',
  november: '11',
  december: '12',
}

export function getAccountsAvailableMonths(): string[] {
  const inventoryMonths = accountsRead<Record<string, unknown> | null>(
    ACCOUNTS_KEYS.INVENTORY_CONTROL,
    null
  )
  const defaultList = [
    'October',
    'September',
    'August',
    'July',
    'June',
    'May',
    'April',
    'March',
    'Febraury',
    'January',
  ]
  const keys = inventoryMonths ? Object.keys(inventoryMonths) : []
  const combined = Array.from(new Set([...keys, ...defaultList]))

  return combined.sort((a, b) => {
    const aClean = a.replace(/20\d{2}/, '').trim().toLowerCase()
    const bClean = b.replace(/20\d{2}/, '').trim().toLowerCase()
    const aOrder = MONTH_ORDER_MAP[aClean] || 99
    const bOrder = MONTH_ORDER_MAP[bClean] || 99
    return bOrder - aOrder
  })
}

export function getDefaultDateForMonth(monthStr: string): string {
  const now = new Date()
  const todayDay = String(now.getDate()).padStart(2, '0')
  const todayYear = String(now.getFullYear())

  if (!monthStr || monthStr === 'ALL') {
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    return `${todayYear}-${mm}-${todayDay}`
  }

  const isoMatch = monthStr.match(/^(\d{4})-(\d{2})/)
  if (isoMatch) {
    const year = isoMatch[1]
    const mm = isoMatch[2]
    const maxDays = new Date(Number(year), Number(mm), 0).getDate()
    const day = Math.min(now.getDate(), maxDays)
    return `${year}-${mm}-${String(day).padStart(2, '0')}`
  }

  const yearMatch = monthStr.match(/\b(20\d{2})\b/)
  const year = yearMatch ? yearMatch[1] : '2026'

  const cleanMonth = monthStr.replace(/20\d{2}/, '').trim().toLowerCase()
  const monthNum = MONTH_NUMBER_MAP[cleanMonth] || String(now.getMonth() + 1).padStart(2, '0')

  const maxDays = new Date(Number(year), Number(monthNum), 0).getDate()
  const day = Math.min(now.getDate(), maxDays)
  const dayStr = String(day).padStart(2, '0')

  return `${year}-${monthNum}-${dayStr}`
}
