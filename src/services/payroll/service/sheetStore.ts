/** Read / save each salary sheet (advances, staff, contract, efficiency, weavers, helpers, contractors). */
import { isMonthEndContractorRow } from '@/services/payroll/contractorPlan'
import {
  AdvanceRecord,
  StaffSalaryRecord,
  ContractSalaryRecord,
  EfficiencyIncentiveRecord,
  WeaverWageRecord,
  HelperWageRecord,
  ContractorPaymentRecord,
} from '@/types/payroll'
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
  writeStore,
  writeStoreAndWait,
  isTombstonedEmployee,
  dedupeRowsByKey,
  advancePersonMonthKey,
} from '@/services/payroll/payrollStorage'
import {
  sheetMonthKey,
  employeeBelongsInMonth,
  namesMatch,
  findLinkedEmployee,
} from '@/services/payroll/payrollCalculations'
import type { PayrollService } from '@/services/payrollService'

export const sheetStoreMethods = {
  // Cross-table synchronization: Advance ➔ Staff / Contract / Contractor Tables
  syncAdvanceToSalaries(this: PayrollService, employeeNameOrId: string, month: string = '2026-08', newAmount: number): void {
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
        // Advance is taken once, on the month-end (1–30/31) payment — never on 1–15 too.
        return this.calculateContractorPaymentRow({
          ...c,
          lessAdvance: isMonthEndContractorRow(c) ? newAmount : 0,
        })
      }
      return c
    })
    if (contractorUpdated) this.saveContractorsPayments(updatedContractors, false)

    this.notifyDataChanged(month)
  },

  // Cross-table synchronization: Efficiency ➔ Contract Salaries / Weaver Wages
  syncEfficiencyToSalaries(
    this: PayrollService,
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
  },

  // ==========================================
  // ADVANCES (WITH AUTOMATIC CASCADING SYNC)
  // ==========================================

  getAdvances(this: PayrollService, month: string = '2026-08', fortnight?: string): AdvanceRecord[] {
    const list = this.readStore(STORAGE_KEYS.ADVANCES, INITIAL_ADVANCES)
    // Same person twice in one month is shown once (saving the sheet then stores it once).
    const { list: deduped } = dedupeRowsByKey(list, advancePersonMonthKey)
    let filtered = deduped.filter((a) => sheetMonthKey(a.month) === sheetMonthKey(month))
    if (fortnight && fortnight !== 'all') {
      filtered = filtered.filter((a) => (a.fortnight || '1-15') === fortnight)
    }
    // Monthly advance sheet: belong by DOJ/resign month only — never 1-15 mid-month hide.
    // findLinkedEmployee prefers Active on duplicate names (new Dawood vs resigned Dawood).
    const roster = this.getEmployees()
    return filtered
      .filter((row) => {
        if (isTombstonedEmployee(row.employeeId, row.employeeName)) return false
        const emp = findLinkedEmployee(
          roster,
          row.employeeName,
          row.designation,
          row.employeeId
        )
        return employeeBelongsInMonth(emp, month)
      })
      .map((row, idx) =>
        row.serialNo !== undefined && row.serialNo !== null
          ? { ...row, serialNo: idx + 1 }
          : row
      )
  },

  saveAdvances(this: PayrollService, list: AdvanceRecord[], triggerCascade: boolean = true, month?: string, fortnight?: string): void {
    void this.saveAdvancesAsync(list, triggerCascade, month, fortnight)
  },

  async saveAdvancesAsync(
    this: PayrollService,
    list: AdvanceRecord[],
    triggerCascade: boolean = true,
    month?: string,
    fortnight?: string
  ): Promise<boolean> {
    if (!this.canWrite()) return false
    let cleaned: AdvanceRecord[] = list
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

      cleaned = this.renumberByMonth(dedupeRowsByKey(masterList, advancePersonMonthKey).list)
    } catch (err) {
      console.error(err)
      cleaned = list
    }

    const ok = await writeStoreAndWait(STORAGE_KEYS.ADVANCES, cleaned)
    if (triggerCascade) {
      this.syncAllAdvanceTotals(month || list[0]?.month || '2026-08')
    } else {
      this.notifyDataChanged(month)
    }
    return ok
  },

  syncAllAdvanceTotals(this: PayrollService, month: string = '2026-08'): void {
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
              // Once, on the month-end payment (as in the Excel) — not again on 1–15.
              lessAdvance: isMonthEndContractorRow(c) ? totalFor(c.name, c.contractType, c.employeeId) : 0,
            })
          : c
      ),
      false
    )

    this.notifyDataChanged(month)
  },

  // ==========================================
  // STAFF SALARIES
  // ==========================================

  getStaffSalaries(this: PayrollService, month: string = '2026-08'): StaffSalaryRecord[] {
    const list = this.readStore(STORAGE_KEYS.STAFF, INITIAL_STAFF_SALARIES)
    return this.filterRowsForMonth(
      list.filter((s) => s.month === month),
      month,
      'employeeName'
    )
  },

  saveStaffSalaries(this: PayrollService, list: StaffSalaryRecord[], broadcast: boolean = true): void {
    if (this.canWrite()) {
      const existing = this.readStore(STORAGE_KEYS.STAFF, INITIAL_STAFF_SALARIES)
      const incomingMonths = new Set(list.map((r) => r.month).filter(Boolean))
      const kept = existing.filter(
        (r) => !list.some((n) => n.id === r.id) && !(r.month && incomingMonths.has(r.month))
      )
      writeStore(STORAGE_KEYS.STAFF, [...kept, ...list])
      if (broadcast) this.notifyDataChanged()
    }
  },

  // ==========================================
  // CONTRACT SALARIES
  // ==========================================

  getContractSalaries(this: PayrollService, month: string = '2026-08'): ContractSalaryRecord[] {
    const list = this.readStore(STORAGE_KEYS.CONTRACT, INITIAL_CONTRACT_SALARIES)
    return this.filterRowsForMonth(
      list.filter((c) => c.month === month),
      month,
      'employeeName'
    )
  },

  saveContractSalaries(this: PayrollService, monthOrList: string | ContractSalaryRecord[], listOrBroadcast?: ContractSalaryRecord[] | boolean, broadcast: boolean = true): void {
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
  },

  syncContractBasicsToEfficiency(this: PayrollService, contractList: ContractSalaryRecord[]): void {
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
    // Never cascade amount→contract here: that pushed sheet amount 0 back onto
    // Contract net-payment efficiency the user just typed, wiping it on Save/refresh.
    if (changed) this.saveEfficiencyIncentives(updated, false)
  },

  // ==========================================
  // EFFICIENCY INCENTIVES
  // ==========================================

  getEfficiencyIncentives(this: PayrollService, month: string = '2026-08'): EfficiencyIncentiveRecord[] {
    const list = this.readStore(STORAGE_KEYS.EFFICIENCY, INITIAL_EFFICIENCY_INCENTIVES)
    return this.filterRowsForMonth(
      list.filter((e) => e.month === month),
      month,
      'name'
    )
  },

  saveEfficiencyIncentives(this: PayrollService, list: EfficiencyIncentiveRecord[], triggerCascade: boolean = true): void {
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
  },

  // ==========================================
  // WEAVERS WAGES
  // ==========================================

  getWeaversWages(this: PayrollService, month: string = '2026-08', fortnight?: '1-15' | '16-31'): WeaverWageRecord[] {
    const list = this.readStore(STORAGE_KEYS.WEAVERS, INITIAL_WEAVERS_WAGES)
    return this.filterRowsForMonth(
      list.filter((w) => w.month === month && (!fortnight || w.fortnight === fortnight)),
      month,
      'employeeName',
      fortnight
    )
  },

  saveWeaversWages(
    this: PayrollService,
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
  },

  // ==========================================
  // HELPERS WAGES
  // ==========================================

  getHelpersWages(this: PayrollService, month: string = '2026-08', fortnight?: '1-15' | '16-31'): HelperWageRecord[] {
    const list = this.readStore(STORAGE_KEYS.HELPERS, INITIAL_HELPERS_WAGES)
    return this.filterRowsForMonth(
      list.filter((h) => h.month === month && (!fortnight || h.fortnight === fortnight)),
      month,
      'employeeName',
      fortnight
    )
  },

  saveHelpersWages(
    this: PayrollService,
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
  },

  // ==========================================
  // CONTRACTORS PAYMENTS
  // ==========================================

  getContractorsPayments(
    this: PayrollService,
    month: string = '2026-08',
    fortnight?: '1-15' | '16-31' | '1-31'
  ): ContractorPaymentRecord[] {
    const list = this.readStore(STORAGE_KEYS.CONTRACTORS, INITIAL_CONTRACTORS)
    return this.filterRowsForMonth(
      list.filter((c) => c.month === month && (!fortnight || c.fortnight === fortnight)),
      month,
      'name',
      fortnight
    )
  },

  /** 1–30/31 sheet: month-end rows ("1-31", plus "16-31" rows saved before the change). */
  getContractorsMonthEnd(this: PayrollService, month: string): ContractorPaymentRecord[] {
    const list = this.readStore(STORAGE_KEYS.CONTRACTORS, INITIAL_CONTRACTORS)
    return this.filterRowsForMonth(
      list.filter((c) => c.month === month && isMonthEndContractorRow(c)),
      month,
      'name'
    )
  },

  /** Replace the month-end rows of `month`; other months and the 1–15 sheet stay as they are. */
  saveContractorsMonthEnd(this: PayrollService, month: string, rows: ContractorPaymentRecord[]): void {
    if (!this.canWrite()) return
    const all = this.readStore(STORAGE_KEYS.CONTRACTORS, INITIAL_CONTRACTORS)
    const incoming = rows.map((r) => ({
      ...r,
      month,
      fortnight: isMonthEndContractorRow(r) ? r.fortnight : ('1-31' as const),
    }))
    writeStore(STORAGE_KEYS.CONTRACTORS, [
      ...all.filter((r) => !(r.month === month && isMonthEndContractorRow(r))),
      ...incoming,
    ])
    this.notifyDataChanged()
  },

  saveContractorsPayments(
    this: PayrollService,
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
  },

}

export type SheetStoreMethods = typeof sheetStoreMethods
