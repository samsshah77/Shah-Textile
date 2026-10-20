/** Petty cash register, synopsis totals and month lists. */
import { FortnightSynopsis, MonthlyGrandSalarySynopsis, PettyCashRecord } from '@/types/payroll'
import { INITIAL_HELPERS_WAGES, INITIAL_CONTRACTORS, INITIAL_PETTY_CASH } from '@/data/payrollSeeds'
import { STORAGE_KEYS } from '@/services/payroll/payrollConstants'
import {
  writeStore,
  writeStoreAndWait,
  readHrMetaRaw,
  writeHrMeta,
  hydratePayrollFromDb,
  defaultPettyCashInflow,
  pettyCashInflowMetaKey,
} from '@/services/payroll/payrollStorage'
import { buildFortnightSynopsis, buildMonthlyGrandSummary } from '@/services/payroll/payrollReports'
import type { PayrollService } from '@/services/payrollService'

export const pettyCashSynopsisMethods = {
  // ==========================================
  // DYNAMIC SYNOPSIS & ROLLUPS (EXACT EXCEL LIVE MATH)
  // ==========================================

  /** Petty Cash Transfer Inflow — editable by accountant; defaults 86,930 / 86,570. */
  getPettyCashInflow(this: PayrollService, month: string, fortnight: '1-15' | '16-31'): number {
    const key = pettyCashInflowMetaKey(month, fortnight)
    const raw = readHrMetaRaw()
    const override = raw.pettyCashInflowOverrides?.[key]
    if (typeof override === 'number' && Number.isFinite(override)) return Math.round(override)
    return defaultPettyCashInflow(fortnight)
  },

  setPettyCashInflow(this: PayrollService, month: string, fortnight: '1-15' | '16-31', amount: number): void {
    const key = pettyCashInflowMetaKey(month, fortnight)
    const n = Math.max(0, Math.round(Number(amount) || 0))
    const raw = readHrMetaRaw()
    writeHrMeta({
      categories: raw.categories || [],
      designations: raw.designations || [],
      activeSalariedMonth: raw.activeSalariedMonth,
      activeFortnightMonth: raw.activeFortnightMonth,
      activeFortnight: raw.activeFortnight,
      pettyCashInflowOverrides: {
        ...(raw.pettyCashInflowOverrides || {}),
        [key]: n,
      },
    })
    this.notifyDataChanged(month)
  },

  async setPettyCashInflowAsync(
    this: PayrollService,
    month: string,
    fortnight: '1-15' | '16-31',
    amount: number
  ): Promise<boolean> {
    const key = pettyCashInflowMetaKey(month, fortnight)
    const n = Math.max(0, Math.round(Number(amount) || 0))
    await hydratePayrollFromDb()
    const raw = readHrMetaRaw()
    const meta = {
      categories: raw.categories || [],
      designations: raw.designations || [],
      activeSalariedMonth: raw.activeSalariedMonth,
      activeFortnightMonth: raw.activeFortnightMonth,
      activeFortnight: raw.activeFortnight,
      pettyCashInflowOverrides: {
        ...(raw.pettyCashInflowOverrides || {}),
        [key]: n,
      },
    }
    const ok = await writeStoreAndWait(STORAGE_KEYS.HR_META, meta)
    this.notifyDataChanged(month)
    return ok
  },

  getFortnightSynopsis(this: PayrollService, month: string = '2026-08', fortnight: '1-15' | '16-31'): FortnightSynopsis {
    return buildFortnightSynopsis(month, fortnight, this)
  },

  getMonthlyGrandSummary(this: PayrollService, month: string = '2026-08'): MonthlyGrandSalarySynopsis {
    return buildMonthlyGrandSummary(month, this)
  },

  listHelpersMonths(this: PayrollService): string[] {
    const months = new Set<string>(this.listPayrollMonths())
    for (const row of this.readStore(STORAGE_KEYS.HELPERS, INITIAL_HELPERS_WAGES)) {
      if (row.month) months.add(row.month)
    }
    return [...months].sort()
  },

  /** Months that have Contractor rows (independent of Weaver active period). */
  listContractorsMonths(this: PayrollService): string[] {
    const months = new Set<string>(this.listPayrollMonths())
    for (const row of this.readStore(STORAGE_KEYS.CONTRACTORS, INITIAL_CONTRACTORS)) {
      if (row.month) months.add(row.month)
    }
    return [...months].sort()
  },

  // Petty Cash Register (Sheets 13 & 20) — own month list, not Weaver-driven
  listPettyCashMonths(this: PayrollService): string[] {
    const months = new Set<string>(this.listPayrollMonths())
    for (const row of this.readStore(STORAGE_KEYS.PETTY_CASH, INITIAL_PETTY_CASH)) {
      if (row.month) months.add(row.month)
    }
    return [...months].sort()
  },

  getPettyCashEntries(this: PayrollService, month: string = '2026-08', fortnight: '1-15' | '16-31'): PettyCashRecord[] {
    const list = this.readStore(STORAGE_KEYS.PETTY_CASH, INITIAL_PETTY_CASH)
    return list.filter(
      (e) => (e.month || '2026-08') === month && e.fortnight === fortnight
    )
  },

  savePettyCashEntries(
    this: PayrollService,
    monthOrList: string | PettyCashRecord[],
    fortnightOrList?: string | PettyCashRecord[],
    list?: PettyCashRecord[]
  ): void {
    if (!this.isClient()) return

    let next: PettyCashRecord[]
    if (Array.isArray(monthOrList)) {
      next = monthOrList
    } else if (typeof fortnightOrList === 'string' && Array.isArray(list)) {
      next = this.mergeMonthOrFortnightRows(
        this.readStore(STORAGE_KEYS.PETTY_CASH, INITIAL_PETTY_CASH),
        list,
        monthOrList,
        fortnightOrList
      )
    } else if (Array.isArray(fortnightOrList)) {
      next = this.mergeMonthOrFortnightRows(
        this.readStore(STORAGE_KEYS.PETTY_CASH, INITIAL_PETTY_CASH),
        fortnightOrList,
        monthOrList
      )
    } else {
      next = list || []
    }

    writeStore(STORAGE_KEYS.PETTY_CASH, next)
    this.notifyDataChanged()
  },

}

export type PettyCashSynopsisMethods = typeof pettyCashSynopsisMethods
