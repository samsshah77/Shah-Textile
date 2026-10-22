'use client'

import { useState, useEffect } from 'react'
import { payrollService, formatPayrollMonthLabel } from '@/services/payrollService'
import { StaffSalaryRecord, CustomColumn, EmployeePaySlip } from '@/types/payroll'
import { AddColumnButton, CustomColumnHeader } from '@/components/shared/CustomColumnModal'
import { SerialCellWithInsert, reorderSerialRows } from '@/components/shared/InlineRowActions'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { useAuth } from '@/context/AuthContext'
import { formatCurrency, formatNumber, numberToWordsPKR, cn } from '@/lib/utils'
import {
  Users,
  Printer,
  DollarSign,
  Clock,
  Building,
  Trash2,
  Save,
  CheckCircle2,
  Calculator,
  X,
  Lock,
  FileSpreadsheet,
  FileText,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { ExportPdfButton } from '@/components/shared/ExportPdfButton'
import { NumericCellInput } from '@/components/shared/NumericCellInput'
import { PayrollMonthSelect } from '@/components/payroll/PayrollMonthSelect'
import { MonthLockButton } from '@/components/payroll/MonthLockBanner'
import { EmployeePaySlipModal } from '@/components/payroll/EmployeePaySlipModal'
import { PayrollSaveButton } from '@/components/payroll/PayrollSaveButton'
import { PayrollUnsavedBanner } from '@/components/payroll/PayrollUnsavedBanner'
import { usePayrollDirtyTracker } from '@/hooks/usePayrollDirtyTracker'
import { usePayrollModals } from '@/hooks/usePayrollModals'
import { removeRowConfirm, REMOVE_ROW_TITLE } from '@/components/payroll/removeRowConfirm'

const DEFAULT_STAFF_WIDTHS: Record<string, number> = {
  serial: 56,
  employeeName: 220,
  designation: 180,
  salary: 110,
  attendanceDays: 65,
  ratePerDay: 85,
  basicSalary: 100,
  perHrRate: 85,
  otHours: 75,
  otAmount: 95,
  grossAmount: 100,
  lessAdvance: 95,
  chequeAmount: 95,
  synopsisAmount: 95,
  netCashAmount: 115,
  action: 48,
}

export default function StaffSalariesPage() {
  const { canEditAccounts } = useAuth()
  const { askConfirm, showSuccess, modals } = usePayrollModals()
  const [staffList, setStaffList] = useState<StaffSalaryRecord[]>([])
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([])
  const [selectedMonth, setSelectedMonth] = useState(() => payrollService.getActiveSalariedMonth())
  // Staff Excel / General Wages use 30-day rate base (not calendar 31).
  const [daysInMonth, setDaysInMonth] = useState<number>(30)
  const [activeSlip, setActiveSlip] = useState<EmployeePaySlip | null>(null)

  const isLocked = payrollService.isMonthLocked(selectedMonth)
  const isEditable = canEditAccounts && !isLocked

  const {
    isCellDirty,
    isRowDirty,
    dirtyCount,
    hasUnsavedChanges,
    commitSaved,
    resetSnapshot,
    discardChanges,
    requestNavigationGuard,
  } = usePayrollDirtyTracker(staffList, selectedMonth, {
    sheetName: 'Staff Salary & OT',
    editableFields: ['attendanceDays', 'otHours', 'lessAdvance', 'chequeAmount'],
  })

  const { widths, setColumnWidth, resetColumnWidth, resetAllWidths } = useResizableColumns(
    'staff_salaries_v1',
    DEFAULT_STAFF_WIDTHS
  )

  const reload = (force = false) => {
    if (!force && hasUnsavedChanges) return
    const days = daysInMonth || 30
    const fresh = payrollService
      .getStaffSalaries(selectedMonth)
      .map((row) => payrollService.calculateStaffSalaryRow(row, days))
    setStaffList(fresh)
    resetSnapshot(fresh)
  }

  useEffect(() => {
    // Keep 30-day Staff base across months (Feb can be switched manually to 28).
    if (daysInMonth !== 28 && daysInMonth !== 30 && daysInMonth !== 31) {
      setDaysInMonth(30)
    }
    reload(true)
    const handleSync = (e: Event) => {
      const detailMonth = (e as CustomEvent<{ month?: string }>).detail?.month
      const next =
        detailMonth && /^\d{4}-\d{2}$/.test(detailMonth)
          ? detailMonth
          : payrollService.getActiveSalariedMonth()
      if (next !== selectedMonth) {
        setSelectedMonth(next)
        return
      }
      reload()
    }
    window.addEventListener('payroll_synced', handleSync)
    return () => window.removeEventListener('payroll_synced', handleSync)
  }, [selectedMonth, daysInMonth])

  // Handle cell edit with live reactive calculation
  const handleCellChange = (
    index: number,
    field: keyof StaffSalaryRecord,
    value: string | number
  ) => {
    if (!canEditAccounts) return
    setStaffList((prev) => {
      const updated = [...prev]
      const current = { ...updated[index], [field]: value }
      const recalculated = payrollService.calculateStaffSalaryRow(current, daysInMonth)
      updated[index] = recalculated
      return updated
    })
  }

  const handleCustomCellChange = (index: number, colId: string, value: string) => {
    if (!canEditAccounts) return
    setStaffList((prev) => {
      const updated = [...prev]
      const currentCustom = updated[index].customFields || {}
      updated[index] = {
        ...updated[index],
        customFields: { ...currentCustom, [colId]: value },
      }
      return updated
    })
  }

  // Insert row anywhere with auto-renumber (inserts BELOW selected row)
  const handleInsertRow = (insertIdx?: number) => {
    if (!canEditAccounts) return
    const raw: StaffSalaryRecord = {
      id: `staff-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      serialNo: (insertIdx !== undefined ? insertIdx + 2 : staffList.length + 1),
      employeeName: 'New Staff Member',
      designation: 'Staff',
      salary: 30000,
      attendanceDays: daysInMonth,
      ratePerDay: 30000 / daysInMonth,
      basicSalary: 30000,
      perHrRate: 30000 / 240,
      otHours: 0,
      otAmount: 0,
      grossAmount: 30000,
      lessAdvance: 0,
      chequeAmount: 0,
      synopsisAmount: 30000,
      netCashAmount: 30000,
      month: selectedMonth,
    }
    const newRecord = payrollService.calculateStaffSalaryRow(raw, daysInMonth)

    const updated = [...staffList]
    if (insertIdx !== undefined) {
      updated.splice(insertIdx + 1, 0, newRecord)
    } else {
      updated.push(newRecord)
    }

    const renumbered = updated.map((item, idx) => ({ ...item, serialNo: idx + 1 }))
    setStaffList(renumbered)
    payrollService.saveStaffSalaries(renumbered)
  }

  const handleMoveRow = (index: number, direction: 'up' | 'down') => {
    if (!canEditAccounts) return
    const next = reorderSerialRows(staffList, index, direction)
    if (!next) return
    setStaffList(next)
    payrollService.saveStaffSalaries(next)
  }

  // Delete row and auto-renumber with confirmation
  const handleDeleteRow = (id: string) => {
    if (!canEditAccounts) return
    const row = staffList.find((item) => item.id === id)
    if (!row) return
    const empName = row?.employeeName || 'Staff Member'
    askConfirm({
      ...removeRowConfirm(empName, 'is mahine ki Staff sheet'),
      onConfirm: () => {
        const updated = staffList
          .filter((item) => item.id !== id)
          .map((item, idx) => ({ ...item, serialNo: idx + 1 }))
        setStaffList(updated)
        payrollService.saveStaffSalaries(updated)
      },
    })
  }

  const handleAddCustomColumn = (col: CustomColumn) => {
    setCustomColumns((prev) => [...prev, col])
  }

  const handleUpdateCustomColumn = (updated: CustomColumn) => {
    setCustomColumns((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
  }

  const handleRemoveCustomColumn = (colId: string) => {
    setCustomColumns((prev) => prev.filter((c) => c.id !== colId))
  }

  const handleSave = () => {
    if (!canEditAccounts) return
    askConfirm({
      title: 'Save staff salaries?',
      message: 'Staff salary calculations save ho jayengi.',
      confirmText: 'Save',
      onConfirm: () => {
        payrollService.saveStaffSalaries(staffList)
        commitSaved(staffList)
        showSuccess('Saved', 'Staff salaries successfully saved.')
      },
    })
  }

  const handleDiscard = () => {
    askConfirm({
      title: 'Discard unsaved changes?',
      message: 'Unsaved edits revert ho jayenge. Proceed karein?',
      confirmText: 'Discard',
      onConfirm: () => {
        setStaffList(discardChanges())
      },
    })
  }


  const totalBasic = staffList.reduce((s, st) => s + (st.basicSalary || 0), 0)
  const totalOT = staffList.reduce((s, st) => s + (st.otAmount || 0), 0)
  const totalGross = staffList.reduce((s, st) => s + (st.grossAmount || 0), 0)
  const totalAdvance = staffList.reduce((s, st) => s + (st.lessAdvance || 0), 0)
  const totalCheque = staffList.reduce((s, st) => s + (st.chequeAmount || 0), 0)
  const totalSynopsis = staffList.reduce((s, st) => s + (st.synopsisAmount || 0), 0)
  const totalNetCash = staffList.reduce((s, st) => s + (st.netCashAmount || 0), 0)

  const handlePrint = () => {
    if (typeof window !== 'undefined') window.print()
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="print:hidden">
        <PageHeader
          title="Staff Salaries"
          showTitle={false}
          breadcrumbs={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Payroll', href: '/payroll/staff' },
            { label: 'Staff Salaries' },
          ]}
          actions={
            <>
              <div className="inline-flex shrink-0 items-center gap-1.5">
                <PayrollMonthSelect
                  value={selectedMonth}
                  disabled={!canEditAccounts}
                  onChange={
                    canEditAccounts
                      ? (m) => {
                          if (m === selectedMonth) return
                          if (hasUnsavedChanges) {
                            askConfirm({
                              title: 'Unsaved Changes',
                              message:
                                'Aap ke paas unsaved changes hain. Agar aap month change karein ge toh unsaved changes zaya ho jayengi. Proceed karein?',
                              confirmText: 'Discard & Switch',
                              onConfirm: async () => {
                                await payrollService.setActiveSalariedMonthAsync(m)
                                setSelectedMonth(m)
                              },
                            })
                            return
                          }
                          payrollService.setActiveSalariedMonthAsync(m).then(() => setSelectedMonth(m))
                        }
                      : undefined
                  }
                />
                <select
                  value={daysInMonth}
                  disabled={!canEditAccounts}
                  onChange={(e) => {
                    const days = Number(e.target.value)
                    if (days === daysInMonth) return
                    requestNavigationGuard(() => {
                      setDaysInMonth(days)
                      setStaffList((prev) =>
                        prev.map((row) => payrollService.calculateStaffSalaryRow(row, days))
                      )
                    })
                  }}
                  className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc]/40"
                  aria-label="Days in month"
                >
                  <option value={30}>30 Days</option>
                  <option value={31}>31 Days</option>
                  <option value={28}>28 Days</option>
                </select>
              </div>
              <div className="inline-flex shrink-0 items-center gap-1.5">
                <AddColumnButton onAddColumn={handleAddCustomColumn} />

                <PayrollSaveButton
                  onClick={handleSave}
                  disabled={!isEditable}
                  dirtyCount={dirtyCount}
                />
                <MonthLockButton month={selectedMonth} onStatusChange={reload} />
                <button
                  type="button"
                  onClick={handlePrint}
                  className="erp-btn-secondary text-xs !min-h-9 !h-9 !text-slate-800"
                >
                  <Printer className="size-3.5" />
                  <span>Print</span>
                </button>
                <ExportPdfButton filename={`Staff-Salary-${selectedMonth}`} className="!min-h-9 !h-9" />
              </div>
            </>
          }
        />
      </div>

      {/* Safety Notice if Editing is Disabled */}
      {!canEditAccounts && (
        <div className="flex items-center gap-2.5 p-3 rounded-md border border-amber-200 bg-amber-50/50 text-amber-900 text-xs font-medium print:hidden">
          <Lock className="size-4 shrink-0 text-amber-600" />
          <span>
            Edit Protection Active: Click <strong>&quot;Enable Editing&quot;</strong> in the top navigation bar to modify staff salaries, overtime, or insert rows.
          </span>
        </div>
      )}

      {/* Unsaved changes banner */}
      <PayrollUnsavedBanner
        dirtyCount={dirtyCount}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />

      {modals}

      {/* Interactive Live Spreadsheet Table */}
      <div className="rounded-lg border border-slate-200 bg-white text-slate-900 p-5 shadow-xs print:border-none print:p-0 print:shadow-none font-sans overflow-hidden">
        <div className="text-center border-b border-slate-200 pb-3 mb-4">
          <h1 className="text-lg font-bold uppercase text-slate-900 tracking-wide">SARA TEXTILES</h1>
          <h2 className="text-sm font-semibold text-slate-700 mt-0.5">STAFF SALARIES AND OVERTIME STATEMENT</h2>
          <p className="text-[11px] text-slate-500 font-mono">
            Statement for Month: {formatPayrollMonthLabel(selectedMonth)} ({daysInMonth} Days Base)
          </p>
        </div>

        <div className="overflow-x-auto rounded-md border border-slate-200 shadow-xs">
          <table
            style={{
              minWidth: `${Math.max(
                1200,
                Object.values(widths).reduce((s, w) => s + w, 0) +
                  customColumns.reduce((s, c) => s + (c.width || 120), 0)
              )}px`,
            }}
            className="w-full text-left border-collapse text-xs font-mono"
          >
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 font-semibold uppercase text-[11px] text-slate-600">
                <ResizableTh
                  columnKey="serial"
                  width={widths.serial}
                  minWidth={45}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 py-2 px-1 text-center"
                  title="Hover the row to move it up or down"
                >
                  S.#
                </ResizableTh>

                <ResizableTh
                  columnKey="employeeName"
                  width={widths.employeeName}
                  minWidth={130}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 py-2 px-3 font-sans"
                >
                  Employee Name
                </ResizableTh>

                <ResizableTh
                  columnKey="designation"
                  width={widths.designation}
                  minWidth={110}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 py-2 px-3 font-sans"
                >
                  Designation
                </ResizableTh>

                <ResizableTh
                  columnKey="salary"
                  width={widths.salary}
                  minWidth={90}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 py-2 px-2 text-right"
                >
                  Salary (Base)
                </ResizableTh>

                <ResizableTh
                  columnKey="attendanceDays"
                  width={widths.attendanceDays}
                  minWidth={55}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 py-2 px-1 text-center"
                >
                  Attn
                </ResizableTh>

                <ResizableTh
                  columnKey="ratePerDay"
                  width={widths.ratePerDay}
                  minWidth={75}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 py-2 px-2 text-right whitespace-nowrap"
                >
                  Per Day
                </ResizableTh>

                <ResizableTh
                  columnKey="basicSalary"
                  width={widths.basicSalary}
                  minWidth={85}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 py-2 px-2 text-right font-semibold text-slate-900 whitespace-nowrap"
                >
                  Basic
                </ResizableTh>

                <ResizableTh
                  columnKey="perHrRate"
                  width={widths.perHrRate}
                  minWidth={75}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 py-2 px-2 text-right whitespace-nowrap"
                >
                  Per Hr
                </ResizableTh>

                <ResizableTh
                  columnKey="otHours"
                  width={widths.otHours}
                  minWidth={60}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 py-2 px-1 text-center"
                >
                  O/T Hrs
                </ResizableTh>

                <ResizableTh
                  columnKey="otAmount"
                  width={widths.otAmount}
                  minWidth={85}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 py-2 px-2 text-right font-semibold text-slate-900 whitespace-nowrap"
                >
                  O/T Amt
                </ResizableTh>

                <ResizableTh
                  columnKey="grossAmount"
                  width={widths.grossAmount}
                  minWidth={90}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 py-2 px-2 text-right font-semibold text-slate-900 whitespace-nowrap"
                >
                  Gross
                </ResizableTh>

                <ResizableTh
                  columnKey="lessAdvance"
                  width={widths.lessAdvance}
                  minWidth={85}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 py-2 px-2 text-right text-red-600 whitespace-nowrap"
                >
                  Less Adv
                </ResizableTh>

                <ResizableTh
                  columnKey="chequeAmount"
                  width={widths.chequeAmount}
                  minWidth={85}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 py-2 px-2 text-right text-slate-700 whitespace-nowrap"
                >
                  Cheque
                </ResizableTh>

                <ResizableTh
                  columnKey="synopsisAmount"
                  width={widths.synopsisAmount}
                  minWidth={85}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 py-2 px-2 text-right font-semibold text-slate-900 whitespace-nowrap"
                >
                  Synopsis
                </ResizableTh>

                <ResizableTh
                  columnKey="netCashAmount"
                  width={widths.netCashAmount}
                  minWidth={100}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 py-2 px-2 text-right font-bold text-[#0066cc] whitespace-nowrap"
                >
                  Net Cash
                </ResizableTh>
                
                {/* Custom Columns */}
                {customColumns.map((col) => (
                  <CustomColumnHeader
                    key={col.id}
                    column={col}
                    onUpdateColumn={handleUpdateCustomColumn}
                    onRemoveColumn={handleRemoveCustomColumn}
                  />
                ))}

                <ResizableTh
                  columnKey="action"
                  width={widths.action}
                  minWidth={45}
                  enableResize={false}
                  className="py-2 px-1 text-center print:hidden"
                >
                  Action
                </ResizableTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {staffList.map((st, idx) => (
                <tr
                  key={st.id}
                  className={cn(
                    'text-slate-800 hover:bg-slate-50/80 transition-colors',
                    isRowDirty(st.id) && 'payroll-row-dirty'
                  )}
                >
                  <SerialCellWithInsert
                    serialNo={st.serialNo}
                    index={idx}
                    onMoveUp={(i) => handleMoveRow(i, 'up')}
                    onMoveDown={(i) => handleMoveRow(i, 'down')}
                    canMoveUp={idx > 0}
                    canMoveDown={idx < staffList.length - 1}
                  />
                  
                  {/* Name — from HR / General Wages */}
                  <td
                    style={{ width: `${widths.employeeName}px`, minWidth: `${widths.employeeName}px` }}
                    className="border-r border-slate-100 py-1.5 px-2 bg-slate-50"
                    title="From HR Profiles / General Wages"
                  >
                    <span className="font-semibold font-sans text-xs text-slate-500">{st.employeeName}</span>
                  </td>

                  {/* Designation — from HR / General Wages */}
                  <td
                    style={{ width: `${widths.designation}px`, minWidth: `${widths.designation}px` }}
                    className="border-r border-slate-100 py-1.5 px-2 bg-slate-50"
                    title="From HR Profiles / General Wages"
                  >
                    <span className="font-sans text-xs text-slate-500">{st.designation}</span>
                  </td>

                  {/* Salary — from HR / General Wages */}
                  <td
                    style={{ width: `${widths.salary}px`, minWidth: `${widths.salary}px` }}
                    className="border-r border-slate-100 py-1.5 px-2 text-right bg-slate-50"
                    title="From HR Profiles / General Wages"
                  >
                    <span className="font-semibold text-xs text-slate-500">{formatNumber(st.salary, 0)}</span>
                  </td>

                  {/* Attendance Days (Editable) */}
                  <td
                    style={{ width: `${widths.attendanceDays}px`, minWidth: `${widths.attendanceDays}px` }}
                    className="border-r border-slate-100 py-1 px-1 text-center"
                  >
                    <NumericCellInput
                      value={st.attendanceDays || 0}
                      disabled={!isEditable}
                      isDirty={isCellDirty(st.id, 'attendanceDays')}
                      navRow={idx}
                      navCol={0}
                      onValueChange={(v) => handleCellChange(idx, 'attendanceDays', v)}
                      className="w-full text-center bg-transparent px-1 py-0.5 font-semibold text-xs focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded text-slate-800"
                    />
                  </td>

                  {/* Calculated Per Day */}
                  <td
                    style={{ width: `${widths.ratePerDay}px`, minWidth: `${widths.ratePerDay}px` }}
                    className="border-r border-slate-100 py-1.5 px-2 text-right text-slate-500 whitespace-nowrap bg-slate-50"
                    title="Auto: Salary ÷ Days"
                  >
                    {formatNumber(st.ratePerDay, 2)}
                  </td>

                  {/* Calculated Basic */}
                  <td
                    style={{ width: `${widths.basicSalary}px`, minWidth: `${widths.basicSalary}px` }}
                    className="border-r border-slate-100 py-1.5 px-2 text-right font-semibold text-slate-500 whitespace-nowrap bg-slate-50"
                    title="Auto: Attn × Rate Per Day"
                  >
                    {formatNumber(st.basicSalary, 0)}
                  </td>

                  {/* Calculated Hourly Rate */}
                  <td
                    style={{ width: `${widths.perHrRate}px`, minWidth: `${widths.perHrRate}px` }}
                    className="border-r border-slate-100 py-1.5 px-2 text-right text-slate-500 whitespace-nowrap bg-slate-50"
                    title="Auto: Salary ÷ 240"
                  >
                    {formatNumber(st.perHrRate, 2)}
                  </td>

                  {/* Overtime Hours (Editable) */}
                  <td
                    style={{ width: `${widths.otHours}px`, minWidth: `${widths.otHours}px` }}
                    className="border-r border-slate-100 py-1 px-1 text-center"
                  >
                    <NumericCellInput
                      value={st.otHours || 0}
                      disabled={!isEditable}
                      isDirty={isCellDirty(st.id, 'otHours')}
                      navRow={idx}
                      navCol={1}
                      onValueChange={(v) => handleCellChange(idx, 'otHours', v)}
                      className="w-full text-center bg-transparent px-1 py-0.5 font-semibold text-xs focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded text-slate-900"
                    />
                  </td>

                  {/* Calculated OT Amount */}
                  <td
                    style={{ width: `${widths.otAmount}px`, minWidth: `${widths.otAmount}px` }}
                    className="border-r border-slate-100 py-1.5 px-2 text-right font-semibold text-slate-900 whitespace-nowrap"
                  >
                    {formatNumber(st.otAmount, 0)}
                  </td>

                  {/* Calculated Gross Amount */}
                  <td
                    style={{ width: `${widths.grossAmount}px`, minWidth: `${widths.grossAmount}px` }}
                    className="border-r border-slate-100 py-1.5 px-2 text-right font-semibold text-slate-900 whitespace-nowrap"
                  >
                    {formatNumber(st.grossAmount, 0)}
                  </td>

                  {/* Less Advance (Editable) */}
                  <td
                    style={{ width: `${widths.lessAdvance}px`, minWidth: `${widths.lessAdvance}px` }}
                    className="border-r border-slate-100 py-1 px-1"
                  >
                    <NumericCellInput
                      value={st.lessAdvance || 0}
                      disabled={!isEditable}
                      isDirty={isCellDirty(st.id, 'lessAdvance')}
                      navRow={idx}
                      navCol={2}
                      onValueChange={(v) => handleCellChange(idx, 'lessAdvance', v)}
                      className="w-full text-right bg-transparent px-2 py-0.5 font-semibold text-xs text-red-600 focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded"
                    />
                  </td>

                  {/* Cheque Amount (Editable) */}
                  <td
                    style={{ width: `${widths.chequeAmount}px`, minWidth: `${widths.chequeAmount}px` }}
                    className="border-r border-slate-100 py-1 px-1"
                  >
                    <NumericCellInput
                      value={st.chequeAmount || 0}
                      disabled={!isEditable}
                      isDirty={isCellDirty(st.id, 'chequeAmount')}
                      navRow={idx}
                      navCol={3}
                      onValueChange={(v) => handleCellChange(idx, 'chequeAmount', v)}
                      className="w-full text-right bg-transparent px-2 py-0.5 font-semibold text-xs text-slate-700 focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded"
                    />
                  </td>

                  {/* Calculated Synopsis Amount */}
                  <td
                    style={{ width: `${widths.synopsisAmount}px`, minWidth: `${widths.synopsisAmount}px` }}
                    className="border-r border-slate-100 py-1.5 px-2 text-right font-semibold text-slate-900 whitespace-nowrap"
                  >
                    {formatNumber(st.synopsisAmount, 0)}
                  </td>

                  {/* Calculated Net Cash Amount */}
                  <td
                    style={{ width: `${widths.netCashAmount}px`, minWidth: `${widths.netCashAmount}px` }}
                    className="border-r border-slate-100 py-1.5 px-2 text-right font-bold text-sm text-[#0066cc] whitespace-nowrap"
                  >
                    {formatNumber(st.netCashAmount, 0)}
                  </td>

                  {/* Custom Column Cells */}
                  {customColumns.map((col) => {
                    const cWidth = col.width || 120
                    return (
                      <td
                        key={col.id}
                        style={{ width: `${cWidth}px`, minWidth: `${cWidth}px` }}
                        className="border-r border-slate-100 py-1 px-1 text-slate-700"
                      >
                        <input
                          type="text"
                          value={st.customFields?.[col.id] || ''}
                          disabled={!canEditAccounts}
                          onChange={(e) => handleCustomCellChange(idx, col.id, e.target.value)}
                          placeholder="—"
                          className={cn(
                            'w-full bg-transparent px-1 py-0.5 font-medium font-sans text-xs focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded text-center transition-colors',
                            isCellDirty(st.id, `cf_${col.id}`, st.customFields?.[col.id]) &&
                              'payroll-cell-dirty'
                          )}
                        />
                      </td>
                    )
                  })}

                  {/* Action */}
                  <td
                    style={{ width: `${widths.action}px`, minWidth: `${widths.action}px` }}
                    className="py-1 px-1 text-center print:hidden"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const slip = payrollService.generateEmployeePaySlip(selectedMonth, st.id)
                          setActiveSlip(slip)
                        }}
                        title="View Official Salary Slip / پرچی"
                        className="p-1 text-slate-400 hover:text-[#0066cc] transition-colors cursor-pointer"
                      >
                        <FileText className="size-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteRow(st.id)}
                        disabled={!isEditable}
                        title={REMOVE_ROW_TITLE}
                        className="p-1 text-slate-400 hover:text-red-600 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold text-slate-900 text-xs">
                <td colSpan={6} className="border-r border-slate-200 py-2.5 px-2 font-sans uppercase">
                  Totals & Live Formula Sums:
                </td>
                <td className="border-r border-slate-200 py-2.5 px-2 text-right font-semibold">
                  {formatNumber(totalBasic, 0)}
                </td>
                <td className="border-r border-slate-200 py-2.5 px-2 text-right text-slate-400">-</td>
                <td className="border-r border-slate-200 py-2.5 px-1 text-center font-semibold">
                  {staffList.reduce((s, st) => s + Number(st.otHours || 0), 0)}
                </td>
                <td className="border-r border-slate-200 py-2.5 px-2 text-right font-semibold">
                  {formatNumber(totalOT, 0)}
                </td>
                <td className="border-r border-slate-200 py-2.5 px-2 text-right font-semibold">
                  {formatNumber(totalGross, 0)}
                </td>
                <td className="border-r border-slate-200 py-2.5 px-2 text-right font-semibold text-red-600">
                  {formatNumber(totalAdvance, 0)}
                </td>
                <td className="border-r border-slate-200 py-2.5 px-2 text-right font-semibold text-slate-800">
                  {formatNumber(totalCheque, 0)}
                </td>
                <td className="border-r border-slate-200 py-2.5 px-2 text-right font-semibold">
                  {formatNumber(totalSynopsis, 0)}
                </td>
                <td className="border-r border-slate-200 py-2.5 px-2 text-right font-bold text-sm text-[#0066cc]">
                  {formatNumber(totalNetCash, 0)}
                </td>
                {customColumns.map((col) => (
                  <td key={col.id} className="border-r border-slate-200 py-2.5 px-2 text-center font-sans text-[10px] text-slate-500 font-semibold">
                    —
                  </td>
                ))}
                <td className="py-2.5 px-1 text-center font-sans text-[10px] print:hidden">OK</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Prominent Calculated Staff Total in Words */}
        <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 font-sans print:border-none print:p-2">
          <div>
            <span className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider">Net Cash Disbursal in Words (PKR):</span>
            <div className="text-xs font-semibold text-slate-900 mt-0.5">{numberToWordsPKR(totalNetCash)}</div>
          </div>
          <div className="sm:text-right border-t sm:border-t-0 border-slate-200 pt-2 sm:pt-0 w-full sm:w-auto">
            <span className="text-[11px] font-semibold uppercase text-slate-500">Calculated Net Cash Payout:</span>
            <div className="text-lg font-bold text-[#0066cc]">{formatCurrency(totalNetCash)}</div>
          </div>
        </div>
      </div>

      {/* Formula Explanation Alert at Bottom */}
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700 print:hidden">
        <div className="flex items-center gap-2 font-semibold text-slate-900 mb-1">
          <Calculator className="size-3.5 text-[#0066cc]" />
          <span>Live Formulas Applied:</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-[11px] text-slate-600">
          <div>• <span className="font-semibold text-slate-800">Basic</span> = Attn × Rate Per Day</div>
          <div>• <span className="font-semibold text-slate-800">OT Amt</span> = OT Hrs × (Salary ÷ 240)</div>
          <div>• <span className="font-semibold text-slate-800">Gross</span> = Basic + OT Amt</div>
          <div>• <span className="font-semibold text-slate-800">Synopsis</span> = Gross - Less Advance</div>
          <div>• <span className="font-semibold text-slate-800">Net Cash</span> = Synopsis - Cheque Amount</div>
          <div>• <span className="font-semibold text-slate-800">Per Day</span> = Salary ÷ {daysInMonth}</div>
        </div>
      </div>
      {/* Employee Pay Slip Modal */}
      {activeSlip && (
        <EmployeePaySlipModal
          slip={activeSlip}
          onClose={() => setActiveSlip(null)}
        />
      )}
    </div>
  )
}
