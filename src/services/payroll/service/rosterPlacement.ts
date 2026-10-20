/** Put people from HR profiles onto the right wage / salary / contractor sheets. */
import {
  contractorDefaults,
  contractorRowUntouched,
  contractorSheetsFor,
  isMonthEndContractorRow,
} from '@/services/payroll/contractorPlan'
import {
  EmployeeProfile,
  ContractorPaymentRecord,
  EfficiencyIncentiveRecord,
} from '@/types/payroll'
import {
  INITIAL_STAFF_SALARIES,
  INITIAL_HELPERS_WAGES,
  INITIAL_WEAVERS_WAGES,
  INITIAL_CONTRACT_SALARIES,
  INITIAL_CONTRACTORS,
  INITIAL_EFFICIENCY_INCENTIVES,
} from '@/data/payrollSeeds'
import { STORAGE_KEYS } from '@/services/payroll/payrollConstants'
import { hydrated, isTombstonedEmployee, isMonthLocked, writeStore } from '@/services/payroll/payrollStorage'
import {
  daysInCalendarMonth,
  employeeBelongsInMonth,
  namesMatch,
  inferEmployeeCategory,
  weaverSheetFields,
  helperSheetFields,
} from '@/services/payroll/payrollCalculations'
import type { PayrollService } from '@/services/payrollService'

export const rosterPlacementMethods = {
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
    // Profile was just saved on purpose → its 1–15 setting wins, even over typed amounts.
    this.alignContractorsToProfiles(month, [emp], true)
  },

  /**
   * Make the Contractors sheets of `month` follow each contractor's profile:
   *  - everyone → one 1–30/31 (month end) row (an old "16-31" row also counts);
   *  - "also paid in 1–15" → a 1–15 row as well (unless joined after the 15th).
   * Unticked → the 1–15 row goes: on page open only when nothing was typed on it; on a
   * profile save (force) always — the profile is the decision.
   * Only the running pay month and later months are touched.
   */
  alignContractorsToProfiles(
    this: PayrollService,
    month: string,
    people?: EmployeeProfile[],
    /** Profile save: drop the 1–15 row of an unticked person even if amounts were typed. */
    force = false
  ): boolean {
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
          (r) =>
            !(mine(r) && r.fortnight === '1-15' && (force || contractorRowUntouched(r, emp, '1-15')))
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

  /**
   * Efficiency sheet of `month` follows the Company Contract profiles' "Efficiency" tick:
   *  - ticked → a row (loom from the person's last efficiency row, salary from the Contract sheet);
   *  - unticked → the row goes (on page open only if no efficiency % was typed; on a profile
   *    save always) and its amount is taken off the Contract net payment;
   *  - never decided (old profile) → left as it is.
   * Only the running salary month and later; locked months are never touched.
   */
  alignEfficiencyToProfiles(
    this: PayrollService,
    month: string,
    people?: EmployeeProfile[],
    force = false
  ): boolean {
    if (!this.canWrite() || (this.isClient() && !hydrated) || !/^\d{4}-\d{2}$/.test(month)) return false
    if (month < this.getActiveSalariedMonth() || isMonthLocked(month)) return false
    const roster = (people || this.getEmployees()).filter(
      (e) =>
        inferEmployeeCategory(e) === 'Contract' &&
        typeof e.efficiencyEligible === 'boolean' &&
        !isTombstonedEmployee(e.id, e.name)
    )
    if (roster.length === 0) return false
    const all = this.readStore(STORAGE_KEYS.EFFICIENCY, INITIAL_EFFICIENCY_INCENTIVES)
    let next: EfficiencyIncentiveRecord[] = all
    const zeroed: string[] = []
    let changed = false
    for (const emp of roster) {
      const isMine = (r: EfficiencyIncentiveRecord) =>
        r.employeeId === emp.id || (!r.employeeId && namesMatch(r.name, emp.name))
      const mineNow = next.filter((r) => r.month === month && isMine(r))
      const wanted = emp.efficiencyEligible === true && employeeBelongsInMonth(emp, month)
      if (!wanted) {
        const drop = mineNow.filter((r) => force || !(Number(r.efficiencyPercent) || 0))
        if (drop.length) {
          next = next.filter((r) => !drop.includes(r))
          if (drop.some((r) => Number(r.amount) || 0)) zeroed.push(emp.name)
          changed = true
        }
        continue
      }
      if (mineNow.length) continue
      const last = [...next]
        .filter((r) => r.month < month && isMine(r))
        .sort((a, b) => b.month.localeCompare(a.month))[0]
      const contractRow = this.getContractSalaries(month).find(
        (c) => c.employeeId === emp.id || namesMatch(c.employeeName, emp.name)
      )
      next = [
        ...next,
        this.calculateEfficiencyRow({
          id: `eff-${month}-${emp.id}`,
          serialNo: next.filter((r) => r.month === month).length + 1,
          employeeId: emp.id,
          loom: last?.loom || 'Overall',
          name: emp.name,
          designation: emp.designation,
          efficiencyPercent: 0,
          salaryEarned: contractRow?.basicSalary ?? (Number(emp.salary) || 0),
          month,
        }),
      ]
      changed = true
    }
    if (!changed) return false
    writeStore(STORAGE_KEYS.EFFICIENCY, this.renumberByMonth(next))
    for (const name of zeroed) this.syncEfficiencyToSalaries(name, month, 0, false)
    this.notifyDataChanged(month)
    return true
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
