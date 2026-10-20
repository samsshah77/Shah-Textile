/** Salary Synopsis totals (petty cash comes from Accounts) and month lists. */
import { FortnightSynopsis, MonthlyGrandSalarySynopsis } from '@/types/payroll'
import { INITIAL_HELPERS_WAGES, INITIAL_CONTRACTORS } from '@/data/payrollSeeds'
import { STORAGE_KEYS } from '@/services/payroll/payrollConstants'
import {
  isMonthLocked,
  readHrMetaRaw,
  defaultPettyCashInflow,
  pettyCashInflowMetaKey,
} from '@/services/payroll/payrollStorage'
import { buildFortnightSynopsis, buildMonthlyGrandSummary } from '@/services/payroll/payrollReports'
import type { PayrollService } from '@/services/payrollService'

/** Cash put into petty cash per fortnight, read from Accounts › Petty Cash ("Cash in"). */
const accountsInflow = new Map<string, number>()
const accountsInflowLoaded = new Set<string>()

export const pettyCashSynopsisMethods = {
  // ==========================================
  // DYNAMIC SYNOPSIS & ROLLUPS (EXACT EXCEL LIVE MATH)
  // ==========================================

  /**
   * "Petty Cash Transfer Inflow" on the salary Synopsis. Petty cash lives in Accounts only:
   * the amount is the total of that fortnight's "Cash in" entries there. A locked salary
   * month keeps the value it had (typed earlier, or the old default) so closed months
   * never change.
   */
  getPettyCashInflow(this: PayrollService, month: string, fortnight: '1-15' | '16-31'): number {
    const legacy = () => {
      const override = readHrMetaRaw().pettyCashInflowOverrides?.[pettyCashInflowMetaKey(month, fortnight)]
      return typeof override === 'number' && Number.isFinite(override) ? Math.round(override) : defaultPettyCashInflow(fortnight)
    }
    if (isMonthLocked(month)) return legacy()
    return accountsInflow.get(`${month}|${fortnight}`) ?? 0
  },

  /** Load the Accounts petty cash "Cash in" totals of `month` (call before showing the Synopsis). */
  async loadPettyCashInflow(this: PayrollService, month: string, force = false): Promise<void> {
    if (!this.isClient() || !/^\d{4}-\d{2}$/.test(month)) return
    if (!force && accountsInflowLoaded.has(month)) return
    try {
      const res = await fetch(`/api/accounts/petty-cash?month=${month}`, { credentials: 'include', cache: 'no-store' })
      const data = (await res.json().catch(() => null)) as {
        statement?: { entries?: Array<{ date: string; kind: string; debit: number }> }
      } | null
      if (!res.ok || !data?.statement) return
      let first = 0
      let second = 0
      for (const e of data.statement.entries || []) {
        if (e.kind !== 'CASH_IN') continue
        const day = Number(String(e.date).slice(8, 10)) || 1
        if (day <= 15) first += Number(e.debit) || 0
        else second += Number(e.debit) || 0
      }
      accountsInflow.set(`${month}|1-15`, Math.round(first))
      accountsInflow.set(`${month}|16-31`, Math.round(second))
      accountsInflowLoaded.add(month)
    } catch (err) {
      console.error('[payroll] petty cash from Accounts not loaded', err)
    }
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

  getFortnightSynopsis(this: PayrollService, month: string = '2026-08', fortnight: '1-15' | '16-31'): FortnightSynopsis {
    return buildFortnightSynopsis(month, fortnight, this)
  },

}

export type PettyCashSynopsisMethods = typeof pettyCashSynopsisMethods
