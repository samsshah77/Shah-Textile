/** Carry a profile change (name, designation, pay) onto every sheet that has the person. */
import { contractorBasis, isMonthEndContractorRow } from '@/services/payroll/contractorPlan'
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
import { hydrated, writeStoreAndWait } from '@/services/payroll/payrollStorage'
import {
  daysInCalendarMonth,
  sheetMonthKey,
  isTargetPayMonth,
  namesMatch,
  inferEmployeeCategory,
  weaverSheetFields,
  helperSheetFields,
  sameJobFamily,
  findLinkedEmployee,
} from '@/services/payroll/payrollCalculations'
import type { PayrollService } from '@/services/payrollService'

export const employeeSyncMethods = {
  syncSingleEmployeeAcrossSheets(
    this: PayrollService,
    oldEmp: EmployeeProfile,
    newEmp: EmployeeProfile,
    targetMonth?: string
  ): void {
    const activeMonth = targetMonth || this.getActiveSalariedMonth()
    const isEmpMatch = (name?: string, id?: string) => {
      if (id && id === newEmp.id) return true
      if (name && (namesMatch(name, oldEmp.name) || namesMatch(name, newEmp.name))) return true
      return false
    }

    // 1. Staff Salary & OT — identity all months; pay only targetMonth
    const staffList = this.readStore(STORAGE_KEYS.STAFF, INITIAL_STAFF_SALARIES)
    let staffChanged = false
    const updatedStaff = staffList.map((st) => {
      if (!isEmpMatch(st.employeeName, st.employeeId)) return st
      if (!isTargetPayMonth(st.month, activeMonth)) {
        if (
          st.employeeName !== newEmp.name ||
          st.designation !== newEmp.designation ||
          st.employeeId !== newEmp.id
        ) {
          staffChanged = true
          return {
            ...st,
            employeeId: newEmp.id,
            employeeName: newEmp.name,
            designation: newEmp.designation,
          }
        }
        return st
      }
      staffChanged = true
      return this.calculateStaffSalaryRow(
        {
          ...st,
          employeeId: newEmp.id,
          employeeName: newEmp.name,
          designation: newEmp.designation,
          salary: newEmp.salary,
        },
        daysInCalendarMonth(sheetMonthKey(st.month, activeMonth))
      )
    })
    if (staffChanged) this.saveStaffSalaries(updatedStaff, false)

    // 2. Contract Salaries — identity all months; pay only targetMonth
    const contractList = this.readStore(STORAGE_KEYS.CONTRACT, INITIAL_CONTRACT_SALARIES)
    let contractChanged = false
    const updatedContract = contractList.map((ct) => {
      if (!isEmpMatch(ct.employeeName, ct.employeeId)) return ct
      if (!isTargetPayMonth(ct.month, activeMonth)) {
        if (
          ct.employeeName !== newEmp.name ||
          ct.designation !== newEmp.designation ||
          ct.employeeId !== newEmp.id
        ) {
          contractChanged = true
          return {
            ...ct,
            employeeId: newEmp.id,
            employeeName: newEmp.name,
            designation: newEmp.designation,
          }
        }
        return ct
      }
      contractChanged = true
      return this.calculateContractSalaryRow(
        {
          ...ct,
          employeeId: newEmp.id,
          employeeName: newEmp.name,
          designation: newEmp.designation,
          salary: newEmp.salary,
        },
        daysInCalendarMonth(sheetMonthKey(ct.month, activeMonth))
      )
    })
    if (contractChanged) this.saveContractSalaries(updatedContract, false)

    // 3. Efficiency — identity all months; salaryEarned only for targetMonth
    const efficiencyAll = this.readStore(STORAGE_KEYS.EFFICIENCY, INITIAL_EFFICIENCY_INCENTIVES)
    let efficiencyChanged = false
    const updatedEfficiency = efficiencyAll.map((eff) => {
      if (!isEmpMatch(eff.name, eff.employeeId)) return eff
      if (!isTargetPayMonth(eff.month, activeMonth)) {
        if (
          eff.name !== newEmp.name ||
          eff.designation !== newEmp.designation ||
          eff.employeeId !== newEmp.id
        ) {
          efficiencyChanged = true
          return {
            ...eff,
            employeeId: newEmp.id,
            name: newEmp.name,
            designation: newEmp.designation,
          }
        }
        return eff
      }
      const linkedContract = updatedContract.find(
        (ct) =>
          isEmpMatch(ct.employeeName, ct.employeeId) &&
          isTargetPayMonth(ct.month, activeMonth)
      )
      const salaryEarned = linkedContract ? linkedContract.basicSalary : eff.salaryEarned
      const recalculated = this.calculateEfficiencyRow({
        ...eff,
        employeeId: newEmp.id,
        name: newEmp.name,
        designation: newEmp.designation,
        salaryEarned,
      })
      efficiencyChanged = true
      return recalculated
    })
    if (efficiencyChanged) {
      this.saveEfficiencyIncentives(updatedEfficiency, false)
      updatedEfficiency.forEach((eff) => {
        if (isEmpMatch(eff.name, eff.employeeId) && isTargetPayMonth(eff.month, activeMonth)) {
          this.syncEfficiencyToSalaries(eff.name, sheetMonthKey(eff.month, activeMonth), eff.amount || 0, false)
        }
      })
    }

    // 4. Advances (identity only)
    const advances = this.readStore(STORAGE_KEYS.ADVANCES, INITIAL_ADVANCES)
    let advancesChanged = false
    const updatedAdvances = advances.map((adv) => {
      if (!isEmpMatch(adv.employeeName, adv.employeeId)) return adv
      advancesChanged = true
      return {
        ...adv,
        employeeId: newEmp.id,
        employeeName: newEmp.name,
        designation: newEmp.designation,
      }
    })
    if (advancesChanged) this.saveAdvances(updatedAdvances, false)

    // 5. Weavers — identity all months; wage only targetMonth
    const weavers = this.readStore(STORAGE_KEYS.WEAVERS, INITIAL_WEAVERS_WAGES)
    let weaversChanged = false
    const updatedWeavers = weavers.map((w) => {
      if (!isEmpMatch(w.employeeName, w.employeeId)) return w
      if (!isTargetPayMonth(w.month, activeMonth)) {
        if (
          w.employeeName !== newEmp.name ||
          w.designation !== newEmp.designation ||
          w.employeeId !== newEmp.id
        ) {
          weaversChanged = true
          return {
            ...w,
            employeeId: newEmp.id,
            employeeName: newEmp.name,
            designation: (newEmp.designation === 'Spare Weaver' ? 'Spare Weaver' : 'Weaver') as 'Spare Weaver' | 'Weaver',
          }
        }
        return w
      }
      const pay = weaverSheetFields(newEmp)
      weaversChanged = true
      return this.calculateWeaverWageRow({
        ...w,
        employeeId: newEmp.id,
        employeeName: newEmp.name,
        designation: pay.designation,
        wagePerDay: pay.wagePerDay,
        holidayRate: pay.holidayRate,
        // Keep sheet holiday attendance (editable on Weavers OT tab).
        holidayAttendance: w.holidayAttendance,
      })
    })
    if (weaversChanged) this.saveWeaversWages(updatedWeavers, false)

    // 6. Helpers — identity all months; wage only targetMonth
    const helpers = this.readStore(STORAGE_KEYS.HELPERS, INITIAL_HELPERS_WAGES)
    let helpersChanged = false
    const updatedHelpers = helpers.map((h) => {
      if (!isEmpMatch(h.employeeName, h.employeeId)) return h
      if (!isTargetPayMonth(h.month, activeMonth)) {
        if (
          h.employeeName !== newEmp.name ||
          h.designation !== newEmp.designation ||
          h.employeeId !== newEmp.id
        ) {
          helpersChanged = true
          return {
            ...h,
            employeeId: newEmp.id,
            employeeName: newEmp.name,
            designation: (newEmp.designation === 'Winder' ? 'Winder' : 'Helper') as 'Helper' | 'Winder',
          }
        }
        return h
      }
      const pay = helperSheetFields(newEmp)
      helpersChanged = true
      return this.calculateHelperWageRow({
        ...h,
        employeeId: newEmp.id,
        employeeName: newEmp.name,
        designation: pay.designation,
        wagePerDay: pay.wagePerDay,
        otRate: pay.otRate,
        // Keep sheet holiday attendance (editable on Helpers sheet).
        holidayAttendance: h.holidayAttendance,
      })
    })
    if (helpersChanged) this.saveHelpersWages(updatedHelpers, false)

    // 7. Contractors — identity all months; amount only targetMonth
    const contractors = this.readStore(STORAGE_KEYS.CONTRACTORS, INITIAL_CONTRACTORS)
    let contractorsChanged = false
    const updatedContractors = contractors.map((c) => {
      if (!isEmpMatch(c.name, c.employeeId)) return c
      if (!isTargetPayMonth(c.month, activeMonth)) {
        if (c.name !== newEmp.name || c.employeeId !== newEmp.id) {
          contractorsChanged = true
          return {
            ...c,
            employeeId: newEmp.id,
            name: newEmp.name,
          }
        }
        return c
      }
      contractorsChanged = true
      return this.calculateContractorPaymentRow({
        ...c,
        employeeId: newEmp.id,
        name: newEmp.name,
        contractType: newEmp.designation || c.contractType,
        // Only a fix-salary month-end row follows the profile amount; bill amounts and
        // 1–15 payments are typed from the bill and must not be overwritten.
        contractualAmount:
          Number(newEmp.salary) > 0 && contractorBasis(newEmp) === 'SALARY' && isMonthEndContractorRow(c)
            ? Number(newEmp.salary)
            : c.contractualAmount,
      })
    })
    if (contractorsChanged) this.saveContractorsPayments(updatedContractors, false)
  },

  async syncSingleEmployeeAcrossSheetsAsync(
    this: PayrollService,
    oldEmp: EmployeeProfile,
    newEmp: EmployeeProfile,
    targetMonth?: string
  ): Promise<void> {
    const activeMonth = targetMonth || this.getActiveSalariedMonth()
    const isEmpMatch = (name?: string, id?: string) => {
      if (id && id === newEmp.id) return true
      if (name && (namesMatch(name, oldEmp.name) || namesMatch(name, newEmp.name))) return true
      return false
    }

    const persistPromises: Promise<boolean>[] = []

    // 1. Staff — identity all months; pay only targetMonth
    const staffList = this.readStore(STORAGE_KEYS.STAFF, INITIAL_STAFF_SALARIES)
    let staffChanged = false
    const updatedStaff = staffList.map((st) => {
      if (!isEmpMatch(st.employeeName, st.employeeId)) return st
      if (!isTargetPayMonth(st.month, activeMonth)) {
        if (
          st.employeeName !== newEmp.name ||
          st.designation !== newEmp.designation ||
          st.employeeId !== newEmp.id
        ) {
          staffChanged = true
          return {
            ...st,
            employeeId: newEmp.id,
            employeeName: newEmp.name,
            designation: newEmp.designation,
          }
        }
        return st
      }
      staffChanged = true
      return this.calculateStaffSalaryRow(
        {
          ...st,
          employeeId: newEmp.id,
          employeeName: newEmp.name,
          designation: newEmp.designation,
          salary: newEmp.salary,
        },
        daysInCalendarMonth(sheetMonthKey(st.month, activeMonth))
      )
    })
    if (staffChanged) {
      persistPromises.push(writeStoreAndWait(STORAGE_KEYS.STAFF, updatedStaff))
    }

    // 2. Contract — identity all months; pay only targetMonth
    const contractList = this.readStore(STORAGE_KEYS.CONTRACT, INITIAL_CONTRACT_SALARIES)
    let contractChanged = false
    const updatedContract = contractList.map((ct) => {
      if (!isEmpMatch(ct.employeeName, ct.employeeId)) return ct
      if (!isTargetPayMonth(ct.month, activeMonth)) {
        if (
          ct.employeeName !== newEmp.name ||
          ct.designation !== newEmp.designation ||
          ct.employeeId !== newEmp.id
        ) {
          contractChanged = true
          return {
            ...ct,
            employeeId: newEmp.id,
            employeeName: newEmp.name,
            designation: newEmp.designation,
          }
        }
        return ct
      }
      contractChanged = true
      return this.calculateContractSalaryRow(
        {
          ...ct,
          employeeId: newEmp.id,
          employeeName: newEmp.name,
          designation: newEmp.designation,
          salary: newEmp.salary,
        },
        daysInCalendarMonth(sheetMonthKey(ct.month, activeMonth))
      )
    })
    if (contractChanged) {
      persistPromises.push(writeStoreAndWait(STORAGE_KEYS.CONTRACT, updatedContract))
    }

    // 3. Efficiency — identity all months; salaryEarned only targetMonth
    const efficiencyAll = this.readStore(STORAGE_KEYS.EFFICIENCY, INITIAL_EFFICIENCY_INCENTIVES)
    let efficiencyChanged = false
    const updatedEfficiency = efficiencyAll.map((eff) => {
      if (!isEmpMatch(eff.name, eff.employeeId)) return eff
      if (!isTargetPayMonth(eff.month, activeMonth)) {
        if (
          eff.name !== newEmp.name ||
          eff.designation !== newEmp.designation ||
          eff.employeeId !== newEmp.id
        ) {
          efficiencyChanged = true
          return {
            ...eff,
            employeeId: newEmp.id,
            name: newEmp.name,
            designation: newEmp.designation,
          }
        }
        return eff
      }
      const linkedContract = updatedContract.find(
        (ct) =>
          isEmpMatch(ct.employeeName, ct.employeeId) &&
          isTargetPayMonth(ct.month, activeMonth)
      )
      const salaryEarned = linkedContract ? linkedContract.basicSalary : eff.salaryEarned
      const recalculated = this.calculateEfficiencyRow({
        ...eff,
        employeeId: newEmp.id,
        name: newEmp.name,
        designation: newEmp.designation,
        salaryEarned,
      })
      efficiencyChanged = true
      return recalculated
    })
    if (efficiencyChanged) {
      persistPromises.push(writeStoreAndWait(STORAGE_KEYS.EFFICIENCY, updatedEfficiency))
      updatedEfficiency.forEach((eff) => {
        if (isEmpMatch(eff.name, eff.employeeId) && isTargetPayMonth(eff.month, activeMonth)) {
          this.syncEfficiencyToSalaries(eff.name, sheetMonthKey(eff.month, activeMonth), eff.amount || 0, false)
        }
      })
    }

    // 4. Advances (identity only)
    const advances = this.readStore(STORAGE_KEYS.ADVANCES, INITIAL_ADVANCES)
    let advancesChanged = false
    const updatedAdvances = advances.map((adv) => {
      if (!isEmpMatch(adv.employeeName, adv.employeeId)) return adv
      advancesChanged = true
      return {
        ...adv,
        employeeId: newEmp.id,
        employeeName: newEmp.name,
        designation: newEmp.designation,
      }
    })
    if (advancesChanged) {
      persistPromises.push(writeStoreAndWait(STORAGE_KEYS.ADVANCES, updatedAdvances))
    }

    // 5. Weavers — identity all months; wage only targetMonth
    const weavers = this.readStore(STORAGE_KEYS.WEAVERS, INITIAL_WEAVERS_WAGES)
    let weaversChanged = false
    const updatedWeavers = weavers.map((w) => {
      if (!isEmpMatch(w.employeeName, w.employeeId)) return w
      if (!isTargetPayMonth(w.month, activeMonth)) {
        if (
          w.employeeName !== newEmp.name ||
          w.designation !== newEmp.designation ||
          w.employeeId !== newEmp.id
        ) {
          weaversChanged = true
          return {
            ...w,
            employeeId: newEmp.id,
            employeeName: newEmp.name,
            designation: (newEmp.designation === 'Spare Weaver' ? 'Spare Weaver' : 'Weaver') as 'Spare Weaver' | 'Weaver',
          }
        }
        return w
      }
      const pay = weaverSheetFields(newEmp)
      weaversChanged = true
      return this.calculateWeaverWageRow({
        ...w,
        employeeId: newEmp.id,
        employeeName: newEmp.name,
        designation: pay.designation,
        wagePerDay: pay.wagePerDay,
        holidayRate: pay.holidayRate,
        holidayAttendance: w.holidayAttendance,
      })
    })
    if (weaversChanged) {
      persistPromises.push(writeStoreAndWait(STORAGE_KEYS.WEAVERS, updatedWeavers))
    }

    // 6. Helpers — identity all months; wage only targetMonth
    const helpers = this.readStore(STORAGE_KEYS.HELPERS, INITIAL_HELPERS_WAGES)
    let helpersChanged = false
    const updatedHelpers = helpers.map((h) => {
      if (!isEmpMatch(h.employeeName, h.employeeId)) return h
      if (!isTargetPayMonth(h.month, activeMonth)) {
        if (
          h.employeeName !== newEmp.name ||
          h.designation !== newEmp.designation ||
          h.employeeId !== newEmp.id
        ) {
          helpersChanged = true
          return {
            ...h,
            employeeId: newEmp.id,
            employeeName: newEmp.name,
            designation: (newEmp.designation === 'Winder' ? 'Winder' : 'Helper') as 'Helper' | 'Winder',
          }
        }
        return h
      }
      const pay = helperSheetFields(newEmp)
      helpersChanged = true
      return this.calculateHelperWageRow({
        ...h,
        employeeId: newEmp.id,
        employeeName: newEmp.name,
        designation: pay.designation,
        wagePerDay: pay.wagePerDay,
        otRate: pay.otRate,
        holidayAttendance: h.holidayAttendance,
      })
    })
    if (helpersChanged) {
      persistPromises.push(writeStoreAndWait(STORAGE_KEYS.HELPERS, updatedHelpers))
    }

    // 7. Contractors — identity all months; amount only targetMonth
    const contractors = this.readStore(STORAGE_KEYS.CONTRACTORS, INITIAL_CONTRACTORS)
    let contractorsChanged = false
    const updatedContractors = contractors.map((c) => {
      if (!isEmpMatch(c.name, c.employeeId)) return c
      if (!isTargetPayMonth(c.month, activeMonth)) {
        if (c.name !== newEmp.name || c.employeeId !== newEmp.id) {
          contractorsChanged = true
          return {
            ...c,
            employeeId: newEmp.id,
            name: newEmp.name,
          }
        }
        return c
      }
      contractorsChanged = true
      return this.calculateContractorPaymentRow({
        ...c,
        employeeId: newEmp.id,
        name: newEmp.name,
        contractType: newEmp.designation || c.contractType,
        // Only a fix-salary month-end row follows the profile amount; bill amounts and
        // 1–15 payments are typed from the bill and must not be overwritten.
        contractualAmount:
          Number(newEmp.salary) > 0 && contractorBasis(newEmp) === 'SALARY' && isMonthEndContractorRow(c)
            ? Number(newEmp.salary)
            : c.contractualAmount,
      })
    })
    if (contractorsChanged) {
      persistPromises.push(writeStoreAndWait(STORAGE_KEYS.CONTRACTORS, updatedContractors))
    }

    await Promise.all(persistPromises)
  },

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
    const isEmpMatch = (name?: string, id?: string) => {
      if (id && id === emp.id) return true
      if (name && namesMatch(name, emp.name)) return true
      return false
    }

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

  syncMasterRoster(this: PayrollService, roster?: EmployeeProfile[], month?: string): void {
    // Client must not sync onto sheets until Postgres snapshot is loaded — otherwise
    // INITIAL August seed is written and September rows disappear after refresh.
    if (this.isClient() && !hydrated) return

    const activeMonth = month || this.getActiveSalariedMonth()

    const employees = roster || this.getEmployees()
    const isLinked = (
      name?: string,
      designation?: string,
      employeeId?: string
    ) => findLinkedEmployee(employees, name, designation, employeeId)

    const resolveLinked = (
      name?: string,
      designation?: string,
      employeeId?: string
    ) => {
      const direct = isLinked(name, designation, employeeId)
      if (direct) return direct
      for (const emp of employees) {
        const prev = this.profileAliases.get(emp.id)
        if (prev && namesMatch(name, prev) && sameJobFamily(emp, designation)) return emp
      }
      return undefined
    }

    // IDENTITY ONLY (name / designation / id) across EVERY month.
    // Never push profile.salary / wages here — that wiped Aug 36000 when Sep was 40000
    // and General Wages Save (or active-month switch) re-synced the roster.
    // Month pay changes only via updateEmployee → syncSingleEmployeeAcrossSheets(targetMonth).

    const staffList = this.readStore(STORAGE_KEYS.STAFF, INITIAL_STAFF_SALARIES)
    let staffChanged = false
    const updatedStaff = staffList.map((st) => {
      const emp = resolveLinked(st.employeeName, st.designation, st.employeeId)
      if (!emp) return st
      const cat = inferEmployeeCategory(emp)
      if (cat !== 'Staff' && cat !== 'Admin') return st
      if (
        st.employeeId === emp.id &&
        st.employeeName === emp.name &&
        st.designation === emp.designation
      ) {
        return st
      }
      staffChanged = true
      return {
        ...st,
        employeeId: emp.id,
        employeeName: emp.name,
        designation: emp.designation,
      }
    })
    if (staffChanged) this.saveStaffSalaries(updatedStaff, false)

    const contractList = this.readStore(STORAGE_KEYS.CONTRACT, INITIAL_CONTRACT_SALARIES)
    let contractChanged = false
    const updatedContract = contractList.map((ct) => {
      const emp = resolveLinked(ct.employeeName, ct.designation, ct.employeeId)
      if (!emp || inferEmployeeCategory(emp) !== 'Contract') return ct
      if (
        ct.employeeId === emp.id &&
        ct.employeeName === emp.name &&
        ct.designation === emp.designation
      ) {
        return ct
      }
      contractChanged = true
      return {
        ...ct,
        employeeId: emp.id,
        employeeName: emp.name,
        designation: emp.designation,
      }
    })
    if (contractChanged) this.saveContractSalaries(updatedContract, false)

    // Advances: identity only. Amount is owned by Sheet 2.
    const advances = this.readStore(STORAGE_KEYS.ADVANCES, INITIAL_ADVANCES)
    let advancesChanged = false
    const updatedAdvances = advances.map((adv) => {
      const emp = resolveLinked(adv.employeeName, adv.designation, adv.employeeId)
      if (!emp) return adv
      if (
        adv.employeeId === emp.id &&
        adv.employeeName === emp.name &&
        adv.designation === emp.designation
      ) {
        return adv
      }
      advancesChanged = true
      return {
        ...adv,
        employeeId: emp.id,
        employeeName: emp.name,
        designation: emp.designation,
      }
    })
    if (advancesChanged) this.saveAdvances(updatedAdvances, false)

    // Efficiency: identity only on roster sync (amounts stay per-month on the sheet).
    const efficiencyAll = this.readStore(STORAGE_KEYS.EFFICIENCY, INITIAL_EFFICIENCY_INCENTIVES)
    let efficiencyChanged = false
    const updatedEfficiency = efficiencyAll.map((eff) => {
      const emp = resolveLinked(eff.name, eff.designation, eff.employeeId)
      if (!emp) return eff
      if (
        eff.employeeId === emp.id &&
        eff.name === emp.name &&
        eff.designation === emp.designation
      ) {
        return eff
      }
      efficiencyChanged = true
      return {
        ...eff,
        employeeId: emp.id,
        name: emp.name,
        designation: emp.designation,
      }
    })
    if (efficiencyChanged) this.saveEfficiencyIncentives(updatedEfficiency, false)

    // Weavers / Helpers / Contractors: identity only (wages owned by monthly sheets).
    const weavers = this.readStore(STORAGE_KEYS.WEAVERS, INITIAL_WEAVERS_WAGES)
    let weaversChanged = false
    const updatedWeavers = weavers.map((w) => {
      const emp = resolveLinked(w.employeeName, w.designation, w.employeeId)
      if (!emp || inferEmployeeCategory(emp) !== 'Weaver') return w
      const nextDesignation = (
        emp.designation === 'Spare Weaver' ? 'Spare Weaver' : 'Weaver'
      ) as 'Spare Weaver' | 'Weaver'
      if (
        w.employeeId === emp.id &&
        w.employeeName === emp.name &&
        w.designation === nextDesignation
      ) {
        return w
      }
      weaversChanged = true
      return {
        ...w,
        employeeId: emp.id,
        employeeName: emp.name,
        designation: nextDesignation,
      }
    })
    if (weaversChanged) this.saveWeaversWages(updatedWeavers, false)

    const helpers = this.readStore(STORAGE_KEYS.HELPERS, INITIAL_HELPERS_WAGES)
    let helpersChanged = false
    const updatedHelpers = helpers.map((h) => {
      const emp = resolveLinked(h.employeeName, h.designation, h.employeeId)
      if (!emp || inferEmployeeCategory(emp) !== 'Helper') return h
      const nextDesignation = (
        emp.designation === 'Winder' ? 'Winder' : 'Helper'
      ) as 'Helper' | 'Winder'
      if (
        h.employeeId === emp.id &&
        h.employeeName === emp.name &&
        h.designation === nextDesignation
      ) {
        return h
      }
      helpersChanged = true
      return {
        ...h,
        employeeId: emp.id,
        employeeName: emp.name,
        designation: nextDesignation,
      }
    })
    if (helpersChanged) this.saveHelpersWages(updatedHelpers, false)

    const contractors = this.readStore(STORAGE_KEYS.CONTRACTORS, INITIAL_CONTRACTORS)
    let contractorsChanged = false
    const updatedContractors = contractors.map((c) => {
      const emp = resolveLinked(c.name, c.contractType, c.employeeId)
      if (!emp || inferEmployeeCategory(emp) !== 'Contractor') return c
      const nextType = emp.designation || c.contractType
      if (c.employeeId === emp.id && c.name === emp.name && c.contractType === nextType) {
        return c
      }
      contractorsChanged = true
      return {
        ...c,
        employeeId: emp.id,
        name: emp.name,
        contractType: nextType,
      }
    })
    if (contractorsChanged) this.saveContractorsPayments(updatedContractors, false)

    this.notifyDataChanged(activeMonth)
  },

}

export type EmployeeSyncMethods = typeof employeeSyncMethods
