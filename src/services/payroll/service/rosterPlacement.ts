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
  INITIAL_CONTRACTORS,
  INITIAL_EFFICIENCY_INCENTIVES,
} from '@/data/payrollSeeds'
import { STORAGE_KEYS } from '@/services/payroll/payrollConstants'
import { hydrated, isTombstonedEmployee, isMonthLocked, writeStore } from '@/services/payroll/payrollStorage'
import {
  employeeBelongsInMonth,
  namesMatch,
  inferEmployeeCategory,
} from '@/services/payroll/payrollCalculations'
import type { PayrollService } from '@/services/payrollService'

export const rosterPlacementMethods = {
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
          if (drop.some((r) => Number(r.amount) || 0)) zeroed.push(emp.id)
          changed = true
        }
        continue
      }
      if (mineNow.length) continue
      const last = [...next]
        .filter((r) => r.month < month && isMine(r))
        .sort((a, b) => b.month.localeCompare(a.month))[0]
      const contractRow = this.getContractSalaries(month).find(
        (c) => (c.employeeId ? c.employeeId === emp.id : namesMatch(c.employeeName, emp.name))
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
    for (const id of zeroed) this.syncEfficiencyToSalaries(id, month, 0, false)
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

}

export type RosterPlacementMethods = typeof rosterPlacementMethods
