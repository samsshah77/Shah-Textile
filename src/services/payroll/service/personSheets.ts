/**
 * How a profile change reaches the salary sheets. One set of rules for every sheet:
 *
 *  1. A sheet row belongs to a person by `employeeId` only. Two people with the same name are
 *     two different people (a name is used only for very old rows that have no id).
 *  2. A change made while working in month M applies to M and later months. Earlier months
 *     keep what they were (name, designation, pay, category). Later months take a new pay
 *     only if they still had the same pay as M (a raise already entered later is kept).
 *  3. Dates decide membership in every month: setting the joining date to September (while
 *     working in October) puts the person on September's sheets; a later joining date or a
 *     resign date takes them off the months they no longer belong to.
 *  4. A category change (e.g. Weaver → Staff in October) moves the person from October on;
 *     September stays on the Weavers sheet.
 *  5. Rows where something was already entered (attendance, OT, amounts…) are never removed
 *     automatically — they are kept and a message says so. Locked months are never touched.
 */
import { contractorBasis, contractorRowUntouched, contractorSheetsFor, isMonthEndContractorRow } from '@/services/payroll/contractorPlan'
import type {
  ContractorPaymentRecord,
  ContractSalaryRecord,
  EfficiencyIncentiveRecord,
  EmployeeProfile,
  HelperWageRecord,
  StaffSalaryRecord,
  WeaverWageRecord,
} from '@/types/payroll'
import { STORAGE_KEYS } from '@/services/payroll/payrollConstants'
import { isMonthLocked, isTombstonedEmployee, readStore, writeStore } from '@/services/payroll/payrollStorage'
import {
  calculateContractSalaryRow,
  calculateStaffSalaryRow,
  daysInCalendarMonth,
  employeeBelongsInMonth,
  findLinkedEmployee,
  helperSheetFields,
  inferEmployeeCategory,
  joiningMonth,
  weaverSheetFields,
} from '@/services/payroll/payrollCalculations'
import type { PayrollService } from '@/services/payrollService'

type AnyRow = {
  id: string
  month: string
  fortnight?: string
  serialNo?: number
  employeeId?: string
  employeeName?: string
  name?: string
  designation?: string
  contractType?: string
}

const num = (v: unknown) => Number(v) || 0

/** Does this row belong to `emp`? Id when the row has one; very old rows by name + job family. */
export function rowIsPerson(row: AnyRow, emp: EmployeeProfile, roster: EmployeeProfile[]): boolean {
  if (row.employeeId) return row.employeeId === emp.id
  const linked = findLinkedEmployee(roster, row.employeeName || row.name, row.designation || row.contractType)
  return Boolean(linked && linked.id === emp.id)
}

/** Something was entered on this row by hand (so it must not disappear on its own). */
export function rowHasEntries(sheet: string, row: AnyRow): boolean {
  const r = row as unknown as Record<string, unknown>
  const any = (...f: string[]) => f.some((k) => num(r[k]) !== 0)
  const custom = Object.values((r.customFields as Record<string, unknown>) || {}).some((v) => v !== '' && v != null)
  if (custom) return true
  switch (sheet) {
    case STORAGE_KEYS.STAFF:
      return any('attendanceDays', 'otHours', 'lessAdvance', 'chequeAmount')
    case STORAGE_KEYS.CONTRACT:
      return any('attendanceDays', 'otHours', 'lateHours', 'efficiencyAmount', 'advanceDeduction')
    case STORAGE_KEYS.WEAVERS:
      return any('attendanceDays', 'extraLooms', 'holidayAttendance', 'efficiencyAmount')
    case STORAGE_KEYS.HELPERS:
      return any('attendanceDays', 'holidayAttendance')
    case STORAGE_KEYS.EFFICIENCY:
      return any('efficiencyPercent')
    default:
      return true
  }
}

type Spec = {
  key: string
  fortnightly: boolean
  categories: string[]
  label: string
}

const SPECS: Spec[] = [
  { key: STORAGE_KEYS.STAFF, fortnightly: false, categories: ['Staff', 'Admin'], label: 'Staff' },
  { key: STORAGE_KEYS.CONTRACT, fortnightly: false, categories: ['Contract'], label: 'Company Contract' },
  { key: STORAGE_KEYS.WEAVERS, fortnightly: true, categories: ['Weaver'], label: 'Weavers' },
  { key: STORAGE_KEYS.HELPERS, fortnightly: true, categories: ['Helper'], label: 'Helpers' },
]

type Period = { month: string; fortnight?: '1-15' | '16-31' }
const periodKey = (p: Period) => `${p.month}|${p.fortnight || ''}`

function periodsOf(rows: AnyRow[], fortnightly: boolean): Period[] {
  const seen = new Map<string, Period>()
  for (const r of rows) {
    if (!/^\d{4}-\d{2}$/.test(r.month || '')) continue
    const p: Period = fortnightly
      ? { month: r.month, fortnight: r.fortnight === '16-31' ? '16-31' : '1-15' }
      : { month: r.month }
    seen.set(periodKey(p), p)
  }
  return [...seen.values()].sort((a, b) => periodKey(a).localeCompare(periodKey(b)))
}

const inPeriod = (r: AnyRow, p: Period) =>
  r.month === p.month && (!p.fortnight || (r.fortnight === '16-31' ? '16-31' : '1-15') === p.fortnight)

/** Renumber S.# of the given periods only (other months keep their numbers). */
function renumber<T extends AnyRow>(rows: T[], touched: Set<string>, fortnightly: boolean): T[] {
  const counters = new Map<string, number>()
  return rows.map((r) => {
    const k = fortnightly ? `${r.month}|${r.fortnight === '16-31' ? '16-31' : '1-15'}` : `${r.month}|`
    if (!touched.has(k)) return r
    const n = (counters.get(k) || 0) + 1
    counters.set(k, n)
    return r.serialNo === n ? r : { ...r, serialNo: n }
  })
}

export type ProfileSheetResult = { warnings: string[]; months: string[] }

export const personSheetMethods = {
  /**
   * Bring every salary sheet in line with a saved profile (see the rules at the top).
   * `before` is the profile as it was (null for a new person); `fromMonth` is the month
   * the change was made in. Returns messages about rows that were kept on purpose.
   */
  applyProfileToSheets(
    this: PayrollService,
    before: EmployeeProfile | null,
    after: EmployeeProfile,
    fromMonth: string
  ): ProfileSheetResult {
    const roster = this.getEmployees()
    const warnings: string[] = []
    const monthsTouched = new Set<string>()
    if (isTombstonedEmployee(after.id, after.name)) return { warnings, months: [] }

    const catAfter = inferEmployeeCategory(after)
    const catBefore = before ? inferEmployeeCategory(before) : catAfter
    const joinBefore = before ? joiningMonth(before) : ''
    const datesChanged =
      !before ||
      before.doj !== after.doj ||
      (before.resignedAt || '') !== (after.resignedAt || '') ||
      (before.status || 'Active') !== (after.status || 'Active')
    /** A month the new dates cover that the old dates did not (only these are filled in the past). */
    const newlyCovered = (p: Period) =>
      !before || !employeeBelongsInMonth(before, p.month, p.fortnight) || Boolean(joinBefore && p.month < joinBefore)
    const keepNote = (label: string, p: Period) =>
      warnings.push(
        `${after.name}: ${label} ${p.month}${p.fortnight ? ` (${p.fortnight})` : ''} ki row mein data likha hua hai — wo row nahi hatai; zaroorat ho to khud saaf karein.`
      )

    // ---- Staff / Company Contract / Weavers / Helpers
    for (const spec of SPECS) {
      const all = readStore<AnyRow[]>(spec.key, [])
      let next = [...all]
      const touched = new Set<string>()
      const fromPeriod = periodsOf(all, spec.fortnightly).find((p) => p.month === fromMonth)
      const basePayRow = fromPeriod ? all.find((r) => inPeriod(r, fromPeriod) && rowIsPerson(r, after, roster)) : undefined
      const basePay = basePayRow ? this.payOfRow(spec.key, basePayRow) : null

      for (const p of periodsOf(all, spec.fortnightly)) {
        if (isMonthLocked(p.month)) continue
        const forward = p.month >= fromMonth
        const cat = forward ? catAfter : catBefore
        const belongs = employeeBelongsInMonth(after, p.month, p.fortnight)
        const want = belongs && spec.categories.includes(cat)
        const mine = next.filter((r) => inPeriod(r, p) && rowIsPerson(r, after, roster))

        if (!want) {
          // Past months change only when the dates say the person was not there.
          if (!forward && belongs) continue
          for (const row of mine) {
            if (rowHasEntries(spec.key, row)) keepNote(spec.label, p)
            else {
              next = next.filter((r) => r !== row)
              touched.add(periodKey(p))
            }
          }
          continue
        }

        if (mine.length) {
          if (!forward) continue
          const row = mine[0]
          const carryPay = p.month === fromMonth || basePay === null || this.payOfRow(spec.key, row) === basePay
          const updated = this.rowWithProfile(spec.key, row, after, p, carryPay)
          if (JSON.stringify(updated) !== JSON.stringify(row)) next = next.map((r) => (r === row ? updated : r))
          continue
        }

        if (!forward && !(datesChanged && newlyCovered(p))) continue
        const serial = next.filter((r) => inPeriod(r, p)).length + 1
        next.push(this.newSheetRow(spec.key, after, p, serial))
        touched.add(periodKey(p))
        monthsTouched.add(p.month)
      }

      if (next !== all && JSON.stringify(next) !== JSON.stringify(all)) {
        writeStore(spec.key, renumber(next, touched, spec.fortnightly))
      }
    }

    // ---- Contractors (1–15 + month end)
    {
      const all = readStore<ContractorPaymentRecord[]>(STORAGE_KEYS.CONTRACTORS, [])
      let next = [...all]
      const months = [...new Set(all.map((r) => r.month).filter((m) => /^\d{4}-\d{2}$/.test(m || '')))].sort()
      const touched = new Set<string>()
      const sheetOf = (r: ContractorPaymentRecord): '1-15' | '1-31' => (isMonthEndContractorRow(r) ? '1-31' : '1-15')
      for (const m of months) {
        if (isMonthLocked(m)) continue
        const forward = m >= fromMonth
        const cat = forward ? catAfter : catBefore
        const belongs = employeeBelongsInMonth(after, m)
        const wanted = belongs && cat === 'Contractor' ? contractorSheetsFor(after, m) : []
        const mine = next.filter((r) => r.month === m && rowIsPerson(r as AnyRow, after, roster))
        const onlyMidMonthUnticked = cat === 'Contractor' && belongs
        for (const row of mine) {
          const sheet = sheetOf(row)
          if (wanted.includes(sheet)) continue
          if (!forward && belongs) continue
          // Unticking "1–15" on the profile is a decision: that row goes even if typed.
          const untouched = contractorRowUntouched(row, before || after, sheet)
          if ((onlyMidMonthUnticked && sheet === '1-15' && forward) || untouched) {
            next = next.filter((r) => r !== row)
            touched.add(`${m}|${sheet}`)
          } else keepNote('Contractors', { month: m })
        }
        for (const sheet of wanted) {
          const existing = next.find((r) => r.month === m && rowIsPerson(r as AnyRow, after, roster) && sheetOf(r) === sheet)
          if (existing) {
            if (!forward) continue
            const fixSalary = contractorBasis(after) === 'SALARY' && sheet === '1-31' && num(after.salary) > 0
            const updated = this.calculateContractorPaymentRow({
              ...existing,
              employeeId: after.id,
              name: after.name,
              contractType: after.designation || existing.contractType,
              contractualAmount:
                fixSalary && (m === fromMonth || !before || num(existing.contractualAmount) === num(before.salary))
                  ? num(after.salary)
                  : existing.contractualAmount,
            })
            if (JSON.stringify(updated) !== JSON.stringify(existing)) next = next.map((r) => (r === existing ? updated : r))
            continue
          }
          if (!forward && !(datesChanged && newlyCovered({ month: m }))) continue
          const serial = next.filter((r) => r.month === m && sheetOf(r) === sheet).length + 1
          next.push(this.newContractorRow(after, m, sheet, serial))
          touched.add(`${m}|${sheet}`)
          monthsTouched.add(m)
        }
      }
      if (JSON.stringify(next) !== JSON.stringify(all)) {
        const counters = new Map<string, number>()
        writeStore(
          STORAGE_KEYS.CONTRACTORS,
          next.map((r) => {
            const k = `${r.month}|${sheetOf(r)}`
            if (!touched.has(k)) return r
            const n = (counters.get(k) || 0) + 1
            counters.set(k, n)
            return r.serialNo === n ? r : { ...r, serialNo: n }
          })
        )
      }
    }

    // ---- Efficiency (Company Contract people with the "Efficiency" tick)
    {
      const all = readStore<EfficiencyIncentiveRecord[]>(STORAGE_KEYS.EFFICIENCY, [])
      const contract = readStore<ContractSalaryRecord[]>(STORAGE_KEYS.CONTRACT, [])
      let next = [...all]
      const touched = new Set<string>()
      const zeroed: string[] = []
      const months = [...new Set(all.map((r) => r.month).filter(Boolean))].sort()
      for (const m of months) {
        if (isMonthLocked(m)) continue
        const forward = m >= fromMonth
        const cat = forward ? catAfter : catBefore
        const belongs = employeeBelongsInMonth(after, m)
        // Old profiles where the tick was never set: leave the sheet as it is.
        if (typeof after.efficiencyEligible !== 'boolean' && cat === 'Contract') continue
        const want = belongs && cat === 'Contract' && after.efficiencyEligible === true
        const mine = next.filter((r) => r.month === m && rowIsPerson(r as unknown as AnyRow, after, roster))
        if (!want) {
          if (!forward && belongs) continue
          for (const row of mine) {
            // Unticking on the profile is a decision for this month on; dates-only changes keep typed rows.
            if (forward && cat === 'Contract') {
              next = next.filter((r) => r !== row)
              if (num(row.amount)) zeroed.push(m)
              touched.add(`${m}|`)
            } else if (!rowHasEntries(STORAGE_KEYS.EFFICIENCY, row as unknown as AnyRow)) {
              next = next.filter((r) => r !== row)
              touched.add(`${m}|`)
            } else keepNote('Efficiency', { month: m })
          }
          continue
        }
        if (mine.length) {
          if (!forward) continue
          const row = mine[0]
          if (row.name !== after.name || row.designation !== after.designation || row.employeeId !== after.id) {
            const updated = { ...row, employeeId: after.id, name: after.name, designation: after.designation }
            next = next.map((r) => (r === row ? updated : r))
          }
          continue
        }
        if (!forward && !(datesChanged && newlyCovered({ month: m }))) continue
        const last = next
          .filter((r) => r.month < m && rowIsPerson(r as unknown as AnyRow, after, roster))
          .sort((a, b) => b.month.localeCompare(a.month))[0]
        const contractRow = contract.find((c) => c.month === m && rowIsPerson(c as AnyRow, after, roster))
        next.push(
          this.calculateEfficiencyRow({
            id: `eff-${m}-${after.id}`,
            serialNo: next.filter((r) => r.month === m).length + 1,
            employeeId: after.id,
            loom: last?.loom || 'Overall',
            name: after.name,
            designation: after.designation,
            efficiencyPercent: 0,
            salaryEarned: contractRow?.basicSalary ?? num(after.salary),
            month: m,
          })
        )
        touched.add(`${m}|`)
      }
      if (JSON.stringify(next) !== JSON.stringify(all)) {
        writeStore(STORAGE_KEYS.EFFICIENCY, renumber(next as unknown as AnyRow[], touched, false))
        for (const m of zeroed) this.syncEfficiencyToSalaries(after.id, m, 0, false)
      }
    }

    // ---- Advances: name / designation from this month on (money rows are never removed)
    {
      const all = readStore<Array<AnyRow & { amount?: number }>>(STORAGE_KEYS.ADVANCES, [])
      let changed = false
      const next = all.map((r) => {
        if (r.month < fromMonth || isMonthLocked(r.month) || !rowIsPerson(r, after, roster)) return r
        if (r.employeeId === after.id && r.employeeName === after.name && r.designation === after.designation) return r
        changed = true
        return { ...r, employeeId: after.id, employeeName: after.name, designation: after.designation }
      })
      if (changed) writeStore(STORAGE_KEYS.ADVANCES, next)
    }

    // New rows pick up advances already given in their month.
    for (const m of monthsTouched) if (!isMonthLocked(m)) this.syncAllAdvanceTotals(m)
    return { warnings: [...new Set(warnings)], months: [...monthsTouched].sort() }
  },

  /** The pay a profile change compares against (see rule 2). */
  payOfRow(this: PayrollService, sheet: string, row: AnyRow): string {
    const r = row as unknown as Record<string, unknown>
    if (sheet === STORAGE_KEYS.WEAVERS) return `${num(r.wagePerDay)}|${num(r.holidayRate)}`
    if (sheet === STORAGE_KEYS.HELPERS) return `${num(r.wagePerDay)}|${num(r.otRate)}`
    return String(num(r.salary))
  },

  /** An existing row with the profile's name / designation (and pay when `carryPay`). */
  rowWithProfile(this: PayrollService, sheet: string, row: AnyRow, emp: EmployeeProfile, p: Period, carryPay: boolean): AnyRow {
    const days = daysInCalendarMonth(p.month)
    if (sheet === STORAGE_KEYS.STAFF) {
      const r = row as unknown as StaffSalaryRecord
      return calculateStaffSalaryRow(
        { ...r, employeeId: emp.id, employeeName: emp.name, designation: emp.designation, salary: carryPay ? emp.salary : r.salary },
        days === 28 ? 28 : 30,
        p.month,
        emp
      ) as unknown as AnyRow
    }
    if (sheet === STORAGE_KEYS.CONTRACT) {
      const r = row as unknown as ContractSalaryRecord
      return calculateContractSalaryRow(
        { ...r, employeeId: emp.id, employeeName: emp.name, designation: emp.designation, salary: carryPay ? emp.salary : r.salary },
        days,
        p.month,
        emp
      ) as unknown as AnyRow
    }
    if (sheet === STORAGE_KEYS.WEAVERS) {
      const r = row as unknown as WeaverWageRecord
      const pay = weaverSheetFields(emp)
      return this.calculateWeaverWageRow({
        ...r,
        employeeId: emp.id,
        employeeName: emp.name,
        designation: pay.designation,
        wagePerDay: carryPay ? pay.wagePerDay : r.wagePerDay,
        holidayRate: carryPay ? pay.holidayRate : r.holidayRate,
      }) as unknown as AnyRow
    }
    const r = row as unknown as HelperWageRecord
    const pay = helperSheetFields(emp)
    return this.calculateHelperWageRow({
      ...r,
      employeeId: emp.id,
      employeeName: emp.name,
      designation: pay.designation,
      wagePerDay: carryPay ? pay.wagePerDay : r.wagePerDay,
      otRate: carryPay ? pay.otRate : r.otRate,
    }) as unknown as AnyRow
  },

  /** A fresh row (nothing entered yet) for `emp` in period `p`. */
  newSheetRow(this: PayrollService, sheet: string, emp: EmployeeProfile, p: Period, serialNo: number): AnyRow {
    const m = p.month
    const days = daysInCalendarMonth(m)
    if (sheet === STORAGE_KEYS.STAFF) {
      return calculateStaffSalaryRow(
        {
          id: `st-${m}-${emp.id}`,
          serialNo,
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
        days === 28 ? 28 : 30,
        p.month,
        emp
      ) as unknown as AnyRow
    }
    if (sheet === STORAGE_KEYS.CONTRACT) {
      return calculateContractSalaryRow(
        {
          id: `ct-${m}-${emp.id}`,
          serialNo,
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
        days,
        p.month,
        emp
      ) as unknown as AnyRow
    }
    if (sheet === STORAGE_KEYS.WEAVERS) {
      const pay = weaverSheetFields(emp)
      return this.calculateWeaverWageRow({
        id: `w-${m}-${p.fortnight}-${emp.id}`,
        serialNo,
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
        fortnight: p.fortnight || '1-15',
        month: m,
      }) as unknown as AnyRow
    }
    const pay = helperSheetFields(emp)
    return this.calculateHelperWageRow({
      id: `h-${m}-${p.fortnight}-${emp.id}`,
      serialNo,
      employeeId: emp.id,
      employeeName: emp.name,
      designation: pay.designation,
      wagePerDay: pay.wagePerDay,
      attendanceDays: 0,
      otRate: pay.otRate,
      holidayAttendance: 0,
      fortnight: p.fortnight || '1-15',
      month: m,
    }) as unknown as AnyRow
  },
}

export type PersonSheetMethods = typeof personSheetMethods
