/** Generate a salaried month or a weaver/helper/contractor fortnight from the roster. */
import { contractorSheetsFor, isMonthEndContractorRow } from '@/services/payroll/contractorPlan'
import {
  INITIAL_HELPERS_WAGES,
  INITIAL_WEAVERS_WAGES,
  INITIAL_CONTRACTORS,
} from '@/data/payrollSeeds'
import { STORAGE_KEYS } from '@/services/payroll/payrollConstants'
import {
  writeStoreAndWait,
  readHrMetaRaw,
  hydratePayrollFromDb,
  resetPayrollHydration,
} from '@/services/payroll/payrollStorage'
import {
  employeeBelongsInMonth,
  inferEmployeeCategory,
  weaverSheetFields,
  helperSheetFields,
  formatPayrollMonthLabel,
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

    // The server creates the month in one transaction (see /api/payroll/generate-month).
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
          message: data.message || `${formatPayrollMonthLabel(month)} ban gaya.`,
          staff: Number(data.staff) || 0,
          contract: Number(data.contract) || 0,
        }
      }
      return {
        ok: false,
        message: String(data?.error || data?.message || `Generate nahi hua (${res.status}).`),
        staff: 0,
        contract: 0,
      }
    } catch (err) {
      console.error('[payroll] generate-month API error', err)
      return { ok: false, message: 'Server se raabta nahi hua — internet check karke dobara karein.', staff: 0, contract: 0 }
    }
  },

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
        otRate: pay.otRate, // Winder 1400, Helper 1200 (or the profile's own OT rate)
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

}

export type MonthGenerationMethods = typeof monthGenerationMethods
