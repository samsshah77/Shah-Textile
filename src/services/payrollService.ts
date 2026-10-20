// src/services/payrollService.ts
import {
  EmployeeProfile,
  AdvanceRecord,
  StaffSalaryRecord,
  ContractSalaryRecord,
  EfficiencyIncentiveRecord,
  WeaverWageRecord,
  HelperWageRecord,
  ContractorPaymentRecord,
} from '@/types/payroll'

import {
  INITIAL_STAFF_SALARIES,
  INITIAL_ADVANCES,
  INITIAL_HELPERS_WAGES,
  INITIAL_WEAVERS_WAGES,
  INITIAL_CONTRACT_SALARIES,
  INITIAL_CONTRACTORS,
  INITIAL_EMPLOYEES,
  getPayrollSeedStore,
} from '@/data/payrollSeeds'

export { getPayrollSeedStore }

// Re-export constants, storage, calculations, reports, and cycle generators
export * from './payroll/payrollConstants'
export * from './payroll/payrollStorage'
export * from './payroll/payrollCalculations'
export * from './payroll/payrollReports'
export * from './payroll/payrollCycles'

import {
  STORAGE_KEYS,
  DEFAULT_HR_CATEGORIES,
  DEFAULT_HR_DESIGNATIONS,
} from './payroll/payrollConstants'

import {
  allowServerSheetWrite,
  isPayrollClient,
  readStore,
  writeStoreAndWait,
  readHrMetaRaw,
  writeHrMeta,
  isTombstonedEmployee,
  advancePersonMonthKey,
  hydratePayrollFromDb,
} from './payroll/payrollStorage'

import {
  sheetMonthKey,
  isActiveEmployee,
  resolveResignedAt,
  employeeBelongsInMonth,
  namesMatch,
  findLinkedEmployee,
  calculateStaffSalaryRow,
  calculateContractSalaryRow,
  calculateEfficiencyRow,
  calculateWeaverWageRow,
  calculateHelperWageRow,
  calculateContractorPaymentRow,
} from './payroll/payrollCalculations'


import {
  rosterPlacementMethods,
  type RosterPlacementMethods,
} from '@/services/payroll/service/rosterPlacement'
import {
  monthGenerationMethods,
  type MonthGenerationMethods,
} from '@/services/payroll/service/monthGeneration'
import {
  rosterRepairMethods,
  type RosterRepairMethods,
} from '@/services/payroll/service/rosterRepairs'
import {
  employeeEditMethods,
  type EmployeeEditMethods,
} from '@/services/payroll/service/employeeEdits'
import {
  employeeSyncMethods,
  type EmployeeSyncMethods,
} from '@/services/payroll/service/employeeSync'
import { sheetStoreMethods, type SheetStoreMethods } from '@/services/payroll/service/sheetStore'
import {
  pettyCashSynopsisMethods,
  type PettyCashSynopsisMethods,
} from '@/services/payroll/service/pettyCashAndSynopsis'
import { lockSlipMethods, type LockSlipMethods } from '@/services/payroll/service/locksAndSlips'

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- methods are attached below (see end of file)
export class PayrollService {
  /** Previous name, so a renamed person still matches their wage-sheet row. */
  profileAliases = new Map<string, string>()

  isClient(): boolean {
    return isPayrollClient()
  }

  canWrite(): boolean {
    return this.isClient() || allowServerSheetWrite
  }

  readStore<T>(key: string, fallback: T[]): T[] {
    return readStore(key, fallback)
  }

  // ==========================================
  // FORMULA CALCULATION UTILITIES (LIVE EXCEL MATH)
  // ==========================================

  calculateStaffSalaryRow(
    row: Partial<StaffSalaryRecord>,
    daysInMonth = 30,
    matchedEmp?: EmployeeProfile
  ): StaffSalaryRecord {
    const emp =
      matchedEmp ||
      findLinkedEmployee(
        this.getEmployees(),
        row.employeeName,
        row.designation,
        row.employeeId
      )
    return calculateStaffSalaryRow(row, daysInMonth, this.getActiveSalariedMonth(), emp)
  }

  calculateContractSalaryRow(
    row: Partial<ContractSalaryRecord>,
    daysInMonth = 30,
    matchedEmp?: EmployeeProfile
  ): ContractSalaryRecord {
    const emp =
      matchedEmp ||
      findLinkedEmployee(
        this.getEmployees(),
        row.employeeName,
        row.designation,
        row.employeeId
      )
    return calculateContractSalaryRow(row, daysInMonth, this.getActiveSalariedMonth(), emp)
  }

  calculateEfficiencyRow(row: Partial<EfficiencyIncentiveRecord>): EfficiencyIncentiveRecord {
    return calculateEfficiencyRow(row)
  }

  calculateWeaverWageRow(row: Partial<WeaverWageRecord>): WeaverWageRecord {
    return calculateWeaverWageRow(row)
  }

  calculateHelperWageRow(row: Partial<HelperWageRecord>): HelperWageRecord {
    return calculateHelperWageRow(row)
  }

  calculateContractorPaymentRow(row: Partial<ContractorPaymentRecord>): ContractorPaymentRecord {
    return calculateContractorPaymentRow(row)
  }

  notifyDataChanged(month?: string): void {
    if (this.isClient()) {
      try {
        window.dispatchEvent(new CustomEvent('payroll_synced', { detail: { month } }))
      } catch (err) {
        console.error('Error dispatching payroll sync event', err)
      }
    }
  }

  // ==========================================
  // LOCAL STORAGE GETTERS & PERSISTENCE
  // ==========================================

  /** HR roster (permanently deleted people hidden). Reading never changes stored data. */
  getEmployees(): EmployeeProfile[] {
    const list = this.readStore(STORAGE_KEYS.EMPLOYEES, INITIAL_EMPLOYEES)
    return list.filter((e) => !isTombstonedEmployee(e.id, e.name))
  }

  listPayrollMonths(): string[] {
    const months = new Set<string>(['2026-08'])
    for (const row of this.readStore(STORAGE_KEYS.STAFF, INITIAL_STAFF_SALARIES)) {
      if (row.month) months.add(row.month)
    }
    for (const row of this.readStore(STORAGE_KEYS.CONTRACT, INITIAL_CONTRACT_SALARIES)) {
      if (row.month) months.add(row.month)
    }
    return [...months].sort()
  }

  /** Shared month for General Wages → Staff / Company Contract sheets. */
  getActiveSalariedMonth(): string {
    const meta = readHrMetaRaw()
    const saved = (meta.activeSalariedMonth || '').trim()
    const months = this.listPayrollMonths()
    // Trust saved meta even if sheet rows have not hydrated yet (mirror / race).
    if (saved && /^\d{4}-\d{2}$/.test(saved)) {
      if (months.includes(saved) || months.length <= 1) return saved
      // Prefer saved if it is the newest or still listed
      if (saved >= months[months.length - 1]) return saved
      if (months.includes(saved)) return saved
      return saved
    }
    return months[months.length - 1] || '2026-08'
  }

  setActiveSalariedMonth(month: string): void {
    const m = (month || '').trim()
    if (!/^\d{4}-\d{2}$/.test(m)) return
    const raw = readHrMetaRaw()
    writeHrMeta({
      categories: raw.categories || [],
      designations: raw.designations || [],
      activeSalariedMonth: m,
      activeFortnightMonth: raw.activeFortnightMonth,
      activeFortnight: raw.activeFortnight,
    })
    this.notifyDataChanged(m)
  }

  async setActiveSalariedMonthAsync(month: string): Promise<boolean> {
    const m = (month || '').trim()
    if (!/^\d{4}-\d{2}$/.test(m)) return false
    await hydratePayrollFromDb()
    const raw = readHrMetaRaw()
    const meta = {
      categories: raw.categories || [],
      designations: raw.designations || [],
      activeSalariedMonth: m,
      activeFortnightMonth: raw.activeFortnightMonth,
      activeFortnight: raw.activeFortnight,
      pettyCashInflowOverrides: raw.pettyCashInflowOverrides,
    }
    const ok = await writeStoreAndWait(STORAGE_KEYS.HR_META, meta)
    this.notifyDataChanged(m)
    return ok
  }

  /** Shared Weaver/Helper/Contractor fortnight period. */
  getActiveFortnightPeriod(): { month: string; fortnight: '1-15' | '16-31' } {
    const meta = readHrMetaRaw()
    const months = this.listFortnightMonths()
    const savedMonth = (meta.activeFortnightMonth || '').trim()
    const month =
      savedMonth && months.includes(savedMonth) ? savedMonth : months[months.length - 1] || '2026-08'
    const fortnight: '1-15' | '16-31' =
      meta.activeFortnight === '16-31' || meta.activeFortnight === '1-15'
        ? meta.activeFortnight
        : '1-15'
    return { month, fortnight }
  }

  listFortnightMonths(): string[] {
    const months = new Set<string>(['2026-08'])
    const fortnightSources: Array<[string, { month?: string }[]]> = [
      [STORAGE_KEYS.WEAVERS, INITIAL_WEAVERS_WAGES],
      [STORAGE_KEYS.HELPERS, INITIAL_HELPERS_WAGES],
      [STORAGE_KEYS.CONTRACTORS, INITIAL_CONTRACTORS],
    ]
    for (const [storeKey, fallback] of fortnightSources) {
      const rows = this.readStore(storeKey, fallback)
      for (const row of rows) {
        if (row.month) months.add(row.month)
      }
    }
    return [...months].sort()
  }

  /**
   * Fortnight halves that already have generated sheet rows for a month.
   * Always includes active half so the filter never goes empty.
   */
  listAvailableFortnightsForMonth(month: string): Array<'1-15' | '16-31'> {
    const m = (month || '').trim()
    const found = new Set<'1-15' | '16-31'>()
    const sources: Array<[string, { month?: string; fortnight?: string }[]]> = [
      [STORAGE_KEYS.WEAVERS, INITIAL_WEAVERS_WAGES],
      [STORAGE_KEYS.HELPERS, INITIAL_HELPERS_WAGES],
      [STORAGE_KEYS.CONTRACTORS, INITIAL_CONTRACTORS],
    ]
    for (const [storeKey, fallback] of sources) {
      const rows = this.readStore(storeKey, fallback)
      for (const row of rows) {
        if ((row.month || '') !== m) continue
        const fn = row.fortnight === '16-31' ? '16-31' : '1-15'
        found.add(fn)
      }
    }
    if (found.size === 0) {
      const active = this.getActiveFortnightPeriod()
      if (active.month === m) found.add(active.fortnight)
      else found.add('1-15')
    }
    return (['1-15', '16-31'] as const).filter((fn) => found.has(fn))
  }

  async setActiveFortnightPeriodAsync(
    month: string,
    fortnight: '1-15' | '16-31'
  ): Promise<boolean> {
    const m = (month || '').trim()
    if (!/^\d{4}-\d{2}$/.test(m)) return false
    if (fortnight !== '1-15' && fortnight !== '16-31') return false
    await hydratePayrollFromDb()
    const raw = readHrMetaRaw()
    const meta = {
      categories: raw.categories || [],
      designations: raw.designations || [],
      activeSalariedMonth: raw.activeSalariedMonth,
      activeFortnightMonth: m,
      activeFortnight: fortnight,
      pettyCashInflowOverrides: raw.pettyCashInflowOverrides,
    }
    const ok = await writeStoreAndWait(STORAGE_KEYS.HR_META, meta)
    this.notifyDataChanged(m)
    return ok
  }

  /** Working roster only — excludes Resigned (for Profiles / General Wages / new month seed). */
  getActiveEmployees(): EmployeeProfile[] {
    return this.getEmployees().filter(isActiveEmployee)
  }

  getResignedEmployees(): EmployeeProfile[] {
    return this.getEmployees()
      .filter((e) => (e.status || 'Active') === 'Resigned')
      .sort((a, b) => resolveResignedAt(b).localeCompare(resolveResignedAt(a)))
  }

  /** Staff marked Advance-eligible in HR Profiles (active only). */
  getAdvanceEligibleEmployees(): EmployeeProfile[] {
    return this.getActiveEmployees().filter((e) => Boolean(e.advanceEligible || e.advance))
  }

  getHrMeta(): { categories: string[]; designations: string[] } {
    const fromRoster = this.getEmployees()
    const rosterCats = [
      ...new Set(fromRoster.map((e) => e.employeeCategory || 'Staff').filter(Boolean)),
    ]
    const rosterDesigs = [...new Set(fromRoster.map((e) => e.designation).filter(Boolean))]
    const custom = readHrMetaRaw()
    const categories = [
      ...new Set([...DEFAULT_HR_CATEGORIES, ...rosterCats, ...(custom.categories || [])]),
    ].sort((a, b) => a.localeCompare(b))
    const designations = [
      ...new Set([...DEFAULT_HR_DESIGNATIONS, ...rosterDesigs, ...(custom.designations || [])]),
    ].sort((a, b) => a.localeCompare(b))
    return { categories, designations }
  }

  addHrCategory(label: string): void {
    const name = label.trim()
    if (!name || !this.isClient()) return
    const raw = readHrMetaRaw()
    const custom: { categories: string[]; designations: string[] } = {
      categories: [],
      designations: [],
      ...raw,
    }
    if (!custom.categories.includes(name)) custom.categories.push(name)
    writeHrMeta(custom)
  }

  addHrDesignation(label: string): void {
    const name = label.trim()
    if (!name || !this.isClient()) return
    const raw = readHrMetaRaw()
    const custom: { categories: string[]; designations: string[] } = {
      categories: [],
      designations: [],
      ...raw,
    }
    if (!custom.designations.includes(name)) custom.designations.push(name)
    writeHrMeta(custom)
  }

  filterRowsForMonth<
    T extends {
      employeeName?: string
      name?: string
      designation?: string
      employeeId?: string
      contractType?: string
      fortnight?: string
      serialNo?: number | null
    }
  >(
    rows: T[],
    month: string,
    nameKey: 'employeeName' | 'name' = 'employeeName',
    _fortnight?: string
  ): T[] {
    const roster = this.getEmployees()
    const filtered = rows.filter((row) => {
      const rowName = nameKey === 'name' ? row.name : row.employeeName
      // Permanently deleted people must not reappear at the end of wage sheets.
      if (isTombstonedEmployee(row.employeeId, rowName)) return false
      // Prefer id / Active on duplicate names (new Dawood vs resigned Dawood).
      // No naive roster.find name fallback — that bound rows to the wrong namesake.
      const emp = findLinkedEmployee(
        roster,
        rowName,
        row.designation || row.contractType,
        row.employeeId
      )
      // Day>15 / resign-day hide ONLY on real fortnight sheets (1-15 / 16-31).
      const rowFortnight =
        row.fortnight === '1-15' || row.fortnight === '16-31' ? row.fortnight : undefined
      return employeeBelongsInMonth(emp, month, rowFortnight)
    })
    return filtered.map((row, idx) =>
      row.serialNo !== undefined && row.serialNo !== null ? { ...row, serialNo: idx + 1 } : row
    )
  }

  /**
   * Profile.salary is the "current going rate" (newest / active month).
   * Editing an older month must update that month's sheet only — not clobber profile pay.
   */
  shouldWritePayOntoProfile(targetMonth?: string): boolean {
    const target = sheetMonthKey(targetMonth || this.getActiveSalariedMonth())
    const months = this.listPayrollMonths()
    const latest = months[months.length - 1] || target
    const active = this.getActiveSalariedMonth()
    return target === latest || target === active || target >= latest
  }

  renumberByMonth<T extends { month?: string; serialNo?: number }>(list: T[]): T[] {
    const groups = new Map<string, T[]>()
    for (const row of list) {
      const m = sheetMonthKey(row.month)
      const g = groups.get(m) || []
      g.push(row)
      groups.set(m, g)
    }
    const out: T[] = []
    for (const [, rows] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      rows
        .sort((a, b) => (Number(a.serialNo) || 0) - (Number(b.serialNo) || 0))
        .forEach((row, i) => out.push({ ...row, serialNo: i + 1 }))
    }
    return out
  }

  renumberByMonthFortnight<
    T extends { month?: string; fortnight?: string; serialNo?: number },
  >(list: T[]): T[] {
    const groups = new Map<string, T[]>()
    for (const row of list) {
      const key = `${sheetMonthKey(row.month)}|${row.fortnight || '1-15'}`
      const g = groups.get(key) || []
      g.push(row)
      groups.set(key, g)
    }
    const out: T[] = []
    for (const [, rows] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      rows
        .sort((a, b) => (Number(a.serialNo) || 0) - (Number(b.serialNo) || 0))
        .forEach((row, i) => out.push({ ...row, serialNo: i + 1 }))
    }
    return out
  }

  /** True if this person already has an advance row in the month (blocks double entry). */
  hasAdvanceForEmployee(
    month: string,
    employeeId?: string,
    employeeName?: string
  ): AdvanceRecord | undefined {
    const key = advancePersonMonthKey({ month, employeeId, employeeName })
    if (!key) return undefined
    return this.readStore(STORAGE_KEYS.ADVANCES, INITIAL_ADVANCES).find(
      (a) => advancePersonMonthKey(a) === key
    )
  }

  rowMatchesPerson(
    employeeNameOrId: string,
    rowName?: string,
    rowDesignation?: string,
    rowEmployeeId?: string,
    roster?: EmployeeProfile[]
  ): boolean {
    if (rowEmployeeId && rowEmployeeId === employeeNameOrId) return true
    if (namesMatch(rowName, employeeNameOrId)) return true
    const employees = roster || this.getEmployees()
    const emp =
      employees.find((e) => e.id === employeeNameOrId) ||
      findLinkedEmployee(employees, employeeNameOrId, rowDesignation)
    if (!emp) return false
    return Boolean(findLinkedEmployee([emp], rowName, rowDesignation, rowEmployeeId))
  }

  mergeMonthOrFortnightRows<T extends { month?: string; fortnight?: string }>(
    existing: T[],
    incoming: T[],
    month?: string,
    fortnight?: string
  ): T[] {
    if (!month) return incoming
    if (fortnight && fortnight !== 'all') {
      return [
        ...existing.filter(
          (row) => (row.month || '2026-08') !== month || (row.fortnight || '1-15') !== fortnight
        ),
        ...incoming,
      ]
    }
    return [...existing.filter((row) => (row.month || '2026-08') !== month), ...incoming]
  }
}

// Methods live in ./payroll/service/* and are attached here, so callers keep using payrollService.X().
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface PayrollService extends RosterPlacementMethods, MonthGenerationMethods, RosterRepairMethods, EmployeeEditMethods, EmployeeSyncMethods, SheetStoreMethods, PettyCashSynopsisMethods, LockSlipMethods {}
Object.assign(PayrollService.prototype, rosterPlacementMethods, monthGenerationMethods, rosterRepairMethods, employeeEditMethods, employeeSyncMethods, sheetStoreMethods, pettyCashSynopsisMethods, lockSlipMethods)

export const payrollService = new PayrollService()
