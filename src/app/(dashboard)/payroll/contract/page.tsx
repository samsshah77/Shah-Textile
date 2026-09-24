'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { payrollService } from '@/services/payrollService'
import { ContractSalaryRecord, CustomColumn } from '@/types/payroll'
import { AddColumnButton, CustomColumnHeader } from '@/components/shared/CustomColumnModal'
import { SerialCellWithInsert } from '@/components/shared/InlineRowActions'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { useAuth } from '@/context/AuthContext'
import { formatCurrency, formatNumber, numberToWordsPKR } from '@/lib/utils'
import {
  Users,
  Printer,
  DollarSign,
  Clock,
  Zap,
  Plus,
  Trash2,
  RotateCcw,
  Save,
  CheckCircle2,
  Lock,
  FileSpreadsheet,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { ExportPdfButton } from '@/components/shared/ExportPdfButton'
import { NumericCellInput } from '@/components/shared/NumericCellInput'

const DEFAULT_CONTRACT_SALARY_WIDTHS = {
  serialNo: 56,
  employeeName: 200,
  designation: 160,
  salary: 100,
  attendanceDays: 70,
  ratePerDay: 90,
  ratePerHr: 85,
  basicSalary: 100,
  lateHours: 75,
  lateAmount: 95,
  advanceDeduction: 90,
  ticketCharges: 70,
  netAmount: 110,
  action: 48,
}

const DEFAULT_CONTRACT_OT_WIDTHS = {
  serialNo: 56,
  employeeName: 220,
  designation: 180,
  otHours: 110,
  ratePerHr: 100,
  otAmount: 130,
  action: 48,
}

const DEFAULT_CONTRACT_NET_WIDTHS = {
  serialNo: 56,
  employeeName: 220,
  designation: 180,
  salary: 100,
  attendanceDays: 65,
  basicSalary: 100,
  otHours: 75,
  otAmount: 100,
  efficiencyAmount: 100,
  grossSalary: 105,
  advanceDeduction: 95,
  ticketCharges: 65,
  netAmount: 120,
  action: 48,
}

function ContractPayrollContent() {
  const { canEditAccounts } = useAuth()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState<'employees' | 'overtime' | 'net-payment'>('employees')

  useEffect(() => {
    if (tabParam === 'overtime') setActiveTab('overtime')
    else if (tabParam === 'net-payment') setActiveTab('net-payment')
    else setActiveTab('employees')
  }, [tabParam])

  const [contractList, setContractList] = useState<ContractSalaryRecord[]>([])
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([])
  const [selectedMonth, setSelectedMonth] = useState('2026-08')
  const [daysInMonth, setDaysInMonth] = useState<number>(31)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Resizable column width hooks for all 3 views
  const {
    widths: salaryWidths,
    setColumnWidth: setSalaryColWidth,
    resetColumnWidth: resetSalaryColWidth,
  } = useResizableColumns('contract_salary', DEFAULT_CONTRACT_SALARY_WIDTHS)

  const {
    widths: otWidths,
    setColumnWidth: setOtColWidth,
    resetColumnWidth: resetOtColWidth,
  } = useResizableColumns('contract_ot', DEFAULT_CONTRACT_OT_WIDTHS)

  const {
    widths: netWidths,
    setColumnWidth: setNetColWidth,
    resetColumnWidth: resetNetColWidth,
  } = useResizableColumns('contract_net', DEFAULT_CONTRACT_NET_WIDTHS)

  const reload = () => {
    setContractList(
      payrollService
        .getContractSalaries(selectedMonth)
        .map((row) => payrollService.calculateContractSalaryRow(row, daysInMonth))
    )
  }

  useEffect(() => {
    reload()
    const handleSync = () => reload()
    window.addEventListener('payroll_synced', handleSync)
    return () => window.removeEventListener('payroll_synced', handleSync)
  }, [selectedMonth, daysInMonth])

  // Handle cell edit with live formula recalculation
  const handleCellChange = (
    index: number,
    field: keyof ContractSalaryRecord,
    value: string | number
  ) => {
    if (!canEditAccounts) return
    setContractList((prev) => {
      const updated = [...prev]
      const current = { ...updated[index], [field]: value }
      // When late hours change, clear lateAmount so calculator re-derives from hrs × rate
      if (field === 'lateHours') {
        current.lateAmount = undefined
      }
      const recalculated = payrollService.calculateContractSalaryRow(current, daysInMonth)
      updated[index] = recalculated
      return updated
    })
  }

  const handleCustomCellChange = (index: number, colId: string, value: string) => {
    if (!canEditAccounts) return
    setContractList((prev) => {
      const updated = [...prev]
      const currentCustom = updated[index].customFields || {}
      updated[index] = {
        ...updated[index],
        customFields: { ...currentCustom, [colId]: value },
      }
      return updated
    })
  }

  // Insert row anywhere with auto-renumber (inserts BELOW the selected row)
  const handleInsertRow = (insertIdx?: number) => {
    if (!canEditAccounts) return
    const raw: ContractSalaryRecord = {
      id: `cnt-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      serialNo: insertIdx !== undefined ? insertIdx + 2 : contractList.length + 1,
      employeeName: 'New Contract Worker',
      designation: 'Technician',
      salary: 40000,
      attendanceDays: daysInMonth,
      ratePerDay: Math.round(40000 / daysInMonth),
      ratePerHr: Number((40000 / (30 * 12)).toFixed(2)),
      basicSalary: 40000,
      otHours: 0,
      otAmount: 0,
      efficiencyAmount: 0,
      grossSalary: 40000,
      advanceDeduction: 0,
      ticketCharges: 5,
      netAmount: 39995,
      month: selectedMonth,
    }
    const newRecord = payrollService.calculateContractSalaryRow(raw, daysInMonth)

    const updated = [...contractList]
    if (insertIdx !== undefined) {
      updated.splice(insertIdx + 1, 0, newRecord)
    } else {
      updated.push(newRecord)
    }

    const renumbered = updated.map((item, i) => ({
      ...item,
      serialNo: i + 1,
    }))
    setContractList(renumbered)
  }

  const handleDeleteRow = (id: string) => {
    if (!canEditAccounts) return
    const filtered = contractList
      .filter((c) => c.id !== id)
      .map((item, i) => ({ ...item, serialNo: i + 1 }))
    setContractList(filtered)
  }

  const handleReset = () => {
    if (!canEditAccounts) return
    if (confirm('Reset Contract Salaries back to template default values?')) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('sara_payroll_contract_v7')
        localStorage.removeItem('sara_payroll_contract_v6')
      }
      payrollService.resetAllToDefault()
      setContractList(payrollService.getContractSalaries(selectedMonth))
      setCustomColumns([])
    }
  }

  const handleSave = () => {
    if (!canEditAccounts) return
    payrollService.saveContractSalaries(selectedMonth, contractList)
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 3000)
  }

  const handlePrint = () => {
    window.print()
  }

  // Custom Column Handlers
  const handleAddCustomColumn = (newCol: CustomColumn) => {
    setCustomColumns([...customColumns, newCol])
  }

  const handleUpdateCustomColumn = (updated: CustomColumn) => {
    setCustomColumns(customColumns.map((c) => (c.id === updated.id ? updated : c)))
  }

  const handleRemoveCustomColumn = (colId: string) => {
    setCustomColumns(customColumns.filter((c) => c.id !== colId))
  }

  // Totals calculations
  const totalBasic = contractList.reduce((sum, c) => sum + (c.basicSalary || 0), 0)
  const totalOT = contractList.reduce((sum, c) => sum + (c.otAmount || 0), 0)
  const totalOTHours = contractList.reduce((sum, c) => sum + (c.otHours || 0), 0)
  const totalEfficiency = contractList.reduce((sum, c) => sum + (c.efficiencyAmount || 0), 0)
  const totalGross = contractList.reduce((sum, c) => sum + (c.grossSalary || 0), 0)
  const totalAdvance = contractList.reduce((sum, c) => sum + (c.advanceDeduction || 0), 0)
  const totalTicket = contractList.reduce((sum, c) => sum + (c.ticketCharges || 0), 0)
  const totalNet = contractList.reduce((sum, c) => sum + (c.netAmount || 0), 0)

  return (
    <div className="space-y-6 print:space-y-2">
      <div className="print:hidden">
        <PageHeader
          title="Contract Staff Register"
          breadcrumbs={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Payroll', href: '/payroll/contract' },
            { label: 'Contract Staff' },
          ]}
          actions={
            <>
              <select
                value={daysInMonth}
                disabled={!canEditAccounts}
                onChange={(e) => {
                  const days = Number(e.target.value)
                  setDaysInMonth(days)
                  setContractList((prev) =>
                    prev.map((row) => payrollService.calculateContractSalaryRow(row, days))
                  )
                }}
                className="form-select form-select-sm"
                aria-label="Days in month"
              >
                <option value={31}>31 Days</option>
                <option value={30}>30 Days</option>
                <option value={28}>28 Days</option>
              </select>
              <button
                type="button"
                onClick={() => handleInsertRow()}
                disabled={!canEditAccounts}
                className="erp-btn-secondary"
              >
                <Plus className="size-3.5 text-[#0066cc]" />
                <span>Add Worker</span>
              </button>
              <AddColumnButton onAddColumn={handleAddCustomColumn} />
              <button
                type="button"
                onClick={handleReset}
                disabled={!canEditAccounts}
                title={canEditAccounts ? 'Reset to template default values' : 'Enable Editing to reset'}
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
              <ExportPdfButton filename={`Contract-${activeTab}-${selectedMonth}`} />
            </>
          }
        />
      </div>

      {/* Safety Notice if Editing is Disabled */}
      {!canEditAccounts && (
        <div className="flex items-center gap-2.5 p-3 rounded-md border border-amber-200 bg-amber-50/50 text-amber-900 text-xs font-medium print:hidden">
          <Lock className="size-4 shrink-0 text-amber-600" />
          <span>
            Edit Protection Active: Click <strong>&quot;Enable Editing&quot;</strong> in the top navigation bar to modify contract payroll, overtime, or insert rows.
          </span>
        </div>
      )}

      {saveSuccess && (
        <div className="flex items-center gap-2 rounded-md bg-emerald-50 border border-emerald-200 p-3 text-xs font-semibold text-emerald-900 print:hidden animate-in fade-in">
          <CheckCircle2 className="size-4 text-emerald-600" />
          <span>Contract employee records and live calculations saved successfully!</span>
        </div>
      )}

      {/* VIEW 1: Sheet 4 - Contract Salaries */}
      {activeTab === 'employees' && (
        <div className="rounded-lg border border-slate-200 bg-white text-slate-900 p-5 shadow-xs print:border-none print:p-0 print:shadow-none font-sans overflow-hidden">
          <div className="text-center border-b border-slate-200 pb-3 mb-4">
            <h1 className="text-xl font-bold uppercase text-slate-900 tracking-wide">SARA TEXTILES</h1>
            <h2 className="text-xs font-semibold text-slate-600 mt-0.5">CONTRACT EMPLOYEES SALARIES (EXCEL SHEET 4)</h2>
            <p className="text-[11px] text-slate-500 font-mono">Statement for Month: August-2026 ({daysInMonth} Days Base)</p>
          </div>

          <div className="overflow-x-auto rounded-md border border-slate-200 shadow-xs">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 font-semibold uppercase text-[11px] text-slate-600">
                  <ResizableTh
                    columnKey="serialNo"
                    width={salaryWidths.serialNo}
                    minWidth={45}
                    onResize={setSalaryColWidth}
                    onReset={resetSalaryColWidth}
                    className="border-r border-slate-200 py-2 px-1 text-center"
                    title="Hover row serial to insert row at position"
                  >
                    S.#
                  </ResizableTh>

                  <ResizableTh
                    columnKey="employeeName"
                    width={salaryWidths.employeeName}
                    minWidth={130}
                    onResize={setSalaryColWidth}
                    onReset={resetSalaryColWidth}
                    className="border-r border-slate-200 py-2 px-3 font-sans"
                  >
                    Employee Name
                  </ResizableTh>

                  <ResizableTh
                    columnKey="designation"
                    width={salaryWidths.designation}
                    minWidth={110}
                    onResize={setSalaryColWidth}
                    onReset={resetSalaryColWidth}
                    className="border-r border-slate-200 py-2 px-3 font-sans"
                  >
                    Designation
                  </ResizableTh>

                  <ResizableTh
                    columnKey="salary"
                    width={salaryWidths.salary}
                    minWidth={85}
                    onResize={setSalaryColWidth}
                    onReset={resetSalaryColWidth}
                    className="border-r border-slate-200 py-2 px-2 text-right"
                  >
                    Salary / Wages
                  </ResizableTh>

                  <ResizableTh
                    columnKey="attendanceDays"
                    width={salaryWidths.attendanceDays}
                    minWidth={55}
                    onResize={setSalaryColWidth}
                    onReset={resetSalaryColWidth}
                    className="border-r border-slate-200 py-2 px-1 text-center"
                  >
                    Attn Days
                  </ResizableTh>

                  <ResizableTh
                    columnKey="ratePerDay"
                    width={salaryWidths.ratePerDay}
                    minWidth={80}
                    onResize={setSalaryColWidth}
                    onReset={resetSalaryColWidth}
                    className="border-r border-slate-200 py-2 px-2 text-right whitespace-nowrap"
                  >
                    Rate Per Day
                  </ResizableTh>

                  <ResizableTh
                    columnKey="ratePerHr"
                    width={salaryWidths.ratePerHr}
                    minWidth={80}
                    onResize={setSalaryColWidth}
                    onReset={resetSalaryColWidth}
                    className="border-r border-slate-200 py-2 px-2 text-right whitespace-nowrap"
                  >
                    Rate Per Hr
                  </ResizableTh>

                  <ResizableTh
                    columnKey="basicSalary"
                    width={salaryWidths.basicSalary}
                    minWidth={85}
                    onResize={setSalaryColWidth}
                    onReset={resetSalaryColWidth}
                    className="border-r border-slate-200 py-2 px-2 text-right font-semibold text-slate-900 whitespace-nowrap"
                  >
                    Gross Salary
                  </ResizableTh>

                  <ResizableTh
                    columnKey="lateHours"
                    width={salaryWidths.lateHours}
                    minWidth={70}
                    onResize={setSalaryColWidth}
                    onReset={resetSalaryColWidth}
                    className="border-r border-slate-200 py-2 px-2 text-right whitespace-nowrap"
                  >
                    Late Hrs
                  </ResizableTh>

                  <ResizableTh
                    columnKey="lateAmount"
                    width={salaryWidths.lateAmount}
                    minWidth={80}
                    onResize={setSalaryColWidth}
                    onReset={resetSalaryColWidth}
                    className="border-r border-slate-200 py-2 px-2 text-right text-red-600 whitespace-nowrap"
                  >
                    Late Amount
                  </ResizableTh>

                  <ResizableTh
                    columnKey="advanceDeduction"
                    width={salaryWidths.advanceDeduction}
                    minWidth={80}
                    onResize={setSalaryColWidth}
                    onReset={resetSalaryColWidth}
                    className="border-r border-slate-200 py-2 px-2 text-right text-red-600 whitespace-nowrap"
                  >
                    Advance
                  </ResizableTh>

                  <ResizableTh
                    columnKey="ticketCharges"
                    width={salaryWidths.ticketCharges}
                    minWidth={60}
                    onResize={setSalaryColWidth}
                    onReset={resetSalaryColWidth}
                    className="border-r border-slate-200 py-2 px-2 text-right text-red-600 whitespace-nowrap"
                  >
                    Ticket
                  </ResizableTh>

                  <ResizableTh
                    columnKey="netAmount"
                    width={salaryWidths.netAmount}
                    minWidth={90}
                    onResize={setSalaryColWidth}
                    onReset={resetSalaryColWidth}
                    className="border-r border-slate-200 py-2 px-2 text-right font-semibold text-[#0066cc] whitespace-nowrap"
                  >
                    Net Salary
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
                    width={salaryWidths.action}
                    minWidth={45}
                    enableResize={false}
                    className="py-2 px-1 text-center print:hidden"
                  >
                    Action
                  </ResizableTh>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {contractList.map((c, idx) => (
                  <tr key={c.id} className="text-slate-800 hover:bg-slate-50/80 transition-colors">
                    {/* S.# with Hover Row Insertion */}
                    <SerialCellWithInsert
                      serialNo={c.serialNo}
                      index={idx}
                      onInsertRow={handleInsertRow}
                    />
                    
                    {/* Name — from HR / General Wages */}
                    <td
                      style={{ width: `${salaryWidths.employeeName}px`, minWidth: `${salaryWidths.employeeName}px` }}
                      className="border-r border-slate-100 py-1.5 px-2 bg-slate-50"
                      title="From HR Profiles / General Wages"
                    >
                      <span className="font-semibold font-sans text-xs text-slate-500">{c.employeeName}</span>
                    </td>

                    {/* Designation — from HR / General Wages */}
                    <td
                      style={{ width: `${salaryWidths.designation}px`, minWidth: `${salaryWidths.designation}px` }}
                      className="border-r border-slate-100 py-1.5 px-2 bg-slate-50"
                      title="From HR Profiles / General Wages"
                    >
                      <span className="font-sans text-xs text-slate-500">{c.designation}</span>
                    </td>

                    {/* Salary — from HR / General Wages */}
                    <td
                      style={{ width: `${salaryWidths.salary}px`, minWidth: `${salaryWidths.salary}px` }}
                      className="border-r border-slate-100 py-1.5 px-2 text-right bg-slate-50"
                      title="From HR Profiles / General Wages"
                    >
                      <span className="font-semibold text-xs text-slate-500">{formatNumber(c.salary, 0)}</span>
                    </td>

                    {/* Attendance Days */}
                    <td
                      style={{ width: `${salaryWidths.attendanceDays}px`, minWidth: `${salaryWidths.attendanceDays}px` }}
                      className="border-r border-slate-100 py-1 px-1 text-center"
                    >
                      <NumericCellInput
                        value={c.attendanceDays || 0}
                        disabled={!canEditAccounts}
                        navRow={idx}
                        navCol={0}
                        onValueChange={(v) => handleCellChange(idx, 'attendanceDays', v)}
                        className="w-full text-center bg-transparent px-1 py-0.5 font-semibold text-xs focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded text-slate-800"
                      />
                    </td>

                    {/* Calculated Rate Per Day */}
                    <td
                      style={{ width: `${salaryWidths.ratePerDay}px`, minWidth: `${salaryWidths.ratePerDay}px` }}
                      className="border-r border-slate-100 py-1.5 px-2 text-right text-slate-500 whitespace-nowrap bg-slate-50"
                      title="Auto: Salary ÷ Days"
                    >
                      {formatNumber(c.ratePerDay, 2)}
                    </td>

                    {/* Calculated Rate Per Hr */}
                    <td
                      style={{ width: `${salaryWidths.ratePerHr}px`, minWidth: `${salaryWidths.ratePerHr}px` }}
                      className="border-r border-slate-100 py-1.5 px-2 text-right text-slate-500 whitespace-nowrap bg-slate-50"
                      title="From General Wages / duty hours"
                    >
                      {formatNumber(c.ratePerHr, 2)}
                    </td>

                    {/* Calculated Gross Salary */}
                    <td
                      style={{ width: `${salaryWidths.basicSalary}px`, minWidth: `${salaryWidths.basicSalary}px` }}
                      className="border-r border-slate-100 py-1.5 px-2 text-right font-semibold text-slate-500 whitespace-nowrap bg-slate-50"
                      title="Auto: Attn × Rate Per Day"
                    >
                      {formatNumber(c.basicSalary, 0)}
                    </td>

                    {/* Late Hrs */}
                    <td
                      style={{ width: `${salaryWidths.lateHours}px`, minWidth: `${salaryWidths.lateHours}px` }}
                      className="border-r border-slate-100 py-1 px-1 text-center"
                    >
                      <NumericCellInput
                        value={c.lateHours || 0}
                        disabled={!canEditAccounts}
                        navRow={idx}
                        navCol={1}
                        onValueChange={(v) => handleCellChange(idx, 'lateHours', v)}
                        className="w-full text-center bg-transparent px-1 py-0.5 font-semibold text-xs focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded text-slate-800"
                      />
                    </td>

                    {/* Late Amount */}
                    <td
                      style={{ width: `${salaryWidths.lateAmount}px`, minWidth: `${salaryWidths.lateAmount}px` }}
                      className="border-r border-slate-100 py-1 px-1"
                    >
                      <NumericCellInput
                        value={c.lateAmount || 0}
                        disabled={!canEditAccounts}
                        navRow={idx}
                        navCol={2}
                        onValueChange={(v) => handleCellChange(idx, 'lateAmount', v)}
                        className="w-full text-right bg-transparent px-1 py-0.5 font-semibold text-xs text-red-600 focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded"
                      />
                    </td>

                    {/* Advance Input */}
                    <td
                      style={{ width: `${salaryWidths.advanceDeduction}px`, minWidth: `${salaryWidths.advanceDeduction}px` }}
                      className="border-r border-slate-100 py-1 px-1"
                    >
                      <NumericCellInput
                        value={c.advanceDeduction || 0}
                        disabled={!canEditAccounts}
                        navRow={idx}
                        navCol={3}
                        onValueChange={(v) => handleCellChange(idx, 'advanceDeduction', v)}
                        className="w-full text-right bg-transparent px-2 py-0.5 font-semibold text-xs text-red-600 focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded"
                      />
                    </td>

                    {/* Ticket Charges */}
                    <td
                      style={{ width: `${salaryWidths.ticketCharges}px`, minWidth: `${salaryWidths.ticketCharges}px` }}
                      className="border-r border-slate-100 py-1 px-1"
                    >
                      <NumericCellInput
                        value={c.ticketCharges ?? 5}
                        disabled={!canEditAccounts}
                        navRow={idx}
                        navCol={4}
                        onValueChange={(v) => handleCellChange(idx, 'ticketCharges', v)}
                        className="w-full text-right bg-transparent px-1 py-0.5 font-semibold text-xs text-red-600 focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded"
                      />
                    </td>

                    {/* Net Salary */}
                    <td
                      style={{ width: `${salaryWidths.netAmount}px`, minWidth: `${salaryWidths.netAmount}px` }}
                      className="border-r border-slate-100 py-1.5 px-2 text-right font-bold text-[#0066cc] whitespace-nowrap bg-slate-50"
                      title="Gross − Late − Advance − Ticket"
                    >
                      {formatNumber(c.netAmount, 0)}
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
                            value={c.customFields?.[col.id] || ''}
                            disabled={!canEditAccounts}
                            onChange={(e) => handleCustomCellChange(idx, col.id, e.target.value)}
                            placeholder="—"
                            className="w-full bg-transparent px-1 py-0.5 font-medium font-sans text-xs focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded text-center"
                          />
                        </td>
                      )
                    })}

                    {/* Action */}
                    <td
                      style={{ width: `${salaryWidths.action}px`, minWidth: `${salaryWidths.action}px` }}
                      className="py-1 px-1 text-center print:hidden"
                    >
                      <button
                        onClick={() => handleDeleteRow(c.id)}
                        disabled={!canEditAccounts}
                        className="text-slate-400 hover:text-red-600 p-1 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold text-slate-900">
                  <td colSpan={3} className="border-r border-slate-200 py-2 px-2 text-center uppercase text-xs">Total Base Earned:</td>
                  <td className="border-r border-slate-200 py-2 px-2 text-right font-semibold">{formatNumber(contractList.reduce((s, c) => s + (c.salary || 0), 0), 0)}</td>
                  <td className="border-r border-slate-200 py-2 px-1 text-center text-slate-400">-</td>
                  <td className="border-r border-slate-200 py-2 px-2 text-right text-slate-400">-</td>
                  <td className="border-r border-slate-200 py-2 px-2 text-right text-slate-400">-</td>
                  <td className="border-r border-slate-200 py-2 px-2 text-right font-bold text-[#0066cc] text-sm">{formatCurrency(totalBasic)}</td>
                  <td className="border-r border-slate-200 py-2 px-2 text-right text-slate-400">-</td>
                  <td className="border-r border-slate-200 py-2 px-2 text-right text-red-600 font-semibold">{formatNumber(contractList.reduce((s, c) => s + (c.lateAmount || 0), 0), 0)}</td>
                  <td className="border-r border-slate-200 py-2 px-2 text-right text-red-600 font-semibold">{formatNumber(totalAdvance, 0)}</td>
                  <td className="border-r border-slate-200 py-2 px-2 text-right text-red-600 font-semibold">{formatNumber(totalTicket, 0)}</td>
                  <td className="border-r border-slate-200 py-2 px-2 text-right font-bold text-[#0066cc] text-sm">{formatCurrency(totalNet)}</td>
                  {customColumns.map((col) => (
                    <td key={col.id} className="border-r border-slate-200 py-2 px-2 text-center font-sans text-[10px] text-slate-500">
                      —
                    </td>
                  ))}
                  <td className="print:hidden"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Prominent Calculated Base Salary in Words */}
          <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 font-sans print:border-none print:p-2">
            <div>
              <span className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider">Contract Basic in Words (PKR):</span>
              <div className="text-xs font-semibold text-slate-900 mt-0.5">{numberToWordsPKR(totalBasic)}</div>
            </div>
            <div className="sm:text-right border-t sm:border-t-0 border-slate-200 pt-2 sm:pt-0 w-full sm:w-auto">
              <span className="text-[11px] font-semibold uppercase text-slate-500">Calculated Basic Earned:</span>
              <div className="text-lg font-bold text-[#0066cc]">{formatCurrency(totalBasic)}</div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: Sheet 5 - Contract OverTime */}
      {activeTab === 'overtime' && (
        <div className="rounded-lg border border-slate-200 bg-white text-slate-900 p-5 shadow-xs print:border-none print:p-0 print:shadow-none font-sans overflow-hidden">
          <div className="text-center border-b border-slate-200 pb-3 mb-4">
            <h1 className="text-xl font-bold uppercase text-slate-900 tracking-wide">SARA TEXTILES</h1>
            <h2 className="text-xs font-semibold text-slate-600 mt-0.5">CONTRACT EMPLOYEES OVERTIME (EXCEL SHEET 5)</h2>
            <p className="text-[11px] text-slate-500 font-mono">Statement for Month: August-2026 ({daysInMonth} Days Base)</p>
          </div>

          <div className="overflow-x-auto rounded-md border border-slate-200 shadow-xs">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 font-semibold uppercase text-[11px] text-slate-600">
                  <ResizableTh
                    columnKey="serialNo"
                    width={otWidths.serialNo}
                    minWidth={45}
                    onResize={setOtColWidth}
                    onReset={resetOtColWidth}
                    className="border-r border-slate-200 py-2 px-2 text-center"
                    title="Hover row serial to insert row at position"
                  >
                    S.#
                  </ResizableTh>

                  <ResizableTh
                    columnKey="employeeName"
                    width={otWidths.employeeName}
                    minWidth={130}
                    onResize={setOtColWidth}
                    onReset={resetOtColWidth}
                    className="border-r border-slate-200 py-2 px-3 font-sans"
                  >
                    Employee Name
                  </ResizableTh>

                  <ResizableTh
                    columnKey="designation"
                    width={otWidths.designation}
                    minWidth={110}
                    onResize={setOtColWidth}
                    onReset={resetOtColWidth}
                    className="border-r border-slate-200 py-2 px-3 font-sans"
                  >
                    Designation
                  </ResizableTh>

                  <ResizableTh
                    columnKey="otHours"
                    width={otWidths.otHours}
                    minWidth={75}
                    onResize={setOtColWidth}
                    onReset={resetOtColWidth}
                    className="border-r border-slate-200 py-2 px-2 text-center"
                  >
                    Overtime Hrs
                  </ResizableTh>

                  <ResizableTh
                    columnKey="ratePerHr"
                    width={otWidths.ratePerHr}
                    minWidth={80}
                    onResize={setOtColWidth}
                    onReset={resetOtColWidth}
                    className="border-r border-slate-200 py-2 px-3 text-right whitespace-nowrap"
                  >
                    Rate Per Hr
                  </ResizableTh>

                  <ResizableTh
                    columnKey="otAmount"
                    width={otWidths.otAmount}
                    minWidth={95}
                    onResize={setOtColWidth}
                    onReset={resetOtColWidth}
                    className="border-r border-slate-200 py-2 px-3 text-right font-semibold text-slate-900 whitespace-nowrap"
                  >
                    Over time Amount
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
                    width={otWidths.action}
                    minWidth={45}
                    enableResize={false}
                    className="py-2 px-1 text-center print:hidden"
                  >
                    Action
                  </ResizableTh>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {contractList.map((c, idx) => (
                  <tr key={c.id} className="text-slate-800 hover:bg-slate-50/80 transition-colors">
                    {/* S.# with Hover Row Insertion */}
                    <SerialCellWithInsert
                      serialNo={c.serialNo}
                      index={idx}
                      onInsertRow={handleInsertRow}
                    />
                    
                    <td
                      style={{ width: `${otWidths.employeeName}px`, minWidth: `${otWidths.employeeName}px` }}
                      className="border-r border-slate-100 py-1.5 px-3 font-sans font-semibold text-slate-900"
                    >
                      {c.employeeName}
                    </td>

                    <td
                      style={{ width: `${otWidths.designation}px`, minWidth: `${otWidths.designation}px` }}
                      className="border-r border-slate-100 py-1.5 px-3 font-sans text-slate-600"
                    >
                      {c.designation}
                    </td>

                    <td
                      style={{ width: `${otWidths.otHours}px`, minWidth: `${otWidths.otHours}px` }}
                      className="border-r border-slate-100 py-1 px-2 text-center"
                    >
                      <NumericCellInput
                        value={c.otHours || 0}
                        disabled={!canEditAccounts}
                        navRow={idx}
                        navCol={0}
                        onValueChange={(v) => handleCellChange(idx, 'otHours', v)}
                        className="w-20 text-center bg-transparent px-1 py-0.5 font-semibold text-xs text-slate-900 focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded mx-auto"
                      />
                    </td>

                    <td
                      style={{ width: `${otWidths.ratePerHr}px`, minWidth: `${otWidths.ratePerHr}px` }}
                      className="border-r border-slate-100 py-1.5 px-3 text-right text-slate-600 font-mono whitespace-nowrap"
                    >
                      {formatNumber(c.ratePerHr, 2)}
                    </td>

                    <td
                      style={{ width: `${otWidths.otAmount}px`, minWidth: `${otWidths.otAmount}px` }}
                      className="border-r border-slate-100 py-1.5 px-3 text-right font-semibold text-slate-900 font-mono whitespace-nowrap"
                    >
                      {formatNumber(c.otAmount, 0)}
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
                            value={c.customFields?.[col.id] || ''}
                            disabled={!canEditAccounts}
                            onChange={(e) => handleCustomCellChange(idx, col.id, e.target.value)}
                            placeholder="—"
                            className="w-full bg-transparent px-1 py-0.5 font-medium font-sans text-xs focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded text-center"
                          />
                        </td>
                      )
                    })}

                    <td
                      style={{ width: `${otWidths.action}px`, minWidth: `${otWidths.action}px` }}
                      className="py-1 px-1 text-center print:hidden"
                    >
                      <button
                        onClick={() => handleDeleteRow(c.id)}
                        disabled={!canEditAccounts}
                        className="text-slate-400 hover:text-red-600 p-1 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold text-slate-900">
                  <td colSpan={3} className="border-r border-slate-200 py-2 px-3 text-center uppercase text-xs">Total Overtime Disbursal:</td>
                  <td className="border-r border-slate-200 py-2 px-2 text-center font-semibold">{totalOTHours} hrs</td>
                  <td className="border-r border-slate-200 py-2 px-3 text-right text-slate-400">-</td>
                  <td className="border-r border-slate-200 py-2 px-3 text-right font-bold text-[#0066cc] text-sm">{formatCurrency(totalOT)}</td>
                  {customColumns.map((col) => (
                    <td key={col.id} className="border-r border-slate-200 py-2 px-2 text-center font-sans text-[10px] text-slate-500">
                      —
                    </td>
                  ))}
                  <td className="print:hidden"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Prominent Calculated OT in Words */}
          <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 font-sans print:border-none print:p-2">
            <div>
              <span className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider">Contract Overtime in Words (PKR):</span>
              <div className="text-xs font-semibold text-slate-900 mt-0.5">{numberToWordsPKR(totalOT)}</div>
            </div>
            <div className="sm:text-right border-t sm:border-t-0 border-slate-200 pt-2 sm:pt-0 w-full sm:w-auto">
              <span className="text-[11px] font-semibold uppercase text-slate-500">Calculated Total OT:</span>
              <div className="text-lg font-bold text-[#0066cc]">{formatCurrency(totalOT)}</div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: Sheet 7 - Net Payment Contract 1 to 31 */}
      {activeTab === 'net-payment' && (
        <div className="rounded-lg border border-slate-200 bg-white text-slate-900 p-5 shadow-xs print:border-none print:p-0 print:shadow-none font-sans overflow-hidden">
          <div className="text-center border-b border-slate-200 pb-3 mb-4">
            <h1 className="text-xl font-bold uppercase text-slate-900 tracking-wide">SARA TEXTILES</h1>
            <h2 className="text-xs font-semibold text-slate-600 mt-0.5">CONTRACT EMPLOYEE SALARY, OVERTIME & EFFICIENCY (EXCEL SHEET 7)</h2>
            <p className="text-[11px] text-slate-500 font-mono">Statement for Month: August-2026 (1 to {daysInMonth} Full Settlement)</p>
          </div>

          <div className="overflow-x-auto rounded-md border border-slate-200 shadow-xs">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 font-semibold uppercase text-[11px] text-slate-600">
                  <ResizableTh
                    columnKey="serialNo"
                    width={netWidths.serialNo}
                    minWidth={45}
                    onResize={setNetColWidth}
                    onReset={resetNetColWidth}
                    className="border-r border-slate-200 py-2 px-1 text-center"
                    title="Hover row serial to insert row at position"
                  >
                    S.#
                  </ResizableTh>

                  <ResizableTh
                    columnKey="employeeName"
                    width={netWidths.employeeName}
                    minWidth={130}
                    onResize={setNetColWidth}
                    onReset={resetNetColWidth}
                    className="border-r border-slate-200 py-2 px-3 font-sans"
                  >
                    Employee Name
                  </ResizableTh>

                  <ResizableTh
                    columnKey="designation"
                    width={netWidths.designation}
                    minWidth={110}
                    onResize={setNetColWidth}
                    onReset={resetNetColWidth}
                    className="border-r border-slate-200 py-2 px-3 font-sans"
                  >
                    Designation
                  </ResizableTh>

                  <ResizableTh
                    columnKey="salary"
                    width={netWidths.salary}
                    minWidth={80}
                    onResize={setNetColWidth}
                    onReset={resetNetColWidth}
                    className="border-r border-slate-200 py-2 px-2 text-right whitespace-nowrap"
                  >
                    Salary
                  </ResizableTh>

                  <ResizableTh
                    columnKey="attendanceDays"
                    width={netWidths.attendanceDays}
                    minWidth={50}
                    onResize={setNetColWidth}
                    onReset={resetNetColWidth}
                    className="border-r border-slate-200 py-2 px-1 text-center whitespace-nowrap"
                  >
                    Attn
                  </ResizableTh>

                  <ResizableTh
                    columnKey="basicSalary"
                    width={netWidths.basicSalary}
                    minWidth={80}
                    onResize={setNetColWidth}
                    onReset={resetNetColWidth}
                    className="border-r border-slate-200 py-2 px-2 text-right font-semibold text-slate-900 whitespace-nowrap"
                  >
                    Basic
                  </ResizableTh>

                  <ResizableTh
                    columnKey="otHours"
                    width={netWidths.otHours}
                    minWidth={60}
                    onResize={setNetColWidth}
                    onReset={resetNetColWidth}
                    className="border-r border-slate-200 py-2 px-1 text-center whitespace-nowrap"
                  >
                    O/T Hrs
                  </ResizableTh>

                  <ResizableTh
                    columnKey="otAmount"
                    width={netWidths.otAmount}
                    minWidth={80}
                    onResize={setNetColWidth}
                    onReset={resetNetColWidth}
                    className="border-r border-slate-200 py-2 px-2 text-right font-semibold text-slate-900 whitespace-nowrap"
                  >
                    O/T Amount
                  </ResizableTh>

                  <ResizableTh
                    columnKey="efficiencyAmount"
                    width={netWidths.efficiencyAmount}
                    minWidth={85}
                    onResize={setNetColWidth}
                    onReset={resetNetColWidth}
                    className="border-r border-slate-200 py-2 px-2 text-right font-semibold text-[#0066cc]"
                  >
                    Efficiency
                  </ResizableTh>

                  <ResizableTh
                    columnKey="grossSalary"
                    width={netWidths.grossSalary}
                    minWidth={85}
                    onResize={setNetColWidth}
                    onReset={resetNetColWidth}
                    className="border-r border-slate-200 py-2 px-2 text-right font-semibold text-slate-900 whitespace-nowrap"
                  >
                    Gross
                  </ResizableTh>

                  <ResizableTh
                    columnKey="advanceDeduction"
                    width={netWidths.advanceDeduction}
                    minWidth={80}
                    onResize={setNetColWidth}
                    onReset={resetNetColWidth}
                    className="border-r border-slate-200 py-2 px-2 text-right text-red-600 whitespace-nowrap"
                  >
                    Advance
                  </ResizableTh>

                  <ResizableTh
                    columnKey="ticketCharges"
                    width={netWidths.ticketCharges}
                    minWidth={55}
                    onResize={setNetColWidth}
                    onReset={resetNetColWidth}
                    className="border-r border-slate-200 py-2 px-1 text-center whitespace-nowrap"
                  >
                    Ticket
                  </ResizableTh>

                  <ResizableTh
                    columnKey="netAmount"
                    width={netWidths.netAmount}
                    minWidth={95}
                    onResize={setNetColWidth}
                    onReset={resetNetColWidth}
                    className="border-r border-slate-200 py-2 px-2 text-right font-bold text-[#0066cc] whitespace-nowrap"
                  >
                    Net Pay
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
                    width={netWidths.action}
                    minWidth={45}
                    enableResize={false}
                    className="py-2 px-1 text-center print:hidden"
                  >
                    Action
                  </ResizableTh>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {contractList.map((c, idx) => (
                  <tr key={c.id} className="text-slate-800 hover:bg-slate-50/80 transition-colors">
                    {/* S.# with Hover Row Insertion */}
                    <SerialCellWithInsert
                      serialNo={c.serialNo}
                      index={idx}
                      onInsertRow={handleInsertRow}
                    />
                    
                    <td
                      style={{ width: `${netWidths.employeeName}px`, minWidth: `${netWidths.employeeName}px` }}
                      className="border-r border-slate-100 py-1.5 px-3 font-sans font-semibold text-slate-900"
                    >
                      {c.employeeName}
                    </td>

                    <td
                      style={{ width: `${netWidths.designation}px`, minWidth: `${netWidths.designation}px` }}
                      className="border-r border-slate-100 py-1.5 px-3 font-sans text-slate-600"
                    >
                      {c.designation}
                    </td>

                    <td
                      style={{ width: `${netWidths.salary}px`, minWidth: `${netWidths.salary}px` }}
                      className="border-r border-slate-100 py-1.5 px-2 text-right whitespace-nowrap text-slate-700"
                    >
                      {formatNumber(c.salary, 0)}
                    </td>

                    <td
                      style={{ width: `${netWidths.attendanceDays}px`, minWidth: `${netWidths.attendanceDays}px` }}
                      className="border-r border-slate-100 py-1.5 px-1 text-center whitespace-nowrap text-slate-700"
                    >
                      {c.attendanceDays}
                    </td>

                    <td
                      style={{ width: `${netWidths.basicSalary}px`, minWidth: `${netWidths.basicSalary}px` }}
                      className="border-r border-slate-100 py-1.5 px-2 text-right font-semibold text-slate-900 whitespace-nowrap"
                    >
                      {formatNumber(c.basicSalary, 0)}
                    </td>

                    <td
                      style={{ width: `${netWidths.otHours}px`, minWidth: `${netWidths.otHours}px` }}
                      className="border-r border-slate-100 py-1.5 px-1 text-center font-medium whitespace-nowrap text-slate-700"
                    >
                      {c.otHours}
                    </td>

                    <td
                      style={{ width: `${netWidths.otAmount}px`, minWidth: `${netWidths.otAmount}px` }}
                      className="border-r border-slate-100 py-1.5 px-2 text-right font-semibold text-slate-900 whitespace-nowrap"
                    >
                      {formatNumber(c.otAmount, 0)}
                    </td>

                    <td
                      style={{ width: `${netWidths.efficiencyAmount}px`, minWidth: `${netWidths.efficiencyAmount}px` }}
                      className="border-r border-slate-100 py-1.5 px-2 text-right font-semibold text-[#0066cc]"
                    >
                      <NumericCellInput
                        value={c.efficiencyAmount || 0}
                        disabled={!canEditAccounts}
                        navRow={idx}
                        navCol={0}
                        onValueChange={(v) => handleCellChange(idx, 'efficiencyAmount', v)}
                        className="w-full text-right bg-transparent px-1 py-0.5 font-semibold text-xs focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded text-[#0066cc]"
                      />
                    </td>

                    <td
                      style={{ width: `${netWidths.grossSalary}px`, minWidth: `${netWidths.grossSalary}px` }}
                      className="border-r border-slate-100 py-1.5 px-2 text-right font-semibold text-slate-900 whitespace-nowrap"
                    >
                      {formatNumber(c.grossSalary, 0)}
                    </td>

                    <td
                      style={{ width: `${netWidths.advanceDeduction}px`, minWidth: `${netWidths.advanceDeduction}px` }}
                      className="border-r border-slate-100 py-1.5 px-2 text-right text-red-600 font-semibold whitespace-nowrap"
                    >
                      {formatNumber(c.advanceDeduction, 0)}
                    </td>

                    <td
                      style={{ width: `${netWidths.ticketCharges}px`, minWidth: `${netWidths.ticketCharges}px` }}
                      className="border-r border-slate-100 py-1 px-1 text-center"
                    >
                      <NumericCellInput
                        value={c.ticketCharges ?? 5}
                        disabled={!canEditAccounts}
                        navRow={idx}
                        navCol={1}
                        onValueChange={(v) => handleCellChange(idx, 'ticketCharges', v)}
                        className="w-full text-center bg-transparent px-1 py-0.5 font-semibold text-xs text-red-600 focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded"
                      />
                    </td>

                    <td
                      style={{ width: `${netWidths.netAmount}px`, minWidth: `${netWidths.netAmount}px` }}
                      className="border-r border-slate-100 py-1.5 px-2 text-right font-bold text-[#0066cc] whitespace-nowrap"
                    >
                      {formatNumber(c.netAmount, 0)}
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
                            value={c.customFields?.[col.id] || ''}
                            disabled={!canEditAccounts}
                            onChange={(e) => handleCustomCellChange(idx, col.id, e.target.value)}
                            placeholder="—"
                            className="w-full bg-transparent px-1 py-0.5 font-medium font-sans text-xs focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded text-center"
                          />
                        </td>
                      )
                    })}

                    <td
                      style={{ width: `${netWidths.action}px`, minWidth: `${netWidths.action}px` }}
                      className="py-1 px-1 text-center print:hidden"
                    >
                      <button
                        onClick={() => handleDeleteRow(c.id)}
                        disabled={!canEditAccounts}
                        className="text-slate-400 hover:text-red-600 p-1 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold text-slate-900">
                  <td colSpan={3} className="border-r border-slate-200 py-2 px-2 text-center uppercase text-xs">Consolidated Totals:</td>
                  <td className="border-r border-slate-200 py-2 px-2 text-right font-semibold">{formatNumber(contractList.reduce((s, c) => s + (c.salary || 0), 0), 0)}</td>
                  <td className="border-r border-slate-200 py-2 px-1 text-center text-slate-400">-</td>
                  <td className="border-r border-slate-200 py-2 px-2 text-right font-semibold">{formatNumber(totalBasic, 0)}</td>
                  <td className="border-r border-slate-200 py-2 px-1 text-center font-semibold">{totalOTHours}</td>
                  <td className="border-r border-slate-200 py-2 px-2 text-right font-semibold">{formatNumber(totalOT, 0)}</td>
                  <td className="border-r border-slate-200 py-2 px-2 text-right font-semibold text-[#0066cc]">{formatNumber(totalEfficiency, 0)}</td>
                  <td className="border-r border-slate-200 py-2 px-2 text-right font-semibold">{formatNumber(totalGross, 0)}</td>
                  <td className="border-r border-slate-200 py-2 px-2 text-right text-red-600 font-semibold">{formatNumber(totalAdvance, 0)}</td>
                  <td className="border-r border-slate-200 py-2 px-1 text-center text-slate-500">{totalTicket}</td>
                  <td className="border-r border-slate-200 py-2 px-2 text-right font-bold text-[#0066cc] text-sm">{formatCurrency(totalNet)}</td>
                  {customColumns.map((col) => (
                    <td key={col.id} className="border-r border-slate-200 py-2 px-2 text-center font-sans text-[10px] text-slate-500">
                      —
                    </td>
                  ))}
                  <td className="print:hidden"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Prominent Calculated Net Disbursal in Words */}
          <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 font-sans print:border-none print:p-2">
            <div>
              <span className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider">Net Contract Disbursal in Words (PKR):</span>
              <div className="text-xs font-semibold text-slate-900 mt-0.5">{numberToWordsPKR(totalNet)}</div>
            </div>
            <div className="sm:text-right border-t sm:border-t-0 border-slate-200 pt-2 sm:pt-0 w-full sm:w-auto">
              <span className="text-[11px] font-semibold uppercase text-slate-500">Calculated Net Payout:</span>
              <div className="text-lg font-bold text-[#0066cc]">{formatCurrency(totalNet)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ContractEmployeesPayrollPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading Contract Sheet...</div>}>
      <ContractPayrollContent />
    </Suspense>
  )
}
