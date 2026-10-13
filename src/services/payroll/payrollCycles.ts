// src/services/payroll/payrollCycles.ts
import { STORAGE_KEYS } from './payrollConstants'
import {
  memoryStore,
  hydrated,
  allowServerSheetWrite,
  setHydrated,
  setAllowServerSheetWrite,
} from './payrollStorage'
import {
  calculateStaffSalaryRow,
  calculateContractSalaryRow,
  calculateEfficiencyRow,
  formatPayrollMonthLabel,
  daysInCalendarMonth,
  inferEmployeeCategory,
  isGeneralWagesEmployee,
  employeeBelongsInMonth,
} from './payrollCalculations'
import {
  INITIAL_STAFF_SALARIES,
  INITIAL_CONTRACT_SALARIES,
  INITIAL_EFFICIENCY_INCENTIVES,
  INITIAL_EMPLOYEES,
  getPayrollSeedStore,
} from '@/data/payrollSeeds'
import type {
  EmployeeProfile,
  StaffSalaryRecord,
  ContractSalaryRecord,
  EfficiencyIncentiveRecord,
} from '@/types/payroll'

export function applySalariedMonthGenerateToStore(
  store: Record<string, unknown>,
  month: string
): {
  ok: boolean
  message: string
  staff: number
  contract: number
  patch: Record<string, unknown>
} {
  const m = (month || '').trim()
  if (!/^\d{4}-\d{2}$/.test(m)) {
    return { ok: false, message: 'Month format YYYY-MM chahiye.', staff: 0, contract: 0, patch: {} }
  }

  const previous = new Map(memoryStore)
  const prevHydrated = hydrated
  const prevAllow = allowServerSheetWrite

  memoryStore.clear()
  const seed = getPayrollSeedStore()
  for (const [key, value] of Object.entries({ ...seed, ...store })) {
    memoryStore.set(key, JSON.stringify(value ?? null))
  }
  setHydrated(true)
  setAllowServerSheetWrite(true)

  try {
    let allStaff: StaffSalaryRecord[] = INITIAL_STAFF_SALARIES
    try {
      allStaff = JSON.parse(memoryStore.get(STORAGE_KEYS.STAFF) || '[]')
      if (!Array.isArray(allStaff) || allStaff.length === 0) allStaff = INITIAL_STAFF_SALARIES
    } catch {
      allStaff = INITIAL_STAFF_SALARIES
    }

    let allContract: ContractSalaryRecord[] = INITIAL_CONTRACT_SALARIES
    try {
      allContract = JSON.parse(memoryStore.get(STORAGE_KEYS.CONTRACT) || '[]')
      if (!Array.isArray(allContract) || allContract.length === 0) allContract = INITIAL_CONTRACT_SALARIES
    } catch {
      allContract = INITIAL_CONTRACT_SALARIES
    }

    const staffExists = allStaff.some((r) => (r.month || '') === m)
    const contractExists = allContract.some((r) => (r.month || '') === m)

    const rawMeta = (() => {
      try {
        return JSON.parse(memoryStore.get(STORAGE_KEYS.HR_META) || '{}') as {
          categories?: string[]
          designations?: string[]
          activeSalariedMonth?: string
          activeFortnightMonth?: string
          activeFortnight?: '1-15' | '16-31'
          pettyCashInflowOverrides?: Record<string, number>
        }
      } catch {
        return {}
      }
    })()

    if (staffExists || contractExists) {
      const meta = {
        categories: rawMeta.categories || [],
        designations: rawMeta.designations || [],
        activeSalariedMonth: m,
        activeFortnightMonth: rawMeta.activeFortnightMonth,
        activeFortnight: rawMeta.activeFortnight,
        pettyCashInflowOverrides: rawMeta.pettyCashInflowOverrides,
      }
      return {
        ok: true,
        message: `${formatPayrollMonthLabel(m)} pehle se maujood hai — active month set.`,
        staff: allStaff.filter((r) => r.month === m).length,
        contract: allContract.filter((r) => r.month === m).length,
        patch: { [STORAGE_KEYS.HR_META]: meta },
      }
    }

    const employees = (
      (() => {
        try {
          return JSON.parse(memoryStore.get(STORAGE_KEYS.EMPLOYEES) || '[]') as EmployeeProfile[]
        } catch {
          return INITIAL_EMPLOYEES
        }
      })() || INITIAL_EMPLOYEES
    )
      .filter((e) => isGeneralWagesEmployee(e))
      .filter((e) => employeeBelongsInMonth(e, m))

    const days = daysInCalendarMonth(m)
    // Staff Excel / General Wages use 30-day rate base (not calendar length).
    const staffDays = days === 28 ? 28 : 30
    const staffPeople = employees.filter((e) => {
      const cat = inferEmployeeCategory(e)
      return cat === 'Staff' || cat === 'Admin'
    })
    const contractPeople = employees.filter((e) => inferEmployeeCategory(e) === 'Contract')

    const newStaff = staffPeople.map((emp, i) =>
      calculateStaffSalaryRow(
        {
          id: `st-${m}-${emp.id}`,
          serialNo: i + 1,
          employeeId: emp.id,
          employeeName: emp.name,
          designation: emp.designation,
          salary: emp.salary,
          attendanceDays: 0,
          otHours: 0,
          lessAdvance: 0,
          chequeAmount: 0,
          month: m,
        },
        staffDays,
        m,
        emp
      )
    )
    const newContract = contractPeople.map((emp, i) =>
      calculateContractSalaryRow(
        {
          id: `ct-${m}-${emp.id}`,
          serialNo: i + 1,
          employeeId: emp.id,
          employeeName: emp.name,
          designation: emp.designation,
          salary: emp.salary,
          attendanceDays: 0,
          otHours: 0,
          lateHours: 0,
          lateAmount: 0,
          efficiencyAmount: 0,
          advanceDeduction: 0,
          ticketCharges: 0,
          month: m,
        },
        days,
        m,
        emp
      )
    )

    if (newStaff.length === 0 && newContract.length === 0) {
      return {
        ok: false,
        message: 'General Wages me koi Staff / Company Contract person nahi mila.',
        staff: 0,
        contract: 0,
        patch: {},
      }
    }

    let allEff: EfficiencyIncentiveRecord[] = []
    try {
      allEff = JSON.parse(memoryStore.get(STORAGE_KEYS.EFFICIENCY) || '[]')
      if (!Array.isArray(allEff) || allEff.length === 0) allEff = INITIAL_EFFICIENCY_INCENTIVES
    } catch {
      allEff = INITIAL_EFFICIENCY_INCENTIVES
    }

    let nextEff = allEff
    let newEffCount = 0
    if (!allEff.some((r) => (r.month || '') === m)) {
      const priorMonths = [
        ...new Set(allEff.map((r) => r.month).filter(Boolean) as string[]),
      ].sort()
      const sourceMonth = priorMonths[priorMonths.length - 1] || '2026-08'
      const template = allEff.filter((r) => r.month === sourceMonth)
      const seeded = template.map((r, i) =>
        calculateEfficiencyRow({
          id: `eff-${m}-${i + 1}`,
          serialNo: i + 1,
          employeeId: r.employeeId,
          loom: r.loom,
          name: r.name,
          designation: r.designation,
          efficiencyPercent: 0,
          salaryEarned: r.salaryEarned || 0,
          month: m,
        })
      )
      nextEff = [...allEff, ...seeded]
      newEffCount = seeded.length
    }

    const meta = {
      categories: rawMeta.categories || [],
      designations: rawMeta.designations || [],
      activeSalariedMonth: m,
      activeFortnightMonth: rawMeta.activeFortnightMonth,
      activeFortnight: rawMeta.activeFortnight,
      pettyCashInflowOverrides: rawMeta.pettyCashInflowOverrides,
    }

    const patch: Record<string, unknown> = {
      [STORAGE_KEYS.HR_META]: meta,
    }
    if (newStaff.length) patch[STORAGE_KEYS.STAFF] = [...allStaff, ...newStaff]
    if (newContract.length) patch[STORAGE_KEYS.CONTRACT] = [...allContract, ...newContract]
    if (newEffCount > 0) patch[STORAGE_KEYS.EFFICIENCY] = nextEff

    return {
      ok: true,
      message: `${formatPayrollMonthLabel(m)}: ${newStaff.length} Staff + ${newContract.length} Contract + ${newEffCount} Efficiency — Postgres save. Refresh ke baad bhi rahega.`,
      staff: newStaff.length,
      contract: newContract.length,
      patch,
    }
  } finally {
    setHydrated(prevHydrated)
    setAllowServerSheetWrite(prevAllow)
    memoryStore.clear()
    for (const [k, v] of previous) memoryStore.set(k, v)
  }
}
