'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import {
  payrollService,
  isGeneralWagesEmployee,
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
  RotateCcw,
  Save,
  CheckCircle2,
  Lock,
  IdCard,
  ChevronUp,
  ChevronDown,
  CalendarPlus,
  Edit2,
  ExternalLink,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { ExportPdfButton } from '@/components/shared/ExportPdfButton'
import { NumericCellInput } from '@/components/shared/NumericCellInput'

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
  action: 65,
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
  const [employees, setEmployees] = useState<EmployeeProfile[]>([])
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([])
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [statusNotice, setStatusNotice] = useState<string | null>(null)
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

  const reload = () => {
    payrollService.renumberGeneralWages()
    const all = payrollService.getEmployees()
    const activeGw = all
      .filter(isGeneralWagesEmployee)
      .sort((a, b) => a.serialNo - b.serialNo)
      .map((e, i) => ({ ...e, serialNo: i + 1 }))
    setEmployees(activeGw)
    setActiveMonth(payrollService.getActiveSalariedMonth())
  }

  const handleActiveMonthChange = async (month: string) => {
    if (!canEditAccounts) return
    await payrollService.setActiveSalariedMonthAsync(month)
    setActiveMonth(month)
    setStatusNotice(`Active month: ${formatPayrollMonthLabel(month)} — Advances / Staff / Contract / Net Payment isi pe khulenge.`)
    setTimeout(() => setStatusNotice(null), 4000)
  }

  const handleGenerateMonth = async () => {
    if (!canEditAccounts) return
    setStatusNotice('Month save ho raha hai…')
    const result = await payrollService.generateSalariedMonth(newMonth)
    setStatusNotice(result.message)
    if (result.ok) {
      setActiveMonth(payrollService.getActiveSalariedMonth())
      const months = payrollService.listPayrollMonths()
      const last = months[months.length - 1] || newMonth
      const [y, m] = last.split('-').map(Number)
      const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
      setNewMonth(next)
    }
    setTimeout(() => setStatusNotice(null), 6000)
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
    if (crossSheetSyncTimer.current) {
      clearTimeout(crossSheetSyncTimer.current)
      crossSheetSyncTimer.current = null
    }
    persistRoster(employees)
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 2500)
  }

  const handleReset = () => {
    if (!canEditAccounts) return
    if (confirm('Reset General Wages to default Excel roster template from August 2026?')) {
      localStorage.removeItem('sara_payroll_employees_v9')
      localStorage.removeItem('sara_payroll_employees_v8')
      localStorage.removeItem('sara_payroll_employees_v7')
      setCustomColumns([])
      reload()
    }
  }

  const handlePrint = () => {
    window.print()
  }

  // Metrics — from active month sheets, not the single profile.salary
  const totalBaseSalary = employees.reduce((s, e) => s + (monthPay(e).salary || 0), 0)
  const totalRatePerDay30 = employees.reduce((s, e) => {
    const pay = monthPay(e)
    return s + (pay.ratePerDay || Math.round(pay.salary / 30))
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
          breadcrumbs={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Payroll', href: '/payroll/employees' },
            { label: 'General Wages' },
          ]}
          actions={
            <>
              <Link href="/payroll/profiles" className="erp-btn-secondary text-xs flex items-center gap-1.5">
                <IdCard className="size-3.5 text-[#0066cc]" />
                <span>HR Profiles</span>
              </Link>
              {canEditAccounts && <AddColumnButton onAddColumn={handleAddCustomColumn} />}
              <button
                type="button"
                onClick={handleReset}
                disabled={!canEditAccounts}
                title={canEditAccounts ? 'Reset to default template' : 'Enable Editing to reset'}
                className="erp-btn-secondary"
              >
                <RotateCcw className="size-3.5" />
                <span>Reset</span>
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!canEditAccounts}
                className="erp-btn-primary"
              >
                <Save className="size-3.5" />
                <span>Save</span>
              </button>
              <button type="button" onClick={handlePrint} className="erp-btn-secondary">
                <Printer className="size-3.5" />
                <span>Print</span>
              </button>
              <ExportPdfButton filename="General-Wages" />
            </>
          }
        />
      </div>

      {canEditAccounts && (
        <div className="print:hidden erp-card p-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
              Active salary month
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Active month ki salary yahan dikhegi. Name/designation har month same; salary har month alag ho sakti hai (profile card se us month ke liye change).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={activeMonth}
              onChange={(e) => handleActiveMonthChange(e.target.value)}
              className="form-select form-select-sm"
              aria-label="Active payroll month"
            >
              {payrollService.listPayrollMonths().map((m) => (
                <option key={m} value={m}>
                  {formatPayrollMonthLabel(m)}
                </option>
              ))}
            </select>
            <input
              type="month"
              value={newMonth}
              onChange={(e) => setNewMonth(e.target.value)}
              className="form-control form-control-sm"
              style={{ width: 'auto' }}
              aria-label="New payroll month"
            />
            <button
              type="button"
              onClick={handleGenerateMonth}
              className="erp-btn-primary text-xs flex items-center gap-1.5"
            >
              <CalendarPlus className="size-3.5" />
              <span>Generate Month</span>
            </button>
          </div>
        </div>
      )}

      {!canEditAccounts && (
        <div className="print:hidden erp-card p-3 flex items-center gap-2 text-xs text-slate-600">
          <CalendarPlus className="size-3.5 text-[#0066cc]" />
          <span>
            Active month: <strong>{formatPayrollMonthLabel(activeMonth)}</strong>
          </span>
        </div>
      )}

      {/* Safety Notice if Editing is Disabled */}
      {!canEditAccounts && (
        <div className="flex items-center gap-2.5 p-3 rounded-md border border-amber-200 bg-amber-50/50 text-amber-900 text-xs font-medium print:hidden">
          <Lock className="size-4 shrink-0 text-amber-600" />
          <span>
            Edit Protection Active: Click <strong>&quot;Enable Editing&quot;</strong> in the top navigation bar to modify sheet remarks, custom columns, or move employee rows.
          </span>
        </div>
      )}

      {/* Informative Banner about Profile-Managed Fields */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border border-blue-200 bg-blue-50/80 text-blue-900 text-xs print:hidden shadow-xs">
        <div className="flex items-center gap-2.5">
          <IdCard className="size-4 shrink-0 text-[#0066cc]" />
          <span>
            <strong>HR Profile Managed:</strong> Employee Name, Designation, Duty Hours, Shift, Salary, aur D.O.J direct <strong>HR Profile Card</strong> se manage hotay hain taake sheet formulas aur past months disturb na hon. Edit karne ke liye row mein <strong>Edit</strong> button click karein.
          </span>
        </div>
        <Link
          href="/payroll/profiles"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#0066cc] text-white hover:bg-[#0052a3] text-xs font-medium shrink-0 transition-colors w-fit"
        >
          <ExternalLink className="size-3.5" />
          <span>Open HR Profiles</span>
        </Link>
      </div>

      {saveSuccess && (
        <div className="flex items-center gap-2 rounded-md bg-emerald-50 border border-emerald-200 p-3 text-xs font-semibold text-emerald-900 print:hidden animate-in fade-in">
          <CheckCircle2 className="size-4 text-emerald-600" />
          <span>General Wages employee records successfully saved and synchronized across all sheets!</span>
        </div>
      )}

      {statusNotice && (
        <div className="flex items-center gap-2 rounded-md bg-blue-50 border border-blue-200 p-3 text-xs font-semibold text-blue-900 print:hidden animate-in fade-in">
          <CheckCircle2 className="size-4 text-blue-600" />
          <span>{statusNotice}</span>
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
                  <th
                    rowSpan={2}
                    className="border-r border-slate-400 py-1.5 px-2 bg-[#e8e4dc] dark:bg-slate-700 text-slate-900 dark:text-white text-center align-middle print:hidden"
                  >
                    Action
                  </th>
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
                        idx % 2 === 1 && 'bg-slate-50/40'
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
                        {formatNumber(pay.ratePerDay || Math.round(pay.salary / 30))}
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
                            className="w-full bg-transparent p-0.5 rounded focus:bg-white focus:ring-1 focus:ring-[#0066cc]"
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
                              className="w-full bg-transparent p-0.5 rounded focus:bg-white focus:ring-1 focus:ring-[#0066cc]"
                            />
                          ) : (
                            emp.customFields?.[col.id] || '—'
                          )}
                        </td>
                      ))}

                      {/* Action: Quick Link to HR Profile Card for editing */}
                      <td className="border-r border-slate-300 py-1 px-1.5 text-center print:hidden bg-slate-50/20">
                        <Link
                          href={`/payroll/profiles?search=${encodeURIComponent(emp.name)}`}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-[#0066cc] hover:bg-blue-100 hover:text-blue-800 border border-blue-200 transition-colors"
                          title={`Edit ${emp.name} in HR Profiles`}
                        >
                          <Edit2 className="size-3" />
                          <span>Edit</span>
                        </Link>
                      </td>

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
                  <td className="border-l border-slate-400 py-2 px-1 print:hidden" />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

      </div>


    </div>
  )
}
