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

import {
  INITIAL_STAFF_SALARIES,
  INITIAL_ADVANCES,
  INITIAL_HELPERS_WAGES,
  INITIAL_WEAVERS_WAGES,
  INITIAL_CONTRACT_SALARIES,
  INITIAL_CONTRACTORS,
  INITIAL_EFFICIENCY_INCENTIVES,
  INITIAL_EMPLOYEES,
  INITIAL_PETTY_CASH,
  getPayrollSeedStore,
} from '@/data/payrollSeeds'

export { getPayrollSeedStore }

// Re-export constants, storage, calculations, reports, and cycle generators
export * from './payroll/payrollConstants'
export * from './payroll/payrollStorage'
export * from './payroll/payrollCalculations'
export * from './payroll/payrollReports'
export * from './payroll/payrollCycles'

import {
  STORAGE_KEYS,
  DEFAULT_HR_CATEGORIES,
  DEFAULT_HR_DESIGNATIONS,
} from './payroll/payrollConstants'

import {
  memoryStore,
  hydrated,
  allowServerSheetWrite,
  isPayrollClient,
  readStore,
  writeStore,
  writeStoreAndWait,
  readLocalMirror,
  writeLocalMirror,
  persistPayrollKey,
  readHrMetaRaw,
  writeHrMeta,
  isTombstonedEmployee,
  rememberDeletedEmployee,
  registerPostHydrateHook,
  dedupeRowsByKey,
  advancePersonMonthKey,
  salariedPersonMonthKey,
  fortnightPersonMonthKey,
  setHydrated,
  setAllowServerSheetWrite,
  hydratePayrollFromDb,
  resetPayrollHydration,
  defaultPettyCashInflow,
  pettyCashInflowMetaKey,
} from './payroll/payrollStorage'

import {
  daysInCalendarMonth,
  sheetMonthKey,
  isTargetPayMonth,
  isActiveEmployee,
  parseResignationDateFromRemarks,
  resolveResignedAt,
  resignedMonth,
  parseDojToIso,
  joiningMonth,
  employeeBelongsInMonth,
  todayIsoDate,
  normalizeName,
  namesMatch,
  jobFamily,
  inferEmployeeCategory,
  isGeneralWagesEmployee,
  matchesHrCategoryFilter,
  findSmartInsertionIndex,
  weaverSheetFields,
  helperSheetFields,
  sameJobFamily,
  findLinkedEmployee,
  sheetRowBelongsToEmployee,
  formatPayrollMonthLabel,
  calculateStaffSalaryRow,
  calculateContractSalaryRow,
  calculateEfficiencyRow,
  calculateWeaverWageRow,
  calculateHelperWageRow,
  calculateContractorPaymentRow,
} from './payroll/payrollCalculations'

import {
  buildFortnightSynopsis,
  buildMonthlyGrandSummary,
} from './payroll/payrollReports'

class PayrollService {
  /** Previous name, so a renamed person still matches their wage-sheet row. */
  private profileAliases = new Map<string, string>()

  constructor() {
    registerPostHydrateHook(() => {
      try {
        this.repairHistoricalPayClobberedByProfile()
      } catch (e) {
        console.error('[payroll] historical pay repair skipped', e)
      }
      try {
        this.repairCorruptedStaffChequeAmounts()
      } catch (e) {
        console.error('[payroll] staff cheque repair skipped', e)
      }
      try {
        this.repairCorruptedContractRates()
      } catch (e) {
        console.error('[payroll] contract rate repair skipped', e)
      }
      try {
        this.repairContractAttendanceFromSeed()
      } catch (e) {
        console.error('[payroll] contract attendance seed repair skipped', e)
      }
      try {
        this.repairDuplicatePayrollRows()
      } catch (e) {
        console.error('[payroll] duplicate repair skipped', e)
      }
      try {
        this.purgeAllJoinersFromPastMonths()
      } catch (e) {
        console.error('[payroll] joiner purge skipped', e)
      }
      try {
        this.purgeAllResignedFortnightCuts()
      } catch (e) {
        console.error('[payroll] resigned fortnight purge skipped', e)
      }
      try {
        this.repairMissingFortnightWageRows()
      } catch (e) {
        console.error('[payroll] missing fortnight wage repair skipped', e)
      }
      try {
        this.repairMissingContractSheetRows()
      } catch (e) {
        console.error('[payroll] missing contract repair skipped', e)
      }
    })
  }

  private isClient(): boolean {
    return isPayrollClient()
  }

  private canWrite(): boolean {
    return this.isClient() || allowServerSheetWrite
  }

  private readStore<T>(key: string, fallback: T[]): T[] {
    return readStore(key, fallback)
  }

  // ==========================================
  // FORMULA CALCULATION UTILITIES (LIVE EXCEL MATH)
  // ==========================================

  calculateStaffSalaryRow(
    row: Partial<StaffSalaryRecord>,
    daysInMonth = 30,
    matchedEmp?: EmployeeProfile
  ): StaffSalaryRecord {
    const emp =
      matchedEmp ||
      findLinkedEmployee(
        this.getEmployees(),
        row.employeeName,
        row.designation,
        row.employeeId
      )
    return calculateStaffSalaryRow(row, daysInMonth, this.getActiveSalariedMonth(), emp)
  }

  calculateContractSalaryRow(
    row: Partial<ContractSalaryRecord>,
    daysInMonth = 30,
    matchedEmp?: EmployeeProfile
  ): ContractSalaryRecord {
    const emp =
      matchedEmp ||
      findLinkedEmployee(
        this.getEmployees(),
        row.employeeName,
        row.designation,
        row.employeeId
      )
    return calculateContractSalaryRow(row, daysInMonth, this.getActiveSalariedMonth(), emp)
  }

  calculateEfficiencyRow(row: Partial<EfficiencyIncentiveRecord>): EfficiencyIncentiveRecord {
    return calculateEfficiencyRow(row)
  }

  calculateWeaverWageRow(row: Partial<WeaverWageRecord>): WeaverWageRecord {
    return calculateWeaverWageRow(row)
  }

  calculateHelperWageRow(row: Partial<HelperWageRecord>): HelperWageRecord {
    return calculateHelperWageRow(row)
  }

  calculateContractorPaymentRow(row: Partial<ContractorPaymentRecord>): ContractorPaymentRecord {
    return calculateContractorPaymentRow(row)
  }

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
    const cleaned = repaired.filter((e) => !isTombstonedEmployee(e.id, e.name))
    const removedTombstones = cleaned.length !== repaired.length
    if ((changed || removedTombstones) && this.isClient() && hydrated) {
      writeStore(STORAGE_KEYS.EMPLOYEES, cleaned)
    }
    return cleaned
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
    const staffDays = days === 28 ? 28 : 30
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
        staffDays
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
    const weaverPeople = roster
      .filter((e) => inferEmployeeCategory(e) === 'Weaver')
      .filter((e) => employeeBelongsInMonth(e, month, fortnight))
    const helperPeople = roster
      .filter((e) => inferEmployeeCategory(e) === 'Helper')
      .filter((e) => employeeBelongsInMonth(e, month, fortnight))
    const contractorPeople = roster
      .filter((e) => inferEmployeeCategory(e) === 'Contractor')
      .filter((e) => employeeBelongsInMonth(e, month, fortnight))

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

  private filterRowsForMonth<
    T extends {
      employeeName?: string
      name?: string
      designation?: string
      employeeId?: string
      contractType?: string
      fortnight?: string
      serialNo?: number | null
    }
  >(
    rows: T[],
    month: string,
    nameKey: 'employeeName' | 'name' = 'employeeName',
    _fortnight?: string
  ): T[] {
    const roster = this.getEmployees()
    const filtered = rows.filter((row) => {
      const rowName = nameKey === 'name' ? row.name : row.employeeName
      // Prefer id / Active on duplicate names (new Dawood vs resigned Dawood).
      // No naive roster.find name fallback — that bound rows to the wrong namesake.
      const emp = findLinkedEmployee(
        roster,
        rowName,
        row.designation || row.contractType,
        row.employeeId
      )
      // Day>15 / resign-day hide ONLY on real fortnight sheets (1-15 / 16-31).
      const rowFortnight =
        row.fortnight === '1-15' || row.fortnight === '16-31' ? row.fortnight : undefined
      return employeeBelongsInMonth(emp, month, rowFortnight)
    })
    return filtered.map((row, idx) =>
      row.serialNo !== undefined && row.serialNo !== null ? { ...row, serialNo: idx + 1 } : row
    )
  }

  /** Drop a resigned person from months after resign, and from 16-31 if resign day ≤ 15. */
  purgeResignedFromFutureMonths(emp: EmployeeProfile): void {
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
  }

  /**
   * Drop a new joiner from every sheet month BEFORE their DOJ month
   * (e.g. Sep joiner must not remain on August Staff / Advances / etc.).
   */
  purgeJoinerFromPastMonths(emp: EmployeeProfile): void {
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

  /** Apply resign-day fortnight rules (e.g. resign ≤15 → drop from 16-31) for all resigned. */
  purgeAllResignedFortnightCuts(): number {
    if (this.isClient() && !hydrated) return 0
    let count = 0
    for (const emp of this.getEmployees()) {
      if ((emp.status || 'Active') !== 'Resigned') continue
      this.purgeResignedFromFutureMonths(emp)
      count += 1
    }
    return count
  }

  /**
   * Ensure every active Weaver/Helper is on every existing fortnight sheet they belong to.
   * Fixes live gaps (e.g. Winder on 1-15 but missing from 16-31 after the helper save bug).
   */
  repairMissingFortnightWageRows(): number {
    if (this.isClient() && !hydrated) return 0
    const weaverMonths = [
      ...new Set(
        this.readStore(STORAGE_KEYS.WEAVERS, INITIAL_WEAVERS_WAGES).map((r) => sheetMonthKey(r.month))
      ),
    ]
    const helperMonths = [
      ...new Set(
        this.readStore(STORAGE_KEYS.HELPERS, INITIAL_HELPERS_WAGES).map((r) => sheetMonthKey(r.month))
      ),
    ]
    const months = [...new Set([...weaverMonths, ...helperMonths, this.getActiveSalariedMonth()])]
    let touched = 0
    for (const emp of this.getActiveEmployees()) {
      const cat = inferEmployeeCategory(emp)
      if (cat !== 'Weaver' && cat !== 'Helper') continue
      for (const m of months) {
        if (!m || !employeeBelongsInMonth(emp, m)) continue
        const beforeW =
          cat === 'Weaver'
            ? this.readStore(STORAGE_KEYS.WEAVERS, INITIAL_WEAVERS_WAGES).length
            : this.readStore(STORAGE_KEYS.HELPERS, INITIAL_HELPERS_WAGES).length
        this.placeOnDailyWageSheets(emp, m)
        const afterW =
          cat === 'Weaver'
            ? this.readStore(STORAGE_KEYS.WEAVERS, INITIAL_WEAVERS_WAGES).length
            : this.readStore(STORAGE_KEYS.HELPERS, INITIAL_HELPERS_WAGES).length
        if (afterW !== beforeW) touched += 1
      }
    }
    return touched
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
   * Fix Contract rows to Excel Sheet 4 / General Wages 30-day rate base
   * (calendar 31 was wrongly forced before and broke September Staff/Contract).
   */
  repairCorruptedContractRates(): number {
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
  }

  /**
   * Restore Contract Excel Sheet 4 rows from seed when live attendance was wiped to 0,
   * or efficiency/net drifted from the Excel snapshot (e.g. Sep Sheet 4).
   */
  repairContractAttendanceFromSeed(): number {
    if (this.isClient() && !hydrated) return 0
    const contracts = this.readStore(STORAGE_KEYS.CONTRACT, INITIAL_CONTRACT_SALARIES)
    let fixed = 0
    const next = contracts.map((ct) => {
      const m = sheetMonthKey(ct.month)
      const seed = INITIAL_CONTRACT_SALARIES.find(
        (s) =>
          sheetMonthKey(s.month) === m &&
          (namesMatch(s.employeeName, ct.employeeName) ||
            (s.employeeId && ct.employeeId && s.employeeId === ct.employeeId))
      )
      if (!seed || (Number(seed.attendanceDays) || 0) <= 0) return ct
      const liveAttn = Number(ct.attendanceDays) || 0
      const seedAttn = Number(seed.attendanceDays) || 0
      const liveEff = Number(ct.efficiencyAmount) || 0
      const seedEff = Number(seed.efficiencyAmount) || 0
      // Restore empty rows; Sep Excel snapshot also fixes wiped attendance / efficiency.
      // Do NOT key off netAmount — nets are always Gross−Late−Advance−Ticket (OT-era seed nets differ).
      const needsRestore =
        liveAttn <= 0 ||
        (m === '2026-09' && (liveAttn !== seedAttn || liveEff !== seedEff))
      if (!needsRestore) return ct
      fixed += 1
      const dayBase = daysInCalendarMonth(m) === 28 ? 28 : 30
      return this.calculateContractSalaryRow(
        {
          ...ct,
          salary: seed.salary ?? ct.salary,
          attendanceDays: seed.attendanceDays,
          ratePerDay: seed.ratePerDay,
          ratePerHr: seed.ratePerHr,
          basicSalary: seed.basicSalary,
          lateHours: seed.lateHours ?? 0,
          lateAmount: seed.lateAmount ?? 0,
          otHours: seed.otHours ?? 0,
          otAmount: seed.otAmount ?? 0,
          efficiencyAmount: seedEff,
          // Keep live advance if already entered (Dawood etc.); seed only as fallback.
          advanceDeduction:
            Number(ct.advanceDeduction) > 0
              ? ct.advanceDeduction
              : (seed.advanceDeduction ?? 0),
          ticketCharges: seed.ticketCharges ?? ct.ticketCharges,
          grossSalary: seed.grossSalary,
        },
        dayBase
      )
    })
    if (fixed > 0) this.saveContractSalaries(next, false)
    return fixed
  }

  /**
   * Re-add Contract salary rows wiped by the old mid-month (day>15) purge bug,
   * and ensure every active Contract roster person has a monthly row (no 1-15 rule).
   */
  repairMissingContractSheetRows(): number {
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
      ...INITIAL_CONTRACT_SALARIES.map((r) => sheetMonthKey(r.month)),
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
        const seed = INITIAL_CONTRACT_SALARIES.find(
          (s) =>
            sheetMonthKey(s.month) === m &&
            (namesMatch(s.employeeName, emp.name) ||
              (s.employeeId && emp.id && s.employeeId === emp.id))
        )
        const peers = next.filter((c) => sheetMonthKey(c.month) === m)
        next.push(
          this.calculateContractSalaryRow(
            {
              ...(seed || {}),
              id: seed?.id || `ct-${m}-${emp.id}`,
              serialNo: peers.length + 1,
              employeeId: emp.id,
              employeeName: emp.name,
              designation: emp.designation,
              salary: seed?.salary ?? emp.salary,
              attendanceDays: seed?.attendanceDays ?? 0,
              otHours: seed?.otHours ?? 0,
              lateHours: seed?.lateHours ?? 0,
              efficiencyAmount: seed?.efficiencyAmount ?? 0,
              advanceDeduction: seed?.advanceDeduction ?? 0,
              ticketCharges: seed?.ticketCharges ?? 5,
              month: m,
            },
            days
          )
        )
        added += 1
        changed = true
      }

      // Historical seed people still on roster name-match for that month
      for (const seed of INITIAL_CONTRACT_SALARIES.filter((s) => sheetMonthKey(s.month) === m)) {
        const emp =
          findLinkedEmployee(roster, seed.employeeName, seed.designation, seed.employeeId) ||
          roster.find((e) => namesMatch(e.name, seed.employeeName))
        if (!emp) continue
        if (!employeeBelongsInMonth(emp, m)) continue
        if (hasRow(m, emp)) continue
        const peers = next.filter((c) => sheetMonthKey(c.month) === m)
        next.push(
          this.calculateContractSalaryRow(
            {
              ...seed,
              serialNo: peers.length + 1,
              employeeId: emp.id,
              employeeName: emp.name,
              designation: emp.designation || seed.designation,
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
    if (!target) return
    if ((target.status || 'Active') !== 'Resigned') {
      throw new Error('Sirf Resigned profile delete ho sakti hai. Pehle Resign karein.')
    }
    rememberDeletedEmployee(target)
    const remaining = list.filter((e) => e.id !== id)
    writeStore(STORAGE_KEYS.EMPLOYEES, remaining)
    this.removeLinkedPayrollRows(target)
    this.renumberGeneralWages()
    this.notifyDataChanged()
  }

  async deleteEmployeeAsync(id: string): Promise<void> {
    await hydratePayrollFromDb()
    const list = this.getEmployees()
    const target = list.find((e) => e.id === id)
    if (!target) return
    if ((target.status || 'Active') !== 'Resigned') {
      throw new Error('Sirf Resigned profile delete ho sakti hai. Pehle Resign karein.')
    }
    rememberDeletedEmployee(target)
    const remaining = list.filter((e) => e.id !== id)
    await writeStoreAndWait(STORAGE_KEYS.EMPLOYEES, remaining)
    this.removeLinkedPayrollRows(target)
    this.renumberGeneralWages()
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
    const roster = this.getEmployees()
    const unlink = (name?: string, designation?: string, employeeId?: string) =>
      sheetRowBelongsToEmployee(emp, name, designation, employeeId, roster)

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
    // Monthly advance sheet: belong by DOJ/resign month only — never 1-15 mid-month hide.
    // findLinkedEmployee prefers Active on duplicate names (new Dawood vs resigned Dawood).
    const roster = this.getEmployees()
    return filtered
      .filter((row) => {
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
  }

  saveAdvances(list: AdvanceRecord[], triggerCascade: boolean = true, month?: string, fortnight?: string): void {
    void this.saveAdvancesAsync(list, triggerCascade, month, fortnight)
  }

  async saveAdvancesAsync(
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
      'employeeName',
      fortnight
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
      'employeeName',
      fortnight
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
      'name',
      fortnight
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
    return buildFortnightSynopsis(month, fortnight, this)
  }

  getMonthlyGrandSummary(month: string = '2026-08'): MonthlyGrandSalarySynopsis {
    return buildMonthlyGrandSummary(month, this)
  }

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
  setAllowServerSheetWrite(true)
  try {
    payrollService.syncMasterRoster()
  } finally {
    setAllowServerSheetWrite(false)
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
  setHydrated(true)
  setAllowServerSheetWrite(true)
  try {
    payrollService.repairCorruptedStaffChequeAmounts()
    payrollService.repairCorruptedContractRates()
    payrollService.repairContractAttendanceFromSeed()
    payrollService.repairDuplicatePayrollRows()
    payrollService.purgeAllJoinersFromPastMonths()
    payrollService.purgeAllResignedFortnightCuts()
    payrollService.repairMissingFortnightWageRows()
    payrollService.repairMissingContractSheetRows()
  } finally {
    setAllowServerSheetWrite(false)
    setHydrated(prevHydrated)
  }
  const changed: Record<string, unknown> = {}
  for (const [key, value] of memoryStore) {
    if (snapshot.get(key) !== value) changed[key] = JSON.parse(value) as unknown
  }
  memoryStore.clear()
  for (const [key, value] of previous) memoryStore.set(key, value)
  return changed
}
