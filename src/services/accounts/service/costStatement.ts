/** Monthly cost statement: build from the month's data, overrides, save / reset. */
import { accountsData } from '@/data/accountsData'
import { payrollService } from '@/services/payrollService'
import { accountsRead, accountsRemove, accountsWrite } from '@/services/accountsStore'
import { ACCOUNTS_KEYS } from '@/lib/accountsKeys'
import {
  INITIAL_COST_STATEMENT_AUG_2026,
  classifyTraderBucket,
  monthTitle,
} from '@/services/accounts/expenseSeeds'
import type {
  CostStatementOverrides,
  StoreCostItem,
  CostStatementModel,
  NamedCostItem,
  MonthlyCostStatement,
} from '@/services/accounts/expenseTypes'
import {
  STORAGE_KEY_COST_STATEMENT,
  STORAGE_KEY_COST_OVERRIDES,
} from '@/services/accounts/expenseKeys'
import type { ExpenseService } from '@/services/expenseService'

export const costStatementMethods = {
  // ==========================================
  // COST STATEMENT — live Excel-style rollups
  // ==========================================

  getCostStatementOverrides(this: ExpenseService, monthStr: string = '2026-08'): CostStatementOverrides {
    return accountsRead(`${STORAGE_KEY_COST_OVERRIDES}_${monthStr}`, {})
  },

  saveCostStatementOverrides(this: ExpenseService, monthStr: string, overrides: CostStatementOverrides): void {
    if (!this.isClient()) return
    accountsWrite(`${STORAGE_KEY_COST_OVERRIDES}_${monthStr}`, overrides)
    this.notifyDataChanged(monthStr)
  },

  /** Store inventory lines from Inventory Control sheet (live edits) or seed data. */
  getStoreInventoryLines(this: ExpenseService, monthStr: string = '2026-08'): StoreCostItem[] {
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
  },

  /**
   * Build Cost Statement like linked Excel workbooks:
   * - Salaries / OT / Efficiency / Weavers / Helpers ← payrollService
   * - Contractors bills ← payroll contractors
   * - Petty cash ← accounts petty cash operational Cr
   * - Machinery / Electric / Repair ← traders & workshop ledgers
   * - Store inventory ← August inventory control (or purchases)
   * - Power, solar, admin, meters ← manual overrides (Excel-manual lines)
   */
  buildCostStatement(this: ExpenseService, monthStr: string = '2026-08'): CostStatementModel {
    const staff = payrollService.getStaffSalaries(monthStr)
    const contract = payrollService.getContractSalaries(monthStr)
    const weavers1 = payrollService.getWeaversWages(monthStr, '1-15')
    const weavers2 = payrollService.getWeaversWages(monthStr, '16-31')
    const helpers1 = payrollService.getHelpersWages(monthStr, '1-15')
    const helpers2 = payrollService.getHelpersWages(monthStr, '16-31')
    const contractors1 = payrollService.getContractorsPayments(monthStr, '1-15')
    // Monthly contractors (1–30/31) are paid with the second half.
    const contractors2 = [
      ...payrollService.getContractorsPayments(monthStr, '16-31'),
      ...payrollService.getContractorsPayments(monthStr, '1-31'),
    ]

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
  },

  /** Persist editable manual fields; salaries/contractors/petty stay live. */
  saveCostStatementModel(
    this: ExpenseService,
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
  },

  getCostStatement(this: ExpenseService, monthStr: string = '2026-08'): MonthlyCostStatement {
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
  },

  saveCostStatement(this: ExpenseService, statement: MonthlyCostStatement): void {
    if (!this.isClient()) return
    accountsWrite(`${STORAGE_KEY_COST_STATEMENT}_${statement.month}`, statement)
    this.notifyDataChanged(statement.month)
  },

  resetCostStatement(this: ExpenseService, monthStr: string = '2026-08'): CostStatementModel {
    if (this.isClient()) {
      accountsRemove(`${STORAGE_KEY_COST_OVERRIDES}_${monthStr}`)
      accountsRemove(`${STORAGE_KEY_COST_STATEMENT}_${monthStr}`)
      accountsRemove('sara_textile_cost_statement_editable_v1')
    }
    const model = this.buildCostStatement(monthStr)
    this.notifyDataChanged(monthStr)
    return model
  },

}

export type CostStatementMethods = typeof costStatementMethods
