// src/services/payrollService.ts
import {
  EmployeeProfile,
  EmployeeCategory,
  AdvanceRecord,
  StaffSalaryRecord,
  ContractSalaryRecord,
  EfficiencyIncentiveRecord,
  WeaverWageRecord,
  HelperWageRecord,
  ContractorPaymentRecord,
  FortnightSynopsis,
  MonthlyGrandSalarySynopsis,
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
}

const DEFAULT_HR_CATEGORIES = ['Admin', 'Staff', 'Contract', 'Weaver', 'Helper', 'Contractor']
const DEFAULT_HR_DESIGNATIONS = [
  'Incharge',
  'Supervisor',
  'Accountant',
  'Quality Controller',
  'D.E.O',
  'Sr.Technician',
  'Electrician',
  'Asst Technician',
  'Oil Man',
  'Weaver',
  'Spare Weaver',
  'Helper',
  'Store Keeper',
  'Time Keeper',
]

type JobFamily = 'weaver' | 'helper' | 'contractor' | 'salaried'

const NAME_ALIASES: Record<string, string> = {
  muhammed: 'muhammad',
  mohammed: 'muhammad',
  mohammad: 'muhammad',
  ahmer: 'ahmar',
  billal: 'bilal',
}

function daysInCalendarMonth(month: string = '2026-08'): number {
  const [year, mon] = (month || '2026-08').split('-').map(Number)
  if (!year || !mon) return 31
  return new Date(year, mon, 0).getDate()
}

/** Normalize sheet month; never fall back to "active" month (that overwrote Aug with Sep pay). */
function sheetMonthKey(rowMonth?: string | null, fallback = '2026-08'): string {
  const m = (rowMonth || '').trim()
  return /^\d{4}-\d{2}$/.test(m) ? m : fallback
}

/** Pay / wage fields apply only to the month being edited from the profile card. */
function isTargetPayMonth(rowMonth: string | undefined | null, targetMonth: string): boolean {
  return sheetMonthKey(rowMonth) === sheetMonthKey(targetMonth)
}

/** Active / On Leave count as working roster; Resigned does not. */
export function isActiveEmployee(emp?: EmployeeProfile | null): boolean {
  if (!emp) return false
  return (emp.status || 'Active') !== 'Resigned'
}

const MONTH_NAME_TO_NUM: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
}

/**
 * Parse dates from remarks like "Resignation 31 Oct 2022" / "Resignation 06-Jan-26".
 * Returns YYYY-MM-DD when possible.
 */
export function parseResignationDateFromRemarks(remarks?: string): string | undefined {
  if (!remarks) return undefined
  const text = remarks.trim()
  const afterLabel = text.replace(/^resign(?:ation|ed)?\s*[:\-]?\s*/i, '').trim() || text

  // 31 Oct 2022 | 30 June-24 | 06-Jan-26 | 18-Sep-2022
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

  // ISO already
  if (/^\d{4}-\d{2}-\d{2}/.test(afterLabel)) return afterLabel.slice(0, 10)

  // 31-10-2022 or 31/10/22 (D-M-Y)
  const dmy = afterLabel.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/)
  if (dmy) {
    let a = Number(dmy[1])
    let b = Number(dmy[2])
    let year = Number(dmy[3])
    if (year < 100) year += 2000
    // Prefer D-M-Y when first > 12
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

/** Prefer resignedAt; else parse from remarks. */
export function resolveResignedAt(emp?: EmployeeProfile | null): string {
  if (!emp) return ''
  const direct = (emp.resignedAt || '').trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(direct)) return direct.slice(0, 10)
  if (direct) return direct
  return parseResignationDateFromRemarks(emp.remarks) || ''
}

/** YYYY-MM of resignation (empty if not resigned). */
export function resignedMonth(emp?: EmployeeProfile | null): string {
  if (!emp || (emp.status || 'Active') !== 'Resigned') return ''
  const raw = resolveResignedAt(emp)
  if (/^\d{4}-\d{2}/.test(raw)) return raw.slice(0, 7)
  return ''
}

/** Parse DOJ strings like 2026-09-01 / 01-Sep-2026 / 26-Jul-2026 → YYYY-MM-DD. */
export function parseDojToIso(doj?: string): string | undefined {
  if (!doj) return undefined
  const text = doj.trim()
  if (!text) return undefined
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10)

  const named = text.match(/(\d{1,2})[\s.\-\/]+([A-Za-z]+)[\s.\-\/]+(\d{2,4})/)
  if (named) {
    const day = Number(named[1])
    const mon = MONTH_NAME_TO_NUM[named[2].toLowerCase()]
    let year = Number(named[3])
    if (year < 100) year += 2000
    if (mon && day >= 1 && day <= 31 && year >= 1990 && year <= 2100) {
      return `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  const dmy = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/)
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

/** First payroll month this person should appear (from DOJ). Empty = no DOJ limit. */
export function joiningMonth(emp?: EmployeeProfile | null): string {
  if (!emp) return ''
  const iso = parseDojToIso(emp.doj)
  if (iso && /^\d{4}-\d{2}/.test(iso)) return iso.slice(0, 7)
  return ''
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

/**
 * Include in a payroll month sheet?
 * - New joiners: only from DOJ month onward (Sep joiner does not show in Aug).
 * - Resigned: stay through resign month, then drop from later months.
 */
export function employeeBelongsInMonth(emp: EmployeeProfile | null | undefined, month: string): boolean {
  if (!emp) return true
  const start = joiningMonth(emp)
  if (start && month < start) return false
  if ((emp.status || 'Active') !== 'Resigned') return true
  const end = resignedMonth(emp)
  if (!end) return false
  return month <= end
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
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

function namesMatch(a?: string, b?: string): boolean {
  if (!a || !b) return false
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (!na || !nb) return false
  return na === nb
}

function jobFamily(designation?: string, category?: string): JobFamily {
  const c = (category || '').toLowerCase()
  const d = (designation || '').toLowerCase()
  if (c === 'weaver' || /\bweaver\b/.test(d) || d.includes('spare weaver')) return 'weaver'
  if (
    d.includes('contractor') ||
    d.includes('contracter') ||
    d.includes('knotting') ||
    d.includes('sarning') ||
    d.includes('chowkidar') ||
    d.includes('gitta') ||
    c === 'contractor'
  ) {
    return 'contractor'
  }
  if ((c === 'helper' && !d.includes('sweeper')) || (d.includes('helper') && !d.includes('electrician helper')) || d.includes('winder')) {
    return 'helper'
  }
  return 'salaried'
}

/** Infer HR category from designation / contract status (Category field removed from form). */
export function inferEmployeeCategory(input: {
  designation?: string
  contractStatus?: string
  employeeCategory?: string | null
}): EmployeeCategory {
  const family = jobFamily(input.designation, input.employeeCategory || undefined)
  if (family === 'weaver') return 'Weaver'
  if (family === 'helper') return 'Helper'
  if (family === 'contractor' || input.contractStatus === 'Contractor') return 'Contractor'
  if (input.contractStatus === 'Company Contract' || input.contractStatus === 'Contract Services') {
    return 'Contract'
  }

  const d = (input.designation || '').toLowerCase()
  const existing = (input.employeeCategory || '').trim()
  if (existing && !['Staff', 'staff'].includes(existing)) {
    // Keep explicit Admin/Contract if already set and not overridden by family
    if (['Admin', 'Contract', 'Contractor', 'Weaver', 'Helper'].includes(existing)) {
      if (family === 'salaried' && (existing === 'Admin' || existing === 'Contract')) return existing as EmployeeCategory
    }
  }
  if (
    d.includes('technician') ||
    d.includes('oilman') ||
    d.includes('oil man') ||
    d.includes('electrician') ||
    d.includes('mechanic') ||
    d.includes('folding') ||
    d.includes('time keeper') ||
    d.includes('beem gater') ||
    d.includes('quality controller') ||
    d.includes('sweeper') ||
    d.includes('kitchen')
  ) {
    return 'Contract'
  }
  if (d.includes('incharge') || d.includes('ceo') || d.includes('director') || d.includes('owner')) {
    return 'Admin'
  }
  return 'Staff'
}

/** Monthly General Wages sheet — exclude daily-wage roles (Weaver / Helper / Contractor) and Resigned employees. */
export function isGeneralWagesEmployee(
  emp: Pick<EmployeeProfile, 'designation' | 'employeeCategory' | 'contractStatus' | 'status' | 'remarks' | 'resignedAt'>
): boolean {
  if (!isActiveEmployee(emp as EmployeeProfile)) return false
  if ((emp.status || '').toLowerCase() === 'resigned') return false
  if (emp.resignedAt && emp.resignedAt.trim()) return false
  if (emp.remarks && emp.remarks.toLowerCase().includes('resign')) return false
  const cat = inferEmployeeCategory(emp)
  return cat !== 'Weaver' && cat !== 'Helper' && cat !== 'Contractor'
}

export function matchesHrCategoryFilter(
  emp: Pick<EmployeeProfile, 'designation' | 'employeeCategory' | 'contractStatus' | 'status'>,
  filter: string
): boolean {
  if (!filter || filter === 'ALL') return true
  const f = filter.toUpperCase()
  if (f === 'RESIGNED') {
    return (emp.status || 'Active').toLowerCase() === 'resigned'
  }
  const cat = inferEmployeeCategory(emp).toUpperCase()
  if (f === 'STAFF') return cat === 'STAFF' || cat === 'ADMIN'
  if (f === 'WEAVER') return cat === 'WEAVER'
  if (f === 'HELPER') return cat === 'HELPER'
  if (f === 'CONTRACT') return cat === 'CONTRACT'
  if (f === 'CONTRACTOR') return cat === 'CONTRACTOR'
  return cat === f
}

/**
 * Finds the optimal row index to insert an employee based on their designation / category.
 * Places the new employee immediately beneath existing peers (e.g. under Quality Controller, Electrician, Contractor, etc.).
 */
export function findSmartInsertionIndex(
  list: EmployeeProfile[],
  designation?: string,
  category?: string
): number {
  if (!list || list.length === 0) return 0
  const dNorm = (designation || '').toLowerCase().trim()

  // 1. Exact designation match: find the last active employee with the exact same designation
  let lastExactIdx = -1
  for (let i = 0; i < list.length; i++) {
    const e = list[i]
    if ((e.status || 'Active') === 'Resigned') continue
    if (dNorm && (e.designation || '').toLowerCase().trim() === dNorm) {
      lastExactIdx = i
    }
  }
  if (lastExactIdx !== -1) {
    return lastExactIdx + 1
  }

  // 2. Keyword match: e.g. "quality", "technician", "electrician", "supervisor", "contractor", "sweeper", "weaver", "helper", etc.
  const keywords = [
    'quality',
    'controller',
    'incharge',
    'supervisor',
    'technician',
    'electrician',
    'mechanic',
    'oil man',
    'folding',
    'time keeper',
    'sweeper',
    'kitchen',
    'contractor',
    'contracter',
    'weaver',
    'helper',
    'winder',
  ]
  const matchedKw = keywords.find((k) => dNorm.includes(k))
  if (matchedKw) {
    let lastKwIdx = -1
    for (let i = 0; i < list.length; i++) {
      const e = list[i]
      if ((e.status || 'Active') === 'Resigned') continue
      if ((e.designation || '').toLowerCase().includes(matchedKw)) {
        lastKwIdx = i
      }
    }
    if (lastKwIdx !== -1) {
      return lastKwIdx + 1
    }
  }

  // 3. Category match: infer category and find the last active in same category
  const targetCategory = inferEmployeeCategory({ designation, employeeCategory: category })
  let lastCatIdx = -1
  for (let i = 0; i < list.length; i++) {
    const e = list[i]
    if ((e.status || 'Active') === 'Resigned') continue
    if (inferEmployeeCategory(e) === targetCategory) {
      lastCatIdx = i
    }
  }
  if (lastCatIdx !== -1) {
    return lastCatIdx + 1
  }

  // 4. Default: insert after the last active employee (before any resigned records)
  let lastActiveIdx = -1
  for (let i = 0; i < list.length; i++) {
    if ((list[i].status || 'Active') !== 'Resigned') {
      lastActiveIdx = i
    }
  }
  if (lastActiveIdx !== -1) {
    return lastActiveIdx + 1
  }

  return list.length
}

function weaverSheetFields(emp: Pick<EmployeeProfile, 'designation' | 'salary' | 'ratePerDay30'> & { overtimeRate?: number }): {
  designation: 'Spare Weaver' | 'Weaver'
  wagePerDay: number
  holidayRate: number
} {
  const isSpare = (emp.designation || '').toLowerCase().includes('spare')
  const wage =
    Number(emp.ratePerDay30) || Math.round((Number(emp.salary) || 0) / 30) || (isSpare ? 1800 : 1450)
  const holidayRate = Number(emp.overtimeRate) || (isSpare ? 2100 : 1750)
  return {
    designation: isSpare ? 'Spare Weaver' : 'Weaver',
    wagePerDay: wage,
    holidayRate,
  }
}

function helperSheetFields(emp: Pick<EmployeeProfile, 'designation' | 'salary' | 'ratePerDay30'> & { overtimeRate?: number }): {
  designation: 'Helper' | 'Winder'
  wagePerDay: number
  otRate: number
} {
  const isWinder = (emp.designation || '').toLowerCase().includes('winder')
  const wage =
    Number(emp.ratePerDay30) || Math.round((Number(emp.salary) || 0) / 30) || (isWinder ? 1150 : 1050)
  const otRate = Number(emp.overtimeRate) || (isWinder ? 1400 : 1200)
  return {
    designation: isWinder ? 'Winder' : 'Helper',
    wagePerDay: wage,
    otRate,
  }
}

function sameJobFamily(emp: EmployeeProfile, rowDesignation?: string): boolean {
  if (!rowDesignation) return true
  return jobFamily(emp.designation, emp.employeeCategory) === jobFamily(rowDesignation)
}

function findLinkedEmployee(
  roster: EmployeeProfile[],
  name?: string,
  designation?: string,
  employeeId?: string
): EmployeeProfile | undefined {
  if (employeeId) {
    const byId = roster.find((emp) => emp.id === employeeId)
    if (byId) return byId
  }
  if (!name) return undefined

  const familyMatches = roster.filter(
    (emp) => namesMatch(emp.name, name) && sameJobFamily(emp, designation)
  )
  if (familyMatches.length === 1) return familyMatches[0]
  if (familyMatches.length > 1) {
    const exactDesignation = familyMatches.find(
      (emp) => normalizeName(emp.designation) === normalizeName(designation)
    )
    return exactDesignation || familyMatches[0]
  }
  return undefined
}


// Seed data directly transcribed from August-2026 Excel sheets
const INITIAL_STAFF_SALARIES: StaffSalaryRecord[] = [
  {
    "id": "staff-1",
    "serialNo": 1,
    "employeeName": "Muhammad Javed",
    "designation": "Incharge",
    "salary": 80000.0,
    "attendanceDays": 31.0,
    "ratePerDay": 2581,
    "basicSalary": 80000.0,
    "perHrRate": 333.33,
    "otHours": 45.0,
    "otAmount": 15000,
    "grossAmount": 95000,
    "lessAdvance": 20000.0,
    "chequeAmount": 60000.0,
    "synopsisAmount": 75000,
    "netCashAmount": 15000,
    "month": "2026-08"
  },
  {
    "id": "staff-2",
    "serialNo": 2,
    "employeeName": "Liaquat Ali",
    "designation": "Supervisor",
    "salary": 40000.0,
    "attendanceDays": 31.0,
    "ratePerDay": 1290,
    "basicSalary": 40000.0,
    "perHrRate": 166.67,
    "otHours": 194.0,
    "otAmount": 32333,
    "grossAmount": 72333,
    "lessAdvance": 10000.0,
    "chequeAmount": 0.0,
    "synopsisAmount": 62333,
    "netCashAmount": 62333,
    "month": "2026-08"
  },
  // --- September 2026 (From (09) Salary Sep.2026.xlsx) ---
  {
    "id": "st-sep-1",
    "serialNo": 1,
    "employeeId": "emp-1",
    "employeeName": "Muhammad Javed",
    "designation": "Incharge",
    "salary": 80000,
    "attendanceDays": 30,
    "ratePerDay": 2666.67,
    "basicSalary": 80000,
    "perHrRate": 333.33,
    "otHours": 60,
    "otAmount": 20000,
    "grossAmount": 100000,
    "lessAdvance": 20000,
    "chequeAmount": 60000,
    "synopsisAmount": 80000,
    "netCashAmount": 20000,
    "month": "2026-09"
  },
  {
    "id": "st-sep-2",
    "serialNo": 2,
    "employeeId": "emp-3",
    "employeeName": "Liaquat Ali",
    "designation": "Supervisor",
    "salary": 40000,
    "attendanceDays": 30,
    "ratePerDay": 1333.33,
    "basicSalary": 40000,
    "perHrRate": 166.67,
    "otHours": 176,
    "otAmount": 29333,
    "grossAmount": 69333,
    "lessAdvance": 10000,
    "chequeAmount": 0,
    "synopsisAmount": 59333,
    "netCashAmount": 59333,
    "month": "2026-09"
  }
]

const INITIAL_ADVANCES: AdvanceRecord[] = [
  {
    "id": "adv-1",
    "serialNo": 1,
    "employeeName": "Muhammed Javed",
    "designation": "Incharge",
    "amount": 20000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-2",
    "serialNo": 2,
    "employeeName": "Liaquat Ali",
    "designation": "Supervisor",
    "amount": 10000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-3",
    "serialNo": 3,
    "employeeName": "Tufail ur Rehman",
    "designation": "Accountant",
    "amount": 25000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-4",
    "serialNo": 4,
    "employeeName": "Kamran",
    "designation": "Quality Controller",
    "amount": 20000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-5",
    "serialNo": 5,
    "employeeName": "Ahmar",
    "designation": "Quality Controller",
    "amount": 10000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-6",
    "serialNo": 6,
    "employeeName": "Abdul Waheed",
    "designation": "Sr.Technician",
    "amount": 10000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-7",
    "serialNo": 7,
    "employeeName": "Basit",
    "designation": "Electrician",
    "amount": 20000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-8",
    "serialNo": 8,
    "employeeName": "Ameen Ullah Khan",
    "designation": "Electrician",
    "amount": 30000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-9",
    "serialNo": 9,
    "employeeName": "Shoaib",
    "designation": "Electrician",
    "amount": 5000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-10",
    "serialNo": 10,
    "employeeName": "Zulfiqar",
    "designation": "Asst Technician",
    "amount": 20000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-11",
    "serialNo": 11,
    "employeeName": "Maqsood",
    "designation": "Oil Man",
    "amount": 20000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-12",
    "serialNo": 12,
    "employeeName": "Salman",
    "designation": "Jeckquard",
    "amount": 20000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-13",
    "serialNo": 13,
    "employeeName": "Hasnain",
    "designation": "Jeckquard",
    "amount": 15000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-14",
    "serialNo": 14,
    "employeeName": "Nazakat",
    "designation": "Beem Gater",
    "amount": 30000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-15",
    "serialNo": 15,
    "employeeName": "Muhammad Arif",
    "designation": "Technician",
    "amount": 30000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-16",
    "serialNo": 16,
    "employeeName": "Mushtaq Ahmed",
    "designation": "Folding",
    "amount": 15000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-17",
    "serialNo": 17,
    "employeeName": "Ali Zar",
    "designation": "Sweeper",
    "amount": 7000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-18",
    "serialNo": 18,
    "employeeName": "Adison",
    "designation": "Sweeper",
    "amount": 8000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-19",
    "serialNo": 19,
    "employeeName": "Christopher",
    "designation": "Sweeper",
    "amount": 5000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-20",
    "serialNo": 20,
    "employeeName": "Amir",
    "designation": "Technician/Contracter",
    "amount": 30000.0,
    "date": "2026-08-05",
    "month": "2026-08",
    "fortnight": "1-15"
  },
  {
    "id": "adv-sep-1",
    "serialNo": 1,
    "employeeId": "emp-1",
    "employeeName": "Muhammed Javed",
    "designation": "Incharge",
    "amount": 20000.0,
    "date": "2026-09-05",
    "month": "2026-09",
    "fortnight": "all"
  },
  {
    "id": "adv-sep-2",
    "serialNo": 2,
    "employeeId": "emp-3",
    "employeeName": "Liaquat Ali",
    "designation": "Supervisor",
    "amount": 10000.0,
    "date": "2026-09-05",
    "month": "2026-09",
    "fortnight": "all"
  },
  {
    "id": "adv-sep-3",
    "serialNo": 3,
    "employeeId": "emp-2",
    "employeeName": "Tufail ur Rehman",
    "designation": "Accountant",
    "amount": 25000.0,
    "date": "2026-09-05",
    "month": "2026-09",
    "fortnight": "all"
  },
  {
    "id": "adv-sep-4",
    "serialNo": 4,
    "employeeId": "emp-5",
    "employeeName": "Kamran",
    "designation": "Quality Controller",
    "amount": 20000.0,
    "date": "2026-09-05",
    "month": "2026-09",
    "fortnight": "all"
  },
  {
    "id": "adv-sep-5",
    "serialNo": 5,
    "employeeId": "emp-6",
    "employeeName": "Ahmer",
    "designation": "Quality Controller",
    "amount": 20000.0,
    "date": "2026-09-05",
    "month": "2026-09",
    "fortnight": "all"
  },
  {
    "id": "adv-sep-6",
    "serialNo": 6,
    "employeeId": "emp-12",
    "employeeName": "Abdul Waheed",
    "designation": "Sr.Technician",
    "amount": 5000.0,
    "date": "2026-09-05",
    "month": "2026-09",
    "fortnight": "all"
  },
  {
    "id": "adv-sep-7",
    "serialNo": 7,
    "employeeId": "emp-adv-basit",
    "employeeName": "Basit",
    "designation": "Electrician",
    "amount": 20000.0,
    "date": "2026-09-05",
    "month": "2026-09",
    "fortnight": "all"
  },
  {
    "id": "adv-sep-8",
    "serialNo": 8,
    "employeeId": "emp-31",
    "employeeName": "Ameen Ullah Khan",
    "designation": "Electrician",
    "amount": 30000.0,
    "date": "2026-09-05",
    "month": "2026-09",
    "fortnight": "all"
  },
  {
    "id": "adv-sep-9",
    "serialNo": 9,
    "employeeId": "emp-sep-20-ubaid",
    "employeeName": "Ubaid",
    "designation": "Electrician",
    "amount": 0.0,
    "date": "2026-09-05",
    "month": "2026-09",
    "fortnight": "all"
  },
  {
    "id": "adv-sep-10",
    "serialNo": 10,
    "employeeId": "emp-69",
    "employeeName": "Shoaib",
    "designation": "Electrician",
    "amount": 5000.0,
    "date": "2026-09-05",
    "month": "2026-09",
    "fortnight": "all"
  },
  {
    "id": "adv-sep-11",
    "serialNo": 11,
    "employeeId": "emp-29",
    "employeeName": "Zulfiqar",
    "designation": "Asst Technician",
    "amount": 15000.0,
    "date": "2026-09-05",
    "month": "2026-09",
    "fortnight": "all"
  },
  {
    "id": "adv-sep-12",
    "serialNo": 12,
    "employeeId": "emp-21",
    "employeeName": "Maqsood",
    "designation": "Oil Man",
    "amount": 20000.0,
    "date": "2026-09-05",
    "month": "2026-09",
    "fortnight": "all"
  },
  {
    "id": "adv-sep-13",
    "serialNo": 13,
    "employeeId": "emp-sep-23-israr",
    "employeeName": "Israr",
    "designation": "Oil Man",
    "amount": 10000.0,
    "date": "2026-09-05",
    "month": "2026-09",
    "fortnight": "all"
  },
  {
    "id": "adv-sep-14",
    "serialNo": 14,
    "employeeId": "emp-22",
    "employeeName": "Salman",
    "designation": "Jeckquard",
    "amount": 20000.0,
    "date": "2026-09-05",
    "month": "2026-09",
    "fortnight": "all"
  },
  {
    "id": "adv-sep-15",
    "serialNo": 15,
    "employeeId": "emp-27",
    "employeeName": "Hasnain",
    "designation": "Jeckquard",
    "amount": 10000.0,
    "date": "2026-09-05",
    "month": "2026-09",
    "fortnight": "all"
  },
  {
    "id": "adv-sep-16",
    "serialNo": 16,
    "employeeId": "emp-10",
    "employeeName": "Muhammad Arif",
    "designation": "Technician",
    "amount": 30000.0,
    "date": "2026-09-05",
    "month": "2026-09",
    "fortnight": "all"
  },
  {
    "id": "adv-sep-17",
    "serialNo": 17,
    "employeeId": "emp-25",
    "employeeName": "Mushtaq Ahmed",
    "designation": "Folding",
    "amount": 15000.0,
    "date": "2026-09-05",
    "month": "2026-09",
    "fortnight": "all"
  },
  {
    "id": "adv-sep-18",
    "serialNo": 18,
    "employeeId": "emp-46",
    "employeeName": "Ali Zar",
    "designation": "Sweeper",
    "amount": 7000.0,
    "date": "2026-09-05",
    "month": "2026-09",
    "fortnight": "all"
  },
  {
    "id": "adv-sep-19",
    "serialNo": 19,
    "employeeId": "emp-sep-48-dawood",
    "employeeName": "Dawood",
    "designation": "Sweeper",
    "amount": 5000.0,
    "date": "2026-09-05",
    "month": "2026-09",
    "fortnight": "all"
  },
  {
    "id": "adv-sep-20",
    "serialNo": 20,
    "employeeId": "emp-67",
    "employeeName": "Nawab",
    "designation": "Gitta Winder/Contractor",
    "amount": 0.0,
    "date": "2026-09-05",
    "month": "2026-09",
    "fortnight": "all"
  },
  {
    "id": "adv-sep-21",
    "serialNo": 21,
    "employeeId": "emp-65",
    "employeeName": "Amir",
    "designation": "Technician/Contracter",
    "amount": 30000.0,
    "date": "2026-09-05",
    "month": "2026-09",
    "fortnight": "all"
  }
]

const INITIAL_HELPERS_WAGES: HelperWageRecord[] = [
  {
    "id": "h-1-1",
    "serialNo": 1,
    "employeeName": "REHAN KHAN",
    "designation": "Winder",
    "wagePerDay": 1150.0,
    "attendanceDays": 13.0,
    "wagesAmount": 14950.0,
    "otRate": 1400.0,
    "holidayAttendance": 1.0,
    "otAmount": 1400.0,
    "netAmount": 16350.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "h-1-2",
    "serialNo": 2,
    "employeeName": "KHALID",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 13.0,
    "wagesAmount": 13650.0,
    "otRate": 1200.0,
    "holidayAttendance": 1.0,
    "otAmount": 1200.0,
    "netAmount": 14850.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "h-1-3",
    "serialNo": 3,
    "employeeName": "MUDASSIR",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 13.0,
    "wagesAmount": 13650.0,
    "otRate": 1200.0,
    "holidayAttendance": 1.0,
    "otAmount": 1200.0,
    "netAmount": 14850.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "h-1-4",
    "serialNo": 4,
    "employeeName": "IBRAHEEM",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 12.0,
    "wagesAmount": 12600.0,
    "otRate": 1200.0,
    "holidayAttendance": 1.0,
    "otAmount": 1200.0,
    "netAmount": 13800.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "h-1-5",
    "serialNo": 5,
    "employeeName": "USMAN",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 13.0,
    "wagesAmount": 13650.0,
    "otRate": 1200.0,
    "holidayAttendance": 1.0,
    "otAmount": 1200.0,
    "netAmount": 14850.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "h-1-6",
    "serialNo": 6,
    "employeeName": "HASEEB",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 13.0,
    "wagesAmount": 13650.0,
    "otRate": 1200.0,
    "holidayAttendance": 1.0,
    "otAmount": 1200.0,
    "netAmount": 14850.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "h-1-7",
    "serialNo": 7,
    "employeeName": "WASIF",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 13.0,
    "wagesAmount": 13650.0,
    "otRate": 1200.0,
    "holidayAttendance": 1.0,
    "otAmount": 1200.0,
    "netAmount": 14850.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "h-1-8",
    "serialNo": 8,
    "employeeName": "REHAN",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 13.0,
    "wagesAmount": 13650.0,
    "otRate": 1200.0,
    "holidayAttendance": 1.0,
    "otAmount": 1200.0,
    "netAmount": 14850.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "h-1-9",
    "serialNo": 9,
    "employeeName": "INAYAT",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 11.0,
    "wagesAmount": 11550.0,
    "otRate": 1200.0,
    "holidayAttendance": 0.0,
    "otAmount": 0.0,
    "netAmount": 11550.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "h-1-10",
    "serialNo": 10,
    "employeeName": "AWAIS",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 13.0,
    "wagesAmount": 13650.0,
    "otRate": 1200.0,
    "holidayAttendance": 1.0,
    "otAmount": 1200.0,
    "netAmount": 14850.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "h-1-11",
    "serialNo": 11,
    "employeeName": "ABDUL SAMAD",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 11.0,
    "wagesAmount": 11550.0,
    "otRate": 1200.0,
    "holidayAttendance": 1.0,
    "otAmount": 1200.0,
    "netAmount": 12750.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "h-1-12",
    "serialNo": 12,
    "employeeName": "JAWAD",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 13.0,
    "wagesAmount": 13650.0,
    "otRate": 1200.0,
    "holidayAttendance": 1.0,
    "otAmount": 1200.0,
    "netAmount": 14850.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "h-2-13",
    "serialNo": 1,
    "employeeName": "REHAN",
    "designation": "Helper",
    "wagePerDay": 1150.0,
    "attendanceDays": 12.0,
    "wagesAmount": 13800.0,
    "otRate": 1400.0,
    "holidayAttendance": 2.0,
    "otAmount": 2800.0,
    "netAmount": 16600.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "h-2-14",
    "serialNo": 2,
    "employeeName": "KHALID",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 12.0,
    "wagesAmount": 12600.0,
    "otRate": 1200.0,
    "holidayAttendance": 2.0,
    "otAmount": 2400.0,
    "netAmount": 15000.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "h-2-15",
    "serialNo": 3,
    "employeeName": "MUDASSIR",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 13.0,
    "wagesAmount": 13650.0,
    "otRate": 1200.0,
    "holidayAttendance": 2.0,
    "otAmount": 2400.0,
    "netAmount": 16050.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "h-2-16",
    "serialNo": 4,
    "employeeName": "IBRAHEEM",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 13.0,
    "wagesAmount": 13650.0,
    "otRate": 1200.0,
    "holidayAttendance": 2.0,
    "otAmount": 2400.0,
    "netAmount": 16050.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "h-2-17",
    "serialNo": 5,
    "employeeName": "USMAN",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 13.0,
    "wagesAmount": 13650.0,
    "otRate": 1200.0,
    "holidayAttendance": 2.0,
    "otAmount": 2400.0,
    "netAmount": 16050.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "h-2-18",
    "serialNo": 6,
    "employeeName": "HASEEB",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 13.0,
    "wagesAmount": 13650.0,
    "otRate": 1200.0,
    "holidayAttendance": 2.0,
    "otAmount": 2400.0,
    "netAmount": 16050.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "h-2-19",
    "serialNo": 7,
    "employeeName": "WASIF",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 13.0,
    "wagesAmount": 13650.0,
    "otRate": 1200.0,
    "holidayAttendance": 2.0,
    "otAmount": 2400.0,
    "netAmount": 16050.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "h-2-20",
    "serialNo": 8,
    "employeeName": "REHAN",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 13.0,
    "wagesAmount": 13650.0,
    "otRate": 1200.0,
    "holidayAttendance": 2.0,
    "otAmount": 2400.0,
    "netAmount": 16050.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "h-2-21",
    "serialNo": 9,
    "employeeName": "INAYAT",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 11.0,
    "wagesAmount": 11550.0,
    "otRate": 1200.0,
    "holidayAttendance": 2.0,
    "otAmount": 2400.0,
    "netAmount": 13950.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "h-2-22",
    "serialNo": 10,
    "employeeName": "AWAIS",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 13.0,
    "wagesAmount": 13650.0,
    "otRate": 1200.0,
    "holidayAttendance": 2.0,
    "otAmount": 2400.0,
    "netAmount": 16050.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "h-2-23",
    "serialNo": 11,
    "employeeName": "ABDUL SAMAD",
    "designation": "Helper",
    "wagePerDay": 1050.0,
    "attendanceDays": 13.0,
    "wagesAmount": 13650.0,
    "otRate": 1200.0,
    "holidayAttendance": 2.0,
    "otAmount": 2400.0,
    "netAmount": 16050.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  // --- September 2026 (From (09) Salary Sep.2026.xlsx) ---
  {
    "id": "h-sep-1-1",
    "serialNo": 1,
    "employeeName": "REHAN KHAN",
    "designation": "Winder",
    "wagePerDay": 1150,
    "attendanceDays": 12,
    "wagesAmount": 13800,
    "otRate": 1400,
    "holidayAttendance": 2,
    "otAmount": 2800,
    "netAmount": 16600,
    "fortnight": "1-15",
    "month": "2026-09"
  },
  {
    "id": "h-sep-1-2",
    "serialNo": 2,
    "employeeName": "KHALID",
    "designation": "Helper",
    "wagePerDay": 1050,
    "attendanceDays": 13,
    "wagesAmount": 13650,
    "otRate": 1200,
    "holidayAttendance": 2,
    "otAmount": 2400,
    "netAmount": 16050,
    "fortnight": "1-15",
    "month": "2026-09"
  },
  {
    "id": "h-sep-1-3",
    "serialNo": 3,
    "employeeName": "MUDASSIR",
    "designation": "Helper",
    "wagePerDay": 1050,
    "attendanceDays": 12,
    "wagesAmount": 12600,
    "otRate": 1200,
    "holidayAttendance": 2,
    "otAmount": 2400,
    "netAmount": 15000,
    "fortnight": "1-15",
    "month": "2026-09"
  },
  {
    "id": "h-sep-1-4",
    "serialNo": 4,
    "employeeName": "IBRAHEEM",
    "designation": "Helper",
    "wagePerDay": 1050,
    "attendanceDays": 13,
    "wagesAmount": 13650,
    "otRate": 1200,
    "holidayAttendance": 2,
    "otAmount": 2400,
    "netAmount": 16050,
    "fortnight": "1-15",
    "month": "2026-09"
  },
  {
    "id": "h-sep-1-5",
    "serialNo": 5,
    "employeeName": "USMAN",
    "designation": "Helper",
    "wagePerDay": 1050,
    "attendanceDays": 7,
    "wagesAmount": 7350,
    "otRate": 1200,
    "holidayAttendance": 1,
    "otAmount": 1200,
    "netAmount": 8550,
    "fortnight": "1-15",
    "month": "2026-09"
  },
  {
    "id": "h-sep-1-6",
    "serialNo": 6,
    "employeeName": "HASEEB",
    "designation": "Helper",
    "wagePerDay": 1050,
    "attendanceDays": 13,
    "wagesAmount": 13650,
    "otRate": 1200,
    "holidayAttendance": 2,
    "otAmount": 2400,
    "netAmount": 16050,
    "fortnight": "1-15",
    "month": "2026-09"
  },
  {
    "id": "h-sep-1-7",
    "serialNo": 7,
    "employeeName": "WASIF",
    "designation": "Helper",
    "wagePerDay": 1050,
    "attendanceDays": 13,
    "wagesAmount": 13650,
    "otRate": 1200,
    "holidayAttendance": 2,
    "otAmount": 2400,
    "netAmount": 16050,
    "fortnight": "1-15",
    "month": "2026-09"
  },
  {
    "id": "h-sep-1-8",
    "serialNo": 8,
    "employeeName": "REHAN",
    "designation": "Helper",
    "wagePerDay": 1050,
    "attendanceDays": 12,
    "wagesAmount": 12600,
    "otRate": 1200,
    "holidayAttendance": 2,
    "otAmount": 2400,
    "netAmount": 15000,
    "fortnight": "1-15",
    "month": "2026-09"
  },
  {
    "id": "h-sep-1-9",
    "serialNo": 9,
    "employeeName": "INAYAT",
    "designation": "Helper",
    "wagePerDay": 1050,
    "attendanceDays": 10,
    "wagesAmount": 10500,
    "otRate": 1200,
    "holidayAttendance": 1,
    "otAmount": 1200,
    "netAmount": 11700,
    "fortnight": "1-15",
    "month": "2026-09"
  },
  {
    "id": "h-sep-1-10",
    "serialNo": 10,
    "employeeName": "AWAIS",
    "designation": "Helper",
    "wagePerDay": 1050,
    "attendanceDays": 11,
    "wagesAmount": 11550,
    "otRate": 1200,
    "holidayAttendance": 2,
    "otAmount": 2400,
    "netAmount": 13950,
    "fortnight": "1-15",
    "month": "2026-09"
  },
  {
    "id": "h-sep-1-11",
    "serialNo": 11,
    "employeeName": "ABDUL SAMAD",
    "designation": "Helper",
    "wagePerDay": 1050,
    "attendanceDays": 11,
    "wagesAmount": 11550,
    "otRate": 1200,
    "holidayAttendance": 2,
    "otAmount": 2400,
    "netAmount": 13950,
    "fortnight": "1-15",
    "month": "2026-09"
  },
  {
    "id": "h-sep-2-1",
    "serialNo": 1,
    "employeeName": "REHAN",
    "designation": "Winder",
    "wagePerDay": 1150,
    "attendanceDays": 0,
    "wagesAmount": 0,
    "otRate": 1400,
    "holidayAttendance": 0,
    "otAmount": 0,
    "netAmount": 0,
    "fortnight": "16-31",
    "month": "2026-09"
  },
  {
    "id": "h-sep-2-2",
    "serialNo": 2,
    "employeeName": "KHALID",
    "designation": "Helper",
    "wagePerDay": 1050,
    "attendanceDays": 0,
    "wagesAmount": 0,
    "otRate": 1200,
    "holidayAttendance": 0,
    "otAmount": 0,
    "netAmount": 0,
    "fortnight": "16-31",
    "month": "2026-09"
  },
  {
    "id": "h-sep-2-3",
    "serialNo": 3,
    "employeeName": "MUDASSIR",
    "designation": "Helper",
    "wagePerDay": 1050,
    "attendanceDays": 0,
    "wagesAmount": 0,
    "otRate": 1200,
    "holidayAttendance": 0,
    "otAmount": 0,
    "netAmount": 0,
    "fortnight": "16-31",
    "month": "2026-09"
  },
  {
    "id": "h-sep-2-4",
    "serialNo": 4,
    "employeeName": "IBRAHEEM",
    "designation": "Helper",
    "wagePerDay": 1050,
    "attendanceDays": 0,
    "wagesAmount": 0,
    "otRate": 1200,
    "holidayAttendance": 0,
    "otAmount": 0,
    "netAmount": 0,
    "fortnight": "16-31",
    "month": "2026-09"
  },
  {
    "id": "h-sep-2-5",
    "serialNo": 5,
    "employeeName": "USMAN",
    "designation": "Helper",
    "wagePerDay": 1050,
    "attendanceDays": 0,
    "wagesAmount": 0,
    "otRate": 1200,
    "holidayAttendance": 0,
    "otAmount": 0,
    "netAmount": 0,
    "fortnight": "16-31",
    "month": "2026-09"
  },
  {
    "id": "h-sep-2-6",
    "serialNo": 6,
    "employeeName": "HASEEB",
    "designation": "Helper",
    "wagePerDay": 1050,
    "attendanceDays": 0,
    "wagesAmount": 0,
    "otRate": 1200,
    "holidayAttendance": 0,
    "otAmount": 0,
    "netAmount": 0,
    "fortnight": "16-31",
    "month": "2026-09"
  },
  {
    "id": "h-sep-2-7",
    "serialNo": 7,
    "employeeName": "WASIF",
    "designation": "Helper",
    "wagePerDay": 1050,
    "attendanceDays": 0,
    "wagesAmount": 0,
    "otRate": 1200,
    "holidayAttendance": 0,
    "otAmount": 0,
    "netAmount": 0,
    "fortnight": "16-31",
    "month": "2026-09"
  },
  {
    "id": "h-sep-2-8",
    "serialNo": 8,
    "employeeName": "REHAN",
    "designation": "Helper",
    "wagePerDay": 1050,
    "attendanceDays": 0,
    "wagesAmount": 0,
    "otRate": 1200,
    "holidayAttendance": 0,
    "otAmount": 0,
    "netAmount": 0,
    "fortnight": "16-31",
    "month": "2026-09"
  },
  {
    "id": "h-sep-2-9",
    "serialNo": 9,
    "employeeName": "INAYAT",
    "designation": "Helper",
    "wagePerDay": 1050,
    "attendanceDays": 0,
    "wagesAmount": 0,
    "otRate": 1200,
    "holidayAttendance": 0,
    "otAmount": 0,
    "netAmount": 0,
    "fortnight": "16-31",
    "month": "2026-09"
  },
  {
    "id": "h-sep-2-10",
    "serialNo": 10,
    "employeeName": "AWAIS",
    "designation": "Helper",
    "wagePerDay": 1050,
    "attendanceDays": 0,
    "wagesAmount": 0,
    "otRate": 1200,
    "holidayAttendance": 0,
    "otAmount": 0,
    "netAmount": 0,
    "fortnight": "16-31",
    "month": "2026-09"
  },
  {
    "id": "h-sep-2-11",
    "serialNo": 11,
    "employeeName": "ABDUL SAMAD",
    "designation": "Helper",
    "wagePerDay": 1050,
    "attendanceDays": 0,
    "wagesAmount": 0,
    "otRate": 1200,
    "holidayAttendance": 0,
    "otAmount": 0,
    "netAmount": 0,
    "fortnight": "16-31",
    "month": "2026-09"
  }
]

const INITIAL_WEAVERS_WAGES: WeaverWageRecord[] = [
  {
    "id": "w-1-1",
    "serialNo": 1,
    "employeeName": "HASSAN",
    "designation": "Spare Weaver",
    "wagePerDay": 1800,
    "attendanceDays": 8.0,
    "basicSalary": 14400.0,
    "rateLoom": 150,
    "extraLooms": 0.0,
    "extraLoomAmount": 0.0,
    "attendanceAllowance": 0.0,
    "holidayAttendance": 1.0,
    "holidayRate": 2100,
    "holidayAmount": 2100.0,
    "efficiencyAmount": 2268.0,
    "grossAmount": 14400.0,
    "netPay": 18768.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "w-1-2",
    "serialNo": 2,
    "employeeName": "YASIR",
    "designation": "Spare Weaver",
    "wagePerDay": 1800,
    "attendanceDays": 16.0,
    "basicSalary": 28800.0,
    "rateLoom": 150,
    "extraLooms": 4.0,
    "extraLoomAmount": 600.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 1.0,
    "holidayRate": 2100,
    "holidayAmount": 2100.0,
    "efficiencyAmount": 4284.0,
    "grossAmount": 30200.0,
    "netPay": 36584.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "w-1-3",
    "serialNo": 3,
    "employeeName": "KASHIF",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 14.0,
    "extraLoomAmount": 2100.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 1.0,
    "holidayRate": 1750,
    "holidayAmount": 1750.0,
    "efficiencyAmount": 5454.0,
    "grossAmount": 21750.0,
    "netPay": 28954.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "w-1-4",
    "serialNo": 4,
    "employeeName": "ARIF",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 12.0,
    "basicSalary": 17400.0,
    "rateLoom": 150,
    "extraLooms": 39.0,
    "extraLoomAmount": 5850.0,
    "attendanceAllowance": 0.0,
    "holidayAttendance": 1.0,
    "holidayRate": 1750,
    "holidayAmount": 1750.0,
    "efficiencyAmount": 1620.0,
    "grossAmount": 23250.0,
    "netPay": 26620.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "w-1-5",
    "serialNo": 5,
    "employeeName": "ADNAN BALOCH",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 11.0,
    "basicSalary": 15950.0,
    "rateLoom": 150,
    "extraLooms": 4.0,
    "extraLoomAmount": 600.0,
    "attendanceAllowance": 0.0,
    "holidayAttendance": 1.0,
    "holidayRate": 1750,
    "holidayAmount": 1750.0,
    "efficiencyAmount": 1985.0,
    "grossAmount": 16550.0,
    "netPay": 20285.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "w-1-6",
    "serialNo": 6,
    "employeeName": "AKMAL",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 14.0,
    "extraLoomAmount": 2100.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 1.0,
    "holidayRate": 1750,
    "holidayAmount": 1750.0,
    "efficiencyAmount": 5387.0,
    "grossAmount": 21750.0,
    "netPay": 28887.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "w-1-7",
    "serialNo": 7,
    "employeeName": "SHAH JALAL",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 12.0,
    "basicSalary": 17400.0,
    "rateLoom": 150,
    "extraLooms": 0.0,
    "extraLoomAmount": 0.0,
    "attendanceAllowance": 0.0,
    "holidayAttendance": 1.0,
    "holidayRate": 1750,
    "holidayAmount": 1750.0,
    "efficiencyAmount": 716.0,
    "grossAmount": 17400.0,
    "netPay": 19866.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "w-1-8",
    "serialNo": 8,
    "employeeName": "NAQEEBULLAH",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 14.0,
    "extraLoomAmount": 2100.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 1.0,
    "holidayRate": 1750,
    "holidayAmount": 1750.0,
    "efficiencyAmount": 3902.0,
    "grossAmount": 21750.0,
    "netPay": 27402.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "w-1-9",
    "serialNo": 9,
    "employeeName": "FAYAZ",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 4.0,
    "extraLoomAmount": 600.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 1.0,
    "holidayRate": 1750,
    "holidayAmount": 1750.0,
    "efficiencyAmount": 1971.0,
    "grossAmount": 20250.0,
    "netPay": 23971.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "w-1-10",
    "serialNo": 10,
    "employeeName": "IMTIAZ",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 14.0,
    "extraLoomAmount": 2100.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 1.0,
    "holidayRate": 1750,
    "holidayAmount": 1750.0,
    "efficiencyAmount": 2808.0,
    "grossAmount": 21750.0,
    "netPay": 26308.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "w-1-11",
    "serialNo": 11,
    "employeeName": "AJMAL",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 14.0,
    "extraLoomAmount": 2100.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 1.0,
    "holidayRate": 1750,
    "holidayAmount": 1750.0,
    "efficiencyAmount": 3915.0,
    "grossAmount": 21750.0,
    "netPay": 27415.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "w-1-12",
    "serialNo": 12,
    "employeeName": "BASIT",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 11.0,
    "basicSalary": 15950.0,
    "rateLoom": 150,
    "extraLooms": 4.0,
    "extraLoomAmount": 600.0,
    "attendanceAllowance": 0.0,
    "holidayAttendance": 1.0,
    "holidayRate": 1750,
    "holidayAmount": 1750.0,
    "efficiencyAmount": 1458.0,
    "grossAmount": 16550.0,
    "netPay": 19758.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "w-1-13",
    "serialNo": 13,
    "employeeName": "RUSTAM",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 12.0,
    "basicSalary": 17400.0,
    "rateLoom": 150,
    "extraLooms": 0.0,
    "extraLoomAmount": 0.0,
    "attendanceAllowance": 0.0,
    "holidayAttendance": 1.0,
    "holidayRate": 1750,
    "holidayAmount": 1750.0,
    "efficiencyAmount": 1661.0,
    "grossAmount": 17400.0,
    "netPay": 20811.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "w-1-14",
    "serialNo": 14,
    "employeeName": "SHAHZAIB",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 14.0,
    "extraLoomAmount": 2100.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 1.0,
    "holidayRate": 1750,
    "holidayAmount": 1750.0,
    "efficiencyAmount": 3915.0,
    "grossAmount": 21750.0,
    "netPay": 27415.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "w-1-15",
    "serialNo": 15,
    "employeeName": "NAZEER AHMED",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 3.0,
    "extraLoomAmount": 450.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 1.0,
    "holidayRate": 1750,
    "holidayAmount": 1750.0,
    "efficiencyAmount": 2336.0,
    "grossAmount": 20100.0,
    "netPay": 24186.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "w-1-16",
    "serialNo": 16,
    "employeeName": "SHEHZAD",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 14.0,
    "extraLoomAmount": 2100.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 1.0,
    "holidayRate": 1750,
    "holidayAmount": 1750.0,
    "efficiencyAmount": 3902.0,
    "grossAmount": 21750.0,
    "netPay": 27402.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "w-1-17",
    "serialNo": 17,
    "employeeName": "HAMZA",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 14.0,
    "extraLoomAmount": 2100.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 1.0,
    "holidayRate": 1750,
    "holidayAmount": 1750.0,
    "efficiencyAmount": 2808.0,
    "grossAmount": 21750.0,
    "netPay": 26308.0,
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "w-2-18",
    "serialNo": 1,
    "employeeName": "HASSAN",
    "designation": "Spare Weaver",
    "wagePerDay": 1800,
    "attendanceDays": 13.0,
    "basicSalary": 23400.0,
    "rateLoom": 150,
    "extraLooms": 0.0,
    "extraLoomAmount": 0.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 2.0,
    "holidayRate": 2100,
    "holidayAmount": 4200.0,
    "efficiencyAmount": 3240.0,
    "grossAmount": 24200.0,
    "netPay": 31640.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "w-2-19",
    "serialNo": 2,
    "employeeName": "YASIR",
    "designation": "Spare Weaver",
    "wagePerDay": 1800,
    "attendanceDays": 13.0,
    "basicSalary": 23400.0,
    "rateLoom": 150,
    "extraLooms": 0.0,
    "extraLoomAmount": 0.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 2.0,
    "holidayRate": 2100,
    "holidayAmount": 4200.0,
    "efficiencyAmount": 3240.0,
    "grossAmount": 24200.0,
    "netPay": 31640.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "w-2-20",
    "serialNo": 3,
    "employeeName": "KASHIF",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 35.0,
    "extraLoomAmount": 5250.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 2.0,
    "holidayRate": 1750,
    "holidayAmount": 3500.0,
    "efficiencyAmount": 5844.0,
    "grossAmount": 24900.0,
    "netPay": 34244.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "w-2-21",
    "serialNo": 4,
    "employeeName": "ARIF",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 0.0,
    "extraLoomAmount": 0.0,
    "attendanceAllowance": 0.0,
    "holidayAttendance": 1.0,
    "holidayRate": 1750,
    "holidayAmount": 1750.0,
    "efficiencyAmount": 580.0,
    "grossAmount": 18850.0,
    "netPay": 21180.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "w-2-22",
    "serialNo": 5,
    "employeeName": "FAYAZ",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 8.0,
    "extraLoomAmount": 1200.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 2.0,
    "holidayRate": 1750,
    "holidayAmount": 3500.0,
    "efficiencyAmount": 2088.0,
    "grossAmount": 20850.0,
    "netPay": 26438.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "w-2-23",
    "serialNo": 6,
    "employeeName": "ADNAN BALOCH",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 12.0,
    "basicSalary": 17400.0,
    "rateLoom": 150,
    "extraLooms": 4.0,
    "extraLoomAmount": 600.0,
    "attendanceAllowance": 0.0,
    "holidayAttendance": 1.0,
    "holidayRate": 1750,
    "holidayAmount": 1750.0,
    "efficiencyAmount": 1523.0,
    "grossAmount": 18000.0,
    "netPay": 21273.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "w-2-24",
    "serialNo": 7,
    "employeeName": "SHAH JALAL",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 0.0,
    "extraLoomAmount": 0.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 2.0,
    "holidayRate": 1750,
    "holidayAmount": 3500.0,
    "efficiencyAmount": 580.0,
    "grossAmount": 19650.0,
    "netPay": 23730.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "w-2-25",
    "serialNo": 8,
    "employeeName": "AKMAL",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 15.0,
    "extraLoomAmount": 2250.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 2.0,
    "holidayRate": 1750,
    "holidayAmount": 3500.0,
    "efficiencyAmount": 6003.0,
    "grossAmount": 21900.0,
    "netPay": 31403.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "w-2-26",
    "serialNo": 9,
    "employeeName": "IMTIAZ",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 15.0,
    "extraLoomAmount": 2250.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 2.0,
    "holidayRate": 1750,
    "holidayAmount": 3500.0,
    "efficiencyAmount": 3263.0,
    "grossAmount": 21900.0,
    "netPay": 28663.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "w-2-27",
    "serialNo": 10,
    "employeeName": "AJMAL",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 35.0,
    "extraLoomAmount": 5250.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 2.0,
    "holidayRate": 1750,
    "holidayAmount": 3500.0,
    "efficiencyAmount": 5394.0,
    "grossAmount": 24900.0,
    "netPay": 33794.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "w-2-28",
    "serialNo": 11,
    "employeeName": "RUSTAM",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 11.0,
    "basicSalary": 15950.0,
    "rateLoom": 150,
    "extraLooms": 0.0,
    "extraLoomAmount": 0.0,
    "attendanceAllowance": 0.0,
    "holidayAttendance": 2.0,
    "holidayRate": 1750,
    "holidayAmount": 3500.0,
    "efficiencyAmount": 1508.0,
    "grossAmount": 15950.0,
    "netPay": 20958.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "w-2-29",
    "serialNo": 12,
    "employeeName": "SHAH ZAIB",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 15.0,
    "extraLoomAmount": 2250.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 2.0,
    "holidayRate": 1750,
    "holidayAmount": 3500.0,
    "efficiencyAmount": 5452.0,
    "grossAmount": 21900.0,
    "netPay": 30852.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "w-2-30",
    "serialNo": 13,
    "employeeName": "BASIT",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 12.0,
    "basicSalary": 17400.0,
    "rateLoom": 150,
    "extraLooms": 8.0,
    "extraLoomAmount": 1200.0,
    "attendanceAllowance": 0.0,
    "holidayAttendance": 2.0,
    "holidayRate": 1750,
    "holidayAmount": 3500.0,
    "efficiencyAmount": 1769.0,
    "grossAmount": 18600.0,
    "netPay": 23869.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "w-2-31",
    "serialNo": 14,
    "employeeName": "JAWAD",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 3.0,
    "extraLoomAmount": 450.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 2.0,
    "holidayRate": 1750,
    "holidayAmount": 3500.0,
    "efficiencyAmount": 3350.0,
    "grossAmount": 20100.0,
    "netPay": 26950.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "w-2-32",
    "serialNo": 15,
    "employeeName": "NAZEER AHMED",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 0.0,
    "extraLoomAmount": 0.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 2.0,
    "holidayRate": 1750,
    "holidayAmount": 3500.0,
    "efficiencyAmount": 3828.0,
    "grossAmount": 19650.0,
    "netPay": 26978.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "w-2-33",
    "serialNo": 16,
    "employeeName": "SHEHZAD",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 5.0,
    "basicSalary": 7250.0,
    "rateLoom": 150,
    "extraLooms": 5.0,
    "extraLoomAmount": 750.0,
    "attendanceAllowance": 0.0,
    "holidayAttendance": 0.0,
    "holidayRate": 1750,
    "holidayAmount": 0.0,
    "efficiencyAmount": 1827.0,
    "grossAmount": 8000.0,
    "netPay": 9827.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "w-2-34",
    "serialNo": 17,
    "employeeName": "NAQEEBULLAH",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 15.0,
    "extraLoomAmount": 2250.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 2.0,
    "holidayRate": 1750,
    "holidayAmount": 3500.0,
    "efficiencyAmount": 4945.0,
    "grossAmount": 21900.0,
    "netPay": 30345.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "w-2-35",
    "serialNo": 18,
    "employeeName": "HAMZA",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13.0,
    "basicSalary": 18850.0,
    "rateLoom": 150,
    "extraLooms": 25.0,
    "extraLoomAmount": 3750.0,
    "attendanceAllowance": 800.0,
    "holidayAttendance": 2.0,
    "holidayRate": 1750,
    "holidayAmount": 3500.0,
    "efficiencyAmount": 3422.0,
    "grossAmount": 23400.0,
    "netPay": 30322.0,
    "fortnight": "16-31",
    "month": "2026-08"
  },
  // --- September 2026 (From (09) Salary Sep.2026.xlsx) ---
  {
    "id": "w-sep-1-1",
    "serialNo": 1,
    "employeeName": "HASSAN",
    "designation": "Spare Weaver",
    "wagePerDay": 1800,
    "attendanceDays": 13,
    "basicSalary": 23400,
    "rateLoom": 150,
    "extraLooms": 0,
    "extraLoomAmount": 0,
    "attendanceAllowance": 800,
    "holidayAttendance": 2,
    "holidayRate": 2100,
    "holidayAmount": 4200,
    "efficiencyAmount": 3780,
    "grossAmount": 24200,
    "netPay": 32180,
    "fortnight": "1-15",
    "month": "2026-09"
  },
  {
    "id": "w-sep-1-2",
    "serialNo": 2,
    "employeeName": "YASIR",
    "designation": "Spare Weaver",
    "wagePerDay": 1800,
    "attendanceDays": 13,
    "basicSalary": 23400,
    "rateLoom": 150,
    "extraLooms": 0,
    "extraLoomAmount": 0,
    "attendanceAllowance": 800,
    "holidayAttendance": 2,
    "holidayRate": 2100,
    "holidayAmount": 4200,
    "efficiencyAmount": 3780,
    "grossAmount": 24200,
    "netPay": 32180,
    "fortnight": "1-15",
    "month": "2026-09"
  },
  {
    "id": "w-sep-1-3",
    "serialNo": 3,
    "employeeName": "KASHIF",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13,
    "basicSalary": 18850,
    "rateLoom": 150,
    "extraLooms": 43,
    "extraLoomAmount": 6450,
    "attendanceAllowance": 800,
    "holidayAttendance": 2,
    "holidayRate": 1750,
    "holidayAmount": 3500,
    "efficiencyAmount": 5177,
    "grossAmount": 26100,
    "netPay": 34777,
    "fortnight": "1-15",
    "month": "2026-09"
  },
  {
    "id": "w-sep-1-4",
    "serialNo": 4,
    "employeeName": "ARIF",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13,
    "basicSalary": 18850,
    "rateLoom": 150,
    "extraLooms": 12,
    "extraLoomAmount": 1800,
    "attendanceAllowance": 800,
    "holidayAttendance": 2,
    "holidayRate": 1750,
    "holidayAmount": 3500,
    "efficiencyAmount": 1595,
    "grossAmount": 21450,
    "netPay": 26545,
    "fortnight": "1-15",
    "month": "2026-09"
  },
  {
    "id": "w-sep-1-5",
    "serialNo": 5,
    "employeeName": "ADNAN BALOCH",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 12,
    "basicSalary": 17400,
    "rateLoom": 150,
    "extraLooms": 8,
    "extraLoomAmount": 1200,
    "attendanceAllowance": 0,
    "holidayAttendance": 2,
    "holidayRate": 1750,
    "holidayAmount": 3500,
    "efficiencyAmount": 1798,
    "grossAmount": 18600,
    "netPay": 23898,
    "fortnight": "1-15",
    "month": "2026-09"
  },
  {
    "id": "w-sep-1-6",
    "serialNo": 6,
    "employeeName": "AKMAL",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 7,
    "basicSalary": 10150,
    "rateLoom": 150,
    "extraLooms": 10,
    "extraLoomAmount": 1500,
    "attendanceAllowance": 0,
    "holidayAttendance": 1,
    "holidayRate": 1750,
    "holidayAmount": 1750,
    "efficiencyAmount": 3437,
    "grossAmount": 11650,
    "netPay": 16837,
    "fortnight": "1-15",
    "month": "2026-09"
  },
  {
    "id": "w-sep-1-7",
    "serialNo": 7,
    "employeeName": "SHAH JALAL",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 9,
    "basicSalary": 13050,
    "rateLoom": 150,
    "extraLooms": 0,
    "extraLoomAmount": 0,
    "attendanceAllowance": 0,
    "holidayAttendance": 1,
    "holidayRate": 1750,
    "holidayAmount": 1750,
    "efficiencyAmount": 1117,
    "grossAmount": 13050,
    "netPay": 15917,
    "fortnight": "1-15",
    "month": "2026-09"
  },
  {
    "id": "w-sep-1-8",
    "serialNo": 8,
    "employeeName": "NAQEEBULLAH",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13,
    "basicSalary": 18850,
    "rateLoom": 150,
    "extraLooms": 31,
    "extraLoomAmount": 4650,
    "attendanceAllowance": 800,
    "holidayAttendance": 2,
    "holidayRate": 1750,
    "holidayAmount": 3500,
    "efficiencyAmount": 3741,
    "grossAmount": 24300,
    "netPay": 31541,
    "fortnight": "1-15",
    "month": "2026-09"
  },
  {
    "id": "w-sep-1-9",
    "serialNo": 9,
    "employeeName": "FAYAZ",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13,
    "basicSalary": 18850,
    "rateLoom": 150,
    "extraLooms": 4,
    "extraLoomAmount": 600,
    "attendanceAllowance": 0,
    "holidayAttendance": 1,
    "holidayRate": 1750,
    "holidayAmount": 1750,
    "efficiencyAmount": 2393,
    "grossAmount": 19450,
    "netPay": 23593,
    "fortnight": "1-15",
    "month": "2026-09"
  },
  {
    "id": "w-sep-1-10",
    "serialNo": 10,
    "employeeName": "IMTIAZ",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 12,
    "basicSalary": 17400,
    "rateLoom": 150,
    "extraLooms": 21,
    "extraLoomAmount": 3150,
    "attendanceAllowance": 0,
    "holidayAttendance": 2,
    "holidayRate": 1750,
    "holidayAmount": 3500,
    "efficiencyAmount": 2030,
    "grossAmount": 20550,
    "netPay": 26080,
    "fortnight": "1-15",
    "month": "2026-09"
  },
  {
    "id": "w-sep-1-11",
    "serialNo": 11,
    "employeeName": "AJMAL",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13,
    "basicSalary": 18850,
    "rateLoom": 150,
    "extraLooms": 43,
    "extraLoomAmount": 6450,
    "attendanceAllowance": 800,
    "holidayAttendance": 2,
    "holidayRate": 1750,
    "holidayAmount": 3500,
    "efficiencyAmount": 3915,
    "grossAmount": 26100,
    "netPay": 33515,
    "fortnight": "1-15",
    "month": "2026-09"
  },
  {
    "id": "w-sep-1-12",
    "serialNo": 12,
    "employeeName": "BASIT",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 11,
    "basicSalary": 15950,
    "rateLoom": 150,
    "extraLooms": 4,
    "extraLoomAmount": 600,
    "attendanceAllowance": 0,
    "holidayAttendance": 2,
    "holidayRate": 1750,
    "holidayAmount": 3500,
    "efficiencyAmount": 1653,
    "grossAmount": 16550,
    "netPay": 21703,
    "fortnight": "1-15",
    "month": "2026-09"
  },
  {
    "id": "w-sep-1-13",
    "serialNo": 13,
    "employeeName": "RUSTAM",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 12,
    "basicSalary": 17400,
    "rateLoom": 150,
    "extraLooms": 4,
    "extraLoomAmount": 600,
    "attendanceAllowance": 0,
    "holidayAttendance": 2,
    "holidayRate": 1750,
    "holidayAmount": 3500,
    "efficiencyAmount": 1479,
    "grossAmount": 18000,
    "netPay": 22979,
    "fortnight": "1-15",
    "month": "2026-09"
  },
  {
    "id": "w-sep-1-14",
    "serialNo": 14,
    "employeeName": "SHAHZAIB",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13,
    "basicSalary": 18850,
    "rateLoom": 150,
    "extraLooms": 30,
    "extraLoomAmount": 4500,
    "attendanceAllowance": 800,
    "holidayAttendance": 2,
    "holidayRate": 1750,
    "holidayAmount": 3500,
    "efficiencyAmount": 4104,
    "grossAmount": 24150,
    "netPay": 31754,
    "fortnight": "1-15",
    "month": "2026-09"
  },
  {
    "id": "w-sep-1-15",
    "serialNo": 15,
    "employeeName": "NAZEER AHMED",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13,
    "basicSalary": 18850,
    "rateLoom": 150,
    "extraLooms": 3,
    "extraLoomAmount": 450,
    "attendanceAllowance": 800,
    "holidayAttendance": 2,
    "holidayRate": 1750,
    "holidayAmount": 3500,
    "efficiencyAmount": 3132,
    "grossAmount": 20100,
    "netPay": 26732,
    "fortnight": "1-15",
    "month": "2026-09"
  },
  {
    "id": "w-sep-1-16",
    "serialNo": 16,
    "employeeName": "SHEHZAD",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 1,
    "basicSalary": 1450,
    "rateLoom": 150,
    "extraLooms": 1,
    "extraLoomAmount": 150,
    "attendanceAllowance": 0,
    "holidayAttendance": 0,
    "holidayRate": 1750,
    "holidayAmount": 0,
    "efficiencyAmount": 305,
    "grossAmount": 1600,
    "netPay": 1905,
    "fortnight": "1-15",
    "month": "2026-09"
  },
  {
    "id": "w-sep-1-17",
    "serialNo": 17,
    "employeeName": "JAWAD",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13,
    "basicSalary": 18850,
    "rateLoom": 150,
    "extraLooms": 0,
    "extraLoomAmount": 0,
    "attendanceAllowance": 800,
    "holidayAttendance": 2,
    "holidayRate": 1750,
    "holidayAmount": 3500,
    "efficiencyAmount": 3103,
    "grossAmount": 19650,
    "netPay": 26253,
    "fortnight": "1-15",
    "month": "2026-09"
  },
  {
    "id": "w-sep-1-18",
    "serialNo": 18,
    "employeeName": "HAMZA",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 13,
    "basicSalary": 18850,
    "rateLoom": 150,
    "extraLooms": 29,
    "extraLoomAmount": 4350,
    "attendanceAllowance": 800,
    "holidayAttendance": 2,
    "holidayRate": 1750,
    "holidayAmount": 3500,
    "efficiencyAmount": 2190,
    "grossAmount": 24000,
    "netPay": 29690,
    "fortnight": "1-15",
    "month": "2026-09"
  },
  {
    "id": "w-sep-2-1",
    "serialNo": 1,
    "employeeName": "HASSAN",
    "designation": "Spare Weaver",
    "wagePerDay": 1800,
    "attendanceDays": 0,
    "basicSalary": 0,
    "rateLoom": 150,
    "extraLooms": 0,
    "extraLoomAmount": 0,
    "attendanceAllowance": 0,
    "holidayAttendance": 0,
    "holidayRate": 2100,
    "holidayAmount": 0,
    "efficiencyAmount": 0,
    "grossAmount": 0,
    "netPay": 0,
    "fortnight": "16-31",
    "month": "2026-09"
  },
  {
    "id": "w-sep-2-2",
    "serialNo": 2,
    "employeeName": "YASIR",
    "designation": "Spare Weaver",
    "wagePerDay": 1800,
    "attendanceDays": 0,
    "basicSalary": 0,
    "rateLoom": 150,
    "extraLooms": 0,
    "extraLoomAmount": 0,
    "attendanceAllowance": 0,
    "holidayAttendance": 0,
    "holidayRate": 2100,
    "holidayAmount": 0,
    "efficiencyAmount": 0,
    "grossAmount": 0,
    "netPay": 0,
    "fortnight": "16-31",
    "month": "2026-09"
  },
  {
    "id": "w-sep-2-3",
    "serialNo": 3,
    "employeeName": "KASHIF",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 0,
    "basicSalary": 0,
    "rateLoom": 150,
    "extraLooms": 0,
    "extraLoomAmount": 0,
    "attendanceAllowance": 0,
    "holidayAttendance": 0,
    "holidayRate": 1750,
    "holidayAmount": 0,
    "efficiencyAmount": 0,
    "grossAmount": 0,
    "netPay": 0,
    "fortnight": "16-31",
    "month": "2026-09"
  },
  {
    "id": "w-sep-2-4",
    "serialNo": 4,
    "employeeName": "ARIF",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 0,
    "basicSalary": 0,
    "rateLoom": 150,
    "extraLooms": 0,
    "extraLoomAmount": 0,
    "attendanceAllowance": 0,
    "holidayAttendance": 0,
    "holidayRate": 1750,
    "holidayAmount": 0,
    "efficiencyAmount": 0,
    "grossAmount": 0,
    "netPay": 0,
    "fortnight": "16-31",
    "month": "2026-09"
  },
  {
    "id": "w-sep-2-5",
    "serialNo": 5,
    "employeeName": "FAYAZ",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 0,
    "basicSalary": 0,
    "rateLoom": 150,
    "extraLooms": 0,
    "extraLoomAmount": 0,
    "attendanceAllowance": 0,
    "holidayAttendance": 0,
    "holidayRate": 1750,
    "holidayAmount": 0,
    "efficiencyAmount": 0,
    "grossAmount": 0,
    "netPay": 0,
    "fortnight": "16-31",
    "month": "2026-09"
  },
  {
    "id": "w-sep-2-6",
    "serialNo": 6,
    "employeeName": "ADNAN BALOCH",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 0,
    "basicSalary": 0,
    "rateLoom": 150,
    "extraLooms": 0,
    "extraLoomAmount": 0,
    "attendanceAllowance": 0,
    "holidayAttendance": 0,
    "holidayRate": 1750,
    "holidayAmount": 0,
    "efficiencyAmount": 0,
    "grossAmount": 0,
    "netPay": 0,
    "fortnight": "16-31",
    "month": "2026-09"
  },
  {
    "id": "w-sep-2-7",
    "serialNo": 7,
    "employeeName": "SHAH JALAL",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 0,
    "basicSalary": 0,
    "rateLoom": 150,
    "extraLooms": 0,
    "extraLoomAmount": 0,
    "attendanceAllowance": 0,
    "holidayAttendance": 0,
    "holidayRate": 1750,
    "holidayAmount": 0,
    "efficiencyAmount": 0,
    "grossAmount": 0,
    "netPay": 0,
    "fortnight": "16-31",
    "month": "2026-09"
  },
  {
    "id": "w-sep-2-8",
    "serialNo": 8,
    "employeeName": "AKMAL",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 0,
    "basicSalary": 0,
    "rateLoom": 150,
    "extraLooms": 0,
    "extraLoomAmount": 0,
    "attendanceAllowance": 0,
    "holidayAttendance": 0,
    "holidayRate": 1750,
    "holidayAmount": 0,
    "efficiencyAmount": 0,
    "grossAmount": 0,
    "netPay": 0,
    "fortnight": "16-31",
    "month": "2026-09"
  },
  {
    "id": "w-sep-2-9",
    "serialNo": 9,
    "employeeName": "IMTIAZ",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 0,
    "basicSalary": 0,
    "rateLoom": 150,
    "extraLooms": 0,
    "extraLoomAmount": 0,
    "attendanceAllowance": 0,
    "holidayAttendance": 0,
    "holidayRate": 1750,
    "holidayAmount": 0,
    "efficiencyAmount": 0,
    "grossAmount": 0,
    "netPay": 0,
    "fortnight": "16-31",
    "month": "2026-09"
  },
  {
    "id": "w-sep-2-10",
    "serialNo": 10,
    "employeeName": "AJMAL",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 0,
    "basicSalary": 0,
    "rateLoom": 150,
    "extraLooms": 0,
    "extraLoomAmount": 0,
    "attendanceAllowance": 0,
    "holidayAttendance": 0,
    "holidayRate": 1750,
    "holidayAmount": 0,
    "efficiencyAmount": 0,
    "grossAmount": 0,
    "netPay": 0,
    "fortnight": "16-31",
    "month": "2026-09"
  },
  {
    "id": "w-sep-2-11",
    "serialNo": 11,
    "employeeName": "RUSTAM",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 0,
    "basicSalary": 0,
    "rateLoom": 150,
    "extraLooms": 0,
    "extraLoomAmount": 0,
    "attendanceAllowance": 0,
    "holidayAttendance": 0,
    "holidayRate": 1750,
    "holidayAmount": 0,
    "efficiencyAmount": 0,
    "grossAmount": 0,
    "netPay": 0,
    "fortnight": "16-31",
    "month": "2026-09"
  },
  {
    "id": "w-sep-2-12",
    "serialNo": 12,
    "employeeName": "SHAH ZAIB",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 0,
    "basicSalary": 0,
    "rateLoom": 150,
    "extraLooms": 0,
    "extraLoomAmount": 0,
    "attendanceAllowance": 0,
    "holidayAttendance": 0,
    "holidayRate": 1750,
    "holidayAmount": 0,
    "efficiencyAmount": 0,
    "grossAmount": 0,
    "netPay": 0,
    "fortnight": "16-31",
    "month": "2026-09"
  },
  {
    "id": "w-sep-2-13",
    "serialNo": 13,
    "employeeName": "BASIT",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 0,
    "basicSalary": 0,
    "rateLoom": 150,
    "extraLooms": 0,
    "extraLoomAmount": 0,
    "attendanceAllowance": 0,
    "holidayAttendance": 0,
    "holidayRate": 1750,
    "holidayAmount": 0,
    "efficiencyAmount": 0,
    "grossAmount": 0,
    "netPay": 0,
    "fortnight": "16-31",
    "month": "2026-09"
  },
  {
    "id": "w-sep-2-14",
    "serialNo": 14,
    "employeeName": "JAWAD",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 0,
    "basicSalary": 0,
    "rateLoom": 150,
    "extraLooms": 0,
    "extraLoomAmount": 0,
    "attendanceAllowance": 0,
    "holidayAttendance": 0,
    "holidayRate": 1750,
    "holidayAmount": 0,
    "efficiencyAmount": 0,
    "grossAmount": 0,
    "netPay": 0,
    "fortnight": "16-31",
    "month": "2026-09"
  },
  {
    "id": "w-sep-2-15",
    "serialNo": 15,
    "employeeName": "NAZEER AHMED",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 0,
    "basicSalary": 0,
    "rateLoom": 150,
    "extraLooms": 0,
    "extraLoomAmount": 0,
    "attendanceAllowance": 0,
    "holidayAttendance": 0,
    "holidayRate": 1750,
    "holidayAmount": 0,
    "efficiencyAmount": 0,
    "grossAmount": 0,
    "netPay": 0,
    "fortnight": "16-31",
    "month": "2026-09"
  },
  {
    "id": "w-sep-2-16",
    "serialNo": 16,
    "employeeName": "SHEHZAD",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 0,
    "basicSalary": 0,
    "rateLoom": 150,
    "extraLooms": 0,
    "extraLoomAmount": 0,
    "attendanceAllowance": 0,
    "holidayAttendance": 0,
    "holidayRate": 1750,
    "holidayAmount": 0,
    "efficiencyAmount": 0,
    "grossAmount": 0,
    "netPay": 0,
    "fortnight": "16-31",
    "month": "2026-09"
  },
  {
    "id": "w-sep-2-17",
    "serialNo": 17,
    "employeeName": "NAQEEBULLAH",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 0,
    "basicSalary": 0,
    "rateLoom": 150,
    "extraLooms": 0,
    "extraLoomAmount": 0,
    "attendanceAllowance": 0,
    "holidayAttendance": 0,
    "holidayRate": 1750,
    "holidayAmount": 0,
    "efficiencyAmount": 0,
    "grossAmount": 0,
    "netPay": 0,
    "fortnight": "16-31",
    "month": "2026-09"
  },
  {
    "id": "w-sep-2-18",
    "serialNo": 18,
    "employeeName": "HAMZA",
    "designation": "Weaver",
    "wagePerDay": 1450,
    "attendanceDays": 0,
    "basicSalary": 0,
    "rateLoom": 150,
    "extraLooms": 0,
    "extraLoomAmount": 0,
    "attendanceAllowance": 0,
    "holidayAttendance": 0,
    "holidayRate": 1750,
    "holidayAmount": 0,
    "efficiencyAmount": 0,
    "grossAmount": 0,
    "netPay": 0,
    "fortnight": "16-31",
    "month": "2026-09"
  }
]

const INITIAL_CONTRACT_SALARIES: ContractSalaryRecord[] = [
  {
    "id": "cnt-1",
    "serialNo": 1,
    "employeeName": "Tufail ur Rehman",
    "designation": "Accountant",
    "salary": 50000.0,
    "attendanceDays": 31.0,
    "ratePerDay": 1613,
    "ratePerHr": 185.19,
    "basicSalary": 50000.0,
    "otHours": 45.0,
    "otAmount": 8333,
    "efficiencyAmount": 0,
    "grossSalary": 58333,
    "advanceDeduction": 25000.0,
    "ticketCharges": 5.0,
    "netAmount": 33328,
    "month": "2026-08"
  },
  {
    "id": "cnt-2",
    "serialNo": 2,
    "employeeName": "Kamran",
    "designation": "Quality Controller",
    "salary": 50000.0,
    "attendanceDays": 31.0,
    "ratePerDay": 1613,
    "ratePerHr": 138.89,
    "basicSalary": 50000.0,
    "otHours": 54.0,
    "otAmount": 7500,
    "efficiencyAmount": 0,
    "grossSalary": 57500,
    "advanceDeduction": 20000.0,
    "ticketCharges": 5.0,
    "netAmount": 37495,
    "month": "2026-08"
  },
  {
    "id": "cnt-3",
    "serialNo": 3,
    "employeeName": "Ahmer",
    "designation": "D.E.O",
    "salary": 40000.0,
    "attendanceDays": 22.0,
    "ratePerDay": 1290,
    "ratePerHr": 148.15,
    "basicSalary": 28387.096774193546,
    "otHours": 30.0,
    "otAmount": 4444,
    "efficiencyAmount": 0,
    "grossSalary": 32831,
    "advanceDeduction": 10000.0,
    "ticketCharges": 5.0,
    "netAmount": 22826,
    "month": "2026-08"
  },
  {
    "id": "cnt-4",
    "serialNo": 4,
    "employeeName": "Abdul Waheed",
    "designation": "Sr.Technician",
    "salary": 62000.0,
    "attendanceDays": 31.0,
    "ratePerDay": 2000,
    "ratePerHr": 206.67,
    "basicSalary": 62000.0,
    "otHours": 41.0,
    "otAmount": 8473,
    "efficiencyAmount": 6200,
    "grossSalary": 76673,
    "advanceDeduction": 10000.0,
    "ticketCharges": 5.0,
    "netAmount": 66668,
    "month": "2026-08"
  },
  {
    "id": "cnt-5",
    "serialNo": 5,
    "employeeName": "Ameen Ullah Khan",
    "designation": "Electrician",
    "salary": 55000.0,
    "attendanceDays": 31.0,
    "ratePerDay": 1774,
    "ratePerHr": 183.33,
    "basicSalary": 55000.0,
    "otHours": 42.5,
    "otAmount": 7792,
    "efficiencyAmount": 6600,
    "grossSalary": 69392,
    "advanceDeduction": 30000.0,
    "ticketCharges": 5.0,
    "netAmount": 39387,
    "month": "2026-08"
  },
  {
    "id": "cnt-6",
    "serialNo": 6,
    "employeeName": "Zulfiqar",
    "designation": "Asst Technician",
    "salary": 45000.0,
    "attendanceDays": 31.0,
    "ratePerDay": 1452,
    "ratePerHr": 125.0,
    "basicSalary": 45000.0,
    "otHours": 54.0,
    "otAmount": 6750,
    "efficiencyAmount": 9450,
    "grossSalary": 61200,
    "advanceDeduction": 20000.0,
    "ticketCharges": 5.0,
    "netAmount": 41195,
    "month": "2026-08"
  },
  {
    "id": "cnt-7",
    "serialNo": 7,
    "employeeName": "Maqsood",
    "designation": "Asst Technician",
    "salary": 38000.0,
    "attendanceDays": 31.0,
    "ratePerDay": 1226,
    "ratePerHr": 105.56,
    "basicSalary": 38000.0,
    "otHours": 54.0,
    "otAmount": 5700,
    "efficiencyAmount": 0,
    "grossSalary": 43700,
    "advanceDeduction": 20000.0,
    "ticketCharges": 5.0,
    "netAmount": 23695,
    "month": "2026-08"
  },
  {
    "id": "cnt-8",
    "serialNo": 8,
    "employeeName": "Salman",
    "designation": "Jeckquard",
    "salary": 50000.0,
    "attendanceDays": 31.0,
    "ratePerDay": 1613,
    "ratePerHr": 166.67,
    "basicSalary": 50000.0,
    "otHours": 39.0,
    "otAmount": 6500,
    "efficiencyAmount": 6000,
    "grossSalary": 62500,
    "advanceDeduction": 20000.0,
    "ticketCharges": 5.0,
    "netAmount": 42495,
    "month": "2026-08"
  },
  {
    "id": "cnt-9",
    "serialNo": 9,
    "employeeName": "Hasnain",
    "designation": "Jeckquard",
    "salary": 42000.0,
    "attendanceDays": 31.0,
    "ratePerDay": 1355,
    "ratePerHr": 140.0,
    "basicSalary": 42000.0,
    "otHours": 54.0,
    "otAmount": 7560,
    "efficiencyAmount": 0,
    "grossSalary": 49560,
    "advanceDeduction": 15000.0,
    "ticketCharges": 5.0,
    "netAmount": 34555,
    "month": "2026-08"
  },
  {
    "id": "cnt-10",
    "serialNo": 10,
    "employeeName": "Nazakat",
    "designation": "Beem Gater",
    "salary": 50000.0,
    "attendanceDays": 21.0,
    "ratePerDay": 1613,
    "ratePerHr": 138.89,
    "basicSalary": 33870.967741935485,
    "otHours": 18.0,
    "otAmount": 2500,
    "efficiencyAmount": 4065,
    "grossSalary": 40436,
    "advanceDeduction": 30000.0,
    "ticketCharges": 5.0,
    "netAmount": 10431,
    "month": "2026-08"
  },
  {
    "id": "cnt-11",
    "serialNo": 11,
    "employeeName": "Muhammad Arif",
    "designation": "Technician",
    "salary": 55000.0,
    "attendanceDays": 31.0,
    "ratePerDay": 1774,
    "ratePerHr": 152.78,
    "basicSalary": 55000.0,
    "otHours": 54.0,
    "otAmount": 8250,
    "efficiencyAmount": 11550,
    "grossSalary": 74800,
    "advanceDeduction": 30000.0,
    "ticketCharges": 5.0,
    "netAmount": 44795,
    "month": "2026-08"
  },
  {
    "id": "cnt-12",
    "serialNo": 12,
    "employeeName": "Mushtaq Ahmed",
    "designation": "Folding",
    "salary": 36000.0,
    "attendanceDays": 30.0,
    "ratePerDay": 1161,
    "ratePerHr": 100.0,
    "basicSalary": 34838.709677419356,
    "otHours": 49.5,
    "otAmount": 4950,
    "efficiencyAmount": 0,
    "grossSalary": 39789,
    "advanceDeduction": 15000.0,
    "ticketCharges": 5.0,
    "netAmount": 24784,
    "month": "2026-08"
  },
  {
    "id": "cnt-13",
    "serialNo": 13,
    "employeeName": "Adison",
    "designation": "Sweeper",
    "salary": 32000.0,
    "attendanceDays": 8.0,
    "ratePerDay": 1032,
    "ratePerHr": 133.33,
    "basicSalary": 8258.064516129032,
    "otHours": 0.0,
    "otAmount": 0,
    "efficiencyAmount": 0,
    "grossSalary": 8258,
    "advanceDeduction": 8000.0,
    "ticketCharges": 5.0,
    "netAmount": 253,
    "month": "2026-08"
  },
  {
    "id": "cnt-14",
    "serialNo": 14,
    "employeeName": "Christopher",
    "designation": "Sweeper",
    "salary": 32000.0,
    "attendanceDays": 5.0,
    "ratePerDay": 1032,
    "ratePerHr": 133.33,
    "basicSalary": 5161.290322580645,
    "otHours": 0.0,
    "otAmount": 0,
    "efficiencyAmount": 0,
    "grossSalary": 5161,
    "advanceDeduction": 5000.0,
    "ticketCharges": 5.0,
    "netAmount": 156,
    "month": "2026-08"
  },
  {
    "id": "cnt-15",
    "serialNo": 15,
    "employeeName": "Ali Zar",
    "designation": "Sweeper",
    "salary": 32000.0,
    "attendanceDays": 26.0,
    "ratePerDay": 1032,
    "ratePerHr": 133.33,
    "basicSalary": 26838.709677419356,
    "otHours": 12.0,
    "otAmount": 1600,
    "efficiencyAmount": 0,
    "grossSalary": 28439,
    "advanceDeduction": 7000.0,
    "ticketCharges": 5.0,
    "netAmount": 21434,
    "month": "2026-08"
  },
  // --- September 2026 (From (09) Salary Sep.2026.xlsx) ---
  {
    "id": "cnt-sep-1",
    "serialNo": 1,
    "employeeId": "emp-2",
    "employeeName": "Tufail ur Rehman",
    "designation": "Accountant",
    "salary": 50000.0,
    "attendanceDays": 0,
    "ratePerDay": 1666.67,
    "ratePerHr": 185.19,
    "basicSalary": 0,
    "lateHours": 0,
    "lateAmount": 0,
    "otHours": 0,
    "otAmount": 0,
    "efficiencyAmount": 0,
    "grossSalary": 0,
    "advanceDeduction": 25000.0,
    "ticketCharges": 5.0,
    "netAmount": -25005.0,
    "month": "2026-09"
  },
  {
    "id": "cnt-sep-2",
    "serialNo": 2,
    "employeeId": "emp-5",
    "employeeName": "Kamran",
    "designation": "Quality Controller",
    "salary": 50000.0,
    "attendanceDays": 0,
    "ratePerDay": 1666.67,
    "ratePerHr": 138.89,
    "basicSalary": 0,
    "lateHours": 0,
    "lateAmount": 0,
    "otHours": 0,
    "otAmount": 0,
    "efficiencyAmount": 0,
    "grossSalary": 0,
    "advanceDeduction": 20000.0,
    "ticketCharges": 5.0,
    "netAmount": -20005.0,
    "month": "2026-09"
  },
  {
    "id": "cnt-sep-3",
    "serialNo": 3,
    "employeeId": "emp-6",
    "employeeName": "Ahmer",
    "designation": "Quality Controller",
    "salary": 40000.0,
    "attendanceDays": 0,
    "ratePerDay": 1333.33,
    "ratePerHr": 148.15,
    "basicSalary": 0,
    "lateHours": 0,
    "lateAmount": 0,
    "otHours": 0,
    "otAmount": 0,
    "efficiencyAmount": 0,
    "grossSalary": 0,
    "advanceDeduction": 20000.0,
    "ticketCharges": 5.0,
    "netAmount": -20005.0,
    "month": "2026-09"
  },
  {
    "id": "cnt-sep-4",
    "serialNo": 4,
    "employeeId": "emp-12",
    "employeeName": "Abdul Waheed",
    "designation": "Sr.Technician",
    "salary": 62000.0,
    "attendanceDays": 0,
    "ratePerDay": 2066.67,
    "ratePerHr": 206.67,
    "basicSalary": 0,
    "lateHours": 0,
    "lateAmount": 0,
    "otHours": 0,
    "otAmount": 0,
    "efficiencyAmount": 0,
    "grossSalary": 0,
    "advanceDeduction": 5000.0,
    "ticketCharges": 5.0,
    "netAmount": -5005.0,
    "month": "2026-09"
  },
  {
    "id": "cnt-sep-5",
    "serialNo": 5,
    "employeeId": "emp-31",
    "employeeName": "Ameen Ullah Khan",
    "designation": "Electrician",
    "salary": 55000.0,
    "attendanceDays": 0,
    "ratePerDay": 1833.33,
    "ratePerHr": 183.33,
    "basicSalary": 0,
    "lateHours": 0,
    "lateAmount": 0,
    "otHours": 0,
    "otAmount": 0,
    "efficiencyAmount": 0,
    "grossSalary": 0,
    "advanceDeduction": 30000.0,
    "ticketCharges": 5.0,
    "netAmount": -30005.0,
    "month": "2026-09"
  },
  {
    "id": "cnt-sep-6",
    "serialNo": 6,
    "employeeId": "emp-sep-20-ubaid",
    "employeeName": "Ubaid",
    "designation": "Electrician",
    "salary": 35000.0,
    "attendanceDays": 0,
    "ratePerDay": 1166.67,
    "ratePerHr": 97.22,
    "basicSalary": 0,
    "lateHours": 0,
    "lateAmount": 0,
    "otHours": 0,
    "otAmount": 0,
    "efficiencyAmount": 0,
    "grossSalary": 0,
    "advanceDeduction": 0,
    "ticketCharges": 5.0,
    "netAmount": -5.0,
    "month": "2026-09"
  },
  {
    "id": "cnt-sep-7",
    "serialNo": 7,
    "employeeId": "emp-29",
    "employeeName": "Zulfiqar",
    "designation": "Asst Technician",
    "salary": 45000.0,
    "attendanceDays": 0,
    "ratePerDay": 1500.0,
    "ratePerHr": 125.0,
    "basicSalary": 0,
    "lateHours": 0,
    "lateAmount": 0,
    "otHours": 0,
    "otAmount": 0,
    "efficiencyAmount": 0,
    "grossSalary": 0,
    "advanceDeduction": 15000.0,
    "ticketCharges": 5.0,
    "netAmount": -15005.0,
    "month": "2026-09"
  },
  {
    "id": "cnt-sep-8",
    "serialNo": 8,
    "employeeId": "emp-21",
    "employeeName": "Maqsood",
    "designation": "Oil Man",
    "salary": 38000.0,
    "attendanceDays": 0,
    "ratePerDay": 1266.67,
    "ratePerHr": 105.56,
    "basicSalary": 0,
    "lateHours": 0,
    "lateAmount": 0,
    "otHours": 0,
    "otAmount": 0,
    "efficiencyAmount": 0,
    "grossSalary": 0,
    "advanceDeduction": 20000.0,
    "ticketCharges": 5.0,
    "netAmount": -20005.0,
    "month": "2026-09"
  },
  {
    "id": "cnt-sep-9",
    "serialNo": 9,
    "employeeId": "emp-sep-23-israr",
    "employeeName": "Israr",
    "designation": "Oil Man",
    "salary": 35000.0,
    "attendanceDays": 0,
    "ratePerDay": 1166.67,
    "ratePerHr": 97.22,
    "basicSalary": 0,
    "lateHours": 0,
    "lateAmount": 0,
    "otHours": 0,
    "otAmount": 0,
    "efficiencyAmount": 0,
    "grossSalary": 0,
    "advanceDeduction": 10000.0,
    "ticketCharges": 5.0,
    "netAmount": -10005.0,
    "month": "2026-09"
  },
  {
    "id": "cnt-sep-10",
    "serialNo": 10,
    "employeeId": "emp-22",
    "employeeName": "Salman",
    "designation": "Jeckquard",
    "salary": 50000.0,
    "attendanceDays": 0,
    "ratePerDay": 1666.67,
    "ratePerHr": 166.67,
    "basicSalary": 0,
    "lateHours": 0,
    "lateAmount": 0,
    "otHours": 0,
    "otAmount": 0,
    "efficiencyAmount": 0,
    "grossSalary": 0,
    "advanceDeduction": 20000.0,
    "ticketCharges": 5.0,
    "netAmount": -20005.0,
    "month": "2026-09"
  },
  {
    "id": "cnt-sep-11",
    "serialNo": 11,
    "employeeId": "emp-27",
    "employeeName": "Hasnain",
    "designation": "Jeckquard",
    "salary": 42000.0,
    "attendanceDays": 0,
    "ratePerDay": 1400.0,
    "ratePerHr": 140.0,
    "basicSalary": 0,
    "lateHours": 0,
    "lateAmount": 0,
    "otHours": 0,
    "otAmount": 0,
    "efficiencyAmount": 0,
    "grossSalary": 0,
    "advanceDeduction": 10000.0,
    "ticketCharges": 5.0,
    "netAmount": -10005.0,
    "month": "2026-09"
  },
  {
    "id": "cnt-sep-12",
    "serialNo": 12,
    "employeeId": "emp-10",
    "employeeName": "Muhammad Arif",
    "designation": "Technician",
    "salary": 55000.0,
    "attendanceDays": 0,
    "ratePerDay": 1833.33,
    "ratePerHr": 152.78,
    "basicSalary": 0,
    "lateHours": 0,
    "lateAmount": 0,
    "otHours": 0,
    "otAmount": 0,
    "efficiencyAmount": 0,
    "grossSalary": 0,
    "advanceDeduction": 30000.0,
    "ticketCharges": 5.0,
    "netAmount": -30005.0,
    "month": "2026-09"
  },
  {
    "id": "cnt-sep-13",
    "serialNo": 13,
    "employeeId": "emp-25",
    "employeeName": "Mushtaq Ahmed",
    "designation": "Folding",
    "salary": 36000.0,
    "attendanceDays": 0,
    "ratePerDay": 1200.0,
    "ratePerHr": 100.0,
    "basicSalary": 0,
    "lateHours": 0,
    "lateAmount": 0,
    "otHours": 0,
    "otAmount": 0,
    "efficiencyAmount": 0,
    "grossSalary": 0,
    "advanceDeduction": 15000.0,
    "ticketCharges": 5.0,
    "netAmount": -15005.0,
    "month": "2026-09"
  },
  {
    "id": "cnt-sep-14",
    "serialNo": 14,
    "employeeId": "emp-sep-48-dawood",
    "employeeName": "Dawood",
    "designation": "Sweeper",
    "salary": 32000.0,
    "attendanceDays": 0,
    "ratePerDay": 1066.67,
    "ratePerHr": 133.33,
    "basicSalary": 0,
    "lateHours": 0,
    "lateAmount": 0,
    "otHours": 0,
    "otAmount": 0,
    "efficiencyAmount": 0,
    "grossSalary": 0,
    "advanceDeduction": 5000.0,
    "ticketCharges": 5.0,
    "netAmount": -5005.0,
    "month": "2026-09"
  },
  {
    "id": "cnt-sep-15",
    "serialNo": 15,
    "employeeId": "emp-46",
    "employeeName": "Ali Zar",
    "designation": "Sweeper",
    "salary": 32000.0,
    "attendanceDays": 0,
    "ratePerDay": 1066.67,
    "ratePerHr": 133.33,
    "basicSalary": 0,
    "lateHours": 0,
    "lateAmount": 0,
    "otHours": 0,
    "otAmount": 0,
    "efficiencyAmount": 0,
    "grossSalary": 0,
    "advanceDeduction": 7000.0,
    "ticketCharges": 5.0,
    "netAmount": -7005.0,
    "month": "2026-09"
  }
]

const INITIAL_CONTRACTORS: ContractorPaymentRecord[] = [
  {
    "id": "c-1-1",
    "serialNo": 1,
    "name": "REHBAR ALI",
    "contractType": "Hand Knotting",
    "contractualAmount": 28880.0,
    "extraIncentive": 0,
    "totalAmount": 28880.0,
    "lessAdvance": 0,
    "netPayment": 28880.0,
    "remarks": "Bill Payment",
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "c-1-2",
    "serialNo": 2,
    "name": "NAZIM HUSSAIN",
    "contractType": "Sarning",
    "contractualAmount": 0.0,
    "extraIncentive": 0,
    "totalAmount": 0.0,
    "lessAdvance": 0,
    "netPayment": 0.0,
    "remarks": "Bill Payment",
    "fortnight": "1-15",
    "month": "2026-08"
  },
  {
    "id": "c-2-3",
    "serialNo": 1,
    "name": "AMIR",
    "contractType": "PU Technician",
    "contractualAmount": 70000.0,
    "extraIncentive": 0.0,
    "totalAmount": 70000.0,
    "lessAdvance": 30000.0,
    "netPayment": 40000.0,
    "remarks": "Fix Salary(70000)",
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "c-2-4",
    "serialNo": 2,
    "name": "BASIT",
    "contractType": "Electrician",
    "contractualAmount": 70000.0,
    "extraIncentive": 0.0,
    "totalAmount": 70000.0,
    "lessAdvance": 20000.0,
    "netPayment": 50000.0,
    "remarks": "Fix Salary (70000)",
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "c-2-5",
    "serialNo": 3,
    "name": "NASEER AHMED",
    "contractType": "Reed Repairing",
    "contractualAmount": 5500.0,
    "extraIncentive": 0.0,
    "totalAmount": 5500.0,
    "lessAdvance": 0.0,
    "netPayment": 5500.0,
    "remarks": "Fix Salary (5500)",
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "c-2-6",
    "serialNo": 4,
    "name": "NAWAB",
    "contractType": "Gitta Winder",
    "contractualAmount": 30000.0,
    "extraIncentive": 0.0,
    "totalAmount": 30000.0,
    "lessAdvance": 0.0,
    "netPayment": 30000.0,
    "remarks": "Fix Salary (30000)",
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "c-2-7",
    "serialNo": 5,
    "name": "ZAFAR GUL",
    "contractType": "Chowkidar (Guard)",
    "contractualAmount": 32000.0,
    "extraIncentive": 0.0,
    "totalAmount": 32000.0,
    "lessAdvance": 0.0,
    "netPayment": 32000.0,
    "remarks": "Fix Salary (32000)",
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "c-2-8",
    "serialNo": 6,
    "name": "SHOAIB",
    "contractType": "Electrician Helper",
    "contractualAmount": 25000.0,
    "extraIncentive": 0.0,
    "totalAmount": 25000.0,
    "lessAdvance": 5000.0,
    "netPayment": 20000.0,
    "remarks": "Fix Salary (25000)",
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "c-2-9",
    "serialNo": 7,
    "name": "REHBAR ALI",
    "contractType": "H-Knotting",
    "contractualAmount": 54669.0,
    "extraIncentive": 0.0,
    "totalAmount": 54669.0,
    "lessAdvance": 0.0,
    "netPayment": 54669.0,
    "remarks": "Bill",
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "c-2-10",
    "serialNo": 8,
    "name": "SHAHID",
    "contractType": "M.Knotting",
    "contractualAmount": 34100.0,
    "extraIncentive": 0.0,
    "totalAmount": 34100.0,
    "lessAdvance": 0.0,
    "netPayment": 34100.0,
    "remarks": "Bill",
    "fortnight": "16-31",
    "month": "2026-08"
  },
  {
    "id": "c-2-11",
    "serialNo": 9,
    "name": "NAZIM HUSSAIN",
    "contractType": "Sarning",
    "contractualAmount": 28200.0,
    "extraIncentive": 0.0,
    "totalAmount": 28200.0,
    "lessAdvance": 0.0,
    "netPayment": 28200.0,
    "remarks": "Bill",
    "fortnight": "16-31",
    "month": "2026-08"
  },
  // --- September 2026 (From (09) Salary Sep.2026.xlsx) ---
  {
    "id": "c-sep-1-1",
    "serialNo": 1,
    "employeeId": "emp-62",
    "name": "REHBAR ALI",
    "contractType": "Hand Knotting",
    "contractualAmount": 35555.0,
    "extraIncentive": 0,
    "totalAmount": 35555.0,
    "lessAdvance": 0,
    "netPayment": 35555.0,
    "remarks": "Bill Payment",
    "fortnight": "1-15",
    "month": "2026-09"
  },
  {
    "id": "c-sep-1-2",
    "serialNo": 2,
    "employeeId": "emp-64",
    "name": "NAZIM HUSSAIN",
    "contractType": "Sarning",
    "contractualAmount": 23500.0,
    "extraIncentive": 0,
    "totalAmount": 23500.0,
    "lessAdvance": 0,
    "netPayment": 23500.0,
    "remarks": "Bill Payment",
    "fortnight": "1-15",
    "month": "2026-09"
  },
  {
    "id": "c-sep-2-1",
    "serialNo": 1,
    "employeeId": "emp-65",
    "name": "AMIR",
    "contractType": "PU Technician",
    "contractualAmount": 70000.0,
    "extraIncentive": 0,
    "totalAmount": 70000.0,
    "lessAdvance": 30000.0,
    "netPayment": 40000.0,
    "remarks": "Fix Salary(70000)",
    "fortnight": "16-31",
    "month": "2026-09"
  },
  {
    "id": "c-sep-2-2",
    "serialNo": 2,
    "employeeId": "emp-adv-basit",
    "name": "BASIT",
    "contractType": "Electrician",
    "contractualAmount": 70000.0,
    "extraIncentive": 0,
    "totalAmount": 70000.0,
    "lessAdvance": 20000.0,
    "netPayment": 50000.0,
    "remarks": "Fix Salary (70000)",
    "fortnight": "16-31",
    "month": "2026-09"
  },
  {
    "id": "c-sep-2-3",
    "serialNo": 3,
    "employeeId": "emp-66",
    "name": "NASEER AHMED",
    "contractType": "Reed Repairing",
    "contractualAmount": 5500.0,
    "extraIncentive": 0,
    "totalAmount": 5500.0,
    "lessAdvance": 0,
    "netPayment": 5500.0,
    "remarks": "Fix Salary (5500)",
    "fortnight": "16-31",
    "month": "2026-09"
  },
  {
    "id": "c-sep-2-4",
    "serialNo": 4,
    "employeeId": "emp-67",
    "name": "NAWAB",
    "contractType": "Gitta Winder",
    "contractualAmount": 30000.0,
    "extraIncentive": 0,
    "totalAmount": 30000.0,
    "lessAdvance": 0,
    "netPayment": 30000.0,
    "remarks": "Fix Salary (30000)",
    "fortnight": "16-31",
    "month": "2026-09"
  },
  {
    "id": "c-sep-2-5",
    "serialNo": 5,
    "employeeId": "emp-68",
    "name": "ZAFAR GUL",
    "contractType": "Chowkidar (Guard)",
    "contractualAmount": 32000.0,
    "extraIncentive": 0,
    "totalAmount": 32000.0,
    "lessAdvance": 0,
    "netPayment": 32000.0,
    "remarks": "Fix Salary (32000)",
    "fortnight": "16-31",
    "month": "2026-09"
  },
  {
    "id": "c-sep-2-6",
    "serialNo": 6,
    "employeeId": "emp-69",
    "name": "SHOAIB",
    "contractType": "Electrician Helper",
    "contractualAmount": 25000.0,
    "extraIncentive": 0,
    "totalAmount": 25000.0,
    "lessAdvance": 5000.0,
    "netPayment": 20000.0,
    "remarks": "Fix Salary (25000)",
    "fortnight": "16-31",
    "month": "2026-09"
  },
  {
    "id": "c-sep-2-7",
    "serialNo": 7,
    "employeeId": "emp-62",
    "name": "REHBAR ALI",
    "contractType": "H-Knotting",
    "contractualAmount": 0.0,
    "extraIncentive": 0,
    "totalAmount": 0.0,
    "lessAdvance": 0,
    "netPayment": 0.0,
    "remarks": "Bill",
    "fortnight": "16-31",
    "month": "2026-09"
  },
  {
    "id": "c-sep-2-8",
    "serialNo": 8,
    "employeeId": "emp-63",
    "name": "SHAHID",
    "contractType": "M.Knotting",
    "contractualAmount": 0.0,
    "extraIncentive": 0,
    "totalAmount": 0.0,
    "lessAdvance": 0,
    "netPayment": 0.0,
    "remarks": "Bill",
    "fortnight": "16-31",
    "month": "2026-09"
  },
  {
    "id": "c-sep-2-9",
    "serialNo": 9,
    "employeeId": "emp-64",
    "name": "NAZIM HUSSAIN",
    "contractType": "Sarning",
    "contractualAmount": 0.0,
    "extraIncentive": 0,
    "totalAmount": 0.0,
    "lessAdvance": 0,
    "netPayment": 0.0,
    "remarks": "Bill",
    "fortnight": "16-31",
    "month": "2026-09"
  }
]

const INITIAL_EFFICIENCY_INCENTIVES: EfficiencyIncentiveRecord[] = [
  {
    "id": "eff-1",
    "serialNo": 1,
    "loom": "G6200",
    "name": "Muhammad Arif",
    "designation": "Technician",
    "efficiencyPercent": 81,
    "salaryEarned": 55000.0,
    "availPercent": 21,
    "amount": 11550.0,
    "month": "2026-08"
  },
  {
    "id": "eff-2",
    "serialNo": 2,
    "loom": "G6200",
    "name": "Zulfiqar",
    "designation": "Asst Technician",
    "efficiencyPercent": 81,
    "salaryEarned": 45000.0,
    "availPercent": 21,
    "amount": 9450.0,
    "month": "2026-08"
  },
  {
    "id": "eff-3",
    "serialNo": 3,
    "loom": "G6300",
    "name": "Abdul Waheed",
    "designation": "Sr.Technician",
    "efficiencyPercent": 70,
    "salaryEarned": 62000.0,
    "availPercent": 10,
    "amount": 6200.0,
    "month": "2026-08"
  },
  {
    "id": "eff-4",
    "serialNo": 4,
    "loom": "Overall",
    "name": "Ameen Ullah Khan",
    "designation": "Electrician",
    "efficiencyPercent": 72,
    "salaryEarned": 55000.0,
    "availPercent": 12,
    "amount": 6600.0,
    "month": "2026-08"
  },
  {
    "id": "eff-5",
    "serialNo": 5,
    "loom": "Overall",
    "name": "Salman",
    "designation": "Jeckquard",
    "efficiencyPercent": 72,
    "salaryEarned": 50000.0,
    "availPercent": 12,
    "amount": 6000.0,
    "month": "2026-08"
  },
  {
    "id": "eff-6",
    "serialNo": 6,
    "loom": "Overall",
    "name": "Nazakat",
    "designation": "Beem Gater",
    "efficiencyPercent": 72,
    "salaryEarned": 33870.967741935485,
    "availPercent": 12,
    "amount": 4064.516129032258,
    "month": "2026-08"
  },
  // --- September 2026 (From (09) Salary Sep.2026.xlsx) ---
  {
    "id": "eff-sep-1",
    "serialNo": 1,
    "loom": "G6200",
    "name": "Muhammad Arif",
    "employeeId": "emp-10",
    "designation": "Technician",
    "efficiencyPercent": 0,
    "salaryEarned": 0,
    "availPercent": 0,
    "amount": 0,
    "month": "2026-09"
  },
  {
    "id": "eff-sep-2",
    "serialNo": 2,
    "loom": "G6200",
    "name": "Zulfiqar",
    "employeeId": "emp-29",
    "designation": "Asst Technician",
    "efficiencyPercent": 0,
    "salaryEarned": 0,
    "availPercent": 0,
    "amount": 0,
    "month": "2026-09"
  },
  {
    "id": "eff-sep-3",
    "serialNo": 3,
    "loom": "G6300",
    "name": "Abdul Waheed",
    "employeeId": "emp-12",
    "designation": "Sr.Technician",
    "efficiencyPercent": 0,
    "salaryEarned": 0,
    "availPercent": 0,
    "amount": 0,
    "month": "2026-09"
  },
  {
    "id": "eff-sep-4",
    "serialNo": 4,
    "loom": "Overall",
    "name": "Ameen Ullah Khan",
    "employeeId": "emp-31",
    "designation": "Electrician",
    "efficiencyPercent": 0,
    "salaryEarned": 0,
    "availPercent": 0,
    "amount": 0,
    "month": "2026-09"
  },
  {
    "id": "eff-sep-5",
    "serialNo": 5,
    "loom": "Overall",
    "name": "Salman",
    "employeeId": "emp-22",
    "designation": "Jeckquard",
    "efficiencyPercent": 0,
    "salaryEarned": 0,
    "availPercent": 0,
    "amount": 0,
    "month": "2026-09"
  }
]

function buildInitialMasterRoster(): EmployeeProfile[] {
  // General Wages + weavers/helpers/contractors already stored on the master roster
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

  const existingNames = new Set(gwList.map((e) => normalizeName(e.name)))

  // 2. Real Weavers from INITIAL_WEAVERS_WAGES (skip anyone already on the roster)
  const weaverNamesSeen = new Set<string>()
  const weaverProfiles: EmployeeProfile[] = []
  let nextSerial = gwList.reduce((max, e) => Math.max(max, e.serialNo || 0), 0) + 1
  for (const w of INITIAL_WEAVERS_WAGES) {
    const norm = normalizeName(w.employeeName)
    if (!weaverNamesSeen.has(norm) && !existingNames.has(norm)) {
      weaverNamesSeen.add(norm)
      const isSpare = (w.designation || '').toLowerCase().includes('spare')
      const dailyWage = w.wagePerDay || (isSpare ? 1800 : 1450)
      weaverProfiles.push({
        id: `emp-w-${weaverProfiles.length + 1}`,
        serialNo: nextSerial++,
        name: w.employeeName,
        fatherName: '',
        cnic: `42101-${Math.floor(1000000 + Math.random() * 9000000)}-${(weaverProfiles.length % 9) + 1}`,
        phone: '0300-0000000',
        address: 'Karachi',
        designation: w.designation || (isSpare ? 'Spare Weaver' : 'Weaver'),
        department: 'Weaving Floor',
        employeeCategory: 'Weaver',
        dutyHrs: 12,
        shiftFromTo: '8 to 8',
        salary: dailyWage * 30,
        ratePerDay31: dailyWage,
        ratePerDay30: dailyWage,
        ratePerHr30: Math.round((dailyWage / 12) * 100) / 100,
        ratePerDay28: dailyWage,
        doj: '01-Jan-2023',
        contractStatus: 'Daily Wage',
        status: 'Active',
      })
    }
  }

  // 3. Real Helpers from INITIAL_HELPERS_WAGES
  const helperNamesSeen = new Set<string>()
  const helperProfiles: EmployeeProfile[] = []
  for (const h of INITIAL_HELPERS_WAGES) {
    const norm = normalizeName(h.employeeName)
    if (!helperNamesSeen.has(norm) && !existingNames.has(norm) && !weaverNamesSeen.has(norm)) {
      helperNamesSeen.add(norm)
      const dailyWage = h.wagePerDay || 1050
      helperProfiles.push({
        id: `emp-h-${helperProfiles.length + 1}`,
        serialNo: nextSerial++,
        name: h.employeeName,
        fatherName: '',
        cnic: `42101-${Math.floor(1000000 + Math.random() * 9000000)}-${(helperProfiles.length % 9) + 1}`,
        phone: '0300-0000000',
        address: 'Karachi',
        designation: h.designation || 'Helper',
        department: 'Weaving Floor',
        employeeCategory: 'Helper',
        dutyHrs: 12,
        shiftFromTo: '8 to 8',
        salary: dailyWage * 30,
        ratePerDay31: dailyWage,
        ratePerDay30: dailyWage,
        ratePerHr30: Math.round((dailyWage / 12) * 100) / 100,
        ratePerDay28: dailyWage,
        doj: '01-Jan-2023',
        contractStatus: 'Daily Wage',
        status: 'Active',
      })
    }
  }

  // 4. Contractors from INITIAL_CONTRACTORS
  const contractorNamesSeen = new Set<string>()
  const contractorProfiles: EmployeeProfile[] = []
  for (const c of INITIAL_CONTRACTORS) {
    const norm = normalizeName(c.name)
    if (!contractorNamesSeen.has(norm) && !existingNames.has(norm) && !weaverNamesSeen.has(norm) && !helperNamesSeen.has(norm)) {
      contractorNamesSeen.add(norm)
      const monthlyAmount = c.contractualAmount || 30000
      contractorProfiles.push({
        id: `emp-c-${contractorProfiles.length + 1}`,
        serialNo: nextSerial++,
        name: c.name,
        fatherName: '',
        cnic: `42101-${Math.floor(1000000 + Math.random() * 9000000)}-${(contractorProfiles.length % 9) + 1}`,
        phone: '0300-0000000',
        address: 'Karachi',
        designation: c.contractType || 'Contractor',
        department: 'Contract Services',
        employeeCategory: 'Contractor',
        dutyHrs: 10,
        shiftFromTo: 'Flexible',
        salary: monthlyAmount,
        ratePerDay31: Math.round((monthlyAmount / 31) * 100) / 100,
        ratePerDay30: Math.round((monthlyAmount / 30) * 100) / 100,
        ratePerHr30: Math.round((monthlyAmount / 300) * 100) / 100,
        ratePerDay28: Math.round((monthlyAmount / 28) * 100) / 100,
        doj: '01-Jan-2022',
        contractStatus: 'Contractor',
        status: 'Active',
      })
    }
  }

  return [...gwList, ...weaverProfiles, ...helperProfiles, ...contractorProfiles]
}

const INITIAL_EMPLOYEES: EmployeeProfile[] = hydrateResignedDates(buildInitialMasterRoster()).list

/** In-memory cache hydrated from PostgreSQL via /api/payroll/store. */
const memoryStore = new Map<string, string>()
let hydrated = false
let hydratePromise: Promise<void> | null = null
let allowServerSheetWrite = false

/** Writes that happened before hydrate finished — must not be wiped by DB snapshot. */
const pendingPersists = new Map<string, unknown>()

const LOCAL_MIRROR_KEYS = new Set<string>([
  STORAGE_KEYS.EMPLOYEES,
  STORAGE_KEYS.STAFF,
  STORAGE_KEYS.CONTRACT,
  STORAGE_KEYS.HR_META,
  STORAGE_KEYS.ADVANCES,
  STORAGE_KEYS.EFFICIENCY,
  STORAGE_KEYS.WEAVERS,
  STORAGE_KEYS.HELPERS,
  STORAGE_KEYS.CONTRACTORS,
  STORAGE_KEYS.PETTY_CASH,
])

const ARRAY_MERGE_KEYS = new Set<string>([
  STORAGE_KEYS.STAFF,
  STORAGE_KEYS.CONTRACT,
  STORAGE_KEYS.ADVANCES,
  STORAGE_KEYS.EFFICIENCY,
  STORAGE_KEYS.WEAVERS,
  STORAGE_KEYS.HELPERS,
  STORAGE_KEYS.CONTRACTORS,
  STORAGE_KEYS.PETTY_CASH,
])

export function isPayrollHydrated(): boolean {
  return hydrated
}

/** Force next hydratePayrollFromDb() to re-fetch from Postgres. */
export function resetPayrollHydration(): void {
  hydrated = false
  hydratePromise = null
}

function localMirrorKey(key: string): string {
  return `sara_payroll_mirror_${key}`
}

function writeLocalMirror(key: string, value: unknown): void {
  if (!isPayrollClient() || !LOCAL_MIRROR_KEYS.has(key)) return
  try {
    localStorage.setItem(localMirrorKey(key), JSON.stringify(value))
  } catch {
    // ignore quota / private mode
  }
}

function readLocalMirror(key: string): unknown | null {
  if (!isPayrollClient() || !LOCAL_MIRROR_KEYS.has(key)) return null
  try {
    const raw = localStorage.getItem(localMirrorKey(key))
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function isPayrollClient(): boolean {
  return typeof window !== 'undefined'
}

async function persistPayrollKey(key: string, value: unknown): Promise<boolean> {
  if (!isPayrollClient()) return false
  writeLocalMirror(key, value)
  try {
    const res = await fetch('/api/payroll/store', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ key, value }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      console.error('[payroll] persist rejected', key, res.status, body)
      return false
    }
    return true
  } catch (err) {
    console.error('[payroll] persist failed', key, err)
    return false
  }
}

function writeStore(key: string, value: unknown): void {
  try {
    memoryStore.set(key, JSON.stringify(value))
  } catch {
    // ignore
  }
  writeLocalMirror(key, value)
  // Wait until the DB snapshot is loaded, otherwise a first paint can overwrite Postgres.
  if (!hydrated) {
    if (ARRAY_MERGE_KEYS.has(key) && Array.isArray(value)) {
      const prev = pendingPersists.get(key)
      if (Array.isArray(prev)) {
        pendingPersists.set(
          key,
          mergeRowsById(prev as { id?: string }[], value as { id?: string }[])
        )
      } else {
        pendingPersists.set(key, value)
      }
    } else if (key === STORAGE_KEYS.HR_META && value && typeof value === 'object') {
      const prev = pendingPersists.get(key)
      const prevObj =
        prev && typeof prev === 'object' ? (prev as Record<string, unknown>) : {}
      const incoming = value as { pettyCashInflowOverrides?: Record<string, number> }
      const prevOverrides =
        prevObj.pettyCashInflowOverrides && typeof prevObj.pettyCashInflowOverrides === 'object'
          ? (prevObj.pettyCashInflowOverrides as Record<string, number>)
          : {}
      pendingPersists.set(key, {
        ...prevObj,
        ...incoming,
        pettyCashInflowOverrides: {
          ...prevOverrides,
          ...(incoming.pettyCashInflowOverrides || {}),
        },
      })
    } else {
      pendingPersists.set(key, value)
    }
    return
  }
  void persistPayrollKey(key, value)
}

/** Prefer DB rows for periods already saved; only add mirror rows for brand-new month/fortnight. */
function mergeMirrorPreferDbPeriods<
  T extends { id?: string; month?: string; fortnight?: string },
>(dbRows: T[], mirrorRows: T[]): T[] {
  const db = Array.isArray(dbRows) ? dbRows : []
  const mirror = Array.isArray(mirrorRows) ? mirrorRows : []
  if (db.length === 0) return mergeRowsById(db, mirror)
  const periodsInDb = new Set(
    db.map((r) => `${r.month || ''}|${r.fortnight || ''}`)
  )
  const extras = mirror.filter(
    (r) => !periodsInDb.has(`${r.month || ''}|${r.fortnight || ''}`)
  )
  return extras.length ? mergeRowsById(db, extras) : [...db]
}

async function writeStoreAndWait(key: string, value: unknown): Promise<boolean> {
  try {
    memoryStore.set(key, JSON.stringify(value))
  } catch {
    // ignore
  }
  writeLocalMirror(key, value)
  if (!hydrated) {
    if (ARRAY_MERGE_KEYS.has(key) && Array.isArray(value)) {
      const prev = pendingPersists.get(key)
      pendingPersists.set(
        key,
        Array.isArray(prev)
          ? mergeRowsById(prev as { id?: string }[], value as { id?: string }[])
          : value
      )
    } else if (key === STORAGE_KEYS.HR_META && value && typeof value === 'object') {
      const prev = pendingPersists.get(key)
      const prevObj =
        prev && typeof prev === 'object' ? (prev as Record<string, unknown>) : {}
      const incoming = value as { pettyCashInflowOverrides?: Record<string, number> }
      const prevOverrides =
        prevObj.pettyCashInflowOverrides && typeof prevObj.pettyCashInflowOverrides === 'object'
          ? (prevObj.pettyCashInflowOverrides as Record<string, number>)
          : {}
      pendingPersists.set(key, {
        ...prevObj,
        ...incoming,
        pettyCashInflowOverrides: {
          ...prevOverrides,
          ...(incoming.pettyCashInflowOverrides || {}),
        },
      })
    } else {
      pendingPersists.set(key, value)
    }
    await hydratePayrollFromDb()
    // After hydrate, memory has DB+mirrors; still force-write our value merged in
    if (ARRAY_MERGE_KEYS.has(key) && Array.isArray(value)) {
      let current: { id?: string }[] = []
      try {
        current = JSON.parse(memoryStore.get(key) || '[]')
      } catch {
        current = []
      }
      const merged = mergeRowsById(current, value as { id?: string }[])
      memoryStore.set(key, JSON.stringify(merged))
      writeLocalMirror(key, merged)
      return persistPayrollKey(key, merged)
    }
    if (key === STORAGE_KEYS.HR_META && value && typeof value === 'object') {
      let current: Record<string, unknown> = {}
      try {
        current = JSON.parse(memoryStore.get(key) || '{}')
      } catch {
        current = {}
      }
      const incoming = value as { pettyCashInflowOverrides?: Record<string, number> }
      const curOverrides =
        current.pettyCashInflowOverrides && typeof current.pettyCashInflowOverrides === 'object'
          ? (current.pettyCashInflowOverrides as Record<string, number>)
          : {}
      const merged = {
        ...current,
        ...incoming,
        pettyCashInflowOverrides: {
          ...curOverrides,
          ...(incoming.pettyCashInflowOverrides || {}),
        },
      }
      memoryStore.set(key, JSON.stringify(merged))
      writeLocalMirror(key, merged)
      return persistPayrollKey(key, merged)
    }
  }
  return persistPayrollKey(key, value)
}

/** Union salary-sheet rows by id so that a local September isn't lost, with overrides taking precedence over base rows. */
function mergeRowsById<T extends { id?: string }>(baseRows: T[], overrides: T[]): T[] {
  const map = new Map<string, T>()
  for (const row of baseRows || []) {
    if (row?.id) map.set(row.id, row)
  }
  for (const row of overrides || []) {
    if (row?.id) map.set(row.id, row)
  }
  return [...map.values()]
}

/**
 * Prefer the "better" duplicate row: has employeeId, stable/seed id, higher amount, lower serial.
 * Used when local mirror + Postgres both kept the same person under different ids.
 */
function preferPayrollDuplicateRow<T extends { id?: string; employeeId?: string; amount?: number; salary?: number; serialNo?: number }>(
  a: T,
  b: T
): T {
  const score = (r: T) => {
    let s = 0
    if (r.employeeId) s += 40
    const id = r.id || ''
    if (/^(adv-sep-|adv-\d+$|st-|ct-|staff-|cnt-)/.test(id)) s += 25
    if (!id.includes('Date.now') && !/-\d{13}-/.test(id)) s += 5
    s += Math.min(20, Math.abs(Number(r.amount ?? r.salary) || 0) / 5000)
    s += Math.max(0, 15 - (Number(r.serialNo) || 99))
    return s
  }
  return score(a) >= score(b) ? a : b
}

function dedupeRowsByKey<T extends { id?: string }>(
  rows: T[],
  keyOf: (row: T) => string,
  prefer: (a: T, b: T) => T = preferPayrollDuplicateRow
): { list: T[]; removed: number } {
  const map = new Map<string, T>()
  let removed = 0
  for (const row of rows || []) {
    const key = keyOf(row)
    if (!key) {
      map.set(`__noid__${row.id || Math.random()}`, row)
      continue
    }
    const prev = map.get(key)
    if (!prev) {
      map.set(key, row)
      continue
    }
    removed += 1
    map.set(key, prefer(prev, row))
  }
  return { list: [...map.values()], removed }
}

function advancePersonMonthKey(a: {
  month?: string
  employeeId?: string
  employeeName?: string
}): string {
  const month = sheetMonthKey(a.month)
  const person = (a.employeeId || '').trim() || normalizeName(a.employeeName)
  if (!person) return ''
  return `${month}|${person}`
}

function salariedPersonMonthKey(row: {
  month?: string
  employeeId?: string
  employeeName?: string
  name?: string
}): string {
  const month = sheetMonthKey(row.month)
  const person =
    (row.employeeId || '').trim() ||
    normalizeName(row.employeeName || row.name)
  if (!person) return ''
  return `${month}|${person}`
}

function fortnightPersonMonthKey(row: {
  month?: string
  fortnight?: string
  employeeId?: string
  employeeName?: string
  name?: string
}): string {
  const base = salariedPersonMonthKey(row)
  if (!base) return ''
  return `${base}|${row.fortnight || '1-15'}`
}

/** Default Excel petty-cash transfer amounts (accountant can override per month/fortnight). */
function defaultPettyCashInflow(fortnight: '1-15' | '16-31'): number {
  return fortnight === '1-15' ? 86930 : 86570
}

function pettyCashInflowMetaKey(month: string, fortnight: '1-15' | '16-31'): string {
  return `${month}|${fortnight}`
}

function writeHrMeta(custom: {
  categories: string[]
  designations: string[]
  activeSalariedMonth?: string
  activeFortnightMonth?: string
  activeFortnight?: '1-15' | '16-31'
  pettyCashInflowOverrides?: Record<string, number>
}): void {
  const raw = readHrMetaRaw()
  writeStore(STORAGE_KEYS.HR_META, {
    ...custom,
    pettyCashInflowOverrides:
      custom.pettyCashInflowOverrides ?? raw.pettyCashInflowOverrides,
  })
}

function readHrMetaRaw(): {
  categories?: string[]
  designations?: string[]
  activeSalariedMonth?: string
  activeFortnightMonth?: string
  activeFortnight?: '1-15' | '16-31'
  pettyCashInflowOverrides?: Record<string, number>
} {
  try {
    const raw = memoryStore.get(STORAGE_KEYS.HR_META)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore
  }
  if (isPayrollClient()) {
    try {
      const legacy = localStorage.getItem(STORAGE_KEYS.HR_META)
      if (legacy) {
        memoryStore.set(STORAGE_KEYS.HR_META, legacy)
        const parsed = JSON.parse(legacy)
        void persistPayrollKey(STORAGE_KEYS.HR_META, parsed)
        return parsed
      }
    } catch {
      // ignore
    }
    const mirrored = readLocalMirror(STORAGE_KEYS.HR_META)
    if (mirrored && typeof mirrored === 'object') {
      return mirrored as {
        categories?: string[]
        designations?: string[]
        activeSalariedMonth?: string
      }
    }
  }
  return {}
}

export function formatPayrollMonthLabel(month: string): string {
  try {
    const [y, m] = month.split('-').map(Number)
    if (!y || !m) return month
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  } catch {
    return month
  }
}

/** Load payroll store from DB (seeds DB if empty). Call once when entering Payroll module. */
export async function hydratePayrollFromDb(): Promise<void> {
  if (!isPayrollClient()) return
  if (hydrated) return
  if (hydratePromise) return hydratePromise

  hydratePromise = (async () => {
    try {
      const res = await fetch('/api/payroll/store', { method: 'GET', cache: 'no-store' })
      const data = await res.json()
      if (data?.ok && data.store && typeof data.store === 'object') {
        Object.entries(data.store as Record<string, unknown>).forEach(([key, value]) => {
          memoryStore.set(key, JSON.stringify(value))
        })
      }

      // Merge local mirrors (e.g. September generated before PUT finished / offline).
      for (const key of LOCAL_MIRROR_KEYS) {
        const mirrored = readLocalMirror(key)
        if (mirrored == null) continue
        if (key === STORAGE_KEYS.HR_META && typeof mirrored === 'object') {
          const dbMeta = (() => {
            try {
              return JSON.parse(memoryStore.get(key) || '{}')
            } catch {
              return {}
            }
          })() as {
            activeSalariedMonth?: string
            activeFortnightMonth?: string
            activeFortnight?: '1-15' | '16-31'
            categories?: string[]
            designations?: string[]
            pettyCashInflowOverrides?: Record<string, number>
          }
          const localMeta = mirrored as typeof dbMeta
          const merged = {
            categories: localMeta.categories?.length ? localMeta.categories : dbMeta.categories || [],
            designations: localMeta.designations?.length
              ? localMeta.designations
              : dbMeta.designations || [],
            activeSalariedMonth: (() => {
              const local = localMeta.activeSalariedMonth || ''
              const db = dbMeta.activeSalariedMonth || ''
              if (local && db) return local >= db ? local : db
              return local || db || undefined
            })(),
            activeFortnightMonth:
              localMeta.activeFortnightMonth || dbMeta.activeFortnightMonth || undefined,
            activeFortnight: localMeta.activeFortnight || dbMeta.activeFortnight || undefined,
            // Keep synopsis petty-cash inflow edits across refresh (local wins on key clash).
            pettyCashInflowOverrides: {
              ...(dbMeta.pettyCashInflowOverrides || {}),
              ...(localMeta.pettyCashInflowOverrides || {}),
            },
          }
          memoryStore.set(key, JSON.stringify(merged))
          pendingPersists.set(key, merged)
          continue
        }
        if (Array.isArray(mirrored)) {
          let dbRows: { id?: string; month?: string; fortnight?: string }[] = []
          try {
            dbRows = JSON.parse(memoryStore.get(key) || '[]')
          } catch {
            dbRows = []
          }
          // Employees: DB roster wins once present (don't resurrect deleted seed people from mirror).
          const merged =
            key === STORAGE_KEYS.EMPLOYEES && dbRows.length > 0
              ? [...dbRows]
              : mergeMirrorPreferDbPeriods(
                  dbRows,
                  mirrored as { id?: string; month?: string; fortnight?: string }[]
                )
          memoryStore.set(key, JSON.stringify(merged))
          // Flush only when mirror added brand-new periods (or first offline sheet).
          if (JSON.stringify(merged) !== JSON.stringify(dbRows)) {
            pendingPersists.set(key, merged)
          }
        }
      }

      // Merge any in-flight pending writes into memory (never let seed wipe newer months).
      for (const [key, value] of pendingPersists) {
        if (key === STORAGE_KEYS.EMPLOYEES && Array.isArray(value)) {
          memoryStore.set(key, JSON.stringify(value))
          writeLocalMirror(key, value)
        } else if (ARRAY_MERGE_KEYS.has(key) && Array.isArray(value)) {
          let current: { id?: string }[] = []
          try {
            current = JSON.parse(memoryStore.get(key) || '[]')
          } catch {
            current = []
          }
          const merged = mergeRowsById(current, value as { id?: string }[])
          memoryStore.set(key, JSON.stringify(merged))
          pendingPersists.set(key, merged)
          writeLocalMirror(key, merged)
        } else if (key === STORAGE_KEYS.HR_META && value && typeof value === 'object') {
          let current: Record<string, unknown> = {}
          try {
            current = JSON.parse(memoryStore.get(key) || '{}')
          } catch {
            current = {}
          }
          const incoming = value as {
            pettyCashInflowOverrides?: Record<string, number>
          }
          const curOverrides =
            current.pettyCashInflowOverrides &&
            typeof current.pettyCashInflowOverrides === 'object'
              ? (current.pettyCashInflowOverrides as Record<string, number>)
              : {}
          const merged = {
            ...current,
            ...incoming,
            pettyCashInflowOverrides: {
              ...curOverrides,
              ...(incoming.pettyCashInflowOverrides || {}),
            },
          }
          memoryStore.set(key, JSON.stringify(merged))
          pendingPersists.set(key, merged)
          writeLocalMirror(key, merged)
        }
      }

      hydrated = true

      // Flush anything written during the race / recovered from mirror.
      const toFlush = [...pendingPersists.entries()]
      pendingPersists.clear()
      await Promise.all(
        toFlush.map(async ([key, value]) => {
          if (key === STORAGE_KEYS.EMPLOYEES && Array.isArray(value)) {
            memoryStore.set(key, JSON.stringify(value))
            writeLocalMirror(key, value)
            return persistPayrollKey(key, value)
          } else if (ARRAY_MERGE_KEYS.has(key) && Array.isArray(value)) {
            let current: { id?: string }[] = []
            try {
              current = JSON.parse(memoryStore.get(key) || '[]')
            } catch {
              current = []
            }
            const merged = mergeRowsById(current, value as { id?: string }[])
            memoryStore.set(key, JSON.stringify(merged))
            writeLocalMirror(key, merged)
            return persistPayrollKey(key, merged)
          }
          return persistPayrollKey(key, value)
        })
      )

      // After mirror flush: restore Aug (etc.) pay if profile sync had overwritten it to 40000.
      try {
        payrollService.repairHistoricalPayClobberedByProfile()
      } catch (repairErr) {
        console.error('[payroll] historical pay repair skipped', repairErr)
      }
      // Fix Sep Staff cheque = -advance corruption (Net Cash wrongly = Gross).
      try {
        payrollService.repairCorruptedStaffChequeAmounts()
      } catch (chequeErr) {
        console.error('[payroll] staff cheque repair skipped', chequeErr)
      }
      // Drop same-person duplicates (local mirror + DB often keep two ids for one advance).
      try {
        payrollService.repairDuplicatePayrollRows()
      } catch (dupErr) {
        console.error('[payroll] duplicate repair skipped', dupErr)
      }
    } catch (err) {
      console.error('[payroll] hydrate failed — falling back to seed/local', err)
      hydrated = true
      const toFlush = [...pendingPersists.entries()]
      pendingPersists.clear()
      await Promise.all(toFlush.map(([key, value]) => persistPayrollKey(key, value)))
    }
  })()

  return hydratePromise
}

class PayrollService {
  /** Previous name, so a renamed person still matches their wage-sheet row. */
  private profileAliases = new Map<string, string>()
  private isClient(): boolean {
    return isPayrollClient()
  }

  private canWrite(): boolean {
    return this.isClient() || allowServerSheetWrite
  }

  // ==========================================
  // FORMULA CALCULATION UTILITIES (LIVE EXCEL MATH)
  // ==========================================

  calculateStaffSalaryRow(row: Partial<StaffSalaryRecord>, daysInMonth = 31): StaffSalaryRecord {
    const salary = Number(row.salary) || 0
    const attendance = Number(row.attendanceDays) || 0
    const otHours = Number(row.otHours) || 0
    // Advances / cheques are never negative (live had cheque = -advance, which inflated Net Cash).
    const lessAdvance = Math.max(0, Number(row.lessAdvance) || 0)
    const chequeAmount = Math.max(0, Number(row.chequeAmount) || 0)

    const month = row.month || '2026-08'
    const isHistorical = month !== this.getActiveSalariedMonth()
    const calDays = daysInCalendarMonth(month)

    let actualDays = calDays
    if (!isHistorical && daysInMonth !== undefined && daysInMonth > 0) {
      actualDays = daysInMonth
    } else if (isHistorical && (daysInMonth === 28 || daysInMonth === calDays)) {
      actualDays = daysInMonth
    }

    // Excel: Rate Per Day = Salary / days; Basic = Attn × Rate Per Day
    const calculatedRatePerDay = Math.round((salary / actualDays) * 100) / 100
    let ratePerDay = calculatedRatePerDay
    let basicSalary = Math.round(attendance * ratePerDay)

    if (
      isHistorical &&
      row.basicSalary !== undefined &&
      row.salary === salary &&
      row.attendanceDays === attendance
    ) {
      basicSalary = Number(row.basicSalary)
      ratePerDay = row.ratePerDay !== undefined ? Number(row.ratePerDay) : calculatedRatePerDay
    }

    const perHrRate = Number((salary / 240).toFixed(2))
    // Excel exact formula: OT Hrs * (Salary / 240) (e.g. 176 * 40000 / 240 = 29333)
    let otAmount = Math.round(otHours * (salary / 240))
    if (
      isHistorical &&
      row.otAmount !== undefined &&
      row.otHours === otHours &&
      row.salary === salary
    ) {
      otAmount = Number(row.otAmount)
    }

    const grossAmount = basicSalary + otAmount
    const synopsisAmount = grossAmount - lessAdvance
    let netCashAmount = Math.max(0, synopsisAmount - chequeAmount)
    if (
      isHistorical &&
      row.netCashAmount !== undefined &&
      row.salary === salary &&
      row.attendanceDays === attendance &&
      row.otHours === otHours &&
      row.lessAdvance === lessAdvance &&
      row.chequeAmount === chequeAmount
    ) {
      netCashAmount = Number(row.netCashAmount)
    }

    return {
      id: row.id || `staff-${Date.now()}`,
      serialNo: row.serialNo || 1,
      employeeId: row.employeeId,
      employeeName: row.employeeName || '',
      designation: row.designation || '',
      salary,
      attendanceDays: attendance,
      ratePerDay,
      basicSalary,
      perHrRate,
      otHours,
      otAmount,
      grossAmount,
      lessAdvance,
      chequeAmount,
      synopsisAmount,
      netCashAmount,
      month,
      customFields: row.customFields,
    }
  }

  calculateContractSalaryRow(row: Partial<ContractSalaryRecord>, daysInMonth = 31): ContractSalaryRecord {
    const salary = Number(row.salary) || 0
    const attendance = Number(row.attendanceDays) || 0
    const otHours = Number(row.otHours) || 0
    const efficiencyAmount = Number(row.efficiencyAmount) || 0
    const advanceDeduction = Number(row.advanceDeduction) || 0
    const ticketCharges = row.ticketCharges !== undefined ? Number(row.ticketCharges) : 5
    const lateHours = Number(row.lateHours) || 0

    const month = row.month || '2026-08'
    const isHistorical = month !== this.getActiveSalariedMonth()
    const calDays = daysInCalendarMonth(month)

    let actualDays = calDays
    if (!isHistorical && daysInMonth !== undefined && daysInMonth > 0) {
      actualDays = daysInMonth
    } else if (isHistorical && (daysInMonth === 28 || daysInMonth === calDays)) {
      actualDays = daysInMonth
    }

    // Excel Contract Employees: Rate = Salary/days; Gross (H) = Attn × Rate
    const calculatedRatePerDay = Math.round((salary / actualDays) * 100) / 100
    let ratePerDay = calculatedRatePerDay
    let basicSalary = Math.round(attendance * ratePerDay)

    if (
      isHistorical &&
      row.basicSalary !== undefined &&
      row.salary === salary &&
      row.attendanceDays === attendance
    ) {
      basicSalary = Number(row.basicSalary)
      ratePerDay = row.ratePerDay !== undefined ? Number(row.ratePerDay) : calculatedRatePerDay
    }

    // Look up duty hours from live master roster (Sheet 1) or fall back to role defaults
    let dutyHrs = 10
    const roster = this.getEmployees()
    const matchedEmp = findLinkedEmployee(roster, row.employeeName, row.designation, row.employeeId)

    if (matchedEmp && matchedEmp.dutyHrs && matchedEmp.dutyHrs > 0) {
      dutyHrs = matchedEmp.dutyHrs
    } else {
      const des = (row.designation || '').toLowerCase()
      if (
        des.includes('quality controller') ||
        des.includes('oilman') ||
        des.includes('oil man') ||
        des.includes('folding') ||
        des.includes('time keeper') ||
        des.includes('beem gater') ||
        des.includes('shift technician') ||
        des.includes('asst technician') ||
        des.includes('asst. technician') ||
        des.includes('technician')
      ) {
        dutyHrs = 12
      } else if (
        des.includes('incharge') ||
        des.includes('accountant') ||
        des.includes('supervisor') ||
        des.includes('store') ||
        des.includes('kitchen') ||
        des.includes('sweeper')
      ) {
        dutyHrs = 8
      } else if (des.includes('d.e.o') || des.includes('deo')) {
        dutyHrs = 9
      }
    }

    // Excel: Rate Per Hr from row salary / (30×dutyHrs). NEVER leak master roster if salaries differ!
    let ratePerHr = Number(row.ratePerHr) || 0
    const calculatedRatePerHr = Number((salary / (30 * dutyHrs)).toFixed(2))

    if (isHistorical) {
      if (ratePerHr <= 0) {
        ratePerHr = calculatedRatePerHr
      }
    } else {
      ratePerHr = calculatedRatePerHr
    }

    let otAmount = Math.round(otHours * ratePerHr)
    if (
      isHistorical &&
      row.otAmount !== undefined &&
      row.otHours === otHours &&
      row.salary === salary
    ) {
      otAmount = Number(row.otAmount)
    }

    // Late Hrs Amount: keep manual value if set; else Late Hrs × Rate Per Hr
    const lateAmount =
      row.lateAmount !== undefined && row.lateAmount !== null && String(row.lateAmount) !== ''
        ? Number(row.lateAmount) || 0
        : lateHours > 0
          ? Math.round(lateHours * ratePerHr)
          : 0

    // Net Payment sheet: Gross = Basic (sheet4 H) + OT + Efficiency
    let grossSalary = basicSalary + otAmount + efficiencyAmount
    if (
      isHistorical &&
      row.grossSalary !== undefined &&
      row.salary === salary &&
      row.attendanceDays === attendance &&
      row.otHours === otHours &&
      row.efficiencyAmount === efficiencyAmount
    ) {
      grossSalary = Number(row.grossSalary)
    }

    // Excel: Net = Gross − Late − Advance − Ticket
    let netAmount = grossSalary - lateAmount - advanceDeduction - ticketCharges
    if (
      isHistorical &&
      row.netAmount !== undefined &&
      row.salary === salary &&
      row.attendanceDays === attendance &&
      row.otHours === otHours &&
      row.advanceDeduction === advanceDeduction &&
      row.efficiencyAmount === efficiencyAmount &&
      row.ticketCharges === ticketCharges
    ) {
      netAmount = Number(row.netAmount)
    }

    return {
      id: row.id || `cnt-${Date.now()}`,
      serialNo: row.serialNo || 1,
      employeeId: row.employeeId || matchedEmp?.id,
      employeeName: row.employeeName || '',
      designation: row.designation || '',
      salary,
      attendanceDays: attendance,
      ratePerDay,
      ratePerHr,
      basicSalary,
      lateHours,
      lateAmount,
      otHours,
      otAmount,
      efficiencyAmount,
      grossSalary,
      advanceDeduction,
      ticketCharges,
      netAmount,
      month,
      customFields: row.customFields,
    }
  }

  calculateEfficiencyRow(row: Partial<EfficiencyIncentiveRecord>): EfficiencyIncentiveRecord {
    const eff = Number(row.efficiencyPercent) || 0
    const salaryEarned = Number(row.salaryEarned) || 0
    const availPercent = eff >= 70 ? Math.max(0, eff - 60) : 0
    const amount = Math.round(salaryEarned * (availPercent / 100))

    return {
      id: row.id || `eff-${Date.now()}`,
      serialNo: row.serialNo || 1,
      employeeId: row.employeeId,
      loom: row.loom || 'Overall',
      name: row.name || '',
      designation: row.designation || '',
      efficiencyPercent: eff,
      salaryEarned,
      availPercent,
      amount,
      month: row.month || '2026-08',
      customFields: row.customFields,
    }
  }

  calculateWeaverWageRow(row: Partial<WeaverWageRecord>): WeaverWageRecord {
    const designation = row.designation || 'Weaver'
    const isSpare = designation === 'Spare Weaver' || (row.wagePerDay && row.wagePerDay >= 1800)
    const wagePerDay = row.wagePerDay ? Number(row.wagePerDay) : isSpare ? 1800 : 1450
    const attendance = Number(row.attendanceDays) || 0
    const extraLooms = Number(row.extraLooms) || 0
    const rateLoom = row.rateLoom !== undefined ? Number(row.rateLoom) : 150
    const holidayAttendance = Number(row.holidayAttendance) || 0
    const holidayRate = row.holidayRate !== undefined ? Number(row.holidayRate) : isSpare ? 2100 : 1750
    const efficiencyAmount = Number(row.efficiencyAmount) || 0

    const basicSalary = wagePerDay * attendance
    const extraLoomAmount = extraLooms * rateLoom
    const attendanceAllowance =
      row.attendanceAllowance !== undefined ? Number(row.attendanceAllowance) : (attendance >= 13 ? 800 : 0)
    const holidayAmount = holidayAttendance * holidayRate
    const grossAmount = basicSalary + extraLoomAmount + attendanceAllowance
    const netPay = grossAmount + holidayAmount + efficiencyAmount

    return {
      id: row.id || `w-${Date.now()}`,
      serialNo: row.serialNo || 1,
      employeeId: row.employeeId,
      employeeName: row.employeeName || '',
      designation: isSpare ? 'Spare Weaver' : 'Weaver',
      wagePerDay,
      attendanceDays: attendance,
      basicSalary,
      rateLoom,
      extraLooms,
      extraLoomAmount,
      attendanceAllowance,
      holidayAttendance,
      holidayRate,
      holidayAmount,
      efficiencyAmount,
      grossAmount,
      netPay,
      fortnight: row.fortnight || '1-15',
      month: row.month || '2026-08',
      customFields: row.customFields,
    }
  }

  calculateHelperWageRow(row: Partial<HelperWageRecord>): HelperWageRecord {
    const wagePerDay = row.wagePerDay !== undefined ? Number(row.wagePerDay) : 1050
    const attendance = Number(row.attendanceDays) || 0
    const holidayAttendance = Number(row.holidayAttendance) || 0
    const wagesAmount = wagePerDay * attendance
    const otRate =
      row.otRate !== undefined
        ? Number(row.otRate)
        : (row.designation === 'Winder' ? 1400 : 1200)
    const otAmount = holidayAttendance * otRate
    const netAmount = wagesAmount + otAmount

    return {
      id: row.id || `h-${Date.now()}`,
      serialNo: row.serialNo || 1,
      employeeId: row.employeeId,
      employeeName: row.employeeName || '',
      designation: row.designation === 'Winder' ? 'Winder' : 'Helper',
      wagePerDay,
      attendanceDays: attendance,
      wagesAmount,
      otRate,
      holidayAttendance,
      otAmount,
      netAmount,
      fortnight: row.fortnight || '1-15',
      month: row.month || '2026-08',
      customFields: row.customFields,
    }
  }

  calculateContractorPaymentRow(row: Partial<ContractorPaymentRecord>): ContractorPaymentRecord {
    const contractualAmount = Number(row.contractualAmount) || 0
    const extraIncentive = Number(row.extraIncentive) || 0
    const lessAdvance = Number(row.lessAdvance) || 0

    const totalAmount = contractualAmount + extraIncentive
    const netPayment = totalAmount - lessAdvance

    return {
      id: row.id || `c-${Date.now()}`,
      serialNo: row.serialNo || 1,
      employeeId: row.employeeId,
      name: row.name || '',
      contractType: row.contractType || '',
      contractualAmount,
      extraIncentive,
      totalAmount,
      lessAdvance,
      netPayment,
      remarks: row.remarks || '',
      fortnight: row.fortnight || '1-15',
      month: row.month || '2026-08',
      customFields: row.customFields,
    }
  }

  // ==========================================
  // REACTIVE EVENT BROADCAST & SYNC
  // ==========================================

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

  getEmployees(): EmployeeProfile[] {
    const list = this.readStore(STORAGE_KEYS.EMPLOYEES, INITIAL_EMPLOYEES)
    const { list: repaired, changed } = this.repairRoster(list)
    if (changed && this.isClient() && hydrated) {
      writeStore(STORAGE_KEYS.EMPLOYEES, repaired)
    }
    return repaired
  }

  /**
   * Merge resigned General Wages people and missing weaver/helper profiles.
   * Used by GET /api/payroll/store so the roster is saved in Postgres, not only in the browser.
   */
  integrateEmployeeRoster(
    employees: unknown,
    weavers: unknown,
    helpers: unknown
  ): { list: EmployeeProfile[]; changed: boolean } {
    const list =
      Array.isArray(employees) && employees.length > 0
        ? (employees as EmployeeProfile[])
        : INITIAL_EMPLOYEES
    const weaverRows = Array.isArray(weavers)
      ? (weavers as WeaverWageRecord[])
      : this.readStore(STORAGE_KEYS.WEAVERS, INITIAL_WEAVERS_WAGES)
    const helperRows = Array.isArray(helpers)
      ? (helpers as HelperWageRecord[])
      : this.readStore(STORAGE_KEYS.HELPERS, INITIAL_HELPERS_WAGES)
    return this.repairRoster(list, weaverRows, helperRows)
  }

  /**
   * Persisted roster can predate the Excel import:
   * - General Wages remarks like "Resignation …" stay Active, so Resigned count is 0
   * - Weavers / Helpers live on their wage sheets but were never copied onto HR
   */
  private repairRoster(
    list: EmployeeProfile[],
    weaverRows?: WeaverWageRecord[],
    helperRows?: HelperWageRecord[]
  ): { list: EmployeeProfile[]; changed: boolean } {
    let changed = false
    let next = list.map((e) => {
      const remarks = e.remarks || ''
      const looksResigned = /resign/i.test(remarks) || (e.status || '').toLowerCase() === 'resigned'
      if (!looksResigned) return e
      const resignedAt = (e.resignedAt || '').trim() || parseResignationDateFromRemarks(remarks) || ''
      if ((e.status || 'Active') === 'Resigned' && ((e.resignedAt || '').trim() === resignedAt || !resignedAt)) {
        return e
      }
      changed = true
      return {
        ...e,
        status: 'Resigned' as const,
        resignedAt: resignedAt || e.resignedAt,
      }
    })

    const names = () => new Set(next.map((e) => normalizeName(e.name)))
    let known = names()

    const pushMissing = (src: EmployeeProfile) => {
      const key = normalizeName(src.name)
      if (next.some((e) => e.id === src.id)) return
      // Same-name new hires (emp-sep-*) may share a display name with a resigned person.
      if (!src.id?.startsWith('emp-sep-') && key && known.has(key)) return
      const remarks = src.remarks || ''
      const looksResigned = /resign/i.test(remarks) || (src.status || '').toLowerCase() === 'resigned'
      next.push({
        ...src,
        status: looksResigned ? 'Resigned' : src.status || 'Active',
        resignedAt: looksResigned
          ? src.resignedAt || parseResignationDateFromRemarks(remarks) || ''
          : src.resignedAt,
      })
      known.add(key)
      changed = true
    }

    // Apply Sep Excel roster: resign/update existing by id, add missing General Wages hires.
    for (const src of allEmployeesData as unknown as EmployeeProfile[]) {
      const d = (src.designation || '').toLowerCase()
      const isFloor = d.includes('weaver') || d.includes('helper')
      const seedResigned =
        (src.status || '').toLowerCase() === 'resigned' || /resign/i.test(src.remarks || '')

      const byId = next.findIndex((e) => e.id === src.id)
      if (byId >= 0) {
        const cur = next[byId]
        if (seedResigned && (cur.status || 'Active') !== 'Resigned') {
          next[byId] = {
            ...cur,
            status: 'Resigned',
            remarks: src.remarks || cur.remarks,
            resignedAt:
              src.resignedAt ||
              parseResignationDateFromRemarks(src.remarks || cur.remarks) ||
              cur.resignedAt ||
              '',
            salary: src.salary ?? cur.salary,
            designation: src.designation || cur.designation,
            dutyHrs: src.dutyHrs ?? cur.dutyHrs,
            shiftFromTo: src.shiftFromTo || cur.shiftFromTo,
            doj: src.doj || cur.doj,
          }
          changed = true
        } else if (!seedResigned && (!cur.salary || cur.salary === 0) && src.salary) {
          next[byId] = {
            ...cur,
            salary: src.salary,
            designation: cur.designation || src.designation,
            dutyHrs: cur.dutyHrs ?? src.dutyHrs,
            shiftFromTo: cur.shiftFromTo || src.shiftFromTo,
            doj: cur.doj || src.doj,
            remarks: cur.remarks || src.remarks,
          }
          changed = true
        }
        continue
      }

      // New Sep hires (Ubaid / Israr / Dawood) or historical resigned missing from live DB.
      if (src.id?.startsWith('emp-sep-') || isFloor || seedResigned) {
        pushMissing(src)
      } else if (!known.has(normalizeName(src.name))) {
        // Active General Wages person present in seed but not live roster.
        const cat = (src.employeeCategory || '').toLowerCase()
        if (cat === 'weaver' || cat === 'helper' || cat === 'contractor') continue
        pushMissing(src)
      }
    }

    known = names()

    const skipName = (name?: string) => {
      const n = (name || '').trim().toLowerCase()
      return !n || n.startsWith('new ')
    }

    let serial = next.reduce((max, e) => Math.max(max, e.serialNo || 0), 0)
    const weaverSource = weaverRows ?? this.readStore(STORAGE_KEYS.WEAVERS, INITIAL_WEAVERS_WAGES)
    for (const w of weaverSource) {
      if (skipName(w.employeeName) || known.has(normalizeName(w.employeeName))) continue
      const isSpare = (w.designation || '').toLowerCase().includes('spare')
      const daily = Number(w.wagePerDay) || (isSpare ? 1800 : 1450)
      serial += 1
      pushMissing({
        id: `emp-w-${normalizeName(w.employeeName).replace(/\s+/g, '-')}`,
        serialNo: serial,
        name: w.employeeName,
        fatherName: '',
        cnic: '',
        phone: '',
        address: '',
        designation: isSpare ? 'Spare Weaver' : 'Weaver',
        department: 'Weaving Floor',
        employeeCategory: 'Weaver',
        dutyHrs: 12,
        shiftFromTo: '8 to 8',
        salary: daily * 30,
        ratePerDay31: daily,
        ratePerDay30: daily,
        ratePerHr30: Math.round((daily / 12) * 100) / 100,
        ratePerDay28: daily,
        doj: '',
        contractStatus: 'Daily Wage',
        status: 'Active',
      })
    }

    const helperSource = helperRows ?? this.readStore(STORAGE_KEYS.HELPERS, INITIAL_HELPERS_WAGES)
    for (const h of helperSource) {
      if (skipName(h.employeeName) || known.has(normalizeName(h.employeeName))) continue
      const daily = Number(h.wagePerDay) || 1050
      serial += 1
      pushMissing({
        id: `emp-h-${normalizeName(h.employeeName).replace(/\s+/g, '-')}`,
        serialNo: serial,
        name: h.employeeName,
        fatherName: '',
        cnic: '',
        phone: '',
        address: '',
        designation: 'Helper',
        department: 'Weaving Floor',
        employeeCategory: 'Helper',
        dutyHrs: 12,
        shiftFromTo: '8 to 8',
        salary: daily * 30,
        ratePerDay31: daily,
        ratePerDay30: daily,
        ratePerHr30: Math.round((daily / 12) * 100) / 100,
        ratePerDay28: daily,
        doj: '',
        contractStatus: 'Daily Wage',
        status: 'Active',
      })
    }

    if (changed) {
      next = next.map((e, i) => ({ ...e, serialNo: i + 1 }))
    }
    return { list: next, changed }
  }

  /** Weaver / Spare Weaver / Helper belong on their wage sheets, not General Wages. */
  private placeOnDailyWageSheets(emp: EmployeeProfile, month = '2026-08'): void {
    const cat = inferEmployeeCategory(emp)
    if (cat !== 'Weaver' && cat !== 'Helper') return
    if ((emp.status || 'Active') === 'Resigned') return
    if (!employeeBelongsInMonth(emp, month)) return

    const monthsOf = (_rows?: { month?: string }[]) => [month]

    if (cat === 'Weaver') {
      const all = this.readStore(STORAGE_KEYS.WEAVERS, INITIAL_WEAVERS_WAGES)
      const pay = weaverSheetFields(emp)
      const previousName = this.profileAliases.get(emp.id)
      let changed = false
      const next = [...all]
      for (const m of monthsOf(all)) {
        for (const fortnight of ['1-15', '16-31'] as const) {
          const idx = next.findIndex(
            (w) =>
              w.month === m &&
              w.fortnight === fortnight &&
              (w.employeeId === emp.id ||
                namesMatch(w.employeeName, emp.name) ||
                namesMatch(w.employeeName, previousName))
          )
          if (idx >= 0) {
            const row = next[idx]
            // holidayAttendance is sheet-owned (editable on Weavers OT) — do not overwrite from profile.
            if (
              row.employeeId === emp.id &&
              row.employeeName === emp.name &&
              row.designation === pay.designation &&
              row.wagePerDay === pay.wagePerDay &&
              row.holidayRate === pay.holidayRate
            ) {
              continue
            }
            next[idx] = this.calculateWeaverWageRow({
              ...row,
              employeeId: emp.id,
              employeeName: emp.name,
              designation: pay.designation,
              wagePerDay: pay.wagePerDay,
              holidayRate: pay.holidayRate,
              holidayAttendance: row.holidayAttendance,
            })
            changed = true
            continue
          }
          const peers = next.filter((w) => w.month === m && w.fortnight === fortnight)
          next.push(
            this.calculateWeaverWageRow({
              id: `w-${m}-${fortnight}-${emp.id}`,
              serialNo: peers.length + 1,
              employeeId: emp.id,
              employeeName: emp.name,
              designation: pay.designation,
              wagePerDay: pay.wagePerDay,
              attendanceDays: 0,
              rateLoom: 150,
              extraLooms: 0,
              holidayAttendance: Number(emp.overtimeShifts) || 0,
              holidayRate: pay.holidayRate,
              efficiencyAmount: 0,
              fortnight,
              month: m,
            })
          )
          changed = true
        }
      }
      if (changed) this.saveWeaversWages(next, false)
      return
    }

    const all = this.readStore(STORAGE_KEYS.HELPERS, INITIAL_HELPERS_WAGES)
    const pay = helperSheetFields(emp)
    const previousName = this.profileAliases.get(emp.id)
    let changed = false
    const next = [...all]
    for (const m of monthsOf(all)) {
      for (const fortnight of ['1-15', '16-31'] as const) {
        const idx = next.findIndex(
          (h) =>
            h.month === m &&
            h.fortnight === fortnight &&
            (h.employeeId === emp.id ||
              namesMatch(h.employeeName, emp.name) ||
              namesMatch(h.employeeName, previousName))
        )
        if (idx >= 0) {
          const row = next[idx]
          // holidayAttendance is sheet-owned (editable on Helpers) — do not overwrite from profile.
          if (
            row.employeeId === emp.id &&
            row.employeeName === emp.name &&
            row.designation === pay.designation &&
            row.wagePerDay === pay.wagePerDay &&
            row.otRate === pay.otRate
          ) {
            continue
          }
          next[idx] = this.calculateHelperWageRow({
            ...row,
            employeeId: emp.id,
            employeeName: emp.name,
            designation: pay.designation,
            wagePerDay: pay.wagePerDay,
            otRate: pay.otRate,
            holidayAttendance: row.holidayAttendance,
          })
          changed = true
          continue
        }
        const peers = next.filter((h) => h.month === m && h.fortnight === fortnight)
        next.push(
          this.calculateHelperWageRow({
            id: `h-${m}-${fortnight}-${emp.id}`,
            serialNo: peers.length + 1,
            employeeId: emp.id,
            employeeName: emp.name,
            designation: pay.designation,
            wagePerDay: pay.wagePerDay,
            attendanceDays: 0,
            otRate: pay.otRate,
            holidayAttendance: Number(emp.overtimeShifts) || 0,
            fortnight,
            month: m,
          })
        )
      }
    }
    if (changed) this.saveHelpersWages(next, false)
  }

  /** Staff / Admin → Staff sheet; Company Contract → Contract sheet. Attendance stays local. */
  private placeOnSalariedSheets(emp: EmployeeProfile, month = '2026-08'): void {
    const cat = inferEmployeeCategory(emp)
    if (cat === 'Weaver' || cat === 'Helper' || cat === 'Contractor') return
    if ((emp.status || 'Active') === 'Resigned') return
    if (!employeeBelongsInMonth(emp, month)) return

    const monthsOf = (_rows?: { month?: string }[]) => [month]

    const previousName = this.profileAliases.get(emp.id)

    if (cat === 'Contract') {
      const all = this.readStore(STORAGE_KEYS.CONTRACT, INITIAL_CONTRACT_SALARIES)
      let changed = false
      const next = [...all]
      for (const m of monthsOf(all)) {
        const days = daysInCalendarMonth(m)
        const idx = next.findIndex(
          (c) =>
            c.month === m &&
            (c.employeeId === emp.id ||
              namesMatch(c.employeeName, emp.name) ||
              namesMatch(c.employeeName, previousName))
        )
        if (idx >= 0) {
          const row = next[idx]
          if (
            row.employeeId === emp.id &&
            row.employeeName === emp.name &&
            row.designation === emp.designation &&
            row.salary === emp.salary
          ) {
            continue
          }
          next[idx] = this.calculateContractSalaryRow(
            {
              ...row,
              employeeId: emp.id,
              employeeName: emp.name,
              designation: emp.designation,
              salary: emp.salary,
            },
            days
          )
          changed = true
          continue
        }
        const peers = next.filter((c) => c.month === m)
        next.push(
          this.calculateContractSalaryRow(
            {
              id: `ct-${m}-${emp.id}`,
              serialNo: peers.length + 1,
              employeeId: emp.id,
              employeeName: emp.name,
              designation: emp.designation,
              salary: emp.salary,
              attendanceDays: 0,
              otHours: 0,
              lateHours: 0,
              efficiencyAmount: 0,
              advanceDeduction: 0,
              ticketCharges: 0,
              month: m,
            },
            days
          )
        )
        changed = true
      }
      if (changed) this.saveContractSalaries(next, false)
      return
    }

    const all = this.readStore(STORAGE_KEYS.STAFF, INITIAL_STAFF_SALARIES)
    let changed = false
    const next = [...all]
    for (const m of monthsOf(all)) {
      const days = daysInCalendarMonth(m)
      const idx = next.findIndex(
        (s) =>
          s.month === m &&
          (s.employeeId === emp.id ||
            namesMatch(s.employeeName, emp.name) ||
            namesMatch(s.employeeName, previousName))
      )
      if (idx >= 0) {
        const row = next[idx]
        if (
          row.employeeId === emp.id &&
          row.employeeName === emp.name &&
          row.designation === emp.designation &&
          row.salary === emp.salary
        ) {
          continue
        }
        next[idx] = this.calculateStaffSalaryRow(
          {
            ...row,
            employeeId: emp.id,
            employeeName: emp.name,
            designation: emp.designation,
            salary: emp.salary,
          },
          days
        )
        changed = true
        continue
      }
      const peers = next.filter((s) => s.month === m)
      next.push(
        this.calculateStaffSalaryRow(
          {
            id: `st-${m}-${emp.id}`,
            serialNo: peers.length + 1,
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
          days
        )
      )
      changed = true
    }
    if (changed) this.saveStaffSalaries(next, false)
  }

  /**
   * Seed Staff + Company Contract salary sheets for a new month from General Wages roster.
   * Prefers server API (direct Postgres write) so refresh cannot wipe September back to August.
   */
  async generateSalariedMonth(targetMonth: string): Promise<{
    ok: boolean
    message: string
    staff: number
    contract: number
  }> {
    await hydratePayrollFromDb()

    const month = (targetMonth || '').trim()
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return { ok: false, message: 'Month format YYYY-MM chahiye.', staff: 0, contract: 0 }
    }

    // 1) Durable path — server writes Postgres directly
    try {
      const res = await fetch('/api/payroll/generate-month', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ month }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.ok) {
        resetPayrollHydration()
        await hydratePayrollFromDb()
        this.notifyDataChanged(month)
        return {
          ok: true,
          message:
            data.message ||
            `${formatPayrollMonthLabel(month)} Postgres me save — refresh ke baad bhi September rahega.`,
          staff: Number(data.staff) || 0,
          contract: Number(data.contract) || 0,
        }
      }
      // Already exists on server — still pin active month
      if (res.status === 400 && String(data?.message || data?.error || '').includes('maujood')) {
        await this.setActiveSalariedMonthAsync(month)
        resetPayrollHydration()
        await hydratePayrollFromDb()
        return {
          ok: true,
          message: data.message || `${formatPayrollMonthLabel(month)} pehle se maujood — active set.`,
          staff: Number(data.staff) || 0,
          contract: Number(data.contract) || 0,
        }
      }
      console.error('[payroll] generate-month API failed', res.status, data)
    } catch (err) {
      console.error('[payroll] generate-month API error', err)
    }

    // 2) Fallback — client seed + PUT (mirrors + merge protect against wipe)
    return this.generateSalariedMonthClientFallback(month)
  }

  private async generateSalariedMonthClientFallback(month: string): Promise<{
    ok: boolean
    message: string
    staff: number
    contract: number
  }> {
    const allStaff = this.readStore(STORAGE_KEYS.STAFF, INITIAL_STAFF_SALARIES)
    const allContract = this.readStore(STORAGE_KEYS.CONTRACT, INITIAL_CONTRACT_SALARIES)
    const staffExists = allStaff.some((r) => (r.month || '') === month)
    const contractExists = allContract.some((r) => (r.month || '') === month)
    if (staffExists || contractExists) {
      await this.setActiveSalariedMonthAsync(month)
      return {
        ok: true,
        message: `${formatPayrollMonthLabel(month)} pehle se maujood hai — active month set kar diya.`,
        staff: allStaff.filter((r) => r.month === month).length,
        contract: allContract.filter((r) => r.month === month).length,
      }
    }

    const roster = this.getActiveEmployees()
      .filter(isGeneralWagesEmployee)
      .filter((e) => employeeBelongsInMonth(e, month))
    const days = daysInCalendarMonth(month)
    const staffPeople = roster.filter((e) => {
      const cat = inferEmployeeCategory(e)
      return cat === 'Staff' || cat === 'Admin'
    })
    const contractPeople = roster.filter((e) => inferEmployeeCategory(e) === 'Contract')

    const newStaff = staffPeople.map((emp, i) =>
      this.calculateStaffSalaryRow(
        {
          id: `st-${month}-${emp.id}`,
          serialNo: i + 1,
          employeeId: emp.id,
          employeeName: emp.name,
          designation: emp.designation,
          salary: emp.salary,
          attendanceDays: 0,
          otHours: 0,
          lessAdvance: 0,
          chequeAmount: 0,
          month,
        },
        days
      )
    )
    const newContract = contractPeople.map((emp, i) =>
      this.calculateContractSalaryRow(
        {
          id: `ct-${month}-${emp.id}`,
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
          month,
        },
        days
      )
    )

    if (newStaff.length === 0 && newContract.length === 0) {
      return {
        ok: false,
        message: 'General Wages me koi Staff / Company Contract person nahi mila.',
        staff: 0,
        contract: 0,
      }
    }

    const nextStaff = newStaff.length ? [...allStaff, ...newStaff] : allStaff
    const nextContract = newContract.length ? [...allContract, ...newContract] : allContract

    const allEff = this.readStore(STORAGE_KEYS.EFFICIENCY, INITIAL_EFFICIENCY_INCENTIVES)
    let nextEff = allEff
    let newEffCount = 0
    if (!allEff.some((r) => (r.month || '') === month)) {
      const priorMonths = [
        ...new Set(allEff.map((r) => r.month).filter(Boolean) as string[]),
      ].sort()
      const sourceMonth = priorMonths[priorMonths.length - 1] || '2026-08'
      const template = allEff.filter((r) => r.month === sourceMonth)
      const seeded = template.map((r, i) =>
        this.calculateEfficiencyRow({
          id: `eff-${month}-${i + 1}`,
          serialNo: i + 1,
          employeeId: r.employeeId,
          loom: r.loom,
          name: r.name,
          designation: r.designation,
          efficiencyPercent: 0,
          salaryEarned: r.salaryEarned || 0,
          month,
        })
      )
      nextEff = [...allEff, ...seeded]
      newEffCount = seeded.length
    }

    const savedStaff = newStaff.length
      ? await writeStoreAndWait(STORAGE_KEYS.STAFF, nextStaff)
      : true
    const savedContract = newContract.length
      ? await writeStoreAndWait(STORAGE_KEYS.CONTRACT, nextContract)
      : true
    const savedEff =
      newEffCount > 0 ? await writeStoreAndWait(STORAGE_KEYS.EFFICIENCY, nextEff) : true

    const raw = readHrMetaRaw()
    const meta = {
      categories: raw.categories || [],
      designations: raw.designations || [],
      activeSalariedMonth: month,
      activeFortnightMonth: raw.activeFortnightMonth,
      activeFortnight: raw.activeFortnight,
      pettyCashInflowOverrides: raw.pettyCashInflowOverrides,
    }
    const savedMeta = await writeStoreAndWait(STORAGE_KEYS.HR_META, meta)

    this.notifyDataChanged(month)

    const persisted = savedStaff && savedContract && savedEff && savedMeta
    return {
      ok: true,
      message: persisted
        ? `${formatPayrollMonthLabel(month)}: ${newStaff.length} Staff + ${newContract.length} Contract + ${newEffCount} Efficiency — save ho gaya.`
        : `${formatPayrollMonthLabel(month)} browser mirror me save — DB PUT fail. Tufail login check karo.`,
      staff: newStaff.length,
      contract: newContract.length,
    }
  }

  listPayrollMonths(): string[] {
    const months = new Set<string>(['2026-08'])
    for (const row of this.readStore(STORAGE_KEYS.STAFF, INITIAL_STAFF_SALARIES)) {
      if (row.month) months.add(row.month)
    }
    for (const row of this.readStore(STORAGE_KEYS.CONTRACT, INITIAL_CONTRACT_SALARIES)) {
      if (row.month) months.add(row.month)
    }
    // Also surface months only present in local mirror (pre-hydrate)
    if (isPayrollClient()) {
      for (const key of [STORAGE_KEYS.STAFF, STORAGE_KEYS.CONTRACT]) {
        const mirrored = readLocalMirror(key)
        if (Array.isArray(mirrored)) {
          for (const row of mirrored as { month?: string }[]) {
            if (row.month) months.add(row.month)
          }
        }
      }
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
      if (isPayrollClient()) {
        const mirrored = readLocalMirror(storeKey)
        if (Array.isArray(mirrored)) {
          for (const row of mirrored as { month?: string }[]) {
            if (row.month) months.add(row.month)
          }
        }
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

  /**
   * Seed Weaver + Helper + Contractor sheets for a fortnight (attendance/amounts zero).
   * Connects Weavers → Helpers → Contractors → Net Payment / Synopsis for that 15-day cycle.
   */
  async generateFortnightCycle(
    targetMonth: string,
    fortnight: '1-15' | '16-31'
  ): Promise<{
    ok: boolean
    message: string
    weavers: number
    helpers: number
    contractors: number
  }> {
    await hydratePayrollFromDb()
    const month = (targetMonth || '').trim()
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return { ok: false, message: 'Month format YYYY-MM chahiye.', weavers: 0, helpers: 0, contractors: 0 }
    }
    if (fortnight !== '1-15' && fortnight !== '16-31') {
      return { ok: false, message: 'Fortnight 1-15 ya 16-31 chahiye.', weavers: 0, helpers: 0, contractors: 0 }
    }

    const allWeavers = this.readStore(STORAGE_KEYS.WEAVERS, INITIAL_WEAVERS_WAGES)
    const allHelpers = this.readStore(STORAGE_KEYS.HELPERS, INITIAL_HELPERS_WAGES)
    const allContractors = this.readStore(STORAGE_KEYS.CONTRACTORS, INITIAL_CONTRACTORS)

    const weaverExists = allWeavers.some(
      (r) => (r.month || '') === month && (r.fortnight || '1-15') === fortnight
    )
    const helperExists = allHelpers.some(
      (r) => (r.month || '') === month && (r.fortnight || '1-15') === fortnight
    )
    const contractorExists = allContractors.some(
      (r) => (r.month || '') === month && (r.fortnight || '1-15') === fortnight
    )

    if (weaverExists || helperExists || contractorExists) {
      await this.setActiveFortnightPeriodAsync(month, fortnight)
      return {
        ok: true,
        message: `${formatPayrollMonthLabel(month)} (${fortnight}) pehle se maujood — active cycle set.`,
        weavers: allWeavers.filter((r) => r.month === month && r.fortnight === fortnight).length,
        helpers: allHelpers.filter((r) => r.month === month && r.fortnight === fortnight).length,
        contractors: allContractors.filter((r) => r.month === month && r.fortnight === fortnight)
          .length,
      }
    }

    const roster = this.getActiveEmployees()
    const weaverPeople = roster.filter((e) => inferEmployeeCategory(e) === 'Weaver')
    const helperPeople = roster.filter((e) => inferEmployeeCategory(e) === 'Helper')
    const contractorPeople = roster.filter((e) => inferEmployeeCategory(e) === 'Contractor')

    const newWeavers = weaverPeople.map((emp, i) => {
      const pay = weaverSheetFields(emp)
      return this.calculateWeaverWageRow({
        id: `w-${month}-${fortnight}-${emp.id}`,
        serialNo: i + 1,
        employeeId: emp.id,
        employeeName: emp.name,
        designation: pay.designation,
        wagePerDay: pay.wagePerDay,
        attendanceDays: 0,
        rateLoom: 150,
        extraLooms: 0,
        holidayAttendance: 0,
        holidayRate: pay.holidayRate,
        efficiencyAmount: 0,
        fortnight,
        month,
      })
    })

    const newHelpers = helperPeople.map((emp, i) => {
      const pay = helperSheetFields(emp)
      return this.calculateHelperWageRow({
        id: `h-${month}-${fortnight}-${emp.id}`,
        serialNo: i + 1,
        employeeId: emp.id,
        employeeName: emp.name,
        designation: pay.designation as 'Helper' | 'Winder',
        wagePerDay: pay.wagePerDay,
        attendanceDays: 0,
        holidayAttendance: 0,
        otRate: 1200,
        fortnight,
        month,
      })
    })

    const newContractors = contractorPeople.map((emp, i) => {
      const amount = Number(emp.salary) || 0
      return this.calculateContractorPaymentRow({
        id: `c-${month}-${fortnight}-${emp.id}`,
        serialNo: i + 1,
        employeeId: emp.id,
        name: emp.name,
        contractType: emp.designation || 'Contract',
        contractualAmount: amount,
        extraIncentive: 0,
        lessAdvance: 0,
        remarks: '',
        fortnight,
        month,
      })
    })

    if (newWeavers.length === 0 && newHelpers.length === 0 && newContractors.length === 0) {
      return {
        ok: false,
        message: 'HR me koi active Weaver / Helper / Contractor nahi mila.',
        weavers: 0,
        helpers: 0,
        contractors: 0,
      }
    }

    const nextWeavers = newWeavers.length ? [...allWeavers, ...newWeavers] : allWeavers
    const nextHelpers = newHelpers.length ? [...allHelpers, ...newHelpers] : allHelpers
    const nextContractors = newContractors.length
      ? [...allContractors, ...newContractors]
      : allContractors

    const savedW = newWeavers.length
      ? await writeStoreAndWait(STORAGE_KEYS.WEAVERS, nextWeavers)
      : true
    const savedH = newHelpers.length
      ? await writeStoreAndWait(STORAGE_KEYS.HELPERS, nextHelpers)
      : true
    const savedC = newContractors.length
      ? await writeStoreAndWait(STORAGE_KEYS.CONTRACTORS, nextContractors)
      : true

    const raw = readHrMetaRaw()
    const meta = {
      categories: raw.categories || [],
      designations: raw.designations || [],
      activeSalariedMonth: raw.activeSalariedMonth,
      activeFortnightMonth: month,
      activeFortnight: fortnight,
      pettyCashInflowOverrides: raw.pettyCashInflowOverrides,
    }
    const savedMeta = await writeStoreAndWait(STORAGE_KEYS.HR_META, meta)

    this.notifyDataChanged(month)

    const persisted = savedW && savedH && savedC && savedMeta
    const label = `${formatPayrollMonthLabel(month)} ${fortnight}`
    return {
      ok: true,
      message: persisted
        ? `${label}: ${newWeavers.length} Weavers + ${newHelpers.length} Helpers + ${newContractors.length} Contractors (zero attendance). Helper / Contractor / Net Payment / Synopsis isi cycle pe khulenge.`
        : `${label} browser me save — DB write fail. Refresh se pehle dubara Generate mat dabao.`,
      weavers: newWeavers.length,
      helpers: newHelpers.length,
      contractors: newContractors.length,
    }
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

  private filterRowsForMonth<T extends { employeeName?: string; name?: string; designation?: string; employeeId?: string; contractType?: string }>(
    rows: T[],
    month: string,
    nameKey: 'employeeName' | 'name' = 'employeeName'
  ): T[] {
    const roster = this.getEmployees()
    return rows.filter((row) => {
      const rowName = nameKey === 'name' ? row.name : row.employeeName
      let emp = findLinkedEmployee(roster, rowName, row.designation || row.contractType, row.employeeId)
      // Fallback: name-only match so DOJ still hides Sep joiners even if designation drifted.
      if (!emp && rowName) {
        emp = roster.find((e) => namesMatch(e.name, rowName))
      }
      return employeeBelongsInMonth(emp, month)
    })
  }

  /** Drop a resigned person from every stored sheet month after resign month. */
  purgeResignedFromFutureMonths(emp: EmployeeProfile): void {
    const end = resignedMonth(emp) || todayIsoDate().slice(0, 7)
    const unlink = (name?: string, designation?: string, employeeId?: string) =>
      Boolean(findLinkedEmployee([emp], name, designation, employeeId))

    const dropFuture = <T extends { month: string; employeeName?: string; name?: string; designation?: string; employeeId?: string; contractType?: string }>(
      list: T[]
    ) =>
      list.filter((row) => {
        if (row.month <= end) return true
        return !unlink(row.employeeName || row.name, row.designation || row.contractType, row.employeeId)
      })

    this.saveStaffSalaries(dropFuture(this.readStore(STORAGE_KEYS.STAFF, INITIAL_STAFF_SALARIES)), false)
    this.saveContractSalaries(dropFuture(this.readStore(STORAGE_KEYS.CONTRACT, INITIAL_CONTRACT_SALARIES)), false)
    this.saveAdvances(dropFuture(this.readStore(STORAGE_KEYS.ADVANCES, INITIAL_ADVANCES)), false)
    this.saveEfficiencyIncentives(dropFuture(this.readStore(STORAGE_KEYS.EFFICIENCY, INITIAL_EFFICIENCY_INCENTIVES)), false)
    this.saveWeaversWages(dropFuture(this.readStore(STORAGE_KEYS.WEAVERS, INITIAL_WEAVERS_WAGES)), false)
    this.saveHelpersWages(dropFuture(this.readStore(STORAGE_KEYS.HELPERS, INITIAL_HELPERS_WAGES)), false)
    this.saveContractorsPayments(dropFuture(this.readStore(STORAGE_KEYS.CONTRACTORS, INITIAL_CONTRACTORS)), false)
  }

  /**
   * Drop a new joiner from every sheet month BEFORE their DOJ month
   * (e.g. Sep joiner must not remain on August Staff / Advances / etc.).
   */
  purgeJoinerFromPastMonths(emp: EmployeeProfile): void {
    const start = joiningMonth(emp)
    if (!start) return
    const unlink = (name?: string, designation?: string, employeeId?: string) => {
      if (emp.id && employeeId && emp.id === employeeId) return true
      if (namesMatch(name, emp.name)) return true
      return Boolean(findLinkedEmployee([emp], name, designation, employeeId))
    }

    const dropPast = <T extends { month: string; employeeName?: string; name?: string; designation?: string; employeeId?: string; contractType?: string }>(
      list: T[]
    ) =>
      list.filter((row) => {
        if (sheetMonthKey(row.month) >= start) return true
        return !unlink(row.employeeName || row.name, row.designation || row.contractType, row.employeeId)
      })

    this.saveStaffSalaries(dropPast(this.readStore(STORAGE_KEYS.STAFF, INITIAL_STAFF_SALARIES)), false)
    this.saveContractSalaries(dropPast(this.readStore(STORAGE_KEYS.CONTRACT, INITIAL_CONTRACT_SALARIES)), false)
    this.saveAdvances(dropPast(this.readStore(STORAGE_KEYS.ADVANCES, INITIAL_ADVANCES)), false)
    this.saveEfficiencyIncentives(dropPast(this.readStore(STORAGE_KEYS.EFFICIENCY, INITIAL_EFFICIENCY_INCENTIVES)), false)
    this.saveWeaversWages(dropPast(this.readStore(STORAGE_KEYS.WEAVERS, INITIAL_WEAVERS_WAGES)), false)
    this.saveHelpersWages(dropPast(this.readStore(STORAGE_KEYS.HELPERS, INITIAL_HELPERS_WAGES)), false)
    this.saveContractorsPayments(dropPast(this.readStore(STORAGE_KEYS.CONTRACTORS, INITIAL_CONTRACTORS)), false)
  }

  /** Run DOJ purge for every roster person (fixes live Israr-still-in-August without re-saving profile). */
  purgeAllJoinersFromPastMonths(): number {
    if (this.isClient() && !hydrated) return 0
    let count = 0
    for (const emp of this.getEmployees()) {
      if (!joiningMonth(emp)) continue
      this.purgeJoinerFromPastMonths(emp)
      count += 1
    }
    return count
  }

  private readStore<T>(key: string, fallback: T[]): T[] {
    try {
      const raw = memoryStore.get(key)
      if (raw) {
        const parsed = JSON.parse(raw)
        // Empty arrays are valid saved state — never revive Excel INITIAL_* just because [].
        if (Array.isArray(parsed)) return parsed as T[]
      }
    } catch (err) {
      console.error(err)
    }
    if (this.isClient()) {
      try {
        const legacy = localStorage.getItem(key)
        if (legacy) {
          const parsed = JSON.parse(legacy)
          if (Array.isArray(parsed)) {
            // Do not PUT legacy localStorage — it is often August-only and wipes newer months.
            if (!memoryStore.get(key)) memoryStore.set(key, legacy)
            return parsed as T[]
          }
        }
      } catch (err) {
        console.error(err)
      }
    }
    return [...fallback]
  }

  saveEmployees(list: EmployeeProfile[], triggerSync: boolean = true): void {
    if (!this.isClient()) return

    writeStore(STORAGE_KEYS.EMPLOYEES, list)

    if (triggerSync) {
      this.syncMasterRoster(list, this.getActiveSalariedMonth())
    } else {
      this.notifyDataChanged()
    }
  }

  addEmployee(
    emp: Omit<EmployeeProfile, 'id' | 'serialNo' | 'ratePerDay31' | 'ratePerDay30' | 'ratePerHr30' | 'ratePerDay28'>,
    targetIndex?: number
  ): EmployeeProfile {
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
    this.purgeJoinerFromPastMonths(saved)
    this.notifyDataChanged()
    return saved
  }

  async addEmployeeAsync(
    emp: Omit<EmployeeProfile, 'id' | 'serialNo' | 'ratePerDay31' | 'ratePerDay30' | 'ratePerHr30' | 'ratePerDay28'>,
    targetIndex?: number,
    targetMonth?: string
  ): Promise<EmployeeProfile> {
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
    this.purgeJoinerFromPastMonths(saved)
    this.notifyDataChanged(targetMonth)
    return saved
  }

  /**
   * Profile.salary is the "current going rate" (newest / active month).
   * Editing an older month must update that month's sheet only — not clobber profile pay.
   */
  private shouldWritePayOntoProfile(targetMonth?: string): boolean {
    const target = sheetMonthKey(targetMonth || this.getActiveSalariedMonth())
    const months = this.listPayrollMonths()
    const latest = months[months.length - 1] || target
    const active = this.getActiveSalariedMonth()
    return target === latest || target === active || target >= latest
  }

  /**
   * Fix Staff rows where CHEQUE was corrupted to -LESS ADV (Net Cash became = Gross).
   * Restores cheque / OT / net from Excel seed for that person+month (Liaquat cheque stays 0).
   */
  repairCorruptedStaffChequeAmounts(): number {
    if (this.isClient() && !hydrated) return 0
    const staff = this.readStore(STORAGE_KEYS.STAFF, INITIAL_STAFF_SALARIES)
    let fixed = 0
    const next = staff.map((st) => {
      const cheque = Number(st.chequeAmount) || 0
      const adv = Number(st.lessAdvance) || 0
      const corrupted = cheque < 0 || (adv > 0 && cheque === -adv)
      if (!corrupted) return st

      const m = sheetMonthKey(st.month)
      const seed = INITIAL_STAFF_SALARIES.find(
        (s) =>
          sheetMonthKey(s.month) === m &&
          (namesMatch(s.employeeName, st.employeeName) ||
            (s.employeeId && st.employeeId && s.employeeId === st.employeeId))
      )

      fixed += 1
      if (seed) {
        return this.calculateStaffSalaryRow(
          {
            ...st,
            attendanceDays: seed.attendanceDays,
            otHours: seed.otHours,
            otAmount: seed.otAmount,
            lessAdvance: Math.max(0, Number(seed.lessAdvance) || 0),
            chequeAmount: Math.max(0, Number(seed.chequeAmount) || 0),
            basicSalary: seed.basicSalary,
            ratePerDay: seed.ratePerDay,
            grossAmount: seed.grossAmount,
            synopsisAmount: seed.synopsisAmount,
            netCashAmount: seed.netCashAmount,
          },
          daysInCalendarMonth(m)
        )
      }
      // No seed match — at least clear negative cheque and recalc.
      return this.calculateStaffSalaryRow(
        { ...st, chequeAmount: 0, lessAdvance: Math.max(0, adv) },
        daysInCalendarMonth(m)
      )
    })
    if (fixed > 0) this.saveStaffSalaries(next, false)
    return fixed
  }

  /**
   * Restore seed pay on older months when row salary was clobbered to match profile.salary
   * (e.g. Aug 36000 → 40000 after Sep profile edit + General Wages save).
   */
  repairHistoricalPayClobberedByProfile(): void {
    if (this.isClient() && !hydrated) return
    const employees = this.getEmployees()
    const months = this.listPayrollMonths()
    const latest = months[months.length - 1] || this.getActiveSalariedMonth()

    const staff = this.readStore(STORAGE_KEYS.STAFF, INITIAL_STAFF_SALARIES)
    let staffChanged = false
    const nextStaff = staff.map((st) => {
      const m = sheetMonthKey(st.month)
      if (m >= latest) return st
      const seed = INITIAL_STAFF_SALARIES.find(
        (s) =>
          sheetMonthKey(s.month) === m &&
          (namesMatch(s.employeeName, st.employeeName) ||
            (s.employeeId && st.employeeId && s.employeeId === st.employeeId))
      )
      if (!seed || Number(seed.salary) === Number(st.salary)) return st
      const emp = findLinkedEmployee(employees, st.employeeName, st.designation, st.employeeId)
      if (!emp || Number(st.salary) !== Number(emp.salary)) return st
      if (Number(seed.salary) === Number(emp.salary)) return st
      staffChanged = true
      return this.calculateStaffSalaryRow({ ...st, salary: seed.salary }, daysInCalendarMonth(m))
    })
    if (staffChanged) this.saveStaffSalaries(nextStaff, false)

    const contract = this.readStore(STORAGE_KEYS.CONTRACT, INITIAL_CONTRACT_SALARIES)
    let contractChanged = false
    const nextContract = contract.map((ct) => {
      const m = sheetMonthKey(ct.month)
      if (m >= latest) return ct
      const seed = INITIAL_CONTRACT_SALARIES.find(
        (s) =>
          sheetMonthKey(s.month) === m &&
          (namesMatch(s.employeeName, ct.employeeName) ||
            (s.employeeId && ct.employeeId && s.employeeId === ct.employeeId))
      )
      if (!seed || Number(seed.salary) === Number(ct.salary)) return ct
      const emp = findLinkedEmployee(employees, ct.employeeName, ct.designation, ct.employeeId)
      if (!emp || Number(ct.salary) !== Number(emp.salary)) return ct
      if (Number(seed.salary) === Number(emp.salary)) return ct
      contractChanged = true
      return this.calculateContractSalaryRow({ ...ct, salary: seed.salary }, daysInCalendarMonth(m))
    })
    if (contractChanged) this.saveContractSalaries(nextContract, false)
  }

  /**
   * Remove duplicate people within the same month (and fortnight for daily-wage sheets).
   * Live often has two copies after localStorage mirror ∪ Postgres merge by id.
   */
  repairDuplicatePayrollRows(): { removed: number } {
    if (this.isClient() && !hydrated) return { removed: 0 }
    let removed = 0

    const advances = this.readStore(STORAGE_KEYS.ADVANCES, INITIAL_ADVANCES)
    const adv = dedupeRowsByKey(advances, advancePersonMonthKey)
    if (adv.removed > 0) {
      removed += adv.removed
      const renumbered = this.renumberByMonth(adv.list)
      writeStore(STORAGE_KEYS.ADVANCES, renumbered)
    }

    const staff = this.readStore(STORAGE_KEYS.STAFF, INITIAL_STAFF_SALARIES)
    const st = dedupeRowsByKey(staff, salariedPersonMonthKey)
    if (st.removed > 0) {
      removed += st.removed
      writeStore(STORAGE_KEYS.STAFF, this.renumberByMonth(st.list))
    }

    const contract = this.readStore(STORAGE_KEYS.CONTRACT, INITIAL_CONTRACT_SALARIES)
    const ct = dedupeRowsByKey(contract, salariedPersonMonthKey)
    if (ct.removed > 0) {
      removed += ct.removed
      writeStore(STORAGE_KEYS.CONTRACT, this.renumberByMonth(ct.list))
    }

    const efficiency = this.readStore(STORAGE_KEYS.EFFICIENCY, INITIAL_EFFICIENCY_INCENTIVES)
    const eff = dedupeRowsByKey(efficiency, (row) =>
      salariedPersonMonthKey({
        month: row.month,
        employeeId: row.employeeId,
        name: row.name,
      })
    )
    if (eff.removed > 0) {
      removed += eff.removed
      writeStore(STORAGE_KEYS.EFFICIENCY, this.renumberByMonth(eff.list))
    }

    const weavers = this.readStore(STORAGE_KEYS.WEAVERS, INITIAL_WEAVERS_WAGES)
    const wv = dedupeRowsByKey(weavers, fortnightPersonMonthKey)
    if (wv.removed > 0) {
      removed += wv.removed
      writeStore(STORAGE_KEYS.WEAVERS, this.renumberByMonthFortnight(wv.list))
    }

    const helpers = this.readStore(STORAGE_KEYS.HELPERS, INITIAL_HELPERS_WAGES)
    const hp = dedupeRowsByKey(helpers, fortnightPersonMonthKey)
    if (hp.removed > 0) {
      removed += hp.removed
      writeStore(STORAGE_KEYS.HELPERS, this.renumberByMonthFortnight(hp.list))
    }

    const contractors = this.readStore(STORAGE_KEYS.CONTRACTORS, INITIAL_CONTRACTORS)
    const cr = dedupeRowsByKey(contractors, fortnightPersonMonthKey)
    if (cr.removed > 0) {
      removed += cr.removed
      writeStore(STORAGE_KEYS.CONTRACTORS, this.renumberByMonthFortnight(cr.list))
    }

    if (removed > 0) this.notifyDataChanged()
    return { removed }
  }

  private renumberByMonth<T extends { month?: string; serialNo?: number }>(list: T[]): T[] {
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

  private renumberByMonthFortnight<
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

  updateEmployee(
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
      this.placeOnSalariedSheets(merged, placeMonth)
    }
    this.notifyDataChanged(targetMonth)
    return merged
  }

  async updateEmployeeAsync(
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
      this.placeOnSalariedSheets(merged, placeMonth)
    }
    this.notifyDataChanged(targetMonth)
    return merged
  }

  syncSingleEmployeeAcrossSheets(
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
        contractualAmount: Number(newEmp.salary) > 0 ? Number(newEmp.salary) : c.contractualAmount,
      })
    })
    if (contractorsChanged) this.saveContractorsPayments(updatedContractors, false)
  }

  async syncSingleEmployeeAcrossSheetsAsync(
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
        contractualAmount: Number(newEmp.salary) > 0 ? Number(newEmp.salary) : c.contractualAmount,
      })
    })
    if (contractorsChanged) {
      persistPromises.push(writeStoreAndWait(STORAGE_KEYS.CONTRACTORS, updatedContractors))
    }

    await Promise.all(persistPromises)
  }

  getEmployeeCompensationForMonth(
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
  }

  rejoinEmployee(id: string, newDoj?: string): EmployeeProfile | null {
    const doj = newDoj || todayIsoDate()
    return this.updateEmployee(id, {
      status: 'Active',
      resignedAt: undefined,
      doj,
      remarks: `Re-joined ${doj}`,
    })
  }

  resignEmployee(id: string, resignedAt?: string, remarks?: string): EmployeeProfile | null {
    const dateStr = resignedAt || todayIsoDate()
    return this.updateEmployee(id, {
      status: 'Resigned',
      resignedAt: dateStr,
      remarks: remarks || `Resigned ${dateStr}`,
    })
  }

  /** Move a profile up/down within optional scope (e.g. General Wages list). */
  moveEmployee(id: string, direction: 'up' | 'down', scopeIds?: string[]): EmployeeProfile[] {
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
  }

  /** Force General Wages rows to continuous 1..n (gaps from resigned/filter). */
  renumberGeneralWages(): EmployeeProfile[] {
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
  }

  deleteEmployee(id: string): void {
    const list = this.getEmployees()
    const target = list.find((e) => e.id === id)
    const remaining = list.filter((e) => e.id !== id).map((e, i) => ({ ...e, serialNo: i + 1 }))
    writeStore(STORAGE_KEYS.EMPLOYEES, remaining)
    if (target) {
      this.removeLinkedPayrollRows(target)
    }
    this.notifyDataChanged()
  }

  async deleteEmployeeAsync(id: string): Promise<void> {
    const list = this.getEmployees()
    const target = list.find((e) => e.id === id)
    const remaining = list.filter((e) => e.id !== id).map((e, i) => ({ ...e, serialNo: i + 1 }))
    await writeStoreAndWait(STORAGE_KEYS.EMPLOYEES, remaining)
    if (target) {
      this.removeLinkedPayrollRows(target)
    }
    this.notifyDataChanged()
  }

  // Sheet 1 master → every sheet that already has the same person
  syncEmployeeProfileUpdate(emp: EmployeeProfile, month?: string): void {
    this.syncMasterRoster(
      this.getEmployees().map((row) => (row.id === emp.id ? emp : row)),
      month || this.getActiveSalariedMonth()
    )
  }

  syncMasterRoster(roster?: EmployeeProfile[], month?: string): void {
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
  }

  private removeLinkedPayrollRows(emp: EmployeeProfile): void {
    const unlink = (name?: string, designation?: string, employeeId?: string) =>
      Boolean(findLinkedEmployee([emp], name, designation, employeeId))

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
  }

  private rowMatchesPerson(
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

  // Cross-table synchronization: Advance ➔ Staff / Contract / Contractor Tables
  syncAdvanceToSalaries(employeeNameOrId: string, month: string = '2026-08', newAmount: number): void {
    const roster = this.getEmployees()

    const staffList = this.getStaffSalaries(month)
    let staffUpdated = false
    const updatedStaff = staffList.map((st) => {
      if (this.rowMatchesPerson(employeeNameOrId, st.employeeName, st.designation, st.employeeId, roster)) {
        staffUpdated = true
        return this.calculateStaffSalaryRow({
          ...st,
          lessAdvance: newAmount,
        })
      }
      return st
    })
    if (staffUpdated) this.saveStaffSalaries(updatedStaff, false)

    const contractList = this.getContractSalaries(month)
    let contractUpdated = false
    const updatedContract = contractList.map((ct) => {
      if (this.rowMatchesPerson(employeeNameOrId, ct.employeeName, ct.designation, ct.employeeId, roster)) {
        contractUpdated = true
        return this.calculateContractSalaryRow({
          ...ct,
          advanceDeduction: newAmount,
        })
      }
      return ct
    })
    if (contractUpdated) this.saveContractSalaries(updatedContract, false)

    const contractors = this.readStore(STORAGE_KEYS.CONTRACTORS, INITIAL_CONTRACTORS)
    let contractorUpdated = false
    const updatedContractors = contractors.map((c) => {
      if (sheetMonthKey(c.month) !== sheetMonthKey(month)) return c
      if (this.rowMatchesPerson(employeeNameOrId, c.name, c.contractType, c.employeeId, roster)) {
        contractorUpdated = true
        return this.calculateContractorPaymentRow({
          ...c,
          lessAdvance: newAmount,
        })
      }
      return c
    })
    if (contractorUpdated) this.saveContractorsPayments(updatedContractors, false)

    this.notifyDataChanged(month)
  }

  // Cross-table synchronization: Efficiency ➔ Contract Salaries / Weaver Wages
  syncEfficiencyToSalaries(
    name: string,
    month: string = '2026-08',
    amount: number,
    broadcast: boolean = true
  ): void {
    const roster = this.getEmployees()

    const allContract = this.readStore(STORAGE_KEYS.CONTRACT, INITIAL_CONTRACT_SALARIES)
    const contractList = allContract.filter((ct) => (ct.month || '2026-08') === month)
    let contractUpdated = false
    const updatedContract = contractList.map((ct) => {
      if (this.rowMatchesPerson(name, ct.employeeName, ct.designation, ct.employeeId, roster)) {
        contractUpdated = true
        return this.calculateContractSalaryRow({
          ...ct,
          efficiencyAmount: amount,
        })
      }
      return ct
    })
    if (contractUpdated) {
      const others = allContract.filter((ct) => (ct.month || '2026-08') !== month)
      this.saveContractSalaries([...others, ...updatedContract], false)
    }

    const weavers = this.readStore(STORAGE_KEYS.WEAVERS, INITIAL_WEAVERS_WAGES)
    let weaverUpdated = false
    const updatedWeavers = weavers.map((w) => {
      if ((w.month || '2026-08') !== month) return w
      if (this.rowMatchesPerson(name, w.employeeName, w.designation, w.employeeId, roster)) {
        weaverUpdated = true
        return this.calculateWeaverWageRow({
          ...w,
          efficiencyAmount: amount,
        })
      }
      return w
    })
    if (weaverUpdated) this.saveWeaversWages(updatedWeavers, false)

    if (broadcast) this.notifyDataChanged(month)
  }

  // ==========================================
  // ADVANCES (WITH AUTOMATIC CASCADING SYNC)
  // ==========================================

  getAdvances(month: string = '2026-08', fortnight?: string): AdvanceRecord[] {
    const list = this.readStore(STORAGE_KEYS.ADVANCES, INITIAL_ADVANCES)
    const { list: deduped, removed } = dedupeRowsByKey(list, advancePersonMonthKey)
    if (removed > 0 && this.canWrite()) {
      writeStore(STORAGE_KEYS.ADVANCES, this.renumberByMonth(deduped))
    }
    let filtered = deduped.filter((a) => sheetMonthKey(a.month) === sheetMonthKey(month))
    if (fortnight && fortnight !== 'all') {
      filtered = filtered.filter((a) => (a.fortnight || '1-15') === fortnight)
    }
    return this.filterRowsForMonth(filtered, month, 'employeeName')
  }

  saveAdvances(list: AdvanceRecord[], triggerCascade: boolean = true, month?: string, fortnight?: string): void {
    if (this.canWrite()) {
      try {
        let masterList = this.readStore(STORAGE_KEYS.ADVANCES, INITIAL_ADVANCES)
        const incoming = dedupeRowsByKey(list, advancePersonMonthKey).list

        if (month) {
          masterList = masterList.filter((a) => {
            if (sheetMonthKey(a.month) !== sheetMonthKey(month)) return true
            if (fortnight && fortnight !== 'all' && (a.fortnight || '1-15') !== fortnight) return true
            return false
          })
          masterList = [...masterList, ...incoming]
        } else {
          masterList = incoming
        }

        const cleaned = dedupeRowsByKey(masterList, advancePersonMonthKey).list
        writeStore(STORAGE_KEYS.ADVANCES, this.renumberByMonth(cleaned))
      } catch (err) {
        console.error(err)
        writeStore(STORAGE_KEYS.ADVANCES, list)
      }

      if (triggerCascade) {
        this.syncAllAdvanceTotals(month || list[0]?.month || '2026-08')
      } else {
        this.notifyDataChanged(month)
      }
    }
  }

  private mergeMonthOrFortnightRows<T extends { month?: string; fortnight?: string }>(
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

  syncAllAdvanceTotals(month: string = '2026-08'): void {
    const advances = this.readStore(STORAGE_KEYS.ADVANCES, INITIAL_ADVANCES).filter(
      (adv) => (adv.month || '2026-08') === month
    )
    const roster = this.getEmployees()
    const totalFor = (name?: string, designation?: string, employeeId?: string) =>
      advances
        .filter((adv) =>
          this.rowMatchesPerson(
            employeeId || name || '',
            adv.employeeName,
            adv.designation,
            adv.employeeId,
            roster
          )
        )
        .reduce((sum, adv) => sum + (Number(adv.amount) || 0), 0)

    const staffList = this.getStaffSalaries(month)
    this.saveStaffSalaries(
      staffList.map((st) =>
        this.calculateStaffSalaryRow({
          ...st,
          lessAdvance: totalFor(st.employeeName, st.designation, st.employeeId),
        })
      ),
      false
    )

    const contractList = this.getContractSalaries(month)
    this.saveContractSalaries(
      contractList.map((ct) =>
        this.calculateContractSalaryRow({
          ...ct,
          advanceDeduction: totalFor(ct.employeeName, ct.designation, ct.employeeId),
        })
      ),
      false
    )

    const contractors = this.readStore(STORAGE_KEYS.CONTRACTORS, INITIAL_CONTRACTORS)
    this.saveContractorsPayments(
      contractors.map((c) =>
        (c.month || '2026-08') === month
          ? this.calculateContractorPaymentRow({
              ...c,
              lessAdvance: totalFor(c.name, c.contractType, c.employeeId),
            })
          : c
      ),
      false
    )

    this.notifyDataChanged(month)
  }

  // ==========================================
  // STAFF SALARIES
  // ==========================================

  getStaffSalaries(month: string = '2026-08'): StaffSalaryRecord[] {
    const list = this.readStore(STORAGE_KEYS.STAFF, INITIAL_STAFF_SALARIES)
    return this.filterRowsForMonth(
      list.filter((s) => s.month === month),
      month,
      'employeeName'
    )
  }

  saveStaffSalaries(list: StaffSalaryRecord[], broadcast: boolean = true): void {
    if (this.canWrite()) {
      const existing = this.readStore(STORAGE_KEYS.STAFF, INITIAL_STAFF_SALARIES)
      const incomingMonths = new Set(list.map((r) => r.month).filter(Boolean))
      const kept = existing.filter(
        (r) => !list.some((n) => n.id === r.id) && !(r.month && incomingMonths.has(r.month))
      )
      writeStore(STORAGE_KEYS.STAFF, [...kept, ...list])
      if (broadcast) this.notifyDataChanged()
    }
  }

  // ==========================================
  // CONTRACT SALARIES
  // ==========================================

  getContractSalaries(month: string = '2026-08'): ContractSalaryRecord[] {
    const list = this.readStore(STORAGE_KEYS.CONTRACT, INITIAL_CONTRACT_SALARIES)
    return this.filterRowsForMonth(
      list.filter((c) => c.month === month),
      month,
      'employeeName'
    )
  }

  saveContractSalaries(monthOrList: string | ContractSalaryRecord[], listOrBroadcast?: ContractSalaryRecord[] | boolean, broadcast: boolean = true): void {
    const data = Array.isArray(monthOrList) ? monthOrList : (Array.isArray(listOrBroadcast) ? listOrBroadcast : [])
    const shouldBroadcast = typeof listOrBroadcast === 'boolean' ? listOrBroadcast : broadcast
    if (this.canWrite()) {
      const existing = this.readStore(STORAGE_KEYS.CONTRACT, INITIAL_CONTRACT_SALARIES)
      const incomingMonths = new Set(data.map((r) => r.month).filter(Boolean))
      const kept = existing.filter(
        (r) => !data.some((n) => n.id === r.id) && !(r.month && incomingMonths.has(r.month))
      )
      writeStore(STORAGE_KEYS.CONTRACT, [...kept, ...data])
      if (shouldBroadcast) {
        this.syncContractBasicsToEfficiency(data)
        this.notifyDataChanged()
      }
    }
  }

  private syncContractBasicsToEfficiency(contractList: ContractSalaryRecord[]): void {
    if (contractList.length === 0) return
    const activeMonth = this.getActiveSalariedMonth()
    const activeRows = contractList.filter((ct) => (ct.month || activeMonth) === activeMonth)
    if (activeRows.length === 0) return
    const efficiency = this.getEfficiencyIncentives(activeMonth)
    let changed = false
    const updated = efficiency.map((eff) => {
      const contractRow = activeRows.find(
        (ct) =>
          (eff.employeeId && ct.employeeId === eff.employeeId) ||
          namesMatch(ct.employeeName, eff.name)
      )
      if (!contractRow) return eff
      const next = this.calculateEfficiencyRow({
        ...eff,
        employeeId: contractRow.employeeId || eff.employeeId,
        salaryEarned: contractRow.basicSalary,
      })
      if (next.salaryEarned === eff.salaryEarned && next.amount === eff.amount) return eff
      changed = true
      return next
    })
    if (changed) this.saveEfficiencyIncentives(updated, true)
  }

  // ==========================================
  // EFFICIENCY INCENTIVES
  // ==========================================

  getEfficiencyIncentives(month: string = '2026-08'): EfficiencyIncentiveRecord[] {
    const list = this.readStore(STORAGE_KEYS.EFFICIENCY, INITIAL_EFFICIENCY_INCENTIVES)
    return this.filterRowsForMonth(
      list.filter((e) => e.month === month),
      month,
      'name'
    )
  }

  saveEfficiencyIncentives(list: EfficiencyIncentiveRecord[], triggerCascade: boolean = true): void {
    if (!this.canWrite()) return
    const existing = this.readStore(STORAGE_KEYS.EFFICIENCY, INITIAL_EFFICIENCY_INCENTIVES)
    const incomingMonths = new Set(list.map((r) => r.month).filter(Boolean))
    const kept = existing.filter(
      (r) => !list.some((n) => n.id === r.id) && !(r.month && incomingMonths.has(r.month))
    )
    writeStore(STORAGE_KEYS.EFFICIENCY, [...kept, ...list])
    if (triggerCascade) {
      list.forEach((eff) => {
        this.syncEfficiencyToSalaries(eff.name, eff.month || '2026-08', eff.amount || 0, false)
      })
      this.notifyDataChanged()
    }
  }

  // ==========================================
  // WEAVERS WAGES
  // ==========================================

  getWeaversWages(month: string = '2026-08', fortnight?: '1-15' | '16-31'): WeaverWageRecord[] {
    const list = this.readStore(STORAGE_KEYS.WEAVERS, INITIAL_WEAVERS_WAGES)
    return this.filterRowsForMonth(
      list.filter((w) => w.month === month && (!fortnight || w.fortnight === fortnight)),
      month,
      'employeeName'
    )
  }

  saveWeaversWages(
    monthOrList: string | WeaverWageRecord[],
    fortnightOrList?: string | WeaverWageRecord[] | boolean,
    listOrBroadcast?: WeaverWageRecord[] | boolean,
    broadcast: boolean = true
  ): void {
    if (!this.canWrite()) return

    let next: WeaverWageRecord[] = []
    let shouldBroadcast = broadcast

    if (Array.isArray(monthOrList)) {
      next = monthOrList
      shouldBroadcast = typeof fortnightOrList === 'boolean' ? fortnightOrList : true
    } else if (typeof fortnightOrList === 'string' && Array.isArray(listOrBroadcast)) {
      next = this.mergeMonthOrFortnightRows(
        this.readStore(STORAGE_KEYS.WEAVERS, INITIAL_WEAVERS_WAGES),
        listOrBroadcast,
        monthOrList,
        fortnightOrList
      )
    } else if (Array.isArray(fortnightOrList)) {
      next = this.mergeMonthOrFortnightRows(
        this.readStore(STORAGE_KEYS.WEAVERS, INITIAL_WEAVERS_WAGES),
        fortnightOrList,
        monthOrList
      )
      shouldBroadcast = typeof listOrBroadcast === 'boolean' ? listOrBroadcast : broadcast
    }

    writeStore(STORAGE_KEYS.WEAVERS, next)
    if (shouldBroadcast) this.notifyDataChanged()
  }

  // ==========================================
  // HELPERS WAGES
  // ==========================================

  getHelpersWages(month: string = '2026-08', fortnight?: '1-15' | '16-31'): HelperWageRecord[] {
    const list = this.readStore(STORAGE_KEYS.HELPERS, INITIAL_HELPERS_WAGES)
    return this.filterRowsForMonth(
      list.filter((h) => h.month === month && (!fortnight || h.fortnight === fortnight)),
      month,
      'employeeName'
    )
  }

  saveHelpersWages(
    monthOrList: string | HelperWageRecord[],
    fortnightOrList?: string | HelperWageRecord[] | boolean,
    listOrBroadcast?: HelperWageRecord[] | boolean,
    broadcast: boolean = true
  ): void {
    if (!this.canWrite()) return

    let next: HelperWageRecord[] = []
    let shouldBroadcast = broadcast

    if (Array.isArray(monthOrList)) {
      next = monthOrList
      shouldBroadcast = typeof fortnightOrList === 'boolean' ? fortnightOrList : true
    } else if (typeof fortnightOrList === 'string' && Array.isArray(listOrBroadcast)) {
      next = this.mergeMonthOrFortnightRows(
        this.readStore(STORAGE_KEYS.HELPERS, INITIAL_HELPERS_WAGES),
        listOrBroadcast,
        monthOrList,
        fortnightOrList
      )
    } else if (Array.isArray(fortnightOrList)) {
      next = this.mergeMonthOrFortnightRows(
        this.readStore(STORAGE_KEYS.HELPERS, INITIAL_HELPERS_WAGES),
        fortnightOrList,
        monthOrList
      )
      shouldBroadcast = typeof listOrBroadcast === 'boolean' ? listOrBroadcast : broadcast
    }

    writeStore(STORAGE_KEYS.HELPERS, next)
    if (shouldBroadcast) this.notifyDataChanged()
  }

  // ==========================================
  // CONTRACTORS PAYMENTS
  // ==========================================

  getContractorsPayments(month: string = '2026-08', fortnight?: '1-15' | '16-31'): ContractorPaymentRecord[] {
    const list = this.readStore(STORAGE_KEYS.CONTRACTORS, INITIAL_CONTRACTORS)
    return this.filterRowsForMonth(
      list.filter((c) => c.month === month && (!fortnight || c.fortnight === fortnight)),
      month,
      'name'
    )
  }

  saveContractorsPayments(
    monthOrList: string | ContractorPaymentRecord[],
    fortnightOrList?: string | ContractorPaymentRecord[] | boolean,
    listOrBroadcast?: ContractorPaymentRecord[] | boolean,
    broadcast: boolean = true
  ): void {
    if (!this.canWrite()) return

    let next: ContractorPaymentRecord[] = []
    let shouldBroadcast = broadcast

    if (Array.isArray(monthOrList)) {
      next = monthOrList
      shouldBroadcast = typeof fortnightOrList === 'boolean' ? fortnightOrList : true
    } else if (typeof fortnightOrList === 'string' && Array.isArray(listOrBroadcast)) {
      next = this.mergeMonthOrFortnightRows(
        this.readStore(STORAGE_KEYS.CONTRACTORS, INITIAL_CONTRACTORS),
        listOrBroadcast,
        monthOrList,
        fortnightOrList
      )
    } else if (Array.isArray(fortnightOrList)) {
      next = this.mergeMonthOrFortnightRows(
        this.readStore(STORAGE_KEYS.CONTRACTORS, INITIAL_CONTRACTORS),
        fortnightOrList,
        monthOrList
      )
      shouldBroadcast = typeof listOrBroadcast === 'boolean' ? listOrBroadcast : broadcast
    }

    writeStore(STORAGE_KEYS.CONTRACTORS, next)
    if (shouldBroadcast) this.notifyDataChanged()
  }

  // ==========================================
  // DYNAMIC SYNOPSIS & ROLLUPS (EXACT EXCEL LIVE MATH)
  // ==========================================

  /** Petty Cash Transfer Inflow — editable by accountant; defaults 86,930 / 86,570. */
  getPettyCashInflow(month: string, fortnight: '1-15' | '16-31'): number {
    const key = pettyCashInflowMetaKey(month, fortnight)
    const raw = readHrMetaRaw()
    const override = raw.pettyCashInflowOverrides?.[key]
    if (typeof override === 'number' && Number.isFinite(override)) return Math.round(override)
    return defaultPettyCashInflow(fortnight)
  }

  setPettyCashInflow(month: string, fortnight: '1-15' | '16-31', amount: number): void {
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
  }

  async setPettyCashInflowAsync(
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
    // Write memory + mirror first so refresh keeps the value even if PUT races.
    writeLocalMirror(STORAGE_KEYS.HR_META, meta)
    try {
      memoryStore.set(STORAGE_KEYS.HR_META, JSON.stringify(meta))
    } catch {
      // ignore
    }
    const ok = await writeStoreAndWait(STORAGE_KEYS.HR_META, meta)
    this.notifyDataChanged(month)
    return ok
  }

  getFortnightSynopsis(month: string = '2026-08', fortnight: '1-15' | '16-31'): FortnightSynopsis {
    if (fortnight === '1-15') {
      const advances = this.getAdvances(month)
      const totalAdvance = advances.reduce((s, a) => s + (a.amount || 0), 0)

      const weavers1 = this.getWeaversWages(month, '1-15')
      const totalWeaverWages = weavers1.reduce((s, w) => s + (w.grossAmount || 0), 0)
      const totalWeaverHol = weavers1.reduce((s, w) => s + (w.holidayAmount || 0), 0)
      const totalWeaverEff = weavers1.reduce((s, w) => s + (w.efficiencyAmount || 0), 0)

      const helpers1 = this.getHelpersWages(month, '1-15')
      const totalHelperWages = helpers1.reduce((s, h) => s + (h.netAmount || 0), 0)

      const contractors1 = this.getContractorsPayments(month, '1-15')
      const totalContractor1 = contractors1.reduce((s, c) => s + (c.netPayment || 0), 0)

      const totalPayrollCash = totalAdvance + totalWeaverWages + totalWeaverHol + totalWeaverEff + totalHelperWages + totalContractor1
      const pettyCashInflow = this.getPettyCashInflow(month, '1-15')
      const totalBankCheque = totalPayrollCash + pettyCashInflow

      return {
        fortnight: '1-15',
        month,
        title: `Salary Expense 1 to 15 (${month}) - 1st Fortnight Disbursal Voucher`,
        items: [
          { serialNo: 1, description: 'ADVANCE (Peshgi)', amount: totalAdvance },
          { serialNo: 2, description: 'WEAVERS WAGES (Basic + Extra Looms + Allowance)', amount: totalWeaverWages },
          { serialNo: 3, description: 'WEAVERS OVERTIME / HOLIDAYS', amount: totalWeaverHol },
          { serialNo: 4, description: 'WEAVER EFFICIENCY BONUS', amount: totalWeaverEff },
          { serialNo: 5, description: `HELPERS WAGES (${helpers1.length} Helpers)`, amount: totalHelperWages },
          { serialNo: 6, description: `CONTRACTORS PAYMENT (${contractors1.length} Contractors)`, amount: totalContractor1 },
        ],
        totalPayrollCash,
        pettyCashInflow,
        totalBankCheque,
      }
    }

    // Fortnight 2 (16-31 & Month End)
    const staff = this.getStaffSalaries(month)
    const totalStaffSynopsis = staff.reduce((s, st) => s + (st.synopsisAmount || 0), 0)
    const totalStaffCheque = staff.reduce((s, st) => s + (st.chequeAmount || 0), 0)
    const totalStaffAdvance = staff.reduce((s, st) => s + (st.lessAdvance || 0), 0)

    const contract = this.getContractSalaries(month)
    const totalContractBasic = contract.reduce((s, c) => s + (c.basicSalary || 0), 0)
    const totalContractAdv = contract.reduce((s, c) => s + (c.advanceDeduction || 0), 0)
    const netContractBasic = Math.max(0, totalContractBasic - totalContractAdv)
    const totalContractOT = contract.reduce((s, c) => s + (c.otAmount || 0), 0)
    const totalContractEff = contract.reduce((s, c) => s + (c.efficiencyAmount || 0), 0)
    const totalTicket = contract.reduce((s, c) => s + (c.ticketCharges || 0), 0)

    const weavers2 = this.getWeaversWages(month, '16-31')
    const totalWeaverWages2 = weavers2.reduce((s, w) => s + (w.grossAmount || 0), 0)
    const totalWeaverHol2 = weavers2.reduce((s, w) => s + (w.holidayAmount || 0), 0)
    const totalWeaverEff2 = weavers2.reduce((s, w) => s + (w.efficiencyAmount || 0), 0)

    const helpers2 = this.getHelpersWages(month, '16-31')
    const totalHelperWages2 = helpers2.reduce((s, h) => s + (h.netAmount || 0), 0)

    const contractors2 = this.getContractorsPayments(month, '16-31')
    const totalContractor2 = contractors2.reduce((s, c) => s + (c.netPayment || 0), 0)

    const totalPayrollCash = Math.round(
      (totalStaffSynopsis - totalStaffCheque) +
      netContractBasic +
      totalContractOT +
      totalContractEff +
      totalWeaverWages2 +
      totalWeaverHol2 +
      totalWeaverEff2 +
      totalHelperWages2 +
      totalContractor2 -
      totalTicket
    )
    const pettyCashInflow = this.getPettyCashInflow(month, '16-31')
    const totalBankCheque = totalPayrollCash + pettyCashInflow

    return {
      fortnight: '16-31',
      month,
      title: `Salary Expense 16 to 31 (${month}) - 2nd Fortnight & Settlement`,
      items: [
        { serialNo: 1, description: 'Staff Salaries & Overtime (Net Cash)', amount: Math.round(totalStaffSynopsis - totalStaffCheque), chequeAmount: totalStaffCheque, advance: totalStaffAdvance },
        { serialNo: 2, description: 'Contract Employees Salaries (Net Basic)', amount: Math.round(netContractBasic), advance: totalContractAdv },
        { serialNo: 3, description: 'Contract Employees Overtime', amount: Math.round(totalContractOT) },
        { serialNo: 4, description: 'Contract Employees Efficiency', amount: Math.round(totalContractEff) },
        { serialNo: 5, description: 'Weavers Wages (2nd Half)', amount: totalWeaverWages2 },
        { serialNo: 6, description: 'Weavers Overtime / Holidays (2nd Half)', amount: totalWeaverHol2 },
        { serialNo: 7, description: 'Weaver Efficiency Bonus (2nd Half)', amount: totalWeaverEff2 },
        { serialNo: 8, description: `Helpers Wages (${helpers2.length} Helpers)`, amount: totalHelperWages2 },
        { serialNo: 9, description: `Contractors Bill Payments (${contractors2.length} Contractors)`, amount: totalContractor2 },
        { serialNo: 10, description: 'Ticket Charges Deductions', amount: -totalTicket },
      ],
      totalPayrollCash,
      pettyCashInflow,
      totalBankCheque,
    }
  }

  getMonthlyGrandSummary(month: string = '2026-08'): MonthlyGrandSalarySynopsis {
    const f1 = this.getFortnightSynopsis(month, '1-15')
    const f2 = this.getFortnightSynopsis(month, '16-31')

    const staff = this.getStaffSalaries(month)
    const contract = this.getContractSalaries(month)
    const weavers1 = this.getWeaversWages(month, '1-15')
    const weavers2 = this.getWeaversWages(month, '16-31')
    const helpers1 = this.getHelpersWages(month, '1-15')
    const helpers2 = this.getHelpersWages(month, '16-31')
    const contractors1 = this.getContractorsPayments(month, '1-15')
    const contractors2 = this.getContractorsPayments(month, '16-31')

    const totalStaffGross = staff.reduce((s, st) => s + (st.grossAmount || 0), 0)
    const totalStaffCheque = staff.reduce((s, st) => s + (st.chequeAmount || 0), 0)
    const totalStaffAdv = staff.reduce((s, st) => s + (st.lessAdvance || 0), 0)
    const totalStaffCash = staff.reduce((s, st) => s + (st.netCashAmount || 0), 0)

    const totalContractBasic = contract.reduce((s, c) => s + (c.basicSalary || 0), 0)
    const totalContractAdv = contract.reduce((s, c) => s + (c.advanceDeduction || 0), 0)
    const totalContractOT = contract.reduce((s, c) => s + (c.otAmount || 0), 0)
    const totalContractEff = contract.reduce((s, c) => s + (c.efficiencyAmount || 0), 0)

    const totalWeaverWages = weavers1.reduce((s, w) => s + (w.grossAmount || 0), 0) + weavers2.reduce((s, w) => s + (w.grossAmount || 0), 0)
    const totalWeaverHol = weavers1.reduce((s, w) => s + (w.holidayAmount || 0), 0) + weavers2.reduce((s, w) => s + (w.holidayAmount || 0), 0)
    const totalWeaverEff = weavers1.reduce((s, w) => s + (w.efficiencyAmount || 0), 0) + weavers2.reduce((s, w) => s + (w.efficiencyAmount || 0), 0)

    const totalHelperWages = helpers1.reduce((s, h) => s + (h.netAmount || 0), 0) + helpers2.reduce((s, h) => s + (h.netAmount || 0), 0)
    const totalContractorPayments = contractors1.reduce((s, c) => s + (c.netPayment || 0), 0) + contractors2.reduce((s, c) => s + (c.netPayment || 0), 0)

    return {
      month,
      monthTitle: `Grand Monthly Salary & Wages Synopsis (${month})`,
      fortnight1Total: f1.totalPayrollCash,
      fortnight1PettyCash: f1.pettyCashInflow,
      fortnight1Cheque: f1.totalBankCheque,
      fortnight2Total: f2.totalPayrollCash,
      fortnight2PettyCash: f2.pettyCashInflow,
      fortnight2Cheque: f2.totalBankCheque,
      monthlyTotalSalary: f1.totalBankCheque + f2.totalBankCheque,
      grandSynopsisItems: [
        { serialNo: 1, description: 'Staff Salaries & Overtime', amount: Math.round(totalStaffCash), chequeAmount: totalStaffCheque, advance: totalStaffAdv, totalGrossHead: totalStaffGross },
        { serialNo: 2, description: 'Contract Employees Salaries', amount: Math.round(Math.max(0, totalContractBasic - totalContractAdv)), chequeAmount: 0, advance: totalContractAdv, totalGrossHead: totalContractBasic },
        { serialNo: 3, description: 'Contract Employee Overtime', amount: Math.round(totalContractOT), chequeAmount: 0, advance: 0, totalGrossHead: totalContractOT },
        { serialNo: 4, description: 'Contract Employee Efficiency', amount: Math.round(totalContractEff), chequeAmount: 0, advance: 0, totalGrossHead: totalContractEff },
        { serialNo: 5, description: 'Weavers Wages (Total Fortnight 1 + 2)', amount: Math.round(totalWeaverWages), chequeAmount: 0, advance: 0, totalGrossHead: totalWeaverWages },
        { serialNo: 6, description: 'Weavers Holy Days / OT Amount', amount: Math.round(totalWeaverHol), chequeAmount: 0, advance: 0, totalGrossHead: totalWeaverHol },
        { serialNo: 7, description: 'Weaver Efficiency Bonus', amount: Math.round(totalWeaverEff), chequeAmount: 0, advance: 0, totalGrossHead: totalWeaverEff },
        { serialNo: 8, description: 'Helpers Wages (Total Fortnight 1 + 2)', amount: Math.round(totalHelperWages), chequeAmount: 0, advance: 0, totalGrossHead: totalHelperWages },
        { serialNo: 9, description: 'Contractors Bill Payments', amount: Math.round(totalContractorPayments), chequeAmount: 0, advance: 0, totalGrossHead: totalContractorPayments },
      ],
    }
  }

  /** Months that have Helper rows (independent of Weaver active period). */
  listHelpersMonths(): string[] {
    const months = new Set<string>(this.listPayrollMonths())
    for (const row of this.readStore(STORAGE_KEYS.HELPERS, INITIAL_HELPERS_WAGES)) {
      if (row.month) months.add(row.month)
    }
    if (isPayrollClient()) {
      const mirrored = readLocalMirror(STORAGE_KEYS.HELPERS)
      if (Array.isArray(mirrored)) {
        for (const row of mirrored as { month?: string }[]) {
          if (row.month) months.add(row.month)
        }
      }
    }
    return [...months].sort()
  }

  /** Months that have Contractor rows (independent of Weaver active period). */
  listContractorsMonths(): string[] {
    const months = new Set<string>(this.listPayrollMonths())
    for (const row of this.readStore(STORAGE_KEYS.CONTRACTORS, INITIAL_CONTRACTORS)) {
      if (row.month) months.add(row.month)
    }
    if (isPayrollClient()) {
      const mirrored = readLocalMirror(STORAGE_KEYS.CONTRACTORS)
      if (Array.isArray(mirrored)) {
        for (const row of mirrored as { month?: string }[]) {
          if (row.month) months.add(row.month)
        }
      }
    }
    return [...months].sort()
  }

  // Petty Cash Register (Sheets 13 & 20) — own month list, not Weaver-driven
  listPettyCashMonths(): string[] {
    const months = new Set<string>(this.listPayrollMonths())
    for (const row of this.readStore(STORAGE_KEYS.PETTY_CASH, INITIAL_PETTY_CASH)) {
      if (row.month) months.add(row.month)
    }
    if (isPayrollClient()) {
      const mirrored = readLocalMirror(STORAGE_KEYS.PETTY_CASH)
      if (Array.isArray(mirrored)) {
        for (const row of mirrored as { month?: string }[]) {
          if (row.month) months.add(row.month)
        }
      }
    }
    return [...months].sort()
  }

  getPettyCashEntries(month: string = '2026-08', fortnight: '1-15' | '16-31'): PettyCashRecord[] {
    const list = this.readStore(STORAGE_KEYS.PETTY_CASH, INITIAL_PETTY_CASH)
    return list.filter(
      (e) => (e.month || '2026-08') === month && e.fortnight === fortnight
    )
  }

  savePettyCashEntries(
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
  }

  /**
   * Reset only one fortnight sheet (helpers/contractors/weavers/petty) for the open period.
   * Does NOT wipe the whole payroll module or HR meta / synopsis inflow overrides.
   */
  resetFortnightSheetToSeed(
    sheet: 'weavers' | 'helpers' | 'contractors' | 'petty-cash',
    month: string,
    fortnight: '1-15' | '16-31'
  ): void {
    if (!this.isClient()) return
    const m = (month || '').trim()
    if (!/^\d{4}-\d{2}$/.test(m)) return
    if (fortnight !== '1-15' && fortnight !== '16-31') return

    const map = {
      weavers: {
        key: STORAGE_KEYS.WEAVERS,
        seed: INITIAL_WEAVERS_WAGES as Array<{ month?: string; fortnight?: string }>,
      },
      helpers: {
        key: STORAGE_KEYS.HELPERS,
        seed: INITIAL_HELPERS_WAGES as Array<{ month?: string; fortnight?: string }>,
      },
      contractors: {
        key: STORAGE_KEYS.CONTRACTORS,
        seed: INITIAL_CONTRACTORS as Array<{ month?: string; fortnight?: string }>,
      },
      'petty-cash': {
        key: STORAGE_KEYS.PETTY_CASH,
        seed: INITIAL_PETTY_CASH as Array<{ month?: string; fortnight?: string }>,
      },
    } as const
    const { key, seed } = map[sheet]
    const existing = this.readStore(key, seed)
    const periodSeed = seed
      .filter((r) => (r.month || '') === m && (r.fortnight || '1-15') === fortnight)
      .map((r) => ({ ...r }))
    const next = this.mergeMonthOrFortnightRows(existing, periodSeed, m, fortnight)
    writeStore(key, next)
    this.notifyDataChanged(m)
  }

  /** Reset only one salaried month sheet (contract / efficiency). */
  resetMonthSheetToSeed(sheet: 'contract' | 'efficiency', month: string): void {
    if (!this.isClient()) return
    const m = (month || '').trim()
    if (!/^\d{4}-\d{2}$/.test(m)) return
    const map = {
      contract: {
        key: STORAGE_KEYS.CONTRACT,
        seed: INITIAL_CONTRACT_SALARIES as Array<{ month?: string }>,
      },
      efficiency: {
        key: STORAGE_KEYS.EFFICIENCY,
        seed: INITIAL_EFFICIENCY_INCENTIVES as Array<{ month?: string }>,
      },
    } as const
    const { key, seed } = map[sheet]
    const existing = this.readStore(key, seed)
    const monthSeed = seed.filter((r) => (r.month || '') === m).map((r) => ({ ...r }))
    const next = this.mergeMonthOrFortnightRows(existing, monthSeed, m)
    writeStore(key, next)
    this.notifyDataChanged(m)
  }

  /** Nuclear: entire payroll → Excel seed. Prefer scoped reset methods instead. */
  resetAllToDefault(): void {
    this.resetToDefaults()
  }

  resetToDefaults(): void {
    if (!this.isClient()) return
    for (const key of Object.values(STORAGE_KEYS)) {
      memoryStore.delete(key)
      try {
        localStorage.removeItem(key)
      } catch {
        /* ignore */
      }
      try {
        localStorage.removeItem(localMirrorKey(key))
      } catch {
        /* ignore */
      }
    }
    const seed = getPayrollSeedStore()
    for (const [key, value] of Object.entries(seed)) {
      writeStore(key, value)
    }
    this.notifyDataChanged()
  }
}

const INITIAL_PETTY_CASH: PettyCashRecord[] = [
  // Fortnight 1 (1 to 15 Aug 2026) - Sheet 13
  { id: 'pc-1-1', serialNo: 1, date: '2026-08-01', description: 'Balance b/f', drAmount: null, crAmount: null, balance: 4714, fortnight: '1-15', month: '2026-08' },
  { id: 'pc-1-2', serialNo: 2, date: '2026-08-05', description: 'Cash Recceived for Petty Cash', drAmount: 80136, crAmount: null, balance: 84850, fortnight: '1-15', month: '2026-08' },
  { id: 'pc-1-3', serialNo: 3, date: '2026-08-05', description: 'Cash Recceived for Salary, Wages and Contractor Payment', drAmount: 1509864, crAmount: null, balance: 1594714, fortnight: '1-15', month: '2026-08' },
  { id: 'pc-1-4', serialNo: 4, date: '2026-08-05', description: 'Paid Salaries and Contracters amount', drAmount: null, crAmount: 1509864, balance: 84850, fortnight: '1-15', month: '2026-08' },
  { id: 'pc-1-5', serialNo: 5, date: '2026-08-02', description: 'Salvage & Weft Cutter For G-6300', drAmount: null, crAmount: 18000, balance: 66850, fortnight: '1-15', month: '2026-08' },
  { id: 'pc-1-6', serialNo: 6, date: '2026-08-03', description: 'Bearing 6207 5pcs, Toner Refilling, KDJ-4629 Petrol, Bykea', drAmount: null, crAmount: 8400, balance: 58450, fortnight: '1-15', month: '2026-08' },
  { id: 'pc-1-7', serialNo: 7, date: '2026-08-07', description: 'LY3 Relay 9pcs, LY4 Relay 6pcs, LY4 Base 6pcs', drAmount: null, crAmount: 17100, balance: 41350, fortnight: '1-15', month: '2026-08' },
  { id: 'pc-1-8', serialNo: 8, date: '2026-08-08', description: 'Acid 2 Can, Broom 10pcs, Surf 3kg, Belt 1100 H 2pcs', drAmount: null, crAmount: 13010, balance: 28340, fortnight: '1-15', month: '2026-08' },
  { id: 'pc-1-9', serialNo: 9, date: '2026-08-08', description: 'LN Bolt 4pcs, Breaker 16 To 22A 2pcs, Petrol KGA 6065', drAmount: null, crAmount: 6640, balance: 21700, fortnight: '1-15', month: '2026-08' },
  { id: 'pc-1-10', serialNo: 10, date: '2026-08-08', description: 'Bearing 6207 3pcs, 6304 3pcs, 6008 2pcs, Diamond File, Cutter Blade', drAmount: null, crAmount: 9920, balance: 11780, fortnight: '1-15', month: '2026-08' },
  { id: 'pc-1-11', serialNo: 11, date: '2026-08-12', description: 'PTCL Bill Paid', drAmount: null, crAmount: 8070, balance: 3710, fortnight: '1-15', month: '2026-08' },
  { id: 'pc-1-12', serialNo: 12, date: '2026-08-15', description: 'Chalk 24box, Register 3pcs, Bykea For Electronic Component', drAmount: null, crAmount: 2780, balance: 930, fortnight: '1-15', month: '2026-08' },

  // Fortnight 2 (16 to 31 Aug 2026) - Sheet 20
  { id: 'pc-2-0', serialNo: null, date: '2026-08-16', description: 'Balance b/f', drAmount: null, crAmount: null, balance: 930, fortnight: '16-31', month: '2026-08' },
  { id: 'pc-2-1', serialNo: 1, date: '2026-08-20', description: 'Cash Recceived for Petty Cash', drAmount: 86930, crAmount: null, balance: 87860, fortnight: '16-31', month: '2026-08' },
  { id: 'pc-2-2', serialNo: 2, date: '2026-08-20', description: 'Cash Recceived for Salary, Wages and Contractor Payment', drAmount: 983070, crAmount: null, balance: 1070930, fortnight: '16-31', month: '2026-08' },
  { id: 'pc-2-3', serialNo: 3, date: '2026-08-20', description: 'Paid Salaries and Contracters amount', drAmount: null, crAmount: 983070, balance: 87860, fortnight: '16-31', month: '2026-08' },
  { id: 'pc-2-4', serialNo: 4, date: '2026-08-16', description: 'Solar Panel Wash, Washing Chemical, Dry Mop (Cleaning 10-08-2026)', drAmount: null, crAmount: 16400, balance: 71460, fortnight: '16-31', month: '2026-08' },
  { id: 'pc-2-5', serialNo: 5, date: '2026-08-20', description: 'Grease Bucket 12kg, Petrol KGA-6065', drAmount: null, crAmount: 9000, balance: 62460, fortnight: '16-31', month: '2026-08' },
  { id: 'pc-2-6', serialNo: 6, date: '2026-08-21', description: 'Jeck Drive Plate Bush, Bykea For Electronic Component, Silicon Tube', drAmount: null, crAmount: 3790, balance: 58670, fortnight: '16-31', month: '2026-08' },
  { id: 'pc-2-7', serialNo: 7, date: '2026-08-24', description: 'Chain Gear 38 Teeth With Bolt', drAmount: null, crAmount: 4680, balance: 53990, fortnight: '16-31', month: '2026-08' },
  { id: 'pc-2-8', serialNo: 8, date: '2026-08-25', description: 'Leno Con Winding', drAmount: null, crAmount: 2500, balance: 51490, fortnight: '16-31', month: '2026-08' },
  { id: 'pc-2-9', serialNo: 9, date: '2026-08-27', description: '08BI 428 Chain 10ft, Ufone Blaze Pkg', drAmount: null, crAmount: 5650, balance: 45840, fortnight: '16-31', month: '2026-08' },
  { id: 'pc-2-10', serialNo: 10, date: '2026-08-27', description: 'Stationary Items, Marker, Ink, Ball pen, A4 Rim, Register, D/Book', drAmount: null, crAmount: 6455, balance: 39385, fortnight: '16-31', month: '2026-08' },
  { id: 'pc-2-11', serialNo: 11, date: '2026-08-29', description: 'Solar Panel Wash (Cleaning Date 25-08-2026)', drAmount: null, crAmount: 12000, balance: 27385, fortnight: '16-31', month: '2026-08' },
  { id: 'pc-2-12', serialNo: 12, date: '2026-08-29', description: 'Helper Injured (Bandage And Medicine)', drAmount: null, crAmount: 5700, balance: 21685, fortnight: '16-31', month: '2026-08' },
  { id: 'pc-2-13', serialNo: 13, date: '2026-08-31', description: 'Dobby Belt 1400-14M 55mm 1pcs, 1100H Belt 30mm 1pcs', drAmount: null, crAmount: 8200, balance: 13485, fortnight: '16-31', month: '2026-08' },
  { id: 'pc-2-14', serialNo: 14, date: '2026-08-31', description: 'Bearing 6304N 6pcs, Silicon Tube 5pcs', drAmount: null, crAmount: 4350, balance: 9135, fortnight: '16-31', month: '2026-08' },
  { id: 'pc-2-15', serialNo: 15, date: '2026-08-31', description: 'JeckQuard LCD Repaired, Ribbon Cable 3+1 10pcs', drAmount: null, crAmount: 4500, balance: 4635, fortnight: '16-31', month: '2026-08' },
  // --- September 2026 (From (09) Salary Sep.2026.xlsx) ---
  {"id":"pc-sep-1-1","serialNo":1,"date":"2026-09-01","description":"Balance b/f","drAmount":null,"crAmount":null,"balance":4635,"fortnight":"1-15","month":"2026-09"},
  {"id":"pc-sep-1-2","serialNo":2,"date":"2026-09-05","description":"Cash Recceived for Petty Cash","drAmount":86570,"crAmount":null,"balance":91205,"fortnight":"1-15","month":"2026-09"},
  {"id":"pc-sep-1-3","serialNo":3,"date":"2026-09-05","description":"Cash Recceived for Salary, Wages and Contractor Payment","drAmount":1473430,"crAmount":null,"balance":1564635,"fortnight":"1-15","month":"2026-09"},
  {"id":"pc-sep-1-4","serialNo":4,"date":"2026-09-05","description":"Paid Salaries and Contracters amount","drAmount":null,"crAmount":1473430,"balance":91205,"fortnight":"1-15","month":"2026-09"},
  {"id":"pc-sep-1-5","serialNo":5,"date":"2026-09-02","description":"Emery 5Ft,Loom Frame Rep,Jeck LCD Rep,Petrol KGA-6065","drAmount":null,"crAmount":3950,"balance":87255,"fortnight":"1-15","month":"2026-09"},
  {"id":"pc-sep-1-6","serialNo":6,"date":"2026-09-02","description":"Helper Usman Bandage Change","drAmount":null,"crAmount":2450,"balance":84805,"fortnight":"1-15","month":"2026-09"},
  {"id":"pc-sep-1-7","serialNo":7,"date":"2026-09-05","description":"Electronic Componant","drAmount":null,"crAmount":3045,"balance":81760,"fortnight":"1-15","month":"2026-09"},
  {"id":"pc-sep-1-8","serialNo":8,"date":"2026-09-09","description":"Oil Seal 14*24*7,Moti 4mm,LDR Oil For PU","drAmount":null,"crAmount":4900,"balance":76860,"fortnight":"1-15","month":"2026-09"},
  {"id":"pc-sep-1-9","serialNo":9,"date":"2026-09-11","description":"EWA Card For G-6200","drAmount":null,"crAmount":16000,"balance":60860,"fortnight":"1-15","month":"2026-09"},
  {"id":"pc-sep-1-10","serialNo":10,"date":"2026-09-12","description":"Solar Panel Cleaning","drAmount":null,"crAmount":12000,"balance":48860,"fortnight":"1-15","month":"2026-09"},
  {"id":"pc-sep-1-11","serialNo":11,"date":"2026-09-12","description":"Suzuki Rent For Frame,Jeck LCD Repaired","drAmount":null,"crAmount":3000,"balance":45860,"fortnight":"1-15","month":"2026-09"},
  {"id":"pc-sep-1-12","serialNo":12,"date":"2026-09-14","description":"LED Light 45W 5pcs,Jeck LCD Repaired,Petrol For Module Cleaning","drAmount":null,"crAmount":6000,"balance":39860,"fortnight":"1-15","month":"2026-09"},
  {"id":"pc-sep-1-13","serialNo":13,"date":"2026-09-14","description":"Acid 1 Can,Broom 8pcs,Surf 4Kg","drAmount":null,"crAmount":4700,"balance":35160,"fortnight":"1-15","month":"2026-09"},
  {"id":"pc-sep-1-14","serialNo":14,"date":"2026-09-15","description":"PTCL Bill Paid","drAmount":null,"crAmount":8070,"balance":27090,"fortnight":"1-15","month":"2026-09"},
  {"id":"pc-sep-1-15","serialNo":15,"date":"2026-09-15","description":"PU Let Off Repaired (L#26)","drAmount":null,"crAmount":7500,"balance":19590,"fortnight":"1-15","month":"2026-09"},
  {"id":"pc-sep-1-16","serialNo":16,"date":"2026-09-15","description":"G-6200 Opner Patti 20pcs, Motor Belt 2pcs","drAmount":null,"crAmount":9700,"balance":9890,"fortnight":"1-15","month":"2026-09"},
  {"id":"pc-sep-2-1","serialNo":null,"date":"2026-09-16","description":"Balance b/f","drAmount":null,"crAmount":null,"balance":9890,"fortnight":"16-31","month":"2026-09"},
  {"id":"pc-sep-2-2","serialNo":1,"date":"2026-09-20","description":"Cash Recceived for Petty Cash","drAmount":76916,"crAmount":null,"balance":86806,"fortnight":"16-31","month":"2026-09"},
  {"id":"pc-sep-2-3","serialNo":2,"date":"2026-09-20","description":"Cash Recceived for Salary, Wages and Contractor Payment","drAmount":993084,"crAmount":null,"balance":1079890,"fortnight":"16-31","month":"2026-09"},
  {"id":"pc-sep-2-4","serialNo":3,"date":"2026-09-20","description":"Paid Salaries and Contracters amount","drAmount":null,"crAmount":993084,"balance":86806,"fortnight":"16-31","month":"2026-09"},
  {"id":"pc-sep-2-5","serialNo":4,"date":"2026-09-17","description":"Petrol KGA-6065","drAmount":null,"crAmount":2000,"balance":84806,"fortnight":"16-31","month":"2026-09"},
  {"id":"pc-sep-2-6","serialNo":5,"date":"2026-09-19","description":"Leno Con Winding","drAmount":null,"crAmount":3000,"balance":81806,"fortnight":"16-31","month":"2026-09"},
  {"id":"pc-sep-2-7","serialNo":6,"date":"2026-09-23","description":"Moti 50pcs,Electric Board & Botton,Knotter 100pcs Box,Polish Paper 10pcs","drAmount":null,"crAmount":4000,"balance":77806,"fortnight":"16-31","month":"2026-09"},
  {"id":"pc-sep-2-8","serialNo":7,"date":"2026-09-23","description":"LN Bolt 10mm 3pcs,3mm 200pcs,LDR Oil 100 5 Litter","drAmount":null,"crAmount":5570,"balance":72236,"fortnight":"16-31","month":"2026-09"},
  {"id":"pc-sep-2-9","serialNo":8,"date":"2026-09-26","description":"Ufone Blaz Pkg,KGA-6065 Petrol,KDJ-4629 Tuning","drAmount":null,"crAmount":5000,"balance":67236,"fortnight":"16-31","month":"2026-09"},
  {"id":"pc-sep-2-10","serialNo":9,"date":"2026-09-26","description":"Belt 1100H 2pcs,Belt 1600H 1pcs","drAmount":null,"crAmount":10200,"balance":57036,"fortnight":"16-31","month":"2026-09"},
  {"id":"pc-sep-2-11","serialNo":10,"date":"2026-09-28","description":"TP Link Wifi Card For Admin Office System & Software Installation","drAmount":null,"crAmount":3600,"balance":53436,"fortnight":"16-31","month":"2026-09"},
  {"id":"pc-sep-2-12","serialNo":11,"date":"2026-09-29","description":"TP Link Router Archer C6 For Fiber Net & 5M Cat 6 Cable","drAmount":null,"crAmount":10250,"balance":43186,"fortnight":"16-31","month":"2026-09"},
  {"id":"pc-sep-2-13","serialNo":12,"date":"2026-09-30","description":"Bolt,Nut,Washer For Jeck , Goti 36'' For PU","drAmount":null,"crAmount":2090,"balance":41096,"fortnight":"16-31","month":"2026-09"},
  {"id":"pc-sep-2-14","serialNo":13,"date":"2026-09-30","description":"LED Light 20W 2pcs,LED Light 45W 6pcs,4M 40/76 Wire,Bed Switch 1pcs","drAmount":null,"crAmount":7510,"balance":33586,"fortnight":"16-31","month":"2026-09"}
]

/** Default bootstrap payload for empty `payroll_store` (server GET /api/payroll/store). */
export function getPayrollSeedStore(): Record<string, unknown> {
  return {
    [STORAGE_KEYS.EMPLOYEES]: INITIAL_EMPLOYEES,
    [STORAGE_KEYS.ADVANCES]: INITIAL_ADVANCES,
    [STORAGE_KEYS.STAFF]: INITIAL_STAFF_SALARIES,
    [STORAGE_KEYS.CONTRACT]: INITIAL_CONTRACT_SALARIES,
    [STORAGE_KEYS.EFFICIENCY]: INITIAL_EFFICIENCY_INCENTIVES,
    [STORAGE_KEYS.WEAVERS]: INITIAL_WEAVERS_WAGES,
    [STORAGE_KEYS.HELPERS]: INITIAL_HELPERS_WAGES,
    [STORAGE_KEYS.CONTRACTORS]: INITIAL_CONTRACTORS,
    [STORAGE_KEYS.PETTY_CASH]: INITIAL_PETTY_CASH,
    [STORAGE_KEYS.HR_META]: {},
  }
}

/**
 * Server-safe generate: load store → seed month → return patch keys for Postgres upsert.
 * Does not touch the browser memoryStore permanently.
 */
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
  hydrated = true
  allowServerSheetWrite = true

  try {
    const allStaff = payrollService['readStore'](STORAGE_KEYS.STAFF, INITIAL_STAFF_SALARIES) as StaffSalaryRecord[]
    const allContract = payrollService['readStore'](
      STORAGE_KEYS.CONTRACT,
      INITIAL_CONTRACT_SALARIES
    ) as ContractSalaryRecord[]

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
    const staffPeople = employees.filter((e) => {
      const cat = inferEmployeeCategory(e)
      return cat === 'Staff' || cat === 'Admin'
    })
    const contractPeople = employees.filter((e) => inferEmployeeCategory(e) === 'Contract')

    const newStaff = staffPeople.map((emp, i) =>
      payrollService.calculateStaffSalaryRow(
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
        days
      )
    )
    const newContract = contractPeople.map((emp, i) =>
      payrollService.calculateContractSalaryRow(
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
        days
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
        payrollService.calculateEfficiencyRow({
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
    hydrated = prevHydrated
    allowServerSheetWrite = prevAllow
    memoryStore.clear()
    for (const [k, v] of previous) memoryStore.set(k, v)
  }
}

export const payrollService = new PayrollService()

/** Copy HR name, designation, and wage onto each person's own sheet. Returns changed store keys. */
export function projectProfilesOntoSheets(store: Record<string, unknown>): Record<string, unknown> {
  const previous = new Map(memoryStore)
  const snapshot = new Map<string, string>()
  memoryStore.clear()
  for (const [key, value] of Object.entries(store)) {
    const raw = JSON.stringify(value ?? null)
    memoryStore.set(key, raw)
    snapshot.set(key, raw)
  }
  allowServerSheetWrite = true
  try {
    payrollService.syncMasterRoster()
  } finally {
    allowServerSheetWrite = false
  }
  const changed: Record<string, unknown> = {}
  for (const [key, value] of memoryStore) {
    if (snapshot.get(key) !== value) changed[key] = JSON.parse(value) as unknown
  }
  memoryStore.clear()
  for (const [key, value] of previous) memoryStore.set(key, value)
  return changed
}

/** Server-side: strip same-person duplicate rows from a payroll store snapshot. */
export function dedupePayrollStore(store: Record<string, unknown>): Record<string, unknown> {
  const previous = new Map(memoryStore)
  const snapshot = new Map<string, string>()
  const prevHydrated = hydrated
  memoryStore.clear()
  for (const [key, value] of Object.entries(store)) {
    const raw = JSON.stringify(value ?? null)
    memoryStore.set(key, raw)
    snapshot.set(key, raw)
  }
  hydrated = true
  allowServerSheetWrite = true
  try {
    payrollService.repairCorruptedStaffChequeAmounts()
    payrollService.repairDuplicatePayrollRows()
  } finally {
    allowServerSheetWrite = false
    hydrated = prevHydrated
  }
  const changed: Record<string, unknown> = {}
  for (const [key, value] of memoryStore) {
    if (snapshot.get(key) !== value) changed[key] = JSON.parse(value) as unknown
  }
  memoryStore.clear()
  for (const [key, value] of previous) memoryStore.set(key, value)
  return changed
}
