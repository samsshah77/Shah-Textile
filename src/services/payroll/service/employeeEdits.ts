/** Add / update / resign / rejoin / move / delete employees. */
import { EmployeeProfile } from '@/types/payroll'
import {
  INITIAL_STAFF_SALARIES,
  INITIAL_ADVANCES,
  INITIAL_HELPERS_WAGES,
  INITIAL_WEAVERS_WAGES,
  INITIAL_CONTRACT_SALARIES,
  INITIAL_CONTRACTORS,
  INITIAL_EFFICIENCY_INCENTIVES,
  INITIAL_EMPLOYEES,
} from '@/data/payrollSeeds'
import { STORAGE_KEYS } from '@/services/payroll/payrollConstants'
import {
  hydrated,
  flushPayrollSaves,
  writeStore,
  writeStoreAndWait,
  readHrMetaRaw,
  rememberDeletedEmployee,
  clearDeletedEmployeeTombstone,
  hydratePayrollFromDb,
} from '@/services/payroll/payrollStorage'
import {
  parseResignationDateFromRemarks,
  todayIsoDate,
  namesMatch,
  inferEmployeeCategory,
  isGeneralWagesEmployee,
  findSmartInsertionIndex,
  findLinkedEmployee,
  sheetRowBelongsToDeletedEmployee,
} from '@/services/payroll/payrollCalculations'
import type { PayrollService } from '@/services/payrollService'

export const employeeEditMethods = {
  /**
   * Save the whole roster (General Wages page). People whose profile changed are carried
   * onto the sheets from the active salary month on (earlier months stay as they were).
   */
  saveEmployees(this: PayrollService, list: EmployeeProfile[], triggerSync: boolean = true): void {
    if (!this.isClient()) return
    const before = new Map(this.getEmployees().map((e) => [e.id, e]))
    writeStore(STORAGE_KEYS.EMPLOYEES, list)
    if (triggerSync) {
      const month = this.getActiveSalariedMonth()
      const strip = (e: EmployeeProfile) => JSON.stringify({ ...e, serialNo: 0 })
      const notes: string[] = []
      for (const emp of list) {
        const old = before.get(emp.id)
        if (old && strip(old) === strip(emp)) continue
        notes.push(...this.applyProfileToSheets(old || null, emp, month).warnings)
      }
      this.showProfileNotes(notes)
    }
    this.notifyDataChanged()
  },

  addEmployee(
    this: PayrollService,
    emp: Omit<EmployeeProfile, 'id' | 'serialNo' | 'ratePerDay31' | 'ratePerDay30' | 'ratePerHr30' | 'ratePerDay28'>,
    targetIndex?: number,
    targetMonth?: string
  ): EmployeeProfile {
    const month = targetMonth || this.getActiveSalariedMonth()
    const saved = this.insertNewProfile(emp, targetIndex, month)
    this.showProfileNotes(this.applyProfileToSheets(null, saved, month).warnings)
    this.notifyDataChanged(month)
    return saved
  },

  async addEmployeeAsync(
    this: PayrollService,
    emp: Omit<EmployeeProfile, 'id' | 'serialNo' | 'ratePerDay31' | 'ratePerDay30' | 'ratePerHr30' | 'ratePerDay28'>,
    targetIndex?: number,
    targetMonth?: string
  ): Promise<EmployeeProfile> {
    await hydratePayrollFromDb()
    const saved = this.addEmployee(emp, targetIndex, targetMonth)
    await flushPayrollSaves()
    return saved
  },

  /** Put a new profile into the roster (DOJ defaults to the 1st of the month it is added in). */
  insertNewProfile(
    this: PayrollService,
    emp: Omit<EmployeeProfile, 'id' | 'serialNo' | 'ratePerDay31' | 'ratePerDay30' | 'ratePerHr30' | 'ratePerDay28'>,
    targetIndex: number | undefined,
    month: string
  ): EmployeeProfile {
    // Re-hire after a permanent delete of the same name: allow the name again.
    clearDeletedEmployeeTombstone(undefined, emp.name)
    const list = this.getEmployees()
    const r2 = (n: number) => Math.round(n * 100) / 100
    const employeeCategory = inferEmployeeCategory(emp)
    const newEmp: EmployeeProfile = {
      ...emp,
      id: `emp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      serialNo: 0,
      ratePerDay31: r2(emp.salary / 31),
      ratePerDay30: r2(emp.salary / 30),
      ratePerHr30: r2(emp.salary / (30 * (emp.dutyHrs || 8))),
      ratePerDay28: r2(emp.salary / 28),
      doj: emp.doj || (/^\d{4}-\d{2}$/.test(month) ? `${month}-01` : todayIsoDate()),
      status: emp.status || 'Active',
      employeeCategory,
    }
    const insertIdx =
      targetIndex !== undefined
        ? Math.max(0, Math.min(targetIndex, list.length))
        : findSmartInsertionIndex(list, emp.designation, employeeCategory)
    list.splice(insertIdx, 0, newEmp)
    const renumbered = list.map((item, idx) => ({ ...item, serialNo: idx + 1 }))
    writeStore(STORAGE_KEYS.EMPLOYEES, renumbered)
    return renumbered[insertIdx]
  },

  /**
   * Profile values after an edit, and the person as the sheets of `targetMonth` should see
   * them. Editing an older month changes that month's pay on the sheets but keeps the
   * profile's current pay.
   */
  mergeProfileEdit(
    this: PayrollService,
    current: EmployeeProfile,
    updatedFields: Partial<EmployeeProfile>,
    targetMonth?: string
  ): { merged: EmployeeProfile; sheetEmp: EmployeeProfile } {
    const writePayToProfile = this.shouldWritePayOntoProfile(targetMonth)
    const r2 = (n: number) => Math.round(n * 100) / 100
    const salary = updatedFields.salary !== undefined && writePayToProfile ? Number(updatedFields.salary) : current.salary
    const dutyHrs = updatedFields.dutyHrs !== undefined ? Number(updatedFields.dutyHrs) : current.dutyHrs
    const explicitDaily =
      writePayToProfile && updatedFields.ratePerDay30 != null && Number(updatedFields.ratePerDay30) > 0
        ? Number(updatedFields.ratePerDay30)
        : null

    const nextStatus = updatedFields.status ?? current.status ?? 'Active'
    let resignedAt = updatedFields.resignedAt !== undefined ? updatedFields.resignedAt : current.resignedAt
    if (nextStatus === 'Resigned') {
      resignedAt = resignedAt || parseResignationDateFromRemarks(updatedFields.remarks ?? current.remarks) || todayIsoDate()
    } else if (updatedFields.status && updatedFields.status !== 'Resigned') {
      resignedAt = undefined
    }

    const merged: EmployeeProfile = {
      ...current,
      ...updatedFields,
      salary,
      dutyHrs,
      ratePerDay31: writePayToProfile ? (explicitDaily ?? r2(salary / 31)) : current.ratePerDay31,
      ratePerDay30: writePayToProfile ? (explicitDaily ?? r2(salary / 30)) : current.ratePerDay30,
      ratePerHr30: writePayToProfile ? r2(salary / (30 * (dutyHrs || 8))) : current.ratePerHr30,
      ratePerDay28: writePayToProfile ? (explicitDaily ?? r2(salary / 28)) : current.ratePerDay28,
      status: nextStatus,
      resignedAt,
    }
    merged.employeeCategory = inferEmployeeCategory(merged)

    const sheetDaily =
      updatedFields.ratePerDay30 != null && Number(updatedFields.ratePerDay30) > 0 ? Number(updatedFields.ratePerDay30) : null
    const sheetEmp: EmployeeProfile = {
      ...merged,
      salary: updatedFields.salary !== undefined ? Number(updatedFields.salary) : current.salary,
      ratePerDay30: sheetDaily ?? merged.ratePerDay30,
      ratePerDay31: sheetDaily ?? merged.ratePerDay31,
      ratePerDay28: sheetDaily ?? merged.ratePerDay28,
    }
    return { merged, sheetEmp }
  },

  updateEmployee(
    this: PayrollService,
    id: string,
    updatedFields: Partial<EmployeeProfile>,
    targetMonth?: string
  ): EmployeeProfile | null {
    const list = this.getEmployees()
    const idx = list.findIndex((e) => e.id === id)
    if (idx === -1) return null
    const current = list[idx]
    const { merged, sheetEmp } = this.mergeProfileEdit(current, updatedFields, targetMonth)
    list[idx] = merged
    writeStore(STORAGE_KEYS.EMPLOYEES, list)
    const month = targetMonth || this.getActiveSalariedMonth()
    this.showProfileNotes(this.applyProfileToSheets(current, sheetEmp, month).warnings)
    this.notifyDataChanged(targetMonth)
    return merged
  },

  async updateEmployeeAsync(
    this: PayrollService,
    id: string,
    updatedFields: Partial<EmployeeProfile>,
    targetMonth?: string
  ): Promise<EmployeeProfile | null> {
    await hydratePayrollFromDb()
    const merged = this.updateEmployee(id, updatedFields, targetMonth)
    // Profile + every sheet change go to the server together, in one save.
    await flushPayrollSaves()
    return merged
  },

  /** Tell the user about rows that were kept on purpose (data already entered). */
  showProfileNotes(this: PayrollService, notes: string[]): void {
    const unique = [...new Set(notes)]
    if (!unique.length || !this.isClient()) return
    try {
      window.dispatchEvent(
        new CustomEvent('payroll:save-problem', {
          detail: { status: 200, message: unique.slice(0, 4).join(' ') + (unique.length > 4 ? ` (+${unique.length - 4} aur)` : '') },
        })
      )
    } catch {
      // ignore
    }
  },

  rejoinEmployee(this: PayrollService, id: string, newDoj?: string): EmployeeProfile | null {
    const doj = newDoj || todayIsoDate()
    return this.updateEmployee(id, {
      status: 'Active',
      resignedAt: undefined,
      doj,
      remarks: `Re-joined ${doj}`,
    })
  },

  resignEmployee(this: PayrollService, id: string, resignedAt?: string, remarks?: string): EmployeeProfile | null {
    const dateStr = resignedAt || todayIsoDate()
    return this.updateEmployee(id, {
      status: 'Resigned',
      resignedAt: dateStr,
      remarks: remarks || `Resigned ${dateStr}`,
    })
  },

  /** Move a profile up/down within optional scope (e.g. General Wages list). */
  moveEmployee(this: PayrollService, id: string, direction: 'up' | 'down', scopeIds?: string[]): EmployeeProfile[] {
    let list = [...this.getEmployees()].sort((a, b) => a.serialNo - b.serialNo)

    if (scopeIds?.length) {
      const scopeSet = new Set(scopeIds)
      const scoped = list.filter((e) => scopeSet.has(e.id))
      const others = list.filter((e) => !scopeSet.has(e.id))
      const scopeIdx = scoped.findIndex((e) => e.id === id)
      const swapIdx = direction === 'up' ? scopeIdx - 1 : scopeIdx + 1
      if (scopeIdx < 0 || swapIdx < 0 || swapIdx >= scoped.length) return list
      ;[scoped[scopeIdx], scoped[swapIdx]] = [scoped[swapIdx], scoped[scopeIdx]]
      const renumberedScope = scoped.map((e, i) => ({ ...e, serialNo: i + 1 }))
      const startOther = renumberedScope.length + 1
      const renumberedOthers = others.map((e, i) => ({ ...e, serialNo: startOther + i }))
      list = [...renumberedScope, ...renumberedOthers]
      this.saveEmployees(list, false)
      return list
    }

    const idx = list.findIndex((e) => e.id === id)
    if (idx < 0) return list
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= list.length) return list
    ;[list[idx], list[swapIdx]] = [list[swapIdx], list[idx]]
    list = list.map((e, n) => ({ ...e, serialNo: n + 1 }))
    this.saveEmployees(list, false)
    return list
  },

  /** Force General Wages rows to continuous 1..n (gaps from resigned/filter). */
  renumberGeneralWages(this: PayrollService): EmployeeProfile[] {
    // Never persist renumber before DB hydrate — that queues seed roster and can wipe months.
    if (this.isClient() && !hydrated) {
      return this.getEmployees()
    }
    const list = [...this.getEmployees()].sort((a, b) => a.serialNo - b.serialNo)
    const gw = list.filter((e) => isGeneralWagesEmployee(e))
    const others = list.filter((e) => !isGeneralWagesEmployee(e))
    const needsFix = gw.some((e, i) => e.serialNo !== i + 1)
    if (!needsFix && gw.length > 0) {
      const lastGw = gw[gw.length - 1]?.serialNo || 0
      const othersOk = others.every((e, i) => e.serialNo === lastGw + 1 + i)
      if (othersOk) return list
    }
    if (!needsFix && gw.length === 0) return list
    const renumberedGw = gw.map((e, i) => ({ ...e, serialNo: i + 1 }))
    const startOther = renumberedGw.length + 1
    const renumberedOthers = others.map((e, i) => ({ ...e, serialNo: startOther + i }))
    const next = [...renumberedGw, ...renumberedOthers]
    this.saveEmployees(next, false)
    return next
  },

  deleteEmployee(this: PayrollService, id: string): void {
    const list = this.getEmployees()
    const target = list.find((e) => e.id === id)
    if (!target) return
    if ((target.status || 'Active') !== 'Resigned') {
      throw new Error('Sirf Resigned profile delete ho sakti hai. Pehle Resign karein.')
    }
    rememberDeletedEmployee(target)
    const remaining = list.filter((e) => e.id !== id)
    writeStore(STORAGE_KEYS.EMPLOYEES, remaining)
    this.removeLinkedPayrollRows(target)
    this.renumberGeneralWages()
    this.notifyDataChanged()
  },

  async deleteEmployeeAsync(this: PayrollService, id: string): Promise<void> {
    await hydratePayrollFromDb()
    const list = this.getEmployees()
    const target = list.find((e) => e.id === id)
    if (!target) return
    if ((target.status || 'Active') !== 'Resigned') {
      throw new Error('Sirf Resigned profile delete ho sakti hai. Pehle Resign karein.')
    }
    rememberDeletedEmployee(target)
    const remaining = list.filter((e) => e.id !== id)
    await writeStoreAndWait(STORAGE_KEYS.EMPLOYEES, remaining)
    this.removeLinkedPayrollRows(target)
    this.renumberGeneralWages()
    // Persist tombstone + purged sheets before refresh can re-seed.
    await writeStoreAndWait(STORAGE_KEYS.HR_META, readHrMetaRaw())
    this.notifyDataChanged()
  },

  /**
   * Permanently remove a person from Weaver/Helper wage sheet (+ profile if linked).
   * Stops repairMissingFortnight from putting them back at the table end.
   */
  deleteWageSheetPerson(
    this: PayrollService,
    kind: 'weaver' | 'helper',
    row: { id?: string; employeeId?: string; employeeName?: string; designation?: string }
  ): Promise<void> {
    return this.deleteWageSheetPersonAsync(kind, row)
  },

  async deleteWageSheetPersonAsync(
    this: PayrollService,
    kind: 'weaver' | 'helper',
    row: { id?: string; employeeId?: string; employeeName?: string; designation?: string }
  ): Promise<void> {
    if (!this.canWrite()) return
    const roster = this.getEmployees()
    const linked =
      findLinkedEmployee(roster, row.employeeName, row.designation, row.employeeId) ||
      (!row.employeeId && row.employeeName
        ? roster.find((e) => namesMatch(e.name, row.employeeName))
        : undefined)

    const stub: EmployeeProfile = linked || {
      id: row.employeeId || `tombstone-${Date.now()}`,
      serialNo: 0,
      name: row.employeeName || '',
      fatherName: '',
      cnic: '',
      phone: '',
      address: '',
      designation: row.designation || (kind === 'weaver' ? 'Weaver' : 'Helper'),
      department: '',
      employeeCategory: kind === 'weaver' ? 'Weaver' : 'Helper',
      dutyHrs: 12,
      shiftFromTo: '',
      salary: 0,
      ratePerDay31: 0,
      ratePerDay30: 0,
      ratePerHr30: 0,
      ratePerDay28: 0,
      doj: '',
      contractStatus: 'Daily Wage',
      status: 'Resigned',
    }

    rememberDeletedEmployee(stub)
    if (linked) {
      writeStore(
        STORAGE_KEYS.EMPLOYEES,
        roster.filter((e) => e.id !== linked.id)
      )
    }
    this.removeLinkedPayrollRows(stub)
    this.notifyDataChanged()
    // Tombstone + roster must reach Postgres before a refresh, warna GET dobara seed se daal deta hai.
    await writeStoreAndWait(STORAGE_KEYS.HR_META, readHrMetaRaw())
    if (linked) {
      await writeStoreAndWait(
        STORAGE_KEYS.EMPLOYEES,
        this.readStore(STORAGE_KEYS.EMPLOYEES, INITIAL_EMPLOYEES)
      )
    }
  },

  removeLinkedPayrollRows(this: PayrollService, emp: EmployeeProfile): void {
    // Emp is already off the roster — match by id/name directly (not live canonical).
    const unlink = (name?: string, designation?: string, employeeId?: string) =>
      sheetRowBelongsToDeletedEmployee(emp, name, designation, employeeId)

    const staff = this.readStore(STORAGE_KEYS.STAFF, INITIAL_STAFF_SALARIES).filter(
      (row) => !unlink(row.employeeName, row.designation, row.employeeId)
    )
    this.saveStaffSalaries(staff, false)

    const contract = this.readStore(STORAGE_KEYS.CONTRACT, INITIAL_CONTRACT_SALARIES).filter(
      (row) => !unlink(row.employeeName, row.designation, row.employeeId)
    )
    this.saveContractSalaries(contract, false)

    const advances = this.readStore(STORAGE_KEYS.ADVANCES, INITIAL_ADVANCES).filter(
      (row) => !unlink(row.employeeName, row.designation, row.employeeId)
    )
    this.saveAdvances(advances, false)

    const efficiency = this.readStore(STORAGE_KEYS.EFFICIENCY, INITIAL_EFFICIENCY_INCENTIVES).filter(
      (row) => !unlink(row.name, row.designation, row.employeeId)
    )
    this.saveEfficiencyIncentives(efficiency, false)

    const weavers = this.readStore(STORAGE_KEYS.WEAVERS, INITIAL_WEAVERS_WAGES).filter(
      (row) => !unlink(row.employeeName, row.designation, row.employeeId)
    )
    this.saveWeaversWages(weavers, false)

    const helpers = this.readStore(STORAGE_KEYS.HELPERS, INITIAL_HELPERS_WAGES).filter(
      (row) => !unlink(row.employeeName, row.designation, row.employeeId)
    )
    this.saveHelpersWages(helpers, false)

    const contractors = this.readStore(STORAGE_KEYS.CONTRACTORS, INITIAL_CONTRACTORS).filter(
      (row) => !unlink(row.name, row.contractType, row.employeeId)
    )
    this.saveContractorsPayments(contractors, false)
  },

}

export type EmployeeEditMethods = typeof employeeEditMethods
