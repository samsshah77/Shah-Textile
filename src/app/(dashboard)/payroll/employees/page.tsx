'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { payrollService } from '@/services/payrollService'
import { EmployeeProfile, CustomColumn } from '@/types/payroll'
import { AddColumnButton, CustomColumnHeader } from '@/components/shared/CustomColumnModal'
import { SerialCellWithInsert } from '@/components/shared/InlineRowActions'
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
  Plus,
  Trash2,
  RotateCcw,
  Save,
  CheckCircle2,
  Lock,
  IdCard,
  FileSpreadsheet,
  ArrowRight,
} from 'lucide-react'

const DEFAULT_GW_WIDTHS: Record<string, number> = {
  serial: 52,
  name: 190,
  designation: 150,
  dutyHrs: 70,
  shiftFromTo: 85,
  salary: 105,
  ratePerDay31: 85,
  ratePerHr31: 80,
  ratePerDay30: 85,
  ratePerHr30: 80,
  ratePerDay28: 85,
  ratePerHr28: 80,
  doj: 105,
  contractStatus: 130,
  remarks: 160,
  action: 48,
}

export default function GeneralWagesPage() {
  const { canEditAccounts } = useAuth()
  const [employees, setEmployees] = useState<EmployeeProfile[]>([])
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([])
  const [saveSuccess, setSaveSuccess] = useState(false)

  const { widths, setColumnWidth, resetColumnWidth, resetAllWidths } = useResizableColumns(
    'general_wages_excel_master_v3',
    DEFAULT_GW_WIDTHS
  )

  const reload = () => {
    setEmployees(payrollService.getEmployees())
  }

  useEffect(() => {
    reload()
    const handleSync = () => reload()
    window.addEventListener('payroll_synced', handleSync)
    return () => window.removeEventListener('payroll_synced', handleSync)
  }, [])

  // Handle live inline editing on any cell with automatic recalculation of 31, 30, 28 day rates
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

  // Insert row anywhere with auto-renumber
  const handleInsertRow = (insertIdx?: number) => {
    if (!canEditAccounts) return
    const newRecord: EmployeeProfile = {
      id: `emp-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      serialNo: insertIdx !== undefined ? insertIdx + 2 : employees.length + 1,
      name: 'New Employee',
      designation: 'Worker',
      dutyHrs: 8,
      shiftFromTo: '9 to 5',
      salary: 30000,
      ratePerDay31: Math.round((30000 / 31) * 100) / 100,
      ratePerDay30: 1000,
      ratePerHr30: Math.round((1000 / 8) * 100) / 100,
      ratePerDay28: Math.round((30000 / 28) * 100) / 100,
      doj: new Date().toISOString().split('T')[0],
      contractStatus: 'Company Contract',
      remarks: '',
    }

    const updated = [...employees]
    if (insertIdx !== undefined) {
      updated.splice(insertIdx + 1, 0, newRecord)
    } else {
      updated.push(newRecord)
    }

    const renumbered = updated.map((item, idx) => ({ ...item, serialNo: idx + 1 }))
    setEmployees(renumbered)
    payrollService.saveEmployees(renumbered)
  }

  // Delete row and auto-renumber
  const handleDeleteRow = (id: string) => {
    if (!canEditAccounts) return
    const updated = employees.filter((item) => item.id !== id).map((item, idx) => ({ ...item, serialNo: idx + 1 }))
    setEmployees(updated)
    payrollService.saveEmployees(updated)
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
    payrollService.saveEmployees(employees)
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

  // Metrics
  const totalBaseSalary = employees.reduce((s, e) => s + (e.salary || 0), 0)
  const totalRatePerDay30 = employees.reduce((s, e) => s + (e.ratePerDay30 || Math.round(e.salary / 30)), 0)
  const totalRatePerDay31 = employees.reduce((s, e) => s + (e.ratePerDay31 || Math.round(e.salary / 31)), 0)
  const totalRatePerDay28 = employees.reduce((s, e) => s + (e.ratePerDay28 || Math.round(e.salary / 28)), 0)

  return (
    <div className="space-y-6 pb-24">
      {/* Top Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="erp-badge-blue">
              Salary & Wages Module • General Wages
            </span>
            <span className="text-xs font-semibold text-slate-500">• August 2026</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl mt-1.5">
            General Wages Register
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Master Employee Register, Basic Salaries, Duty Hours & 30-Day Hourly Rates
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Link to HR Profiles Management */}
          <Link
            href="/payroll/profiles"
            className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-xs"
          >
            <IdCard className="size-3.5 text-[#0066cc]" />
            <span>HR & CNIC Profiles</span>
            <ArrowRight className="size-3 text-slate-400" />
          </Link>

          {canEditAccounts && (
            <AddColumnButton onAddColumn={handleAddCustomColumn} />
          )}

          <button
            onClick={handleReset}
            disabled={!canEditAccounts}
            title={canEditAccounts ? 'Reset to default template' : 'Enable Editing to reset'}
            className="erp-btn-secondary"
          >
            <RotateCcw className="size-3.5" />
            <span>Reset</span>
          </button>

          <button
            onClick={handleSave}
            disabled={!canEditAccounts}
            className="erp-btn-primary"
          >
            <Save className="size-3.5" />
            <span>Save Changes</span>
          </button>

          <button
            onClick={handlePrint}
            className="erp-btn-secondary"
          >
            <Printer className="size-3.5" />
            <span>Print (A4)</span>
          </button>
        </div>
      </div>

      {/* Safety Notice if Editing is Disabled */}
      {!canEditAccounts && (
        <div className="flex items-center gap-2.5 p-3 rounded-md border border-amber-200 bg-amber-50/50 text-amber-900 text-xs font-medium print:hidden">
          <Lock className="size-4 shrink-0 text-amber-600" />
          <span>
            Edit Protection Active: Click <strong>&quot;Enable Editing&quot;</strong> in the top navigation bar to modify basic salaries, duty hours, shift timings, or insert employee rows.
          </span>
        </div>
      )}

      {saveSuccess && (
        <div className="flex items-center gap-2 rounded-md bg-emerald-50 border border-emerald-200 p-3 text-xs font-semibold text-emerald-900 print:hidden animate-in fade-in">
          <CheckCircle2 className="size-4 text-emerald-600" />
          <span>General Wages employee records successfully saved and synchronized across all sheets!</span>
        </div>
      )}

      {/* Interactive Live Spreadsheet Table (EXACT EXCEL GENERAL WAGES) */}
      <div className="rounded-lg border border-slate-200 bg-white text-slate-900 p-5 shadow-xs print:border-none print:p-0 print:shadow-none font-sans overflow-hidden">
        {/* Print / Sheet Header */}
        <div className="text-center border-b border-slate-200 pb-3 mb-4">
          <h1 className="text-xl font-bold uppercase text-slate-900 tracking-wide">SARA TEXTILE</h1>
          <h2 className="text-xs font-semibold text-slate-600 mt-0.5">GENERAL WAGES REGISTER</h2>
          <p className="text-[11px] text-slate-500 font-mono">Month: August-2026</p>
        </div>

        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table
            style={{
              minWidth: `${Math.max(
                1280,
                Object.values(widths).reduce((s, w) => s + w, 0) +
                  customColumns.reduce((s, c) => s + (c.width || 120), 0)
              )}px`,
            }}
            className="w-full text-left border-collapse text-xs font-mono"
          >
            <thead>
              {/* Row 1: Merged Excel Headers */}
              <tr className="bg-slate-50 border-b border-slate-200 font-semibold uppercase text-[11px] text-slate-600 text-center">
                <th colSpan={6} className="border-r border-slate-200 py-2 px-3 text-left font-sans">
                  Employee Profile
                </th>
                <th colSpan={2} className="border-r border-slate-200 py-2 px-2 bg-slate-100/70">
                  31 days
                </th>
                <th colSpan={2} className="border-r border-slate-200 py-2 px-2 bg-slate-50">
                  30 days
                </th>
                <th colSpan={2} className="border-r border-slate-200 py-2 px-2 bg-slate-100/70">
                  28 days
                </th>
                <th colSpan={1} className="border-r border-slate-200 py-2 px-2 font-sans">
                  D.O.J
                </th>
                <th colSpan={1} className="border-r border-slate-200 py-2 px-2 font-sans">
                  Contract Status
                </th>
                <th colSpan={1} className="border-r border-slate-200 py-2 px-2 font-sans">
                  Remarks
                </th>
                {customColumns.map((col) => (
                  <th key={col.id} className="border-r border-slate-200 py-2 px-2 font-sans">
                    {col.label}
                  </th>
                ))}
                <th colSpan={1} className="py-2 px-1 print:hidden font-sans">
                  Action
                </th>
              </tr>

              {/* Row 2: Sub Headers */}
              <tr className="bg-slate-50/80 border-b border-slate-200 font-semibold uppercase text-[10px] text-slate-600">
                <ResizableTh
                  columnKey="serial"
                  width={widths.serial}
                  minWidth={45}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 py-2 px-1 text-center"
                  title="Hover row serial to insert row at position"
                >
                  S.No
                </ResizableTh>

                <ResizableTh
                  columnKey="name"
                  width={widths.name}
                  minWidth={130}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 py-2 px-3 font-sans"
                >
                  Name
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
                  columnKey="dutyHrs"
                  width={widths.dutyHrs}
                  minWidth={60}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 py-2 px-1 text-center"
                >
                  Duty Hrs
                </ResizableTh>

                <ResizableTh
                  columnKey="shiftFromTo"
                  width={widths.shiftFromTo}
                  minWidth={75}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 py-2 px-2 text-center"
                >
                  From to
                </ResizableTh>

                <ResizableTh
                  columnKey="salary"
                  width={widths.salary}
                  minWidth={90}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 py-2 px-2 text-right font-semibold text-slate-900"
                >
                  Salary
                </ResizableTh>

                {/* 31 days */}
                <ResizableTh
                  columnKey="ratePerDay31"
                  width={widths.ratePerDay31}
                  minWidth={75}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 py-2 px-2 text-right bg-slate-100/50"
                >
                  Per day
                </ResizableTh>

                <ResizableTh
                  columnKey="ratePerHr31"
                  width={widths.ratePerHr31}
                  minWidth={70}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 py-2 px-2 text-right bg-slate-100/50"
                >
                  Per Hr
                </ResizableTh>

                {/* 30 days */}
                <ResizableTh
                  columnKey="ratePerDay30"
                  width={widths.ratePerDay30}
                  minWidth={75}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 py-2 px-2 text-right"
                >
                  Per day
                </ResizableTh>

                <ResizableTh
                  columnKey="ratePerHr30"
                  width={widths.ratePerHr30}
                  minWidth={70}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 py-2 px-2 text-right"
                >
                  Per Hr
                </ResizableTh>

                {/* 28 days */}
                <ResizableTh
                  columnKey="ratePerDay28"
                  width={widths.ratePerDay28}
                  minWidth={75}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 py-2 px-2 text-right bg-slate-100/50"
                >
                  Per day
                </ResizableTh>

                <ResizableTh
                  columnKey="ratePerHr28"
                  width={widths.ratePerHr28}
                  minWidth={70}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 py-2 px-2 text-right bg-slate-100/50"
                >
                  Per Hr
                </ResizableTh>

                {/* D.O.J */}
                <ResizableTh
                  columnKey="doj"
                  width={widths.doj}
                  minWidth={95}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 py-2 px-2 text-center font-sans"
                >
                  D.O.J
                </ResizableTh>

                {/* Contract Status */}
                <ResizableTh
                  columnKey="contractStatus"
                  width={widths.contractStatus}
                  minWidth={110}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 py-2 px-2 font-sans"
                >
                  Contract Status
                </ResizableTh>

                {/* Remarks */}
                <ResizableTh
                  columnKey="remarks"
                  width={widths.remarks}
                  minWidth={120}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 py-2 px-2 font-sans"
                >
                  Remarks
                </ResizableTh>

                {/* Custom Columns */}
                {customColumns.map((col) => (
                  <CustomColumnHeader
                    key={col.id}
                    column={col}
                    onUpdateColumn={handleUpdateCustomColumn}
                    onRemoveColumn={handleDeleteCustomColumn}
                  />
                ))}

                <th className="py-2 px-1 text-center font-semibold text-slate-600 print:hidden font-sans">
                  Act
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {employees.map((emp, idx) => {
                const isPermanent = emp.contractStatus?.toLowerCase() === 'permanent'
                const isResigned =
                  emp.status === 'Resigned' ||
                  Boolean(emp.remarks && emp.remarks.toLowerCase().includes('resign'))

                return (
                  <tr
                    key={emp.id}
                    className={cn(
                      'hover:bg-slate-50/80 transition-colors',
                      idx % 2 === 1 && 'bg-slate-50/40',
                      isPermanent && 'bg-emerald-50/30',
                      isResigned && 'bg-red-50/20'
                    )}
                  >
                    {/* S.No with Quick Row Insert */}
                    <SerialCellWithInsert
                      serialNo={emp.serialNo}
                      index={idx}
                      onInsertRow={canEditAccounts ? handleInsertRow : undefined}
                      className="border-r border-slate-100 py-1.5 px-1 text-center font-semibold text-slate-700"
                    />

                    {/* Employee Name */}
                    <td className="border-r border-slate-100 py-1 px-3 font-sans">
                      {canEditAccounts ? (
                        <input
                          type="text"
                          value={emp.name}
                          onChange={(e) => handleCellChange(idx, 'name', e.target.value)}
                          className="w-full bg-transparent p-0.5 rounded focus:bg-white focus:ring-1 focus:ring-[#0066cc] font-semibold text-slate-900"
                        />
                      ) : (
                        <span className={cn('font-semibold text-slate-900', isPermanent && 'text-emerald-900')}>
                          {emp.name}
                        </span>
                      )}
                    </td>

                    {/* Designation */}
                    <td className="border-r border-slate-100 py-1 px-3 font-sans text-slate-700">
                      {canEditAccounts ? (
                        <input
                          type="text"
                          value={emp.designation}
                          onChange={(e) => handleCellChange(idx, 'designation', e.target.value)}
                          className="w-full bg-transparent p-0.5 rounded focus:bg-white focus:ring-1 focus:ring-[#0066cc]"
                        />
                      ) : (
                        emp.designation
                      )}
                    </td>

                    {/* Duty Hrs */}
                    <td className="border-r border-slate-100 py-1 px-1 text-center text-slate-700">
                      {canEditAccounts ? (
                        <input
                          type="number"
                          value={emp.dutyHrs}
                          onChange={(e) => handleCellChange(idx, 'dutyHrs', Number(e.target.value))}
                          className="w-full text-center bg-transparent p-0.5 rounded focus:bg-white focus:ring-1 focus:ring-[#0066cc]"
                        />
                      ) : (
                        `${String(emp.dutyHrs).padStart(2, '0')}:00:00`
                      )}
                    </td>

                    {/* From to */}
                    <td className="border-r border-slate-100 py-1 px-2 text-center whitespace-nowrap text-slate-600">
                      {canEditAccounts ? (
                        <input
                          type="text"
                          value={emp.shiftFromTo || ''}
                          onChange={(e) => handleCellChange(idx, 'shiftFromTo', e.target.value)}
                          className="w-full text-center bg-transparent p-0.5 rounded focus:bg-white focus:ring-1 focus:ring-[#0066cc]"
                        />
                      ) : (
                        emp.shiftFromTo || '—'
                      )}
                    </td>

                    {/* Salary */}
                    <td className="border-r border-slate-100 py-1 px-2 text-right font-semibold text-slate-900">
                      {canEditAccounts ? (
                        <input
                          type="number"
                          value={emp.salary}
                          onChange={(e) => handleCellChange(idx, 'salary', Number(e.target.value))}
                          className="w-full text-right bg-transparent p-0.5 rounded focus:bg-white focus:ring-1 focus:ring-[#0066cc] font-semibold text-slate-900"
                        />
                      ) : (
                        formatNumber(emp.salary)
                      )}
                    </td>

                    {/* 31 days - Per day */}
                    <td className="border-r border-slate-100 py-1.5 px-2 text-right text-slate-600 bg-slate-50/30">
                      {formatNumber(emp.ratePerDay31 || Math.round(emp.salary / 31))}
                    </td>

                    {/* 31 days - Per Hr (Blank in Excel) */}
                    <td className="border-r border-slate-100 py-1.5 px-2 text-right text-slate-400 bg-slate-50/30">
                      —
                    </td>

                    {/* 30 days - Per day */}
                    <td className="border-r border-slate-100 py-1.5 px-2 text-right font-semibold text-slate-900">
                      {formatNumber(emp.ratePerDay30 || Math.round(emp.salary / 30))}
                    </td>

                    {/* 30 days - Per Hr */}
                    <td className="border-r border-slate-100 py-1.5 px-2 text-right font-semibold text-slate-900">
                      {emp.dutyHrs && emp.dutyHrs > 0
                        ? (emp.salary / (30 * emp.dutyHrs)).toFixed(2)
                        : emp.ratePerHr30
                        ? emp.ratePerHr30.toFixed(2)
                        : '—'}
                    </td>

                    {/* 28 days - Per day */}
                    <td className="border-r border-slate-100 py-1.5 px-2 text-right text-slate-600 bg-slate-50/30">
                      {formatNumber(emp.ratePerDay28 || Math.round(emp.salary / 28))}
                    </td>

                    {/* 28 days - Per Hr */}
                    <td className="border-r border-slate-100 py-1.5 px-2 text-right text-slate-400 bg-slate-50/30">
                      —
                    </td>

                    {/* D.O.J */}
                    <td className="border-r border-slate-100 py-1 px-2 text-center font-sans whitespace-nowrap text-[11px] text-slate-600">
                      {canEditAccounts ? (
                        <input
                          type="text"
                          value={emp.doj || ''}
                          onChange={(e) => handleCellChange(idx, 'doj', e.target.value)}
                          className="w-full text-center bg-transparent p-0.5 rounded focus:bg-white focus:ring-1 focus:ring-[#0066cc] text-[11px]"
                        />
                      ) : (
                        emp.doj || '—'
                      )}
                    </td>

                    {/* Contract Status */}
                    <td className="border-r border-slate-100 py-1 px-2 font-sans whitespace-nowrap text-center">
                      {canEditAccounts ? (
                        <input
                          type="text"
                          value={emp.contractStatus || ''}
                          onChange={(e) => handleCellChange(idx, 'contractStatus', e.target.value)}
                          className={cn(
                            'w-full bg-transparent p-0.5 rounded focus:bg-white focus:ring-1 focus:ring-[#0066cc] text-center',
                            isPermanent && 'font-semibold text-emerald-800'
                          )}
                        />
                      ) : isPermanent ? (
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {emp.contractStatus}
                        </span>
                      ) : (
                        <span className="text-slate-600 text-xs">
                          {emp.contractStatus || 'Company Contract'}
                        </span>
                      )}
                    </td>

                    {/* Remarks */}
                    <td className="border-r border-slate-100 py-1 px-2 font-sans">
                      {canEditAccounts ? (
                        <input
                          type="text"
                          value={emp.remarks || ''}
                          onChange={(e) => handleCellChange(idx, 'remarks', e.target.value)}
                          className={cn(
                            'w-full bg-transparent p-0.5 rounded focus:bg-white focus:ring-1 focus:ring-[#0066cc]',
                            isResigned ? 'font-semibold text-red-600' : 'text-slate-600'
                          )}
                        />
                      ) : isResigned ? (
                        <span className="inline-block font-semibold text-red-600">
                          {emp.remarks}
                        </span>
                      ) : (
                        <span className="text-slate-500">{emp.remarks || '—'}</span>
                      )}
                    </td>

                    {/* Custom Columns */}
                    {customColumns.map((col) => (
                      <td key={col.id} className="border-r border-slate-100 py-1 px-2 text-slate-700">
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

                    {/* Action */}
                    <td className="py-1 px-1 text-center print:hidden">
                      <div className="flex items-center justify-center gap-1">
                        {canEditAccounts && (
                          <button
                            onClick={() => handleDeleteRow(emp.id)}
                            title="Delete Row"
                            className="p-1 hover:text-red-600 transition-colors cursor-pointer text-slate-400"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>

            {/* Total Row */}
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold text-slate-900">
                <td colSpan={5} className="border-r border-slate-200 py-2.5 px-3 text-right uppercase tracking-wider font-sans text-xs">
                  Total Monthly Base ({employees.length} Employees):
                </td>
                <td className="border-r border-slate-200 py-2.5 px-2 text-right font-bold text-slate-900">
                  {formatCurrency(totalBaseSalary)}
                </td>
                <td className="border-r border-slate-200 py-2.5 px-2 text-right">
                  {formatNumber(totalRatePerDay31)}
                </td>
                <td className="border-r border-slate-200 py-2.5 px-2 text-right text-slate-400">—</td>
                <td className="border-r border-slate-200 py-2.5 px-2 text-right">
                  {formatNumber(totalRatePerDay30)}
                </td>
                <td className="border-r border-slate-200 py-2.5 px-2 text-right text-slate-400">—</td>
                <td className="border-r border-slate-200 py-2.5 px-2 text-right">
                  {formatNumber(totalRatePerDay28)}
                </td>
                <td className="border-r border-slate-200 py-2.5 px-2 text-right text-slate-400">—</td>
                <td colSpan={3 + customColumns.length} className="border-r border-slate-200 py-2.5 px-2 text-center text-slate-500 font-sans text-[11px]">
                  End of Sheet 1: General Wages
                </td>
                <td className="py-2.5 px-1 print:hidden" />
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Quick Add Row Button at bottom */}
        {canEditAccounts && (
          <div className="mt-4 flex justify-start print:hidden">
            <button
              onClick={() => handleInsertRow()}
              className="flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 hover:border-slate-500 bg-slate-50 hover:bg-slate-100 px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
            >
              <Plus className="size-3.5 text-slate-600" />
              <span>Add New Row (End of Sheet)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
