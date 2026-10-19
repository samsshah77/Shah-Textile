/** August 2026 starting data from the Excel files, plus small naming helpers. */
import { InventoryPurchaseEntry, PettyCashEntry, MachineExpenseCategory } from '@/types/expense'
import { accountsData } from '@/data/accountsData'
import type { TraderSummary, MonthlyCostStatement } from '@/services/accounts/expenseTypes'

export function monthTitle(month: string): string {
  try {
    const [y, m] = month.split('-').map(Number)
    const label = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    return `For The Month of ${label}`
  } catch {
    return accountsData.costStatement.period || `For The Month of ${month}`
  }
}

export function classifyTraderBucket(
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
export const INITIAL_PETTY_CASH: PettyCashEntry[] = accountsData.dailyExpense.pettyCash.map((item, idx) => ({
  id: `pc-${item.sNo || idx + 1}`,
  date: item.date || '2026-08-01',
  description: item.description,
  debitAmount: item.debit || 0,
  creditAmount: item.credit || 0,
  balance: item.balance || 0,
}))

// Map the authentic August 2026 Daily Inward items (60 line items) from the Excel file
export const INITIAL_INVENTORY_PURCHASES: InventoryPurchaseEntry[] = accountsData.dailyExpense.inward.map((item, idx) => {
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
export const INITIAL_COST_STATEMENT_AUG_2026: MonthlyCostStatement = {
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
