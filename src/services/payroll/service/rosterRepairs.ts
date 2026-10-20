/**
 * Keep a person's sheet rows inside their working dates: no rows before the joining month,
 * none after resigning. Run when a profile is saved (never on page load).
 */
import { EmployeeProfile } from '@/types/payroll'
import {
  INITIAL_STAFF_SALARIES,
  INITIAL_ADVANCES,
  INITIAL_HELPERS_WAGES,
  INITIAL_WEAVERS_WAGES,
  INITIAL_CONTRACT_SALARIES,
  INITIAL_CONTRACTORS,
  INITIAL_EFFICIENCY_INCENTIVES,
} from '@/data/payrollSeeds'
import { STORAGE_KEYS } from '@/services/payroll/payrollConstants'
import {
} from '@/services/payroll/payrollStorage'
import {
  sheetMonthKey,
  resignedMonth,
  joiningMonth,
  employeeBelongsInMonth,
  todayIsoDate,
  sheetRowBelongsToEmployee,
} from '@/services/payroll/payrollCalculations'
import type { PayrollService } from '@/services/payrollService'

export const rosterRepairMethods = {
  /** Drop a resigned person from months after resign, and from 16-31 if resign day ≤ 15. */
  purgeResignedFromFutureMonths(this: PayrollService, emp: EmployeeProfile): void {
    const end = resignedMonth(emp) || todayIsoDate().slice(0, 7)
    const roster = this.getEmployees()
    const unlink = (name?: string, designation?: string, employeeId?: string) =>
      sheetRowBelongsToEmployee(emp, name, designation, employeeId, roster)

    const dropFuture = <
      T extends {
        month: string
        fortnight?: string
        employeeName?: string
        name?: string
        designation?: string
        employeeId?: string
        contractType?: string
      }
    >(
      list: T[]
    ) =>
      list.filter((row) => {
        const rowM = sheetMonthKey(row.month)
        if (rowM > end) {
          return !unlink(row.employeeName || row.name, row.designation || row.contractType, row.employeeId)
        }
        // Resign on/before 15th → remove from that month's 16-31 fortnight sheets.
        if (rowM === end && row.fortnight === '16-31') {
          if (!employeeBelongsInMonth(emp, row.month, '16-31')) {
            return !unlink(row.employeeName || row.name, row.designation || row.contractType, row.employeeId)
          }
        }
        return true
      })

    this.saveStaffSalaries(dropFuture(this.readStore(STORAGE_KEYS.STAFF, INITIAL_STAFF_SALARIES)), false)
    this.saveContractSalaries(dropFuture(this.readStore(STORAGE_KEYS.CONTRACT, INITIAL_CONTRACT_SALARIES)), false)
    this.saveAdvances(dropFuture(this.readStore(STORAGE_KEYS.ADVANCES, INITIAL_ADVANCES)), false)
    this.saveEfficiencyIncentives(dropFuture(this.readStore(STORAGE_KEYS.EFFICIENCY, INITIAL_EFFICIENCY_INCENTIVES)), false)
    this.saveWeaversWages(dropFuture(this.readStore(STORAGE_KEYS.WEAVERS, INITIAL_WEAVERS_WAGES)), false)
    this.saveHelpersWages(dropFuture(this.readStore(STORAGE_KEYS.HELPERS, INITIAL_HELPERS_WAGES)), false)
    this.saveContractorsPayments(dropFuture(this.readStore(STORAGE_KEYS.CONTRACTORS, INITIAL_CONTRACTORS)), false)
  },

  /**
   * Drop a new joiner from every sheet month BEFORE their DOJ month
   * (e.g. Sep joiner must not remain on August Staff / Advances / etc.).
   */
  purgeJoinerFromPastMonths(this: PayrollService, emp: EmployeeProfile): void {
    const start = joiningMonth(emp)
    if (!start) return
    const roster = this.getEmployees()
    const unlink = (name?: string, designation?: string, employeeId?: string) =>
      sheetRowBelongsToEmployee(emp, name, designation, employeeId, roster)

    const dropPast = <
      T extends {
        month: string
        fortnight?: string
        employeeName?: string
        name?: string
        designation?: string
        employeeId?: string
        contractType?: string
      }
    >(
      list: T[]
    ) =>
      list.filter((row) => {
        const rowM = sheetMonthKey(row.month)
        if (rowM < start) {
          return !unlink(row.employeeName || row.name, row.designation || row.contractType, row.employeeId)
        }
        // Only real 1-15 fortnight sheets hide mid-month joiners.
        // Monthly Staff/Contract rows have no fortnight — keep them for the whole joining month.
        if (rowM === start && row.fortnight === '1-15') {
          if (!employeeBelongsInMonth(emp, row.month, '1-15')) {
            return !unlink(row.employeeName || row.name, row.designation || row.contractType, row.employeeId)
          }
        }
        return true
      })

    this.saveStaffSalaries(dropPast(this.readStore(STORAGE_KEYS.STAFF, INITIAL_STAFF_SALARIES)), false)
    this.saveContractSalaries(dropPast(this.readStore(STORAGE_KEYS.CONTRACT, INITIAL_CONTRACT_SALARIES)), false)
    this.saveAdvances(dropPast(this.readStore(STORAGE_KEYS.ADVANCES, INITIAL_ADVANCES)), false)
    this.saveEfficiencyIncentives(dropPast(this.readStore(STORAGE_KEYS.EFFICIENCY, INITIAL_EFFICIENCY_INCENTIVES)), false)
    this.saveWeaversWages(dropPast(this.readStore(STORAGE_KEYS.WEAVERS, INITIAL_WEAVERS_WAGES)), false)
    this.saveHelpersWages(dropPast(this.readStore(STORAGE_KEYS.HELPERS, INITIAL_HELPERS_WAGES)), false)
    this.saveContractorsPayments(dropPast(this.readStore(STORAGE_KEYS.CONTRACTORS, INITIAL_CONTRACTORS)), false)
  },

}

export type RosterRepairMethods = typeof rosterRepairMethods
