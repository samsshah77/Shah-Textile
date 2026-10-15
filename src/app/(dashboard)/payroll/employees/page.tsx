'use client'

import { useState, useEffect, useRef } from 'react'
import {
  payrollService,
  isGeneralWagesEmployee,
  employeeBelongsInMonth,
  resolveResignedAt,
  formatPayrollMonthLabel,
  hydratePayrollFromDb,
} from '@/services/payrollService'
import { EmployeeProfile, CustomColumn } from '@/types/payroll'
import { AddColumnButton, CustomColumnHeader } from '@/components/shared/CustomColumnModal'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { useAuth } from '@/context/AuthContext'
import { formatCurrency, formatNumber, cn } from '@/lib/utils'
import {
  Printer,
  Save,
  CheckCircle2,
  Lock,
  ChevronUp,
  ChevronDown,
  CalendarPlus,
  X,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { ExportPdfButton } from '@/components/shared/ExportPdfButton'
import { NumericCellInput } from '@/components/shared/NumericCellInput'
import { PayrollMonthSelect } from '@/components/payroll/PayrollMonthSelect'
import { usePayrollModals } from '@/hooks/usePayrollModals'
import { usePayrollDirtyTracker } from '@/hooks/usePayrollDirtyTracker'
import { PayrollSaveButton } from '@/components/payroll/PayrollSaveButton'
import { PayrollUnsavedBanner } from '@/components/payroll/PayrollUnsavedBanner'

const DEFAULT_GW_WIDTHS: Record<string, number> = {
  serial: 48,
  name: 180,
  designation: 140,
  dutyHrs: 70,
  shiftFromTo: 75,
  salary: 95,
  ratePerDay31: 85,
  ratePerHr31: 75,
  ratePerDay30: 85,
  ratePerHr30: 75,
  ratePerDay28: 85,
  ratePerHr28: 75,
  doj: 95,
  contractStatus: 125,
  remarks: 140,
}

const COMMON_GW_DESIGNATIONS = [
  'Quality Controller',
  'Supervisor',
  'Incharge',
  'Senior Technician',
  'Electrician',
  'Assistant Technician',
  'Oil Man',
  'Time Keeper',
  'Folding',
  'Sweeper',
]

export default function GeneralWagesPage() {
  const { canEditAccounts } = useAuth()
  const { askConfirm, showSuccess, showError, modals } = usePayrollModals()
  const [employees, setEmployees] = useState<EmployeeProfile[]>([])
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([])
  const [statusNotice, setStatusNotice] = useState<string | null>(null)
  const [showGenerateDialog, setShowGenerateDialog] = useState(false)
  const [newMonth, setNewMonth] = useState(() => {
    const months = payrollService.listPayrollMonths()
    const last = months[months.length - 1] || '2026-08'
    const [y, m] = last.split('-').map(Number)
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
    return next
  })
  const [activeMonth, setActiveMonth] = useState(() => payrollService.getActiveSalariedMonth())

  const crossSheetSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Identity only — salary/wages are month-owned on Staff/Contract sheets (never push via roster save).
  const CROSS_SHEET_FIELDS: Array<keyof EmployeeProfile> = ['name', 'designation', 'dutyHrs']

  const persistRoster = (gwList: EmployeeProfile[]) => {
    const all = payrollService.getEmployees()
    const gwIds = new Set(gwList.map((e) => e.id))
    const others = all.filter((e) => !gwIds.has(e.id))
    const renumberedGw = gwList.map((e, i) => ({ ...e, serialNo: i + 1 }))
    const startOther = renumberedGw.length + 1
    const renumberedOthers = others.map((e, i) => ({ ...e, serialNo: startOther + i }))
    payrollService.saveEmployees([...renumberedGw, ...renumberedOthers])
  }

  /** Month-scoped pay for the active salary month (Aug can stay 36000 while Sep is 40000). */
  const monthPay = (emp: EmployeeProfile) =>
    payrollService.getEmployeeCompensationForMonth(emp, activeMonth)

  const { widths, setColumnWidth, resetColumnWidth } = useResizableColumns(
    'general_wages_excel_exact_v1',
    DEFAULT_GW_WIDTHS
  )

  const {
    isCellDirty,
    isRowDirty,
    dirtyCount,
    hasUnsavedChanges,
    commitSaved,
    resetSnapshot,
    discardChanges,
    requestNavigationGuard,
  } = usePayrollDirtyTracker(employees, activeMonth, {
    sheetName: 'General Wages',
    editableFields: ['remarks'],
  })

  const reload = (force = false) => {
    if (!force && hasUnsavedChanges) return
    payrollService.renumberGeneralWages()
    const month = payrollService.getActiveSalariedMonth()
    const all = payrollService.getEmployees()
    // Month view follows DOJ: Sep joiners hidden when active month is August.
    // Changing DOJ on HR Profile + Save updates the stored sheets.
    const activeGw = all
      .filter(isGeneralWagesEmployee)
      .filter((e) => employeeBelongsInMonth(e, month))
      .sort((a, b) => a.serialNo - b.serialNo)
      .map((e, i) => ({ ...e, serialNo: i + 1 }))
    setEmployees(activeGw)
    resetSnapshot(activeGw)
    setActiveMonth(month)
  }

  const handleActiveMonthChange = (month: string) => {
    if (!canEditAccounts || month === activeMonth) return
    requestNavigationGuard(async () => {
      await payrollService.setActiveSalariedMonthAsync(month)
      setActiveMonth(month)
      reload(true)
      setStatusNotice(`Active month: ${formatPayrollMonthLabel(month)}`)
      setTimeout(() => setStatusNotice(null), 2500)
    })
  }

  const openGenerateDialog = () => {
    if (!canEditAccounts) return
    setShowGenerateDialog(true)
  }

  const confirmGenerateMonth = () => {
    if (!canEditAccounts) return
    const monthToGenerate = newMonth
    const label = formatPayrollMonthLabel(monthToGenerate)
    setShowGenerateDialog(false)
    askConfirm({
      title: 'Generate salary month?',
      message: (
        <>
          <strong>{label}</strong> generate hoga — Staff / Contract / Advances / Net Payment isi month pe shift ho jayenge.
        </>
      ),
      confirmText: 'Generate',
      onConfirm: async () => {
        const result = await payrollService.generateSalariedMonth(monthToGenerate)
        if (result.ok) {
          setActiveMonth(payrollService.getActiveSalariedMonth())
          reload()
          const months = payrollService.listPayrollMonths()
          const last = months[months.length - 1] || monthToGenerate
          const [y, m] = last.split('-').map(Number)
          const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
          setNewMonth(next)
          showSuccess('Month generated', result.message)
        } else {
          showError('Generate failed', result.message)
        }
      },
    })
  }

  // Move employee up/down and permanently persist the new order
  const handleMove = (empId: string, direction: 'up' | 'down') => {
    if (!canEditAccounts) return
    const scopeIds = employees.map((e) => e.id)
    payrollService.moveEmployee(empId, direction, scopeIds)
    reload()
    setStatusNotice('Row position updated and saved.')
    setTimeout(() => setStatusNotice(null), 2000)
  }

  useEffect(() => {
    let cancelled = false
    const boot = async () => {
      await hydratePayrollFromDb()
      if (cancelled) return
      reload()
    }
    void boot()
    const handleSync = () => {
      reload()
      setActiveMonth(payrollService.getActiveSalariedMonth())
    }
    window.addEventListener('payroll_synced', handleSync)
    return () => {
      cancelled = true
      window.removeEventListener('payroll_synced', handleSync)
      if (crossSheetSyncTimer.current) clearTimeout(crossSheetSyncTimer.current)
    }
  }, [])

  // Handle live inline editing on any cell
  const handleCellChange = (
    index: number,
    field: keyof EmployeeProfile,
    value: string | number
  ) => {
    if (!canEditAccounts) return
    setEmployees((prev) => {
      const updated = [...prev]
      const current = { ...updated[index], [field]: value }
      if (field === 'salary' || field === 'dutyHrs') {
        const sal = Number(current.salary) || 0
        const duty = Number(current.dutyHrs) || 8
        current.ratePerDay31 = Math.round((sal / 31) * 100) / 100
        current.ratePerDay30 = Math.round((sal / 30) * 100) / 100
        current.ratePerHr30 = Math.round((sal / (30 * duty)) * 100) / 100
        current.ratePerDay28 = Math.round((sal / 28) * 100) / 100
      }
      updated[index] = current
      if (CROSS_SHEET_FIELDS.includes(field)) {
        if (crossSheetSyncTimer.current) clearTimeout(crossSheetSyncTimer.current)
        crossSheetSyncTimer.current = setTimeout(() => persistRoster(updated), 450)
      }
      return updated
    })
  }

  const handleCustomCellChange = (index: number, colId: string, value: string) => {
    if (!canEditAccounts) return
    setEmployees((prev) => {
      const updated = [...prev]
      const currentCustom = updated[index].customFields || {}
      updated[index] = {
        ...updated[index],
        customFields: { ...currentCustom, [colId]: value },
      }
      return updated
    })
  }

  const handleAddCustomColumn = (col: CustomColumn) => {
    setCustomColumns((prev) => [...prev, col])
  }

  const handleUpdateCustomColumn = (updated: CustomColumn) => {
    setCustomColumns((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
  }

  const handleDeleteCustomColumn = (colId: string) => {
    setCustomColumns((prev) => prev.filter((c) => c.id !== colId))
  }

  const handleSave = () => {
    if (!canEditAccounts) return
    askConfirm({
      title: 'Save General Wages?',
      message: 'Employee roster save hoga aur related sheets sync ho jayengi.',
      confirmText: 'Save',
      onConfirm: () => {
        if (crossSheetSyncTimer.current) {
          clearTimeout(crossSheetSyncTimer.current)
          crossSheetSyncTimer.current = null
        }
        persistRoster(employees)
        commitSaved(employees)
        showSuccess('Saved', 'General Wages successfully saved and synchronized.')
      },
    })
  }

  const handleDiscard = () => {
    askConfirm({
      title: 'Discard unsaved changes?',
      message: 'Unsaved edits revert ho jayenge. Proceed karein?',
      confirmText: 'Discard',
      onConfirm: () => {
        setEmployees(discardChanges())
      },
    })
  }


  const handlePrint = () => {
    window.print()
  }

  // Metrics — from active month sheets, not the single profile.salary
  const totalBaseSalary = employees.reduce((s, e) => s + (monthPay(e).salary || 0), 0)
  const totalRatePerDay30 = employees.reduce((s, e) => {
    const pay = monthPay(e)
    const rate30 = pay.isDaily
      ? (pay.ratePerDay || 0)
      : (pay.salary ? pay.salary / 30 : (e.ratePerDay30 || 0))
    return s + rate30
  }, 0)
  const totalRatePerDay31 = employees.reduce((s, e) => {
    const pay = monthPay(e)
    return s + Math.round(pay.salary / 31)
  }, 0)
  const totalRatePerDay28 = employees.reduce((s, e) => {
    const pay = monthPay(e)
    return s + Math.round(pay.salary / 28)
  }, 0)

  return (
    <div className="space-y-4 pb-24 font-sans">
      {/* Top Header & Actions - Hidden in Print */}
      <div className="print:hidden">
        <PageHeader
          title="General Wages Register"
          showTitle={false}
          breadcrumbs={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Payroll', href: '/payroll/employees' },
            { label: 'General Wages' },
          ]}
          actions={
            <>
              <div className="inline-flex shrink-0 items-center gap-1.5">
                <PayrollMonthSelect
                  value={activeMonth}
                  onChange={canEditAccounts ? handleActiveMonthChange : undefined}
                  disabled={!canEditAccounts}
                />
                {canEditAccounts && (
                  <button
                    type="button"
                    onClick={openGenerateDialog}
                    className="erp-btn-primary text-xs !min-h-9 !h-9"
                  >
                    <CalendarPlus className="size-3.5" />
                    <span>Generate</span>
                  </button>
                )}
              </div>
              <div className="inline-flex shrink-0 items-center gap-1.5">
                {canEditAccounts && <AddColumnButton onAddColumn={handleAddCustomColumn} />}

                <PayrollSaveButton
                  onClick={handleSave}
                  disabled={!canEditAccounts}
                  dirtyCount={dirtyCount}
                />
                <button
                  type="button"
                  onClick={handlePrint}
                  className="erp-btn-secondary text-xs !min-h-9 !h-9 !text-slate-800"
                >
                  <Printer className="size-3.5" />
                  <span>Print</span>
                </button>
                <ExportPdfButton filename="General-Wages" className="!min-h-9 !h-9" />
              </div>
            </>
          }
        />
      </div>

      {!canEditAccounts && (
        <div className="flex items-center gap-2.5 p-3 rounded-md border border-amber-200 bg-amber-50/50 text-amber-900 text-xs font-medium print:hidden">
          <Lock className="size-4 shrink-0 text-amber-600" />
          <span>
            Edit Protection Active: Click <strong>&quot;Enable Editing&quot;</strong> in the top navigation bar to modify sheet remarks, custom columns, or move employee rows.
          </span>
        </div>
      )}

      {statusNotice && (
        <div className="flex items-center gap-2 rounded-md bg-blue-50 border border-blue-200 p-3 text-xs font-semibold text-blue-900 print:hidden animate-in fade-in">
          <CheckCircle2 className="size-4 text-blue-600" />
          <span>{statusNotice}</span>
        </div>
      )}

      {/* Unsaved changes banner */}
      <PayrollUnsavedBanner
        dirtyCount={dirtyCount}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />

      {modals}

      {showGenerateDialog && (
        <div
          className="fixed inset-0 z-[1080] flex items-center justify-center p-4 print:hidden"
          style={{ background: 'rgba(15, 23, 42, 0.48)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowGenerateDialog(false)
          }}
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-black/5"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gw-generate-title"
          >
            <div className="relative px-5 pt-5 pb-4">
              <button
                type="button"
                onClick={() => setShowGenerateDialog(false)}
                className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
              <h3 id="gw-generate-title" className="text-[15px] font-semibold text-slate-900 pr-8">
                Generate salary month
              </h3>
              <p className="mt-1.5 text-[13px] text-slate-600">
                Naya month select karo, phir Generate confirm karo.
              </p>
              <label className="mt-4 block space-y-1.5">
                <span className="text-xs font-semibold text-slate-700">Month</span>
                <input
                  type="month"
                  value={newMonth}
                  onChange={(e) => setNewMonth(e.target.value)}
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0066cc] outline-none focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc]/40"
                  aria-label="New payroll month"
                />
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-3">
              <button
                type="button"
                onClick={() => setShowGenerateDialog(false)}
                className="erp-btn-secondary text-xs"
              >
                Cancel
              </button>
              <button type="button" onClick={confirmGenerateMonth} className="erp-btn-primary text-xs">
                <CalendarPlus className="size-3.5" />
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXACT EXCEL SPREADSHEET TABLE (Print-Friendly) */}
      <div className="rounded-lg border border-slate-300 bg-white text-slate-900 p-4 shadow-xs print:border-none print:p-0 print:shadow-none overflow-hidden">
        {/* Excel Header Box: Sara Textile */}
        <div className="border border-slate-400 mb-0">
          <div className="bg-[#f2eee7] dark:bg-slate-700 py-1.5 px-3 text-center border-b border-slate-400">
            <h1 className="text-base font-bold uppercase text-slate-900 dark:text-white tracking-wider">
              Sara Textile
            </h1>
          </div>

          <div className="overflow-x-auto">
            <table
              style={{
                minWidth: `${Math.max(
                  1250,
                  Object.values(widths).reduce((s, w) => s + w, 0) +
                    customColumns.reduce((s, c) => s + (c.width || 120), 0)
                )}px`,
              }}
              className="w-full text-left border-collapse text-xs font-sans border-t border-slate-400"
            >
              {/* EXACT 2-ROW EXCEL HEADERS AS IN USER'S SCREENSHOT */}
              <thead>
                {/* Row 1: Group Super Headers */}
                <tr className="border-b border-slate-400 font-bold uppercase text-[11px] text-slate-800 text-center">
                  <th
                    colSpan={6}
                    className="border-r border-slate-400 py-1.5 px-3 bg-[#e8e4dc] dark:bg-slate-700 tracking-wide text-slate-900 dark:text-white"
                  >
                    Employee Profile
                  </th>
                  <th
                    colSpan={2}
                    className="border-r border-slate-400 py-1.5 px-2 bg-[#e8e4dc] dark:bg-slate-700 text-slate-900 dark:text-white tracking-wide"
                  >
                    31 days
                  </th>
                  <th
                    colSpan={2}
                    className="border-r border-slate-400 py-1.5 px-2 bg-[#e8e4dc] dark:bg-slate-700 text-slate-900 dark:text-white tracking-wide"
                  >
                    30 days
                  </th>
                  <th
                    colSpan={2}
                    className="border-r border-slate-400 py-1.5 px-2 bg-[#e8e4dc] dark:bg-slate-700 text-slate-900 dark:text-white tracking-wide"
                  >
                    28 days
                  </th>
                  <th
                    rowSpan={2}
                    className="border-r border-slate-400 py-1.5 px-2 bg-[#e8e4dc] dark:bg-slate-700 text-slate-900 dark:text-white text-center align-middle"
                  >
                    D.O.J
                  </th>
                  <th
                    rowSpan={2}
                    className="border-r border-slate-400 py-1.5 px-2 bg-[#e8e4dc] dark:bg-slate-700 text-slate-900 dark:text-white text-center align-middle"
                  >
                    Contract Status
                  </th>
                  <th
                    rowSpan={2}
                    className="border-r border-slate-400 py-1.5 px-2 bg-[#e8e4dc] dark:bg-slate-700 text-slate-900 dark:text-white text-left align-middle"
                  >
                    Remarks
                  </th>
                  {customColumns.map((col) => (
                    <th
                      key={col.id}
                      rowSpan={2}
                      className="border-r border-slate-400 py-1.5 px-2 bg-[#e8e4dc] dark:bg-slate-700 text-slate-900 dark:text-white text-left align-middle"
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>

                {/* Row 2: Sub Column Headers */}
                <tr className="bg-[#f2eee7] dark:bg-slate-800 border-b border-slate-400 font-semibold text-[10px] text-slate-800 dark:text-slate-200 text-center">
                  <ResizableTh
                    columnKey="serial"
                    width={widths.serial}
                    minWidth={40}
                    onResize={setColumnWidth}
                    onReset={resetColumnWidth}
                    className="border-r border-slate-400 py-1 px-1 font-mono"
                  >
                    S.No
                  </ResizableTh>

                  <ResizableTh
                    columnKey="name"
                    width={widths.name}
                    minWidth={130}
                    onResize={setColumnWidth}
                    onReset={resetColumnWidth}
                    className="border-r border-slate-400 py-1 px-2 text-left font-sans"
                  >
                    Name
                  </ResizableTh>

                  <ResizableTh
                    columnKey="designation"
                    width={widths.designation}
                    minWidth={110}
                    onResize={setColumnWidth}
                    onReset={resetColumnWidth}
                    className="border-r border-slate-400 py-1 px-2 text-left font-sans"
                  >
                    Designation
                  </ResizableTh>

                  <ResizableTh
                    columnKey="dutyHrs"
                    width={widths.dutyHrs}
                    minWidth={55}
                    onResize={setColumnWidth}
                    onReset={resetColumnWidth}
                    className="border-r border-slate-400 py-1 px-1 text-center font-sans"
                  >
                    Duty Hrs
                  </ResizableTh>

                  <ResizableTh
                    columnKey="shiftFromTo"
                    width={widths.shiftFromTo}
                    minWidth={65}
                    onResize={setColumnWidth}
                    onReset={resetColumnWidth}
                    className="border-r border-slate-400 py-1 px-1 text-center font-sans"
                  >
                    From to
                  </ResizableTh>

                  <ResizableTh
                    columnKey="salary"
                    width={widths.salary}
                    minWidth={90}
                    onResize={setColumnWidth}
                    onReset={resetColumnWidth}
                    className="border-r border-slate-400 py-1 px-2 text-right font-sans"
                  >
                    Salary
                  </ResizableTh>

                  <ResizableTh
                    columnKey="ratePerDay31"
                    width={widths.ratePerDay31}
                    minWidth={75}
                    onResize={setColumnWidth}
                    onReset={resetColumnWidth}
                    className="border-r border-slate-400 py-1 px-1.5 text-right font-sans"
                  >
                    Per day
                  </ResizableTh>

                  <ResizableTh
                    columnKey="ratePerHr31"
                    width={widths.ratePerHr31}
                    minWidth={65}
                    onResize={setColumnWidth}
                    onReset={resetColumnWidth}
                    className="border-r border-slate-400 py-1 px-1.5 text-right font-sans"
                  >
                    Per Hr
                  </ResizableTh>

                  <ResizableTh
                    columnKey="ratePerDay30"
                    width={widths.ratePerDay30}
                    minWidth={75}
                    onResize={setColumnWidth}
                    onReset={resetColumnWidth}
                    className="border-r border-slate-400 py-1 px-1.5 text-right font-sans"
                  >
                    Per day
                  </ResizableTh>

                  <ResizableTh
                    columnKey="ratePerHr30"
                    width={widths.ratePerHr30}
                    minWidth={65}
                    onResize={setColumnWidth}
                    onReset={resetColumnWidth}
                    className="border-r border-slate-400 py-1 px-1.5 text-right font-sans"
                  >
                    Per Hr
                  </ResizableTh>

                  <ResizableTh
                    columnKey="ratePerDay28"
                    width={widths.ratePerDay28}
                    minWidth={75}
                    onResize={setColumnWidth}
                    onReset={resetColumnWidth}
                    className="border-r border-slate-400 py-1 px-1.5 text-right font-sans"
                  >
                    Per day
                  </ResizableTh>

                  <ResizableTh
                    columnKey="ratePerHr28"
                    width={widths.ratePerHr28}
                    minWidth={65}
                    onResize={setColumnWidth}
                    onReset={resetColumnWidth}
                    className="border-r border-slate-400 py-1 px-1.5 text-right font-sans"
                  >
                    Per Hr
                  </ResizableTh>
                </tr>
              </thead>

              {/* Exact Data Rows */}
              <tbody className="divide-y divide-slate-200">
                {employees.map((emp, idx) => {
                  const pay = monthPay(emp)
                  return (
                    <tr
                      key={emp.id}
                      className={cn(
                        'group hover:bg-slate-50 transition-colors text-xs',
                        idx % 2 === 1 && 'bg-slate-50/40',
                        isRowDirty(emp.id) && 'payroll-row-dirty'
                      )}
                    >
                      {/* S.No with hover-only Up/Down arrows */}
                      <td className="border-r border-slate-300 py-1 px-1 text-center font-mono text-slate-800 font-medium select-none">
                        <div className="relative flex items-center justify-center min-h-[28px] min-w-[36px]">
                          <span className="tabular-nums">{idx + 1}</span>
                          <div className="sara-serial-arrows">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleMove(emp.id, 'up')
                              }}
                              disabled={idx === 0 || !canEditAccounts}
                              title="Move Up"
                            >
                              <ChevronUp className="size-4 stroke-[2.5]" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleMove(emp.id, 'down')
                              }}
                              disabled={idx === employees.length - 1 || !canEditAccounts}
                              title="Move Down"
                            >
                              <ChevronDown className="size-4 stroke-[2.5]" />
                            </button>
                          </div>
                        </div>
                      </td>

                      {/* Name — Managed via HR Profile Card */}
                      <td
                        className="border-r border-slate-300 py-1.5 px-2 font-sans font-medium text-slate-900 bg-slate-50/40"
                        title="Managed in HR Profile Card"
                      >
                        <span className="truncate block font-semibold">{emp.name}</span>
                      </td>

                      {/* Designation — Managed via HR Profile Card */}
                      <td
                        className="border-r border-slate-300 py-1.5 px-2 font-sans text-slate-700 bg-slate-50/40"
                        title="Managed in HR Profile Card"
                      >
                        <span className="truncate block">{emp.designation}</span>
                      </td>

                      {/* Duty Hrs — Managed via HR Profile Card */}
                      <td
                        className="border-r border-slate-300 py-1.5 px-1 text-center font-mono text-slate-700 bg-slate-50/40"
                        title="Managed in HR Profile Card"
                      >
                        {emp.dutyHrs ? `${emp.dutyHrs}:00` : '9:00'}
                      </td>

                      {/* From to — Managed via HR Profile Card */}
                      <td
                        className="border-r border-slate-300 py-1.5 px-1 text-center font-sans text-slate-700 whitespace-nowrap bg-slate-50/40"
                        title="Managed in HR Profile Card"
                      >
                        {emp.shiftFromTo || '9 to 6'}
                      </td>

                      {/* Salary — month-scoped (profile card edit for active month) */}
                      <td
                        className="border-r border-slate-300 py-1.5 px-2 text-right font-mono font-bold text-slate-900 bg-slate-50/40"
                        title={`Salary for ${formatPayrollMonthLabel(activeMonth)} — edit via HR Profile Card`}
                      >
                        {formatNumber(pay.salary)}
                      </td>

                      {/* 31 days - Per day */}
                      <td className="border-r border-slate-300 py-1 px-1.5 text-right font-mono text-slate-700">
                        {formatNumber(Math.round(pay.salary / 31))}
                      </td>

                      {/* 31 days - Per Hr (Blank in Excel) */}
                      <td className="border-r border-slate-300 py-1 px-1.5 text-right font-mono text-slate-400">
                        —
                      </td>

                      {/* 30 days - Per day */}
                      <td className="border-r border-slate-300 py-1 px-1.5 text-right font-mono text-slate-900 font-medium">
                        {formatNumber(
                          pay.isDaily
                            ? (pay.ratePerDay || 0)
                            : (pay.salary ? pay.salary / 30 : (emp.ratePerDay30 || 0))
                        )}
                      </td>

                      {/* 30 days - Per Hr */}
                      <td className="border-r border-slate-300 py-1 px-1.5 text-right font-mono font-medium text-slate-900">
                        {emp.dutyHrs && emp.dutyHrs > 0
                          ? (pay.salary / (30 * emp.dutyHrs)).toFixed(2)
                          : emp.ratePerHr30
                          ? emp.ratePerHr30.toFixed(2)
                          : '—'}
                      </td>

                      {/* 28 days - Per day */}
                      <td className="border-r border-slate-300 py-1 px-1.5 text-right font-mono text-slate-700">
                        {formatNumber(Math.round(pay.salary / 28))}
                      </td>

                      {/* 28 days - Per Hr (Blank in Excel) */}
                      <td className="border-r border-slate-300 py-1 px-1.5 text-right font-mono text-slate-400">
                        —
                      </td>

                      {/* D.O.J — Managed via HR Profile Card */}
                      <td
                        className="border-r border-slate-300 py-1.5 px-2 text-center font-sans text-[11px] text-slate-700 whitespace-nowrap bg-slate-50/40"
                        title="Managed in HR Profile Card"
                      >
                        {emp.doj || '—'}
                      </td>

                      {/* Contract Status (Read-only in General Wages) */}
                      <td className="border-r border-slate-300 py-1 px-2 text-center font-sans text-xs text-slate-700 whitespace-nowrap">
                        {emp.contractStatus || 'Company Contract'}
                      </td>

                      {/* Remarks */}
                      <td className="border-r border-slate-300 py-1 px-2 font-sans text-slate-700">
                        {canEditAccounts ? (
                          <input
                            type="text"
                            value={emp.remarks || ''}
                            onChange={(e) => handleCellChange(idx, 'remarks', e.target.value)}
                            className={cn(
                              'w-full bg-transparent p-0.5 rounded focus:bg-white focus:ring-1 focus:ring-[#0066cc] transition-colors',
                              isCellDirty(emp.id, 'remarks') && 'payroll-cell-dirty'
                            )}
                          />
                        ) : (
                          emp.remarks || '—'
                        )}
                      </td>

                      {/* Custom Columns */}
                      {customColumns.map((col) => (
                        <td key={col.id} className="border-r border-slate-300 py-1 px-2 text-slate-700">
                          {canEditAccounts ? (
                            <input
                              type="text"
                              value={emp.customFields?.[col.id] || ''}
                              onChange={(e) => handleCustomCellChange(idx, col.id, e.target.value)}
                              className={cn(
                                'w-full bg-transparent p-0.5 rounded focus:bg-white focus:ring-1 focus:ring-[#0066cc] transition-colors',
                                isCellDirty(emp.id, `cf_${col.id}`, emp.customFields?.[col.id]) &&
                                  'payroll-cell-dirty'
                              )}
                            />
                          ) : (
                            emp.customFields?.[col.id] || '—'
                          )}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>

              {/* Excel Total Row */}
              <tfoot>
                <tr className="bg-[#f2eee7] dark:bg-slate-800 border-t-2 border-slate-400 font-bold text-slate-900 text-xs">
                  <td
                    colSpan={5}
                    className="border-r border-slate-400 py-2 px-3 text-right uppercase tracking-wider font-sans"
                  >
                    Total Monthly Base ({employees.length} Active):
                  </td>
                  <td className="border-r border-slate-400 py-2 px-2 text-right font-mono font-bold text-slate-900">
                    {formatCurrency(totalBaseSalary)}
                  </td>
                  <td className="border-r border-slate-400 py-2 px-1.5 text-right font-mono">
                    {formatNumber(totalRatePerDay31)}
                  </td>
                  <td className="border-r border-slate-400 py-2 px-1.5 text-right text-slate-400">
                    —
                  </td>
                  <td className="border-r border-slate-400 py-2 px-1.5 text-right font-mono font-bold text-slate-900">
                    {formatNumber(totalRatePerDay30)}
                  </td>
                  <td className="border-r border-slate-400 py-2 px-1.5 text-right font-mono font-bold text-slate-900">
                    {employees
                      .reduce((s, e) => {
                        const pay = monthPay(e)
                        return s + (e.dutyHrs ? pay.salary / (30 * e.dutyHrs) : e.ratePerHr30 || 0)
                      }, 0)
                      .toFixed(2)}
                  </td>
                  <td className="border-r border-slate-400 py-2 px-1.5 text-right font-mono">
                    {formatNumber(totalRatePerDay28)}
                  </td>
                  <td className="border-r border-slate-400 py-2 px-1.5 text-right text-slate-400">
                    —
                  </td>
                  <td
                    colSpan={3 + customColumns.length}
                    className="py-2 px-2 text-slate-500 text-center font-sans text-[11px]"
                  >
                    Sara Textile Mill Roster
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

      </div>


    </div>
  )
}
