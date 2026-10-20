/** A person's pay as shown for one month (read from that month's sheet row). */
import { EmployeeProfile } from '@/types/payroll'
import {
  namesMatch,
  inferEmployeeCategory,
} from '@/services/payroll/payrollCalculations'
import type { PayrollService } from '@/services/payrollService'

export const employeeSyncMethods = {
  getEmployeeCompensationForMonth(
    this: PayrollService,
    emp: EmployeeProfile,
    month?: string
  ): {
    salary: number
    ratePerDay?: number
    isDaily: boolean
    dutyHrs: number
    shiftFromTo: string
    overtimeRate?: number
    overtimeShifts?: number
  } {
    const activeMonth = month || this.getActiveSalariedMonth()
    const cat = inferEmployeeCategory(emp)
    // Same name ≠ same person: rows with an id match by id only.
    const isEmpMatch = (name?: string, id?: string) => (id ? id === emp.id : namesMatch(name, emp.name))

    if (cat === 'Weaver') {
      const weavers = this.getWeaversWages(activeMonth)
      const row = weavers.find(
        (w) =>
          (w.month || activeMonth) === activeMonth &&
          isEmpMatch(w.employeeName, w.employeeId)
      )
      const daily = row ? row.wagePerDay : (emp.ratePerDay30 || (emp.salary ? Math.round(emp.salary / 30) : 1450))
      const isSpare = (emp.designation || '').toLowerCase().includes('spare')
      const overtimeRate = row?.holidayRate ?? emp.overtimeRate ?? (isSpare ? 2100 : 1750)
      const overtimeShifts = row?.holidayAttendance ?? emp.overtimeShifts ?? 0
      return {
        salary: daily * 30,
        ratePerDay: daily,
        isDaily: true,
        dutyHrs: emp.dutyHrs || 12,
        shiftFromTo: emp.shiftFromTo || '8 to 8',
        overtimeRate,
        overtimeShifts,
      }
    }

    if (cat === 'Helper') {
      const helpers = this.getHelpersWages(activeMonth)
      const row = helpers.find(
        (h) =>
          (h.month || activeMonth) === activeMonth &&
          isEmpMatch(h.employeeName, h.employeeId)
      )
      const daily = row ? row.wagePerDay : (emp.ratePerDay30 || (emp.salary ? Math.round(emp.salary / 30) : 1050))
      const isWinder = (emp.designation || '').toLowerCase().includes('winder')
      const overtimeRate = row?.otRate ?? emp.overtimeRate ?? (isWinder ? 1400 : 1200)
      const overtimeShifts = row?.holidayAttendance ?? emp.overtimeShifts ?? 0
      return {
        salary: daily * 30,
        ratePerDay: daily,
        isDaily: true,
        dutyHrs: emp.dutyHrs || 12,
        shiftFromTo: emp.shiftFromTo || '8 to 8',
        overtimeRate,
        overtimeShifts,
      }
    }

    if (cat === 'Contract') {
      const contracts = this.getContractSalaries(activeMonth)
      const row = contracts.find(
        (c) =>
          (c.month || activeMonth) === activeMonth &&
          isEmpMatch(c.employeeName, c.employeeId)
      )
      return {
        salary: row?.salary ?? emp.salary,
        ratePerDay: row?.ratePerDay ?? emp.ratePerDay30,
        isDaily: false,
        dutyHrs: emp.dutyHrs || 12,
        shiftFromTo: emp.shiftFromTo || '8 to 8',
      }
    }

    if (cat === 'Staff' || cat === 'Admin') {
      const staff = this.getStaffSalaries(activeMonth)
      const row = staff.find(
        (s) =>
          (s.month || activeMonth) === activeMonth &&
          isEmpMatch(s.employeeName, s.employeeId)
      )
      return {
        salary: row?.salary ?? emp.salary,
        ratePerDay: row?.ratePerDay ?? emp.ratePerDay30,
        isDaily: false,
        dutyHrs: emp.dutyHrs || 9,
        shiftFromTo: emp.shiftFromTo || '9 to 6',
      }
    }

    if (cat === 'Contractor') {
      const contractors = this.getContractorsPayments(activeMonth)
      const row = contractors.find(
        (c) =>
          (c.month || activeMonth) === activeMonth &&
          isEmpMatch(c.name, c.employeeId)
      )
      return {
        salary: row?.contractualAmount ?? row?.totalAmount ?? emp.salary,
        ratePerDay: emp.ratePerDay30,
        isDaily: false,
        dutyHrs: emp.dutyHrs || 12,
        shiftFromTo: emp.shiftFromTo || '8 to 8',
      }
    }

    return {
      salary: emp.salary,
      ratePerDay: emp.ratePerDay30,
      isDaily: emp.contractStatus === 'Daily Wage',
      dutyHrs: emp.dutyHrs || 9,
      shiftFromTo: emp.shiftFromTo || '9 to 6',
    }
  },

}

export type EmployeeSyncMethods = typeof employeeSyncMethods
