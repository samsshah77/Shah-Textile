import {
  InventoryPurchaseEntry,
  PettyCashEntry,
  MachineExpenseCategory,
} from '@/types/expense'
import {
  accountsData,
} from '@/data/accountsData'
import { payrollService } from '@/services/payrollService'

const STORAGE_KEY_PETTY_CASH = 'sara_textile_petty_cash_v4'
const STORAGE_KEY_INVENTORY_PURCHASE = 'sara_textile_inventory_purchase_v4'
const STORAGE_KEY_COST_STATEMENT = 'sara_textile_cost_statement_v5'
const STORAGE_KEY_COST_OVERRIDES = 'sara_textile_cost_statement_overrides_v1'

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
      this.notifyDataChanged()
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
      this.notifyDataChanged()
    }
    return newRecord
  }

  getTradersList(): TraderSummary[] {
    const traders: TraderSummary[] = accountsData.traders.ledgers.map((t) => {
      const syn = accountsData.traders.synopsis.find(
        (s) =>
          s.traderName.toLowerCase() === t.partyName.toLowerCase() ||
          t.partyName.toLowerCase().startsWith(s.traderName.toLowerCase().slice(0, 5))
      )
      const totalPurchases = syn ? syn.saraPayable : t.totalPayable
      const totalItems = t.items.reduce((sum, item) => sum + (item.quantity || 1), 0)
      const uniqueBills = syn
        ? syn.noOfBills
        : t.billsCount || new Set(t.items.map((i) => i.billNo).filter(Boolean)).size

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

    accountsData.workshops.ledgers.forEach((w) => {
      const syn = accountsData.workshops.synopsis.find(
        (s) => s.workshopName.toLowerCase() === w.workshopName.toLowerCase()
      )
      const totalPurchases = syn ? syn.saraPayable : w.totalPayable
      const totalItems = w.items.reduce((sum, item) => sum + (item.quantity || 1), 0)
      const uniqueBills = syn
        ? syn.noOfBills
        : w.billsCount || new Set(w.items.map((i) => i.billNo).filter(Boolean)).size

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

  getMonthlyPurchasesSummary(): {
    month: string
    totalAmount: number
    totalEntries: number
    uniqueParties: number
    entries: InventoryPurchaseEntry[]
  }[] {
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

  // ==========================================
  // COST STATEMENT — live Excel-style rollups
  // ==========================================

  getCostStatementOverrides(monthStr: string = '2026-08'): CostStatementOverrides {
    if (this.isClient()) {
      try {
        const stored = localStorage.getItem(`${STORAGE_KEY_COST_OVERRIDES}_${monthStr}`)
        if (stored) return JSON.parse(stored)
      } catch (err) {
        console.error(err)
      }
    }
    return {}
  }

  saveCostStatementOverrides(monthStr: string, overrides: CostStatementOverrides): void {
    if (!this.isClient()) return
    localStorage.setItem(`${STORAGE_KEY_COST_OVERRIDES}_${monthStr}`, JSON.stringify(overrides))
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

    if (this.isClient()) {
      try {
        const stored = localStorage.getItem('sara_textile_inventory_control_v2')
        if (stored) {
          const months = JSON.parse(stored) as Record<
            string,
            { items?: { itemDescription?: string; quantity?: number; totalPrice?: number }[] }
          >
          for (const key of candidates) {
            const sheet = months[key]
            if (sheet?.items?.length) {
              return sheet.items.slice(0, 12).map((it) => ({
                item: `${it.itemDescription || 'Item'}${it.quantity ? ` (${it.quantity} Pieces)` : ''}`,
                amount: Math.round(it.totalPrice || 0),
              }))
            }
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
    if (this.isClient()) {
      try {
        const stored = localStorage.getItem(`${STORAGE_KEY_COST_STATEMENT}_${monthStr}`)
        if (stored) return JSON.parse(stored)
      } catch (err) {
        console.error(err)
      }
    }
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
    if (this.isClient()) {
      localStorage.setItem(
        `${STORAGE_KEY_COST_STATEMENT}_${statement.month}`,
        JSON.stringify(statement)
      )
      this.notifyDataChanged(statement.month)
    }
  }

  resetCostStatement(monthStr: string = '2026-08'): CostStatementModel {
    if (this.isClient()) {
      localStorage.removeItem(`${STORAGE_KEY_COST_OVERRIDES}_${monthStr}`)
      localStorage.removeItem(`${STORAGE_KEY_COST_STATEMENT}_${monthStr}`)
      localStorage.removeItem('sara_textile_cost_statement_editable_v1')
    }
    const model = this.buildCostStatement(monthStr)
    this.notifyDataChanged(monthStr)
    return model
  }
}

export const expenseService = new ExpenseService()
