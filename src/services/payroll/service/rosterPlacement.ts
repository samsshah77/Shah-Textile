/** Put people from HR profiles onto the right wage / salary / contractor sheets. */
import {
  contractorDefaults,
  contractorRowUntouched,
  contractorSheetsFor,
  isMonthEndContractorRow,
} from '@/services/payroll/contractorPlan'
import {
  EmployeeProfile,
  WeaverWageRecord,
  HelperWageRecord,
  ContractorPaymentRecord,
} from '@/types/payroll'
import {
  INITIAL_STAFF_SALARIES,
  INITIAL_HELPERS_WAGES,
  INITIAL_WEAVERS_WAGES,
  INITIAL_CONTRACT_SALARIES,
  INITIAL_CONTRACTORS,
  INITIAL_EMPLOYEES,
} from '@/data/payrollSeeds'
import { STORAGE_KEYS } from '@/services/payroll/payrollConstants'
import { hydrated, isTombstonedEmployee, isMonthLocked } from '@/services/payroll/payrollStorage'
import {
  daysInCalendarMonth,
  parseResignationDateFromRemarks,
  employeeBelongsInMonth,
  normalizeName,
  namesMatch,
  inferEmployeeCategory,
  weaverSheetFields,
  helperSheetFields,
} from '@/services/payroll/payrollCalculations'
import type { PayrollService } from '@/services/payrollService'

export const rosterPlacementMethods = {
  /**
   * Merge resigned General Wages people and missing weaver/helper profiles.
   * Used by GET /api/payroll/store so the roster is saved in Postgres, not only in the browser.
   */
  integrateEmployeeRoster(
    this: PayrollService,
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
  },

  /**
   * Persisted roster can predate the Excel import:
   * - General Wages remarks like "Resignation …" stay Active, so Resigned count is 0
   * - Weavers / Helpers live on their wage sheets but were never copied onto HR
   */
  repairRoster(
    this: PayrollService,
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
      if (isTombstonedEmployee(src.id, src.name)) return
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
  },

  /** Weaver / Spare Weaver / Helper belong on their wage sheets, not General Wages. */
  placeOnDailyWageSheets(this: PayrollService, emp: EmployeeProfile, month = '2026-08'): void {
    const cat = inferEmployeeCategory(emp)
    if (cat !== 'Weaver' && cat !== 'Helper') return
    if ((emp.status || 'Active') === 'Resigned') return
    if (isTombstonedEmployee(emp.id, emp.name)) return
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
          if (!employeeBelongsInMonth(emp, m, fortnight)) {
            const idx = next.findIndex(
              (w) =>
                w.month === m &&
                w.fortnight === fortnight &&
                (w.employeeId === emp.id ||
                  namesMatch(w.employeeName, emp.name) ||
                  namesMatch(w.employeeName, previousName))
            )
            if (idx >= 0) {
              next.splice(idx, 1)
              changed = true
            }
            continue
          }

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
        if (!employeeBelongsInMonth(emp, m, fortnight)) {
          const idx = next.findIndex(
            (h) =>
              h.month === m &&
              h.fortnight === fortnight &&
              (h.employeeId === emp.id ||
                namesMatch(h.employeeName, emp.name) ||
                namesMatch(h.employeeName, previousName))
          )
          if (idx >= 0) {
            next.splice(idx, 1)
            changed = true
          }
          continue
        }

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
        changed = true
      }
    }
    if (changed) this.saveHelpersWages(next, false)
  },

  /**
   * After a contractor's profile is saved: put them on the sheet that matches their pay
   * cycle for the current fortnight month.
   */
  placeContractorOnCycle(this: PayrollService, emp: EmployeeProfile): void {
    const { month } = this.getActiveFortnightPeriod()
    this.alignContractorsToProfiles(month, [emp])
  },

  /**
   * Make the Contractors sheets of `month` follow each contractor's profile:
   *  - everyone → one 1–30/31 (month end) row (an old "16-31" row also counts);
   *  - "also paid in 1–15" → a 1–15 row as well (unless joined after the 15th).
   * A 1–15 row is removed only when nothing was typed on it, so no entered amount is lost.
   * Only the running pay month and later months are touched.
   */
  alignContractorsToProfiles(this: PayrollService, month: string, people?: EmployeeProfile[]): boolean {
    // Never before the DB snapshot is loaded — seed rows would be written back.
    if (!this.canWrite() || (this.isClient() && !hydrated) || !/^\d{4}-\d{2}$/.test(month)) return false
    const roster = (people || this.getEmployees()).filter(
      (e) =>
        inferEmployeeCategory(e) === 'Contractor' &&
        !isTombstonedEmployee(e.id, e.name) &&
        employeeBelongsInMonth(e, month)
    )
    if (roster.length === 0) return false
    // Only the running pay month and later — past months are history and stay as they are.
    if (month < this.getActiveFortnightPeriod().month || isMonthLocked(month)) return false
    let next = this.readStore(STORAGE_KEYS.CONTRACTORS, INITIAL_CONTRACTORS)
    let changed = false
    for (const emp of roster) {
      const mine = (r: ContractorPaymentRecord) =>
        r.month === month && (r.employeeId === emp.id || (!r.employeeId && namesMatch(r.name, emp.name)))
      const wanted = contractorSheetsFor(emp, month)
      if (!wanted.includes('1-15')) {
        const before = next.length
        next = next.filter(
          (r) => !(mine(r) && r.fortnight === '1-15' && contractorRowUntouched(r, emp, '1-15'))
        )
        if (next.length !== before) changed = true
      }
      for (const sheet of wanted) {
        const has = next.some(
          (r) => mine(r) && (sheet === '1-31' ? isMonthEndContractorRow(r) : r.fortnight === '1-15')
        )
        if (has) continue
        const serial =
          next.filter(
            (r) => r.month === month && (sheet === '1-31' ? isMonthEndContractorRow(r) : r.fortnight === '1-15')
          ).length + 1
        next = [...next, this.newContractorRow(emp, month, sheet, serial)]
        changed = true
      }
    }
    if (changed) this.saveContractorsPayments(next, false)
    return changed
  },

  /** A fresh contractor row with the profile's starting amount (see contractorDefaults). */
  newContractorRow(
    this: PayrollService,
    emp: EmployeeProfile,
    month: string,
    sheet: '1-15' | '1-31',
    serialNo: number
  ): ContractorPaymentRecord {
    return this.calculateContractorPaymentRow({
      id: `c-${month}-${sheet}-${emp.id}`,
      serialNo,
      employeeId: emp.id,
      name: emp.name,
      contractType: emp.designation || 'Contract',
      ...contractorDefaults(emp, sheet),
      extraIncentive: 0,
      lessAdvance: 0,
      fortnight: sheet,
      month,
    })
  },

  /** Staff / Admin → Staff sheet; Company Contract → Contract sheet. Attendance stays local. */
  placeOnSalariedSheets(this: PayrollService, emp: EmployeeProfile, month = '2026-08'): void {
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
      const cal = daysInCalendarMonth(m)
      const staffDays = cal === 28 ? 28 : 30
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
          staffDays
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
          staffDays
        )
      )
      changed = true
    }
    if (changed) this.saveStaffSalaries(next, false)
  },

}

export type RosterPlacementMethods = typeof rosterPlacementMethods
