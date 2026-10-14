// src/services/payroll/payrollCalculations.ts
import { JobFamily, NAME_ALIASES, MONTH_NAME_TO_NUM } from './payrollConstants'
import type {
  EmployeeProfile,
  EmployeeCategory,
  StaffSalaryRecord,
  ContractSalaryRecord,
  EfficiencyIncentiveRecord,
  WeaverWageRecord,
  HelperWageRecord,
  ContractorPaymentRecord,
} from '@/types/payroll'

export function daysInCalendarMonth(month: string = '2026-08'): number {
  const [year, mon] = (month || '2026-08').split('-').map(Number)
  if (!year || !mon) return 31
  return new Date(year, mon, 0).getDate()
}

/** Normalize sheet month; never fall back to "active" month (that overwrote Aug with Sep pay). */
export function sheetMonthKey(rowMonth?: string | null, fallback = '2026-08'): string {
  const m = (rowMonth || '').trim()
  return /^\d{4}-\d{2}$/.test(m) ? m : fallback
}

/** Pay / wage fields apply only to the month being edited from the profile card. */
export function isTargetPayMonth(
  rowMonth: string | undefined | null,
  targetMonth: string
): boolean {
  return sheetMonthKey(rowMonth) === sheetMonthKey(targetMonth)
}

/** Active / On Leave count as working roster; Resigned does not. */
export function isActiveEmployee(emp?: EmployeeProfile | null): boolean {
  if (!emp) return false
  return (emp.status || 'Active') !== 'Resigned'
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

/** Parse DOJ strings like 2026-09-01 / 01-Sep-2026 / 26-Jul-2026 / Jan-13-25 → YYYY-MM-DD. */
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

  const monthFirst = text.match(/^([A-Za-z]+)[\s.\-\/]+(\d{1,2})[\s.\-\/]+(\d{2,4})$/)
  if (monthFirst) {
    const mon = MONTH_NAME_TO_NUM[monthFirst[1].toLowerCase()]
    const day = Number(monthFirst[2])
    let year = Number(monthFirst[3])
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

export function hydrateResignedDates(list: EmployeeProfile[]): {
  list: EmployeeProfile[]
  changed: boolean
} {
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
 * Include in a payroll month / fortnight sheet?
 * - New joiners: only from DOJ month onward (Sep joiner does not show in Aug).
 * - Join after 15th: hide from that month's 1-15 Weaver/Helper/Contractor sheet only.
 * - Resign on/before 15th: hide from that month's 16-31 sheet (still on 1-15 if they worked).
 * - Resigned: stay through resign month (subject to fortnight rules), then drop later months.
 */
export function employeeBelongsInMonth(
  emp: EmployeeProfile | null | undefined,
  month: string,
  fortnight?: string
): boolean {
  if (!emp) return true
  const start = joiningMonth(emp)
  if (start && month < start) return false
  if (fortnight === '1-15' && start && month === start) {
    const iso = parseDojToIso(emp.doj)
    if (iso && /^\d{4}-\d{2}-\d{2}/.test(iso)) {
      const joinDay = Number(iso.slice(8, 10))
      if (joinDay > 15) return false
    }
  }
  if ((emp.status || 'Active') !== 'Resigned') return true
  const end = resignedMonth(emp)
  if (!end) return false
  if (month > end) return false
  // Left on/before 15th → not paid in second fortnight of resign month.
  if (fortnight === '16-31' && month === end) {
    const raw = resolveResignedAt(emp)
    const iso = /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : parseDojToIso(raw)
    if (iso && /^\d{4}-\d{2}-\d{2}/.test(iso)) {
      const resignDay = Number(iso.slice(8, 10))
      if (resignDay >= 1 && resignDay <= 15) return false
    }
  }
  return true
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export function normalizeName(name?: string): string {
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

export function namesMatch(a?: string, b?: string): boolean {
  if (!a || !b) return false
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (!na || !nb) return false
  return na === nb
}

export function jobFamily(designation?: string, category?: string): JobFamily {
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
  if (
    (c === 'helper' && !d.includes('sweeper')) ||
    (d.includes('helper') && !d.includes('electrician helper')) ||
    d.includes('winder')
  ) {
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
    if (['Admin', 'Contract', 'Contractor', 'Weaver', 'Helper'].includes(existing)) {
      if (family === 'salaried' && (existing === 'Admin' || existing === 'Contract')) {
        return existing as EmployeeCategory
      }
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
  emp: Pick<
    EmployeeProfile,
    'designation' | 'employeeCategory' | 'contractStatus' | 'status' | 'remarks' | 'resignedAt'
  >
): boolean {
  if (!isActiveEmployee(emp as EmployeeProfile)) return false
  // Only status drives GW membership — remarks text must not kick active people to table end.
  if ((emp.status || 'Active') === 'Resigned') return false
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

  // 1. Exact designation match
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

  // 2. Keyword match
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

  // 3. Category match
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

  // 4. Default: insert after the last active employee
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

export function weaverSheetFields(
  emp: Pick<EmployeeProfile, 'designation' | 'salary' | 'ratePerDay30'> & { overtimeRate?: number }
): {
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

export function helperSheetFields(
  emp: Pick<EmployeeProfile, 'designation' | 'salary' | 'ratePerDay30'> & { overtimeRate?: number }
): {
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

export function sameJobFamily(emp: EmployeeProfile, rowDesignation?: string): boolean {
  if (!rowDesignation) return true
  return jobFamily(emp.designation, emp.employeeCategory) === jobFamily(rowDesignation)
}

export function findLinkedEmployee(
  roster: EmployeeProfile[],
  name?: string,
  designation?: string,
  employeeId?: string
): EmployeeProfile | undefined {
  if (employeeId) {
    const byId = roster.find((emp) => emp.id === employeeId)
    if (byId) return byId
    // Row is explicitly tied to another id — never name-fallback onto a different person
    // (e.g. resigned Dawood emp-38 must not claim new Dawood emp-sep-48-dawood rows).
    return undefined
  }
  if (!name) return undefined

  const familyMatches = roster.filter(
    (emp) => namesMatch(emp.name, name) && sameJobFamily(emp, designation)
  )
  if (familyMatches.length === 0) return undefined
  if (familyMatches.length === 1) return familyMatches[0]
  // Prefer Active when duplicate names share a job family (Dawood ×2).
  const active = familyMatches.filter((emp) => (emp.status || 'Active') !== 'Resigned')
  const pool = active.length > 0 ? active : familyMatches
  const exactDesignation = pool.find(
    (emp) => normalizeName(emp.designation) === normalizeName(designation)
  )
  return exactDesignation || pool[0]
}

/**
 * Does this sheet row belong to `emp` for purge/delete?
 * If the row has employeeId → exact id only (never same-name collateral).
 * Name-only rows → match name+family, preferring Active on collisions.
 */
export function sheetRowBelongsToEmployee(
  emp: EmployeeProfile,
  name?: string,
  designation?: string,
  employeeId?: string,
  roster?: EmployeeProfile[]
): boolean {
  if (employeeId) {
    return Boolean(emp.id && emp.id === employeeId)
  }
  if (!namesMatch(name, emp.name)) return false
  if (designation && !sameJobFamily(emp, designation)) return false
  if (!roster || roster.length === 0) return true
  const canonical = findLinkedEmployee(roster, name, designation)
  return Boolean(canonical && canonical.id === emp.id)
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

// ==========================================
// FORMULA CALCULATION UTILITIES (LIVE EXCEL MATH)
// ==========================================

export function calculateStaffSalaryRow(
  row: Partial<StaffSalaryRecord>,
  daysInMonth = 30,
  activeSalariedMonth = '2026-08',
  matchedEmp?: EmployeeProfile
): StaffSalaryRecord {
  const salary = Number(row.salary) || 0
  const attendance = Number(row.attendanceDays) || 0
  const otHours = Number(row.otHours) || 0
  const lessAdvance = Math.max(0, Number(row.lessAdvance) || 0)
  const chequeAmount = Math.max(0, Number(row.chequeAmount) || 0)

  const month = row.month || '2026-08'
  const isHistorical = month !== activeSalariedMonth
  const calDays = daysInCalendarMonth(month)

  let actualDays = calDays
  if (!isHistorical && daysInMonth !== undefined && daysInMonth > 0) {
    actualDays = daysInMonth
  } else if (isHistorical && (daysInMonth === 28 || daysInMonth === calDays)) {
    actualDays = daysInMonth
  }

  // Staff Excel sheet uses 30-day rate (same as General Wages), not calendar 31.
  // UI may pass 28/30/31; if calendar days leaked in as default, still prefer 30.
  const divisor =
    daysInMonth === 28 || daysInMonth === 30 || daysInMonth === 31
      ? daysInMonth
      : actualDays === 28
        ? 28
        : 30

  const gwRatePerDay =
    matchedEmp &&
    Number(matchedEmp.ratePerDay30) > 0 &&
    divisor === 30 &&
    Math.abs((Number(matchedEmp.salary) || 0) - salary) < 1
      ? Number(matchedEmp.ratePerDay30)
      : 0

  const calculatedRatePerDay =
    gwRatePerDay > 0
      ? Math.round(gwRatePerDay * 100) / 100
      : Math.round((salary / divisor) * 100) / 100
  let ratePerDay = calculatedRatePerDay
  let basicSalary = Math.round(attendance * ratePerDay)

  if (isHistorical && row.basicSalary !== undefined) {
    const explicitDays =
      row.ratePerDay && row.ratePerDay > 0 ? Math.round(salary / row.ratePerDay) : 0
    if (explicitDays === calDays || explicitDays === 28 || explicitDays === 31 || explicitDays === 30) {
      ratePerDay = Number(row.ratePerDay) || calculatedRatePerDay
      basicSalary =
        attendance === explicitDays && salary > 0
          ? salary
          : Math.round(attendance * ratePerDay)
    } else if (attendance === divisor && salary > 0) {
      basicSalary = salary
    } else {
      basicSalary = Number(row.basicSalary)
    }
  } else if (attendance === divisor && salary > 0) {
    // Full attendance for day-base → full salary (Excel: 30 attn → 80,000)
    basicSalary = salary
    ratePerDay = calculatedRatePerDay
  }

  // Same as General Wages 30-day Per Hr; OT uses exact fraction to match Excel (176×40000/240=29333)
  const dutyHrs = Number(matchedEmp?.dutyHrs) > 0 ? Number(matchedEmp!.dutyHrs) : 8
  const gwRatePerHr =
    matchedEmp &&
    Number(matchedEmp.ratePerHr30) > 0 &&
    Math.abs((Number(matchedEmp.salary) || 0) - salary) < 1
      ? Number(Number(matchedEmp.ratePerHr30).toFixed(2))
      : 0
  const perHrRate =
    gwRatePerHr > 0
      ? gwRatePerHr
      : Number((salary / (30 * dutyHrs)).toFixed(2))
  const otAmount = Math.round((otHours * salary) / (30 * dutyHrs))
  const grossAmount = basicSalary + otAmount
  const synopsisAmount = grossAmount - lessAdvance
  const netCashAmount = Math.max(0, synopsisAmount - chequeAmount)

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

export function calculateContractSalaryRow(
  row: Partial<ContractSalaryRecord>,
  daysInMonth = 30,
  activeSalariedMonth = '2026-08',
  matchedEmp?: EmployeeProfile
): ContractSalaryRecord {
  const salary = Number(row.salary) || 0
  const attendance = Number(row.attendanceDays) || 0
  const lateHours = Number(row.lateHours) || 0
  const otHours = Number(row.otHours) || 0
  const advanceDeduction = Number(row.advanceDeduction) || 0
  const efficiencyAmount = Number(row.efficiencyAmount) || 0
  const ticketCharges = Number(row.ticketCharges) || 0

  const month = row.month || '2026-08'
  const isHistorical = month !== activeSalariedMonth
  const calDays = daysInCalendarMonth(month)

  // Contract Excel Sheet 4 uses 30-day rate base (same as General Wages), not calendar 31.
  let actualDays = 30
  if (daysInMonth === 28 || daysInMonth === 30 || daysInMonth === 31) {
    actualDays = daysInMonth
  } else if (isHistorical && (calDays === 28 || calDays === 30 || calDays === 31)) {
    // Prefer stored rate base when historical row already encodes 28/30/31
    const encoded =
      row.ratePerDay && row.ratePerDay > 0 ? Math.round(salary / Number(row.ratePerDay)) : 0
    actualDays =
      encoded === 28 || encoded === 30 || encoded === 31 ? encoded : calDays === 28 ? 28 : 30
  }

  const calculatedRatePerDay = Math.round((salary / actualDays) * 100) / 100
  let ratePerDay = calculatedRatePerDay
  let basicSalary = Math.round(attendance * ratePerDay)

  if (isHistorical && row.basicSalary !== undefined && Number(row.attendanceDays) > 0) {
    const explicitDays =
      row.ratePerDay && row.ratePerDay > 0 ? Math.round(salary / row.ratePerDay) : 0
    if (explicitDays === calDays || explicitDays === 28 || explicitDays === 31 || explicitDays === 30) {
      ratePerDay = Number(row.ratePerDay) || calculatedRatePerDay
      basicSalary =
        attendance === explicitDays && salary > 0
          ? salary
          : Math.round(attendance * ratePerDay)
    } else if (attendance === actualDays && salary > 0) {
      basicSalary = salary
    } else {
      basicSalary = Number(row.basicSalary)
    }
  } else if (attendance === actualDays && salary > 0) {
    basicSalary = salary
  }

  // Same formula as General Wages "30 DAYS → Per Hr": salary / (30 × dutyHrs)
  let dutyHrs = Number(matchedEmp?.dutyHrs) || 0
  if (dutyHrs <= 0) {
    dutyHrs = 12
    const dLow = (row.designation || matchedEmp?.designation || '').toLowerCase()
    if (
      dLow.includes('sweeper') ||
      dLow.includes('kitchen') ||
      dLow.includes('office boy') ||
      dLow.includes('cook') ||
      dLow.includes('guard') ||
      dLow.includes('accountant') ||
      dLow.includes('incharge') ||
      dLow.includes('supervisor') ||
      dLow.includes('store')
    ) {
      dutyHrs = 8
    } else if (dLow.includes('d.e.o') || dLow.includes('deo')) {
      dutyHrs = 9
    } else if (
      dLow.includes('quality') ||
      dLow.includes('oilman') ||
      dLow.includes('oil man') ||
      dLow.includes('folding') ||
      dLow.includes('time keeper') ||
      dLow.includes('technician') ||
      dLow.includes('beem')
    ) {
      dutyHrs = 12
    }
  }

  let ratePerHr = Number(row.ratePerHr) || 0
  // Prefer live General Wages ratePerHr30 when sheet salary still matches profile pay.
  const gwRatePerHr =
    matchedEmp &&
    Number(matchedEmp.ratePerHr30) > 0 &&
    Math.abs((Number(matchedEmp.salary) || 0) - salary) < 1
      ? Number(Number(matchedEmp.ratePerHr30).toFixed(2))
      : 0
  const calculatedRatePerHr =
    gwRatePerHr > 0
      ? gwRatePerHr
      : Number((salary / (30 * dutyHrs)).toFixed(2))

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

  const lateAmount =
    row.lateAmount !== undefined && row.lateAmount !== null && String(row.lateAmount) !== ''
      ? Number(row.lateAmount) || 0
      : lateHours > 0
        ? Math.round(lateHours * ratePerHr)
        : 0

  // Contract net-payment: Gross = Basic + OT Amount
  const grossSalary = basicSalary + otAmount

  // Net = Gross − Advance − Ticket
  const netAmount = Math.max(0, grossSalary - advanceDeduction - ticketCharges)

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

export function calculateEfficiencyRow(
  row: Partial<EfficiencyIncentiveRecord>
): EfficiencyIncentiveRecord {
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

export function calculateWeaverWageRow(row: Partial<WeaverWageRecord>): WeaverWageRecord {
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
    row.attendanceAllowance !== undefined
      ? Number(row.attendanceAllowance)
      : attendance >= 13
        ? 800
        : 0
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

export function calculateHelperWageRow(row: Partial<HelperWageRecord>): HelperWageRecord {
  const wagePerDay = row.wagePerDay !== undefined ? Number(row.wagePerDay) : 1050
  const attendance = Number(row.attendanceDays) || 0
  const holidayAttendance = Number(row.holidayAttendance) || 0
  const wagesAmount = wagePerDay * attendance
  const otRate =
    row.otRate !== undefined
      ? Number(row.otRate)
      : row.designation === 'Winder'
        ? 1400
        : 1200
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

export function calculateContractorPaymentRow(
  row: Partial<ContractorPaymentRecord>
): ContractorPaymentRecord {
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
