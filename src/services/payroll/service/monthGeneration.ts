/** Generate a salaried month or a weaver/helper/contractor fortnight from the roster. */
import { contractorSheetsFor, isMonthEndContractorRow } from '@/services/payroll/contractorPlan'
import {
  INITIAL_STAFF_SALARIES,
  INITIAL_HELPERS_WAGES,
  INITIAL_WEAVERS_WAGES,
  INITIAL_CONTRACT_SALARIES,
  INITIAL_CONTRACTORS,
  INITIAL_EFFICIENCY_INCENTIVES,
} from '@/data/payrollSeeds'
import { STORAGE_KEYS } from '@/services/payroll/payrollConstants'
import {
  hydrated,
  writeStoreAndWait,
  readHrMetaRaw,
  isTombstonedEmployee,
  hydratePayrollFromDb,
  resetPayrollHydration,
} from '@/services/payroll/payrollStorage'
import {
  daysInCalendarMonth,
  sheetMonthKey,
  employeeBelongsInMonth,
  inferEmployeeCategory,
  isGeneralWagesEmployee,
  weaverSheetFields,
  helperSheetFields,
  formatPayrollMonthLabel,
  namesMatch,
} from '@/services/payroll/payrollCalculations'
import type { PayrollService } from '@/services/payrollService'

export const monthGenerationMethods = {
  /**
   * Seed Staff + Company Contract salary sheets for a new month from General Wages roster.
   * Prefers server API (direct Postgres write) so refresh cannot wipe September back to August.
   */
  async generateSalariedMonth(this: PayrollService, targetMonth: string): Promise<{
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
  },

  async generateSalariedMonthClientFallback(this: PayrollService, month: string): Promise<{
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
      // Copy last month's list, minus people whose profile now says "not on Efficiency".
      const offEfficiency = this.getEmployees().filter((e) => e.efficiencyEligible === false)
      const template = allEff.filter(
        (r) =>
          r.month === sourceMonth &&
          !offEfficiency.some((e) => r.employeeId === e.id || (!r.employeeId && namesMatch(r.name, e.name)))
      )
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
  },

  /**
   * Seed Weaver + Helper + Contractor sheets for a fortnight (attendance/amounts zero).
   * Connects Weavers → Helpers → Contractors → Net Payment / Synopsis for that 15-day cycle.
   */
  async generateFortnightCycle(
    this: PayrollService,
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
    // Contractor rows may already exist (the Contractors page fills them from profiles),
    // so only Weaver / Helper rows decide whether this fortnight was generated.
    if (weaverExists || helperExists) {
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
    // Whole month: contractorSheetsFor decides the 1–15 / month-end sheets per person.
    const contractorPeople = roster
      .filter((e) => inferEmployeeCategory(e) === 'Contractor')
      .filter((e) => employeeBelongsInMonth(e, month))

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

    // Contractors follow the profile: everyone on the 1–30/31 sheet (created once, by
    // whichever half runs first); "also paid in 1–15" people on the 1–15 sheet too.
    const midMonthContractors =
      fortnight === '1-15'
        ? contractorPeople.filter(
            (e) =>
              contractorSheetsFor(e, month).includes('1-15') &&
              !allContractors.some(
                (r) => r.month === month && r.fortnight === '1-15' && r.employeeId === e.id
              )
          )
        : []
    const monthEndContractors = contractorPeople.filter(
      (e) =>
        contractorSheetsFor(e, month).includes('1-31') &&
        !allContractors.some(
          (r) => r.month === month && isMonthEndContractorRow(r) && r.employeeId === e.id
        )
    )
    const monthEndCount = allContractors.filter((r) => r.month === month && isMonthEndContractorRow(r)).length
    const newContractors = [
      ...midMonthContractors.map((emp, i) => this.newContractorRow(emp, month, '1-15', i + 1)),
      ...monthEndContractors.map((emp, i) =>
        this.newContractorRow(emp, month, '1-31', monthEndCount + i + 1)
      ),
    ]

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
  },

  /**
   * Ensure every active Weaver/Helper is on every existing fortnight sheet they belong to.
   * Fixes live gaps (e.g. Winder on 1-15 but missing from 16-31 after the helper save bug).
   */
  repairMissingFortnightWageRows(this: PayrollService): number {
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
      if (isTombstonedEmployee(emp.id, emp.name)) continue
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
  },

}

export type MonthGenerationMethods = typeof monthGenerationMethods
