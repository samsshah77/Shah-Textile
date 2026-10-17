import type {
  StaffSalaryRecord,
  AdvanceRecord,
  HelperWageRecord,
  WeaverWageRecord,
  ContractSalaryRecord,
  ContractorPaymentRecord,
  EfficiencyIncentiveRecord,
  EmployeeProfile,
  PettyCashRecord,
} from '@/types/payroll'
import allEmployeesData from '@/data/all_employees.json'

export const STORAGE_KEYS = {
  EMPLOYEES: 'sara_payroll_employees_v9',
  ADVANCES: 'sara_payroll_advances_v7',
  STAFF: 'sara_payroll_staff_v6',
  CONTRACT: 'sara_payroll_contract_v7',
  EFFICIENCY: 'sara_payroll_efficiency_v6',
  WEAVERS: 'sara_payroll_weavers_v6',
  HELPERS: 'sara_payroll_helpers_v6',
  CONTRACTORS: 'sara_payroll_contractors_v6',
  PETTY_CASH: 'sara_payroll_petty_cash_v6',
  HR_META: 'sara_payroll_hr_meta_v1',
} as const

const NAME_ALIASES: Record<string, string> = {
  muhammed: 'muhammad',
  mohammed: 'muhammad',
  mohammad: 'muhammad',
  ahmer: 'ahmar',
  billal: 'bilal',
}

function normalizeName(name?: string): string {
  const parts = (name || '')
    .toLowerCase()
    .replace(/[.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((part) => NAME_ALIASES[part] || part)
  return parts.join(' ')
}

const MONTH_NAME_TO_NUM: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
}

function parseResignationDateFromRemarks(remarks?: string): string | undefined {
  if (!remarks) return undefined
  const text = remarks.trim()
  const afterLabel = text.replace(/^resign(?:ation|ed)?\s*[:\-]?\s*/i, '').trim() || text

  const named = afterLabel.match(/(\d{1,2})[\s.\-\/]+([A-Za-z]+)[\s.\-\/]+(\d{2,4})/)
  if (named) {
    const day = Number(named[1])
    const mon = MONTH_NAME_TO_NUM[named[2].toLowerCase()]
    let year = Number(named[3])
    if (year < 100) year += 2000
    if (mon && day >= 1 && day <= 31 && year >= 1990 && year <= 2100) {
      return `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(afterLabel)) return afterLabel.slice(0, 10)

  const dmy = afterLabel.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/)
  if (dmy) {
    let a = Number(dmy[1])
    let b = Number(dmy[2])
    let year = Number(dmy[3])
    if (year < 100) year += 2000
    let day = a
    let mon = b
    if (a <= 12 && b > 12) {
      mon = a
      day = b
    }
    if (mon >= 1 && mon <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  return undefined
}

function hydrateResignedDates(list: EmployeeProfile[]): { list: EmployeeProfile[]; changed: boolean } {
  let changed = false
  const next = list.map((e) => {
    if ((e.status || 'Active') !== 'Resigned') return e
    if ((e.resignedAt || '').trim()) return e
    const parsed = parseResignationDateFromRemarks(e.remarks)
    if (!parsed) return e
    changed = true
    return { ...e, resignedAt: parsed }
  })
  return { list: next, changed }
}

function buildInitialMasterRoster(): EmployeeProfile[] {
  const gwList: EmployeeProfile[] = (allEmployeesData as unknown as EmployeeProfile[]).map((e) => {
    const copy = { ...e }
    if ((copy.designation || '').toLowerCase().includes('sweeper')) {
      copy.employeeCategory = 'Contract'
    }
    const remarksLow = (copy.remarks || '').toLowerCase()
    if (remarksLow.includes('resign') || (copy.status || '').toLowerCase() === 'resigned') {
      copy.status = 'Resigned'
      if (!copy.resignedAt) {
        copy.resignedAt = parseResignationDateFromRemarks(copy.remarks) || '2026-08-31'
      }
    }
    return copy
  })
  return gwList
}

export const INITIAL_EMPLOYEES: EmployeeProfile[] = hydrateResignedDates(buildInitialMasterRoster()).list

// Historical Excel wage and salary sheets emptied: strict database-driven data only
export const INITIAL_STAFF_SALARIES: StaffSalaryRecord[] = []
export const INITIAL_CONTRACT_SALARIES: ContractSalaryRecord[] = []
export const INITIAL_ADVANCES: AdvanceRecord[] = []
export const INITIAL_WEAVERS_WAGES: WeaverWageRecord[] = []
export const INITIAL_HELPERS_WAGES: HelperWageRecord[] = []
export const INITIAL_CONTRACTORS: ContractorPaymentRecord[] = []
export const INITIAL_EFFICIENCY_INCENTIVES: EfficiencyIncentiveRecord[] = []
export const INITIAL_PETTY_CASH: PettyCashRecord[] = []

/** Clean bootstrap payload: zero Excel seed data, all salary and wage sheets empty. */
export function getPayrollSeedStore(): Record<string, unknown> {
  return {
    [STORAGE_KEYS.EMPLOYEES]: INITIAL_EMPLOYEES,
    [STORAGE_KEYS.ADVANCES]: [],
    [STORAGE_KEYS.STAFF]: [],
    [STORAGE_KEYS.CONTRACT]: [],
    [STORAGE_KEYS.EFFICIENCY]: [],
    [STORAGE_KEYS.WEAVERS]: [],
    [STORAGE_KEYS.HELPERS]: [],
    [STORAGE_KEYS.CONTRACTORS]: [],
    [STORAGE_KEYS.PETTY_CASH]: [],
    [STORAGE_KEYS.HR_META]: {},
  }
}
