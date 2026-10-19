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
  writeStore,
  writeStoreAndWait,
  readHrMetaRaw,
  rememberDeletedEmployee,
  clearDeletedEmployeeTombstone,
  hydratePayrollFromDb,
} from '@/services/payroll/payrollStorage'
import {
  parseResignationDateFromRemarks,
  joiningMonth,
  employeeBelongsInMonth,
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
  saveEmployees(this: PayrollService, list: EmployeeProfile[], triggerSync: boolean = true): void {
    if (!this.isClient()) return

    writeStore(STORAGE_KEYS.EMPLOYEES, list)

    if (triggerSync) {
      this.syncMasterRoster(list, this.getActiveSalariedMonth())
    } else {
      this.notifyDataChanged()
    }
  },

  addEmployee(
    this: PayrollService,
    emp: Omit<EmployeeProfile, 'id' | 'serialNo' | 'ratePerDay31' | 'ratePerDay30' | 'ratePerHr30' | 'ratePerDay28'>,
    targetIndex?: number
  ): EmployeeProfile {
    // Re-hire after permanent delete — clear name tombstone so one fresh profile shows.
    clearDeletedEmployeeTombstone(undefined, emp.name)
    const list = this.getEmployees()
    const ratePerDay31 = Math.round((emp.salary / 31) * 100) / 100
    const ratePerDay30 = Math.round((emp.salary / 30) * 100) / 100
    const ratePerHr30 = Math.round((emp.salary / (30 * (emp.dutyHrs || 8))) * 100) / 100
    const ratePerDay28 = Math.round((emp.salary / 28) * 100) / 100
    const employeeCategory = inferEmployeeCategory(emp)

    const newEmp: EmployeeProfile = {
      ...emp,
      id: `emp-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      serialNo: 0,
      ratePerDay31,
      ratePerDay30,
      ratePerHr30,
      ratePerDay28,
      status: emp.status || 'Active',
      employeeCategory,
    }

    const insertIdx =
      targetIndex !== undefined
        ? Math.max(0, Math.min(targetIndex, list.length))
        : findSmartInsertionIndex(list, emp.designation, employeeCategory)

    list.splice(insertIdx, 0, newEmp)
    const renumbered = list.map((item, idx) => ({ ...item, serialNo: idx + 1 }))
    this.saveEmployees(renumbered, false)
    const saved = renumbered[insertIdx]
    const activeMonth = this.getActiveSalariedMonth()
    this.placeOnDailyWageSheets(saved, activeMonth)
    this.placeOnSalariedSheets(saved, activeMonth)
    this.alignEfficiencyToProfiles(activeMonth, [saved], true)
    this.purgeJoinerFromPastMonths(saved)
    this.notifyDataChanged()
    return saved
  },

  async addEmployeeAsync(
    this: PayrollService,
    emp: Omit<EmployeeProfile, 'id' | 'serialNo' | 'ratePerDay31' | 'ratePerDay30' | 'ratePerHr30' | 'ratePerDay28'>,
    targetIndex?: number,
    targetMonth?: string
  ): Promise<EmployeeProfile> {
    clearDeletedEmployeeTombstone(undefined, emp.name)
    const list = this.getEmployees()
    const ratePerDay31 = Math.round((emp.salary / 31) * 100) / 100
    const ratePerDay30 = Math.round((emp.salary / 30) * 100) / 100
    const ratePerHr30 = Math.round((emp.salary / (30 * (emp.dutyHrs || 8))) * 100) / 100
    const ratePerDay28 = Math.round((emp.salary / 28) * 100) / 100
    const employeeCategory = inferEmployeeCategory(emp)

    // If registering for a target month without DOJ, pin DOJ to that month so past sheets stay clean.
    const pinnedDoj =
      emp.doj ||
      (targetMonth && /^\d{4}-\d{2}$/.test(targetMonth) ? `${targetMonth}-01` : '') ||
      todayIsoDate()

    const newEmp: EmployeeProfile = {
      ...emp,
      id: `emp-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      serialNo: 0,
      ratePerDay31,
      ratePerDay30,
      ratePerHr30,
      ratePerDay28,
      doj: pinnedDoj,
      status: emp.status || 'Active',
      employeeCategory,
    }

    const insertIdx =
      targetIndex !== undefined
        ? Math.max(0, Math.min(targetIndex, list.length))
        : findSmartInsertionIndex(list, emp.designation, employeeCategory)

    list.splice(insertIdx, 0, newEmp)
    const renumbered = list.map((item, idx) => ({ ...item, serialNo: idx + 1 }))
    await writeStoreAndWait(STORAGE_KEYS.EMPLOYEES, renumbered)
    const saved = renumbered[insertIdx]
    const activeMonth = targetMonth || this.getActiveSalariedMonth()
    this.placeOnDailyWageSheets(saved, activeMonth)
    this.placeOnSalariedSheets(saved, activeMonth)
    this.alignEfficiencyToProfiles(activeMonth, [saved], true)
    this.purgeJoinerFromPastMonths(saved)
    this.notifyDataChanged(targetMonth)
    return saved
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
    const writePayToProfile = this.shouldWritePayOntoProfile(targetMonth)
    const salary =
      updatedFields.salary !== undefined && writePayToProfile
        ? Number(updatedFields.salary)
        : current.salary
    const dutyHrs = updatedFields.dutyHrs !== undefined ? Number(updatedFields.dutyHrs) : current.dutyHrs

    const explicitDaily =
      writePayToProfile &&
      updatedFields.ratePerDay30 != null &&
      Number(updatedFields.ratePerDay30) > 0
        ? Number(updatedFields.ratePerDay30)
        : null
    const ratePerDay31 = writePayToProfile
      ? (explicitDaily ?? Math.round((salary / 31) * 100) / 100)
      : current.ratePerDay31
    const ratePerDay30 = writePayToProfile
      ? (explicitDaily ?? Math.round((salary / 30) * 100) / 100)
      : current.ratePerDay30
    const ratePerHr30 = writePayToProfile
      ? Math.round((salary / (30 * (dutyHrs || 8))) * 100) / 100
      : current.ratePerHr30
    const ratePerDay28 = writePayToProfile
      ? (explicitDaily ?? Math.round((salary / 28) * 100) / 100)
      : current.ratePerDay28

    const nextStatus = updatedFields.status ?? current.status ?? 'Active'
    let resignedAt = updatedFields.resignedAt !== undefined ? updatedFields.resignedAt : current.resignedAt
    if (nextStatus === 'Resigned') {
      resignedAt =
        resignedAt ||
        parseResignationDateFromRemarks(updatedFields.remarks ?? current.remarks) ||
        todayIsoDate()
    } else if (updatedFields.status && updatedFields.status !== 'Resigned') {
      resignedAt = undefined
    }

    // Sheet sync always sees the pay values intended for targetMonth (even if profile keeps current rate).
    const sheetPaySalary =
      updatedFields.salary !== undefined ? Number(updatedFields.salary) : current.salary
    const sheetPayDaily =
      updatedFields.ratePerDay30 != null && Number(updatedFields.ratePerDay30) > 0
        ? Number(updatedFields.ratePerDay30)
        : null

    const merged: EmployeeProfile = {
      ...current,
      ...updatedFields,
      salary,
      dutyHrs,
      ratePerDay31,
      ratePerDay30,
      ratePerHr30,
      ratePerDay28,
      status: nextStatus,
      resignedAt,
    }
    merged.employeeCategory = inferEmployeeCategory(merged)

    const syncEmp: EmployeeProfile = {
      ...merged,
      salary: sheetPaySalary,
      ratePerDay30: sheetPayDaily ?? merged.ratePerDay30,
      ratePerDay31: sheetPayDaily ?? merged.ratePerDay31,
      ratePerDay28: sheetPayDaily ?? merged.ratePerDay28,
      overtimeRate: updatedFields.overtimeRate ?? merged.overtimeRate,
      overtimeShifts: updatedFields.overtimeShifts ?? merged.overtimeShifts,
    }

    list[idx] = merged
    this.profileAliases.set(id, current.name)
    writeStore(STORAGE_KEYS.EMPLOYEES, list)
    this.syncSingleEmployeeAcrossSheets(current, syncEmp, targetMonth)
    this.profileAliases.delete(id)

    if (nextStatus === 'Resigned') {
      this.purgeResignedFromFutureMonths(merged)
    }
    // User edits DOJ on profile → drop from earlier month tables, keep on join month onward.
    if (joiningMonth(merged)) {
      this.purgeJoinerFromPastMonths(merged)
    }
    const placeMonth = targetMonth || this.getActiveSalariedMonth()
    if (employeeBelongsInMonth(merged, placeMonth)) {
      this.placeOnDailyWageSheets(merged, placeMonth)
      this.placeContractorOnCycle(merged)
      this.placeOnSalariedSheets(merged, placeMonth)
      this.alignEfficiencyToProfiles(placeMonth, [merged], true)
    }
    this.notifyDataChanged(targetMonth)
    return merged
  },

  async updateEmployeeAsync(
    this: PayrollService,
    id: string,
    updatedFields: Partial<EmployeeProfile>,
    targetMonth?: string
  ): Promise<EmployeeProfile | null> {
    const list = this.getEmployees()
    const idx = list.findIndex((e) => e.id === id)
    if (idx === -1) return null

    const current = list[idx]
    const writePayToProfile = this.shouldWritePayOntoProfile(targetMonth)
    const salary =
      updatedFields.salary !== undefined && writePayToProfile
        ? Number(updatedFields.salary)
        : current.salary
    const dutyHrs = updatedFields.dutyHrs !== undefined ? Number(updatedFields.dutyHrs) : current.dutyHrs

    const explicitDaily =
      writePayToProfile &&
      updatedFields.ratePerDay30 != null &&
      Number(updatedFields.ratePerDay30) > 0
        ? Number(updatedFields.ratePerDay30)
        : null
    const ratePerDay31 = writePayToProfile
      ? (explicitDaily ?? Math.round((salary / 31) * 100) / 100)
      : current.ratePerDay31
    const ratePerDay30 = writePayToProfile
      ? (explicitDaily ?? Math.round((salary / 30) * 100) / 100)
      : current.ratePerDay30
    const ratePerHr30 = writePayToProfile
      ? Math.round((salary / (30 * (dutyHrs || 8))) * 100) / 100
      : current.ratePerHr30
    const ratePerDay28 = writePayToProfile
      ? (explicitDaily ?? Math.round((salary / 28) * 100) / 100)
      : current.ratePerDay28

    const nextStatus = updatedFields.status ?? current.status ?? 'Active'
    let resignedAt = updatedFields.resignedAt !== undefined ? updatedFields.resignedAt : current.resignedAt
    if (nextStatus === 'Resigned') {
      resignedAt =
        resignedAt ||
        parseResignationDateFromRemarks(updatedFields.remarks ?? current.remarks) ||
        todayIsoDate()
    } else if (updatedFields.status && updatedFields.status !== 'Resigned') {
      resignedAt = undefined
    }

    const sheetPaySalary =
      updatedFields.salary !== undefined ? Number(updatedFields.salary) : current.salary
    const sheetPayDaily =
      updatedFields.ratePerDay30 != null && Number(updatedFields.ratePerDay30) > 0
        ? Number(updatedFields.ratePerDay30)
        : null

    const merged: EmployeeProfile = {
      ...current,
      ...updatedFields,
      salary,
      dutyHrs,
      ratePerDay31,
      ratePerDay30,
      ratePerHr30,
      ratePerDay28,
      status: nextStatus,
      resignedAt,
    }
    merged.employeeCategory = inferEmployeeCategory(merged)

    const syncEmp: EmployeeProfile = {
      ...merged,
      salary: sheetPaySalary,
      ratePerDay30: sheetPayDaily ?? merged.ratePerDay30,
      ratePerDay31: sheetPayDaily ?? merged.ratePerDay31,
      ratePerDay28: sheetPayDaily ?? merged.ratePerDay28,
      overtimeRate: updatedFields.overtimeRate ?? merged.overtimeRate,
      overtimeShifts: updatedFields.overtimeShifts ?? merged.overtimeShifts,
    }

    list[idx] = merged
    this.profileAliases.set(id, current.name)
    await writeStoreAndWait(STORAGE_KEYS.EMPLOYEES, list)
    await this.syncSingleEmployeeAcrossSheetsAsync(current, syncEmp, targetMonth)
    this.profileAliases.delete(id)

    if (nextStatus === 'Resigned') {
      this.purgeResignedFromFutureMonths(merged)
    }
    // User edits DOJ on profile → drop from earlier month tables, keep on join month onward.
    if (joiningMonth(merged)) {
      this.purgeJoinerFromPastMonths(merged)
    }
    const placeMonth = targetMonth || this.getActiveSalariedMonth()
    if (employeeBelongsInMonth(merged, placeMonth)) {
      this.placeOnDailyWageSheets(merged, placeMonth)
      this.placeContractorOnCycle(merged)
      this.placeOnSalariedSheets(merged, placeMonth)
      this.alignEfficiencyToProfiles(placeMonth, [merged], true)
    }
    this.notifyDataChanged(targetMonth)
    return merged
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
      (row.employeeName
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

  // Sheet 1 master → every sheet that already has the same person
  syncEmployeeProfileUpdate(this: PayrollService, emp: EmployeeProfile, month?: string): void {
    this.syncMasterRoster(
      this.getEmployees().map((row) => (row.id === emp.id ? emp : row)),
      month || this.getActiveSalariedMonth()
    )
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
