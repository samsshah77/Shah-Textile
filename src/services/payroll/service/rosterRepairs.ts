/** Startup repairs: joiners/resigned cut from wrong months, corrupted amounts, duplicates. */
import { EmployeeProfile, ContractSalaryRecord } from '@/types/payroll'
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
import {
  hydrated,
  writeStore,
  dedupeRowsByKey,
  advancePersonMonthKey,
  salariedPersonMonthKey,
  fortnightPersonMonthKey,
} from '@/services/payroll/payrollStorage'
import {
  daysInCalendarMonth,
  sheetMonthKey,
  resignedMonth,
  joiningMonth,
  employeeBelongsInMonth,
  todayIsoDate,
  namesMatch,
  inferEmployeeCategory,
  sheetRowBelongsToEmployee,
} from '@/services/payroll/payrollCalculations'
import type { PayrollService } from '@/services/payrollService'

export const rosterRepairMethods = {
  /** Drop a resigned person from months after resign, and from 16-31 if resign day ≤ 15. */
  purgeResignedFromFutureMonths(this: PayrollService, emp: EmployeeProfile): void {
    const end = resignedMonth(emp) || todayIsoDate().slice(0, 7)
    const roster = this.getEmployees()
    const unlink = (name?: string, designation?: string, employeeId?: string) =>
      sheetRowBelongsToEmployee(emp, name, designation, employeeId, roster)

    const dropFuture = <
      T extends {
        month: string
        fortnight?: string
        employeeName?: string
        name?: string
        designation?: string
        employeeId?: string
        contractType?: string
      }
    >(
      list: T[]
    ) =>
      list.filter((row) => {
        const rowM = sheetMonthKey(row.month)
        if (rowM > end) {
          return !unlink(row.employeeName || row.name, row.designation || row.contractType, row.employeeId)
        }
        // Resign on/before 15th → remove from that month's 16-31 fortnight sheets.
        if (rowM === end && row.fortnight === '16-31') {
          if (!employeeBelongsInMonth(emp, row.month, '16-31')) {
            return !unlink(row.employeeName || row.name, row.designation || row.contractType, row.employeeId)
          }
        }
        return true
      })

    this.saveStaffSalaries(dropFuture(this.readStore(STORAGE_KEYS.STAFF, INITIAL_STAFF_SALARIES)), false)
    this.saveContractSalaries(dropFuture(this.readStore(STORAGE_KEYS.CONTRACT, INITIAL_CONTRACT_SALARIES)), false)
    this.saveAdvances(dropFuture(this.readStore(STORAGE_KEYS.ADVANCES, INITIAL_ADVANCES)), false)
    this.saveEfficiencyIncentives(dropFuture(this.readStore(STORAGE_KEYS.EFFICIENCY, INITIAL_EFFICIENCY_INCENTIVES)), false)
    this.saveWeaversWages(dropFuture(this.readStore(STORAGE_KEYS.WEAVERS, INITIAL_WEAVERS_WAGES)), false)
    this.saveHelpersWages(dropFuture(this.readStore(STORAGE_KEYS.HELPERS, INITIAL_HELPERS_WAGES)), false)
    this.saveContractorsPayments(dropFuture(this.readStore(STORAGE_KEYS.CONTRACTORS, INITIAL_CONTRACTORS)), false)
  },

  /**
   * Drop a new joiner from every sheet month BEFORE their DOJ month
   * (e.g. Sep joiner must not remain on August Staff / Advances / etc.).
   */
  purgeJoinerFromPastMonths(this: PayrollService, emp: EmployeeProfile): void {
    const start = joiningMonth(emp)
    if (!start) return
    const roster = this.getEmployees()
    const unlink = (name?: string, designation?: string, employeeId?: string) =>
      sheetRowBelongsToEmployee(emp, name, designation, employeeId, roster)

    const dropPast = <
      T extends {
        month: string
        fortnight?: string
        employeeName?: string
        name?: string
        designation?: string
        employeeId?: string
        contractType?: string
      }
    >(
      list: T[]
    ) =>
      list.filter((row) => {
        const rowM = sheetMonthKey(row.month)
        if (rowM < start) {
          return !unlink(row.employeeName || row.name, row.designation || row.contractType, row.employeeId)
        }
        // Only real 1-15 fortnight sheets hide mid-month joiners.
        // Monthly Staff/Contract rows have no fortnight — keep them for the whole joining month.
        if (rowM === start && row.fortnight === '1-15') {
          if (!employeeBelongsInMonth(emp, row.month, '1-15')) {
            return !unlink(row.employeeName || row.name, row.designation || row.contractType, row.employeeId)
          }
        }
        return true
      })

    this.saveStaffSalaries(dropPast(this.readStore(STORAGE_KEYS.STAFF, INITIAL_STAFF_SALARIES)), false)
    this.saveContractSalaries(dropPast(this.readStore(STORAGE_KEYS.CONTRACT, INITIAL_CONTRACT_SALARIES)), false)
    this.saveAdvances(dropPast(this.readStore(STORAGE_KEYS.ADVANCES, INITIAL_ADVANCES)), false)
    this.saveEfficiencyIncentives(dropPast(this.readStore(STORAGE_KEYS.EFFICIENCY, INITIAL_EFFICIENCY_INCENTIVES)), false)
    this.saveWeaversWages(dropPast(this.readStore(STORAGE_KEYS.WEAVERS, INITIAL_WEAVERS_WAGES)), false)
    this.saveHelpersWages(dropPast(this.readStore(STORAGE_KEYS.HELPERS, INITIAL_HELPERS_WAGES)), false)
    this.saveContractorsPayments(dropPast(this.readStore(STORAGE_KEYS.CONTRACTORS, INITIAL_CONTRACTORS)), false)
  },

  /** Run DOJ purge for every roster person (fixes live Israr-still-in-August without re-saving profile). */
  purgeAllJoinersFromPastMonths(this: PayrollService): number {
    if (this.isClient() && !hydrated) return 0
    let count = 0
    for (const emp of this.getEmployees()) {
      if (!joiningMonth(emp)) continue
      this.purgeJoinerFromPastMonths(emp)
      count += 1
    }
    return count
  },

  /** Apply resign-day fortnight rules (e.g. resign ≤15 → drop from 16-31) for all resigned. */
  purgeAllResignedFortnightCuts(this: PayrollService): number {
    if (this.isClient() && !hydrated) return 0
    let count = 0
    for (const emp of this.getEmployees()) {
      if ((emp.status || 'Active') !== 'Resigned') continue
      this.purgeResignedFromFutureMonths(emp)
      count += 1
    }
    return count
  },

  /**
   * Fix Staff rows where CHEQUE was corrupted to -LESS ADV (Net Cash became = Gross).
   * Clears negative cheque and recalcs without resetting from seeds.
   */
  repairCorruptedStaffChequeAmounts(this: PayrollService): number {
    if (this.isClient() && !hydrated) return 0
    const staff = this.readStore(STORAGE_KEYS.STAFF, INITIAL_STAFF_SALARIES)
    let fixed = 0
    const next = staff.map((st) => {
      const cheque = Number(st.chequeAmount) || 0
      const adv = Number(st.lessAdvance) || 0
      const corrupted = cheque < 0 || (adv > 0 && cheque === -adv)
      if (!corrupted) return st

      const m = sheetMonthKey(st.month)
      fixed += 1
      return this.calculateStaffSalaryRow(
        { ...st, chequeAmount: 0, lessAdvance: Math.max(0, adv) },
        daysInCalendarMonth(m)
      )
    })
    if (fixed > 0) this.saveStaffSalaries(next, false)
    return fixed
  },

  /**
   * Fix Contract rows to Excel Sheet 4 / General Wages 30-day rate base
   * (calendar 31 was wrongly forced before and broke September Staff/Contract).
   */
  repairCorruptedContractRates(this: PayrollService): number {
    if (this.isClient() && !hydrated) return 0
    const contracts = this.readStore(STORAGE_KEYS.CONTRACT, INITIAL_CONTRACT_SALARIES)
    let fixed = 0
    const next = contracts.map((ct) => {
      const m = sheetMonthKey(ct.month)
      const calDays = daysInCalendarMonth(m)
      const dayBase = calDays === 28 ? 28 : 30
      const salary = Number(ct.salary) || 0
      if (salary <= 0) return ct
      const expectedRate = Math.round((salary / dayBase) * 100) / 100
      const looksLike31 =
        calDays === 31 &&
        Math.abs((Number(ct.ratePerDay) || 0) - Math.round((salary / 31) * 100) / 100) <= 1
      if (
        looksLike31 ||
        Math.abs((Number(ct.ratePerDay) || 0) - expectedRate) > 1
      ) {
        fixed += 1
        return this.calculateContractSalaryRow(
          {
            ...ct,
            ratePerDay: expectedRate,
          },
          dayBase
        )
      }
      return ct
    })
    if (fixed > 0) this.saveContractSalaries(next, false)
    return fixed
  },

  /**
   * No-op: do not clobber live contract attendance with static seeds.
   */
  repairContractAttendanceFromSeed(this: PayrollService): number {
    return 0
  },

  /**
   * Ensure every active Contract roster person has a monthly row (no 1-15 rule).
   */
  repairMissingContractSheetRows(this: PayrollService): number {
    if (this.isClient() && !hydrated) return 0
    let all = this.readStore(STORAGE_KEYS.CONTRACT, INITIAL_CONTRACT_SALARIES)
    // Strip accidental fortnight on monthly contract rows (would trigger 1-15 hide).
    let changed = false
    all = all.map((ct) => {
      if ((ct as { fortnight?: string }).fortnight) {
        changed = true
        const { fortnight: _fn, ...rest } = ct as ContractSalaryRecord & { fortnight?: string }
        return rest as ContractSalaryRecord
      }
      return ct
    })

    const roster = this.getActiveEmployees().filter(
      (e) => inferEmployeeCategory(e) === 'Contract'
    )
    const months = new Set<string>([
      ...all.map((r) => sheetMonthKey(r.month)),
      this.getActiveSalariedMonth(),
    ])

    let added = 0
    const next = [...all]

    const hasRow = (m: string, emp: EmployeeProfile) =>
      next.some(
        (c) =>
          sheetMonthKey(c.month) === m &&
          (c.employeeId === emp.id || namesMatch(c.employeeName, emp.name))
      )

    for (const m of months) {
      if (!m) continue
      const days = daysInCalendarMonth(m)
      for (const emp of roster) {
        if (!employeeBelongsInMonth(emp, m)) continue
        if (hasRow(m, emp)) continue
        const peers = next.filter((c) => sheetMonthKey(c.month) === m)
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
              ticketCharges: 5,
              month: m,
            },
            days
          )
        )
        added += 1
        changed = true
      }
    }

    if (changed) {
      const renumbered = this.renumberByMonth(next)
      this.saveContractSalaries(renumbered, false)
    }
    return added
  },

  /**
   * No-op: do not clobber historical pay with seed.
   */
  repairHistoricalPayClobberedByProfile(this: PayrollService): void {
    return
  },

  /**
   * Remove duplicate people within the same month (and fortnight for daily-wage sheets).
   * Live often has two copies after localStorage mirror ∪ Postgres merge by id.
   */
  repairDuplicatePayrollRows(this: PayrollService): { removed: number } {
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
  },

}

export type RosterRepairMethods = typeof rosterRepairMethods
