/** Month lock / unlock, pay slips and a person's salary history. */
import {
  EmployeeCategory,
  MonthLockInfo,
  EmployeePaySlip,
  EmployeeSalaryHistoryItem,
} from '@/types/payroll'
import {
  readMonthLock,
  isMonthLocked,
  writeMonthLockAsync,
} from '@/services/payroll/payrollStorage'
import { normalizeName } from '@/services/payroll/payrollCalculations'
import type { PayrollService } from '@/services/payrollService'

export const lockSlipMethods = {
  isMonthLocked(this: PayrollService, month: string): boolean {
    return isMonthLocked(month)
  },

  getMonthLock(this: PayrollService, month: string): MonthLockInfo | null {
    return readMonthLock(month)
  },

  async lockMonthAsync(
    this: PayrollService,
    month: string,
    actorName: string,
    notes?: string
  ): Promise<{ ok: boolean; summary?: MonthLockInfo['disbursalSummary'] }> {
    await this.loadPettyCashInflow(month, true)
    const grand = this.getMonthlyGrandSummary(month)
    const staff = this.getStaffSalaries(month)
    const weavers = this.getWeaversWages(month)
    const contract = this.getContractSalaries(month)
    const helpers = this.getHelpersWages(month)
    const contractors = this.getContractorsPayments(month)

    const empIds = new Set<string>()
    staff.forEach((s) => s.employeeName && empIds.add(s.employeeName.trim().toLowerCase()))
    weavers.forEach((w) => w.employeeName && empIds.add(w.employeeName.trim().toLowerCase()))
    contract.forEach((c) => c.employeeName && empIds.add(c.employeeName.trim().toLowerCase()))
    helpers.forEach((h) => h.employeeName && empIds.add(h.employeeName.trim().toLowerCase()))
    contractors.forEach((c) => c.name && empIds.add(c.name.trim().toLowerCase()))

    const staffTotal = staff.reduce((s, r) => s + (r.netCashAmount || r.synopsisAmount || 0), 0)
    const weaversTotal = weavers.reduce((s, r) => s + (r.netPay || 0), 0)
    const contractTotal = contract.reduce((s, r) => s + (r.netAmount || 0), 0)
    const helpersTotal = helpers.reduce((s, r) => s + (r.netAmount || 0), 0)
    const contractorsTotal = contractors.reduce((s, r) => s + (r.netPayment || 0), 0)

    const summary = {
      staffTotal,
      weaversTotal,
      contractTotal,
      helpersTotal,
      contractorsTotal,
      grandTotal: grand.monthlyTotalSalary,
      employeeCount: empIds.size,
    }

    const lockInfo: MonthLockInfo = {
      locked: true,
      lockedAt: new Date().toISOString(),
      lockedBy: actorName || 'Accounts Admin',
      notes: notes || 'Reconciled & Finalized for bank and floor cash disbursal',
      disbursalSummary: summary,
    }

    const ok = await writeMonthLockAsync(month, lockInfo)
    return { ok, summary }
  },

  async unlockMonthAsync(this: PayrollService, month: string, actorName: string): Promise<{ ok: boolean }> {
    const existing = readMonthLock(month)
    const lockInfo: MonthLockInfo = {
      locked: false,
      lockedAt: new Date().toISOString(),
      lockedBy: actorName || 'Accounts Admin',
      notes: `Unlocked for adjustments by ${actorName || 'Accounts Admin'}`,
      disbursalSummary: existing?.disbursalSummary,
    }
    const ok = await writeMonthLockAsync(month, lockInfo)
    return { ok }
  },

  generateEmployeePaySlip(this: PayrollService, month: string, employeeIdOrName: string): EmployeePaySlip | null {
    const employees = this.getEmployees()
    const norm = normalizeName(employeeIdOrName)
    const emp = employees.find(
      (e) => e.id === employeeIdOrName || normalizeName(e.name) === norm
    )
    const nameToMatch = emp ? emp.name : employeeIdOrName
    const finalNorm = normalizeName(nameToMatch)
    const locked = this.isMonthLocked(month)
    const lockInfo = this.getMonthLock(month)

    // 1. Check Staff Salaries
    const staffRows = this.getStaffSalaries(month)
    const staff = staffRows.find(
      (r) => (r.employeeId && emp && r.employeeId === emp.id) || normalizeName(r.employeeName) === finalNorm
    )
    if (staff) {
      return {
        month,
        slipNo: `ST-${month.replace('-', '')}-${String(staff.serialNo || 1).padStart(3, '0')}`,
        employeeId: emp?.id || staff.employeeId,
        employeeName: emp?.name || staff.employeeName,
        fatherName: emp?.fatherName,
        cnic: emp?.cnic,
        phone: emp?.phone,
        designation: staff.designation || emp?.designation || 'Staff',
        department: emp?.department || 'Administration',
        category: (emp?.employeeCategory as EmployeeCategory) || 'Staff',
        doj: emp?.doj,
        dutyHrs: emp?.dutyHrs || 9,
        attendanceDays: staff.attendanceDays || 0,
        ratePerDay: staff.ratePerDay || 0,
        basicSalary: staff.basicSalary || staff.salary || 0,
        otHours: staff.otHours || 0,
        otRate: staff.perHrRate || 0,
        otAmount: staff.otAmount || 0,
        grossAmount: staff.grossAmount || 0,
        advanceDeduction: staff.lessAdvance || 0,
        totalDeductions: staff.lessAdvance || 0,
        netPayable: staff.synopsisAmount || (staff.grossAmount - staff.lessAdvance),
        paymentMode: staff.chequeAmount > 0 ? 'Bank Cheque' : 'Cash',
        chequeAmount: staff.chequeAmount || 0,
        netCashAmount: staff.netCashAmount || (staff.grossAmount - staff.lessAdvance),
        isLocked: locked,
        lockedAt: lockInfo?.lockedAt,
        lockedBy: lockInfo?.lockedBy,
        remarks: emp?.remarks,
      }
    }

    // 2. Check Contract Salaries
    const contractRows = this.getContractSalaries(month)
    const contract = contractRows.find(
      (r) => (r.employeeId && emp && r.employeeId === emp.id) || normalizeName(r.employeeName) === finalNorm
    )
    if (contract) {
      const deductions =
        (contract.advanceDeduction || 0) + (contract.lateAmount || 0) + (contract.ticketCharges || 0)
      return {
        month,
        slipNo: `CT-${month.replace('-', '')}-${String(contract.serialNo || 1).padStart(3, '0')}`,
        employeeId: emp?.id || contract.employeeId,
        employeeName: emp?.name || contract.employeeName,
        fatherName: emp?.fatherName,
        cnic: emp?.cnic,
        phone: emp?.phone,
        designation: contract.designation || emp?.designation || 'Company Contract',
        department: emp?.department || 'Plant Operations',
        category: (emp?.employeeCategory as EmployeeCategory) || 'Contract',
        doj: emp?.doj,
        dutyHrs: emp?.dutyHrs || 12,
        attendanceDays: contract.attendanceDays || 0,
        ratePerDay: contract.ratePerDay || 0,
        basicSalary: contract.basicSalary || contract.salary || 0,
        otHours: contract.otHours || 0,
        otRate: contract.ratePerHr || 0,
        otAmount: contract.otAmount || 0,
        efficiencyAmount: contract.efficiencyAmount || 0,
        lateDeduction: contract.lateAmount || 0,
        advanceDeduction: contract.advanceDeduction || 0,
        ticketCharges: contract.ticketCharges || 0,
        grossAmount: contract.grossSalary || 0,
        totalDeductions: deductions,
        netPayable: contract.netAmount || (contract.grossSalary - deductions),
        paymentMode: 'Cash',
        netCashAmount: contract.netAmount || (contract.grossSalary - deductions),
        isLocked: locked,
        lockedAt: lockInfo?.lockedAt,
        lockedBy: lockInfo?.lockedBy,
        remarks: emp?.remarks,
      }
    }

    // 3. Check Weavers (Combine F1 + F2)
    const w1 = this.getWeaversWages(month, '1-15').find(
      (r) => (r.employeeId && emp && r.employeeId === emp.id) || normalizeName(r.employeeName) === finalNorm
    )
    const w2 = this.getWeaversWages(month, '16-31').find(
      (r) => (r.employeeId && emp && r.employeeId === emp.id) || normalizeName(r.employeeName) === finalNorm
    )
    if (w1 || w2) {
      const days = (w1?.attendanceDays || 0) + (w2?.attendanceDays || 0)
      const basic = (w1?.basicSalary || 0) + (w2?.basicSalary || 0)
      const extraAmount = (w1?.extraLoomAmount || 0) + (w2?.extraLoomAmount || 0)
      const allowance = (w1?.attendanceAllowance || 0) + (w2?.attendanceAllowance || 0)
      const holiday = (w1?.holidayAmount || 0) + (w2?.holidayAmount || 0)
      const eff = (w1?.efficiencyAmount || 0) + (w2?.efficiencyAmount || 0)
      const gross = (w1?.grossAmount || 0) + (w2?.grossAmount || 0)
      const net = (w1?.netPay || 0) + (w2?.netPay || 0)
      const desig = w2?.designation || w1?.designation || emp?.designation || 'Weaver'
      const rate = w2?.wagePerDay || w1?.wagePerDay || (desig === 'Spare Weaver' ? 1800 : 1450)

      return {
        month,
        slipNo: `WV-${month.replace('-', '')}-${String((w2 || w1)?.serialNo || 1).padStart(3, '0')}`,
        employeeId: emp?.id || (w2 || w1)?.employeeId,
        employeeName: emp?.name || (w2 || w1)?.employeeName || nameToMatch,
        fatherName: emp?.fatherName,
        cnic: emp?.cnic,
        phone: emp?.phone,
        designation: desig,
        department: emp?.department || 'Weaving Floor',
        category: 'Weaver',
        doj: emp?.doj,
        dutyHrs: emp?.dutyHrs || 12,
        attendanceDays: days,
        ratePerDay: rate,
        basicSalary: basic,
        extraLoomAmount: extraAmount,
        attendanceAllowance: allowance,
        holidayAmount: holiday,
        efficiencyAmount: eff,
        grossAmount: gross,
        advanceDeduction: 0,
        totalDeductions: 0,
        netPayable: net,
        paymentMode: 'Cash',
        netCashAmount: net,
        isLocked: locked,
        lockedAt: lockInfo?.lockedAt,
        lockedBy: lockInfo?.lockedBy,
        remarks: emp?.remarks,
      }
    }

    // 4. Check Helpers
    const h1 = this.getHelpersWages(month, '1-15').find(
      (r) => (r.employeeId && emp && r.employeeId === emp.id) || normalizeName(r.employeeName) === finalNorm
    )
    const h2 = this.getHelpersWages(month, '16-31').find(
      (r) => (r.employeeId && emp && r.employeeId === emp.id) || normalizeName(r.employeeName) === finalNorm
    )
    if (h1 || h2) {
      const days = (h1?.attendanceDays || 0) + (h2?.attendanceDays || 0)
      const basic = (h1?.wagesAmount || 0) + (h2?.wagesAmount || 0)
      const ot = (h1?.otAmount || 0) + (h2?.otAmount || 0)
      const net = (h1?.netAmount || 0) + (h2?.netAmount || 0)
      return {
        month,
        slipNo: `HL-${month.replace('-', '')}-${String((h2 || h1)?.serialNo || 1).padStart(3, '0')}`,
        employeeId: emp?.id || (h2 || h1)?.employeeId,
        employeeName: emp?.name || (h2 || h1)?.employeeName || nameToMatch,
        fatherName: emp?.fatherName,
        cnic: emp?.cnic,
        phone: emp?.phone,
        designation: (h2 || h1)?.designation || 'Helper',
        department: emp?.department || 'Weaving Helpers',
        category: 'Helper',
        doj: emp?.doj,
        dutyHrs: emp?.dutyHrs || 12,
        attendanceDays: days,
        ratePerDay: (h2 || h1)?.wagePerDay || 1050,
        basicSalary: basic,
        otAmount: ot,
        grossAmount: net,
        advanceDeduction: 0,
        totalDeductions: 0,
        netPayable: net,
        paymentMode: 'Cash',
        netCashAmount: net,
        isLocked: locked,
        lockedAt: lockInfo?.lockedAt,
        lockedBy: lockInfo?.lockedBy,
        remarks: emp?.remarks,
      }
    }

    return null
  },

  getEmployeeSalaryHistory(this: PayrollService, employeeIdOrName: string): EmployeeSalaryHistoryItem[] {
    const months = this.listPayrollMonths()
    const history: EmployeeSalaryHistoryItem[] = []
    for (const m of months) {
      const slip = this.generateEmployeePaySlip(m, employeeIdOrName)
      if (slip) {
        history.push({
          month: m,
          category: slip.category,
          designation: slip.designation,
          attendanceDays: slip.attendanceDays,
          basicSalary: slip.basicSalary,
          otAmount: slip.otAmount || 0,
          grossAmount: slip.grossAmount,
          advanceDeduction: slip.advanceDeduction || 0,
          netPayable: slip.netPayable,
          isLocked: slip.isLocked,
        })
      }
    }
    return history.sort((a, b) => b.month.localeCompare(a.month))
  },

}

export type LockSlipMethods = typeof lockSlipMethods
