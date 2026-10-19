/** Shapes used by traders, workshops and the monthly cost statement. */
import { InventoryPurchaseEntry, MachineExpenseCategory } from '@/types/expense'

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
