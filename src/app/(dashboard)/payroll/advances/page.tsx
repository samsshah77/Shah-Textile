'use client'

import { useState, useEffect } from 'react'
import { payrollService } from '@/services/payrollService'
import { AdvanceRecord, CustomColumn } from '@/types/payroll'
import { AddColumnButton, CustomColumnHeader } from '@/components/shared/CustomColumnModal'
import { SerialCellWithInsert } from '@/components/shared/InlineRowActions'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { useAuth } from '@/context/AuthContext'
import { AlertModal } from '@/components/ui/AlertModal'
import { formatCurrency, formatNumber, numberToWordsPKR } from '@/lib/utils'
import {
  DollarSign,
  Printer,
  PlusCircle,
  CheckCircle2,
  Calendar,
  Building,
  Plus,
  Trash2,
  RotateCcw,
  Save,
  Lock,
  Search,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { ExportPdfButton } from '@/components/shared/ExportPdfButton'
import { NumericCellInput } from '@/components/shared/NumericCellInput'

const DEFAULT_ADVANCE_WIDTHS = {
  serialNo: 50,
  date: 110,
  employeeName: 200,
  designation: 160,
  amount: 150,
  remarks: 160,
  action: 50,
}

export default function SalaryAdvancesPage() {
  const { canEditAccounts } = useAuth()
  const [advances, setAdvances] = useState<AdvanceRecord[]>([])
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([])
  const [selectedMonth, setSelectedMonth] = useState('2026-08')
  const [search, setSearch] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Delete confirmation modal state
  const [deleteConfirmState, setDeleteConfirmState] = useState<{
    isOpen: boolean
    advanceId: string
    employeeName: string
  }>({
    isOpen: false,
    advanceId: '',
    employeeName: '',
  })

  // Resizable columns hook
  const {
    widths,
    setColumnWidth,
    resetColumnWidth,
    resetAllWidths,
  } = useResizableColumns('salary_advances_v2', DEFAULT_ADVANCE_WIDTHS)

  // Form State
  const [employeeName, setEmployeeName] = useState('')
  const [designation, setDesignation] = useState('')
  const [amount, setAmount] = useState<number | string>('')
  const [formDate, setFormDate] = useState('2026-08-05')
  const [formRemarks, setFormRemarks] = useState('')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')

  const [masterEmployees, setMasterEmployees] = useState<
    { id: string; name: string; designation: string; salary: number }[]
  >([])

  const reload = () => {
    setAdvances(payrollService.getAdvances(selectedMonth, 'all'))
    setMasterEmployees(payrollService.getAdvanceEligibleEmployees())
  }

  useEffect(() => {
    reload()
    const handleSync = () => reload()
    window.addEventListener('payroll_synced', handleSync)
    return () => window.removeEventListener('payroll_synced', handleSync)
  }, [selectedMonth])

  const formatMonthName = (monthStr: string) => {
    try {
      const [y, m] = (monthStr || '2026-08').split('-').map(Number)
      const dateObj = new Date(y, m - 1, 1)
      return dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    } catch {
      return monthStr
    }
  }

  const totalAdvances = advances.reduce((s, a) => s + (Number(a.amount) || 0), 0)

  // Direct ID-based cell editing
  const handleCellChange = (id: string, field: keyof AdvanceRecord, value: string | number) => {
    if (!canEditAccounts) return
    setAdvances((prev) => {
      const updated = prev.map((item) => {
        if (item.id === id) {
          const modified = { ...item, [field]: value }
          if (field === 'amount') {
            payrollService.syncAdvanceToSalaries(
              modified.employeeId || modified.employeeName,
              selectedMonth,
              Number(value) || 0
            )
          }
          return modified
        }
        return item
      })
      return updated
    })
  }

  const handleSelectMasterEmployee = (empName: string) => {
    setEmployeeName(empName)
    const found = masterEmployees.find((e) => e.name.toLowerCase() === empName.toLowerCase())
    if (found) {
      setDesignation(found.designation || 'Staff')
      setSelectedEmployeeId(found.id || '')
    } else {
      setDesignation('')
      setSelectedEmployeeId('')
    }
  }

  const handleAddAdvance = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canEditAccounts) return
    const numAmt = parseFloat(amount as string)
    if (!employeeName || isNaN(numAmt)) return
    if (!selectedEmployeeId) {
      alert('Select an Advance-eligible employee from Profiles (enable Advance Eligible on their HR profile).')
      return
    }

    const newRecord: AdvanceRecord = {
      id: `adv-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      serialNo: advances.length + 1,
      employeeId: selectedEmployeeId,
      employeeName,
      designation: designation || 'Staff',
      amount: numAmt,
      date: formDate || `${selectedMonth}-05`,
      month: selectedMonth,
      fortnight: 'all',
      remarks: formRemarks,
    }

    const updated = [...advances, newRecord]
    setAdvances(updated)
    payrollService.saveAdvances(updated, true, selectedMonth)
    setEmployeeName('')
    setDesignation('')
    setSelectedEmployeeId('')
    setAmount('')
    setFormRemarks('')
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 2500)
  }

  // Insert row anywhere
  const handleInsertRow = (insertIdx?: number) => {
    if (!canEditAccounts) return
    const newRecord: AdvanceRecord = {
      id: `adv-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      serialNo: insertIdx !== undefined ? insertIdx + 2 : advances.length + 1,
      employeeName: 'New Staff',
      designation: 'Staff',
      amount: 5000,
      date: `${selectedMonth}-05`,
      month: selectedMonth,
      fortnight: 'all',
      remarks: '',
    }

    const updated = [...advances]
    if (insertIdx !== undefined) {
      updated.splice(insertIdx + 1, 0, newRecord)
    } else {
      updated.push(newRecord)
    }

    const renumbered = updated.map((item, idx) => ({ ...item, serialNo: idx + 1 }))
    setAdvances(renumbered)
    payrollService.saveAdvances(renumbered, true, selectedMonth)
  }

  const requestDeleteAdvance = (id: string, empName: string) => {
    if (!canEditAccounts) return
    setDeleteConfirmState({
      isOpen: true,
      advanceId: id,
      employeeName: empName || 'Employee',
    })
  }

  const confirmDeleteAdvance = () => {
    if (deleteConfirmState.advanceId) {
      handleDelete(deleteConfirmState.advanceId)
    }
    setDeleteConfirmState({ isOpen: false, advanceId: '', employeeName: '' })
  }

  const handleDelete = (id: string) => {
    const updated = advances.filter((a) => a.id !== id).map((item, idx) => ({ ...item, serialNo: idx + 1 }))
    setAdvances(updated)
    payrollService.saveAdvances(updated, true, selectedMonth)
  }

  const handleReset = () => {
    if (!canEditAccounts) return
    if (confirm('Reset Advances to default Excel template values?')) {
      localStorage.removeItem('sara_payroll_advances_v7')
      localStorage.removeItem('sara_payroll_advances_v6')
      reload()
      setCustomColumns([])
      resetAllWidths()
    }
  }

  const handleSave = () => {
    if (!canEditAccounts) return
    payrollService.saveAdvances(advances, true, selectedMonth)
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

  const handleCustomCellChange = (advanceId: string, colId: string, value: string) => {
    if (!canEditAccounts) return
    setAdvances((prev) =>
      prev.map((item) => {
        if (item.id !== advanceId) return item
        return {
          ...item,
          customFields: { ...(item.customFields || {}), [colId]: value },
        }
      })
    )
  }

  const filtered = advances.filter((a) => {
    return (
      a.employeeName.toLowerCase().includes(search.toLowerCase()) ||
      a.designation.toLowerCase().includes(search.toLowerCase()) ||
      (a.remarks && a.remarks.toLowerCase().includes(search.toLowerCase()))
    )
  })

  return (
    <div className="space-y-6 print:space-y-2">
      <div className="print:hidden">
        <PageHeader
          title="Salary Advances (Peshgi)"
          breadcrumbs={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Payroll', href: '/payroll/advances' },
            { label: 'Advances' },
          ]}
          actions={
            <>
              <button
                type="button"
                onClick={() => handleInsertRow()}
                disabled={!canEditAccounts}
                className="erp-btn-secondary text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="size-3.5 text-[#0066cc]" />
                <span>Add Row</span>
              </button>
              <AddColumnButton onAddColumn={handleAddCustomColumn} />
              <button
                type="button"
                onClick={handleReset}
                disabled={!canEditAccounts}
                title={canEditAccounts ? 'Reset to default template values' : 'Enable Editing to reset'}
                className="erp-btn-secondary text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RotateCcw className="size-3.5 text-slate-500" />
                <span>Reset</span>
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!canEditAccounts}
                className="erp-btn-primary text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="size-3.5" />
                <span>Save</span>
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="erp-btn-secondary text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="size-3.5 text-slate-500" />
                <span>Print</span>
              </button>
              <ExportPdfButton filename={`Advances-${selectedMonth}`} />
            </>
          }
        />
      </div>

      {/* Month & Search Filter Bar */}
      <div className="erp-card p-3 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          {/* Month Selector */}
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700">
            <Calendar className="size-3.5 text-[#0066cc]" />
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Month:</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
            />
          </div>
        </div>

        {/* Search Input & Total Badge */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="size-3.5 absolute left-2.5 top-2 text-slate-400" />
            <input
              type="text"
              placeholder="Search name, designation..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc] focus:outline-none w-52"
            />
          </div>

          <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300">
            <span>Total:</span>
            <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(totalAdvances)}</span>
            <span className="text-[11px] text-slate-400 font-normal">({filtered.length} entries)</span>
          </div>
        </div>
      </div>

      {/* Safety Notice if Editing is Disabled */}
      {!canEditAccounts && (
        <div className="flex items-center gap-2.5 p-3 rounded-lg border border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300 text-xs font-medium print:hidden">
          <Lock className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            Edit Protection Active: Click <strong>&quot;Enable Editing&quot;</strong> in the top navigation bar to issue advances, modify amounts, or insert rows.
          </span>
        </div>
      )}

      {saveSuccess && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300 print:hidden animate-in fade-in">
          <CheckCircle2 className="size-4 text-emerald-600" />
          <span>Advance salary vouchers and deductions synchronized with staff sheets!</span>
        </div>
      )}

      {/* New Advance Entry Form */}
      {canEditAccounts && (
        <div className="erp-card p-4 print:hidden">
          <h2 className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-3 flex items-center justify-between">
            <span>Issue New Advance (Peshgi Voucher)</span>
            <span className="text-[11px] font-normal text-slate-500 normal-case">
              For {formatMonthName(selectedMonth)}
            </span>
          </h2>

          <form onSubmit={handleAddAdvance} className="grid grid-cols-1 gap-3 sm:grid-cols-6">
            <div className="sm:col-span-2">
              <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300">Employee Name</label>
              <input
                type="text"
                required
                list="advance-employees-list"
                placeholder="Type or select name..."
                value={employeeName}
                onChange={(e) => handleSelectMasterEmployee(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
              />
              <datalist id="advance-employees-list">
                {masterEmployees.map((emp) => (
                  <option key={emp.id} value={emp.name}>
                    {emp.designation} (Base: PKR {emp.salary})
                  </option>
                ))}
              </datalist>
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300">Designation</label>
              <input
                type="text"
                placeholder="e.g. Incharge / Electrician"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-900 dark:text-white focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300">Advance Amount (PKR)</label>
              <input
                type="number"
                required
                min="1"
                placeholder="e.g. 20000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc] focus:outline-none font-mono"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300">Date</label>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs font-medium text-slate-900 dark:text-white focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc] focus:outline-none cursor-pointer"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                className="w-full erp-btn-primary flex items-center justify-center gap-1.5 text-xs py-1.5 cursor-pointer"
              >
                <PlusCircle className="size-3.5" />
                <span>Record Advance</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Printable Sheet */}
      <div className="erp-card p-5 sm:p-6 print:border-none print:p-0 font-sans">
        {/* Sheet Header */}
        <div className="text-center border-b border-slate-200 dark:border-slate-700 pb-3 mb-4">
          <h1 className="text-xl font-bold uppercase text-slate-900 dark:text-white tracking-wide">SARA TEXTILES</h1>
          <h2 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mt-0.5">
            ADVANCE SALARY REGISTER (PESHGI)
          </h2>
          <p className="text-[11px] text-slate-500 font-mono mt-0.5">
            Month: {formatMonthName(selectedMonth)}
          </p>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 font-semibold uppercase text-[11px] text-slate-600 dark:text-slate-300">
                <ResizableTh
                  columnKey="serialNo"
                  width={widths.serialNo}
                  minWidth={45}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 dark:border-slate-700 py-2 px-1 text-center"
                  title="Hover row serial to insert row at position"
                >
                  S.#
                </ResizableTh>

                <ResizableTh
                  columnKey="date"
                  width={widths.date}
                  minWidth={95}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 dark:border-slate-700 py-2 px-2 text-center font-sans"
                >
                  Date / Period
                </ResizableTh>

                <ResizableTh
                  columnKey="employeeName"
                  width={widths.employeeName}
                  minWidth={140}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 dark:border-slate-700 py-2 px-3 font-sans"
                >
                  Employee Name
                </ResizableTh>

                <ResizableTh
                  columnKey="designation"
                  width={widths.designation}
                  minWidth={120}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 dark:border-slate-700 py-2 px-3 font-sans"
                >
                  Designation
                </ResizableTh>

                <ResizableTh
                  columnKey="amount"
                  width={widths.amount}
                  minWidth={120}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 dark:border-slate-700 py-2 px-3 text-right text-slate-700 dark:text-slate-300"
                >
                  Advance Amount (PKR)
                </ResizableTh>

                <ResizableTh
                  columnKey="remarks"
                  width={widths.remarks}
                  minWidth={120}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 dark:border-slate-700 py-2 px-3 font-sans"
                >
                  Remarks / Voucher
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
                  className="py-2 px-2 text-center print:hidden"
                >
                  Action
                </ResizableTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7 + customColumns.length} className="py-8 text-center text-slate-400 font-sans text-xs">
                    No advance records found for {formatMonthName(selectedMonth)}. Click <strong>&quot;+ Add Advance Row&quot;</strong> or issue a new advance above.
                  </td>
                </tr>
              ) : (
                filtered.map((adv, idx) => (
                  <tr key={adv.id} className="text-slate-800 dark:text-slate-200 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                    {/* S.# with Hover Row Insertion */}
                    <SerialCellWithInsert
                      serialNo={adv.serialNo || idx + 1}
                      index={idx}
                      onInsertRow={canEditAccounts ? handleInsertRow : undefined}
                    />
                    
                    {/* Date / Period */}
                    <td
                      style={{ width: `${widths.date}px`, minWidth: `${widths.date}px` }}
                      className="border-r border-slate-100 dark:border-slate-800 py-1.5 px-1 text-center font-sans text-[11px]"
                    >
                      {canEditAccounts ? (
                        <input
                          type="text"
                          value={adv.date || (adv.fortnight === '16-31' ? '16-31 Half' : '01-15 Half')}
                          onChange={(e) => handleCellChange(adv.id, 'date', e.target.value)}
                          className="w-full text-center bg-transparent px-1 py-1 font-medium focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-[#0066cc] focus:outline-none rounded text-[11px]"
                        />
                      ) : (
                        <span>{adv.date || (adv.fortnight === '16-31' ? '16-31 Half' : '01-15 Half')}</span>
                      )}
                    </td>

                    {/* Name — from HR */}
                    <td
                      style={{ width: `${widths.employeeName}px`, minWidth: `${widths.employeeName}px` }}
                      className="border-r border-slate-100 dark:border-slate-800 py-1.5 px-2 bg-slate-50"
                      title="From HR Profiles"
                    >
                      <span className="font-semibold font-sans text-xs text-slate-500">{adv.employeeName}</span>
                    </td>

                    {/* Designation — from HR */}
                    <td
                      style={{ width: `${widths.designation}px`, minWidth: `${widths.designation}px` }}
                      className="border-r border-slate-100 dark:border-slate-800 py-1.5 px-2 bg-slate-50"
                      title="From HR Profiles"
                    >
                      <span className="font-medium font-sans text-xs text-slate-500">{adv.designation}</span>
                    </td>

                    {/* Amount (Fully Editable) */}
                    <td
                      style={{ width: `${widths.amount}px`, minWidth: `${widths.amount}px` }}
                      className="border-r border-slate-100 dark:border-slate-800 py-1.5 px-1"
                    >
                      {canEditAccounts ? (
                        <NumericCellInput
                          value={adv.amount || 0}
                          navRow={idx}
                          navCol={0}
                          onValueChange={(v) => handleCellChange(adv.id, 'amount', v)}
                          className="w-full text-right bg-transparent px-2 py-1 font-semibold text-xs text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-[#0066cc] focus:outline-none rounded font-mono"
                        />
                      ) : (
                        <div className="text-right px-2 py-1 font-semibold text-xs text-slate-900 dark:text-white font-mono">
                          {formatNumber(adv.amount || 0, 0)}
                        </div>
                      )}
                    </td>

                    {/* Remarks Input */}
                    <td
                      style={{ width: `${widths.remarks}px`, minWidth: `${widths.remarks}px` }}
                      className="border-r border-slate-100 dark:border-slate-800 py-1.5 px-1 font-sans text-slate-500"
                    >
                      {canEditAccounts ? (
                        <input
                          type="text"
                          value={adv.remarks || ''}
                          placeholder="Voucher / note..."
                          onChange={(e) => handleCellChange(adv.id, 'remarks', e.target.value)}
                          className="w-full bg-transparent px-2 py-1 font-normal font-sans text-xs focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-[#0066cc] focus:outline-none rounded text-slate-700 dark:text-slate-300"
                        />
                      ) : (
                        <span className="px-2 text-slate-500">{adv.remarks || '—'}</span>
                      )}
                    </td>

                    {/* Custom Column Cells */}
                    {customColumns.map((col) => {
                      const cWidth = col.width || 120
                      return (
                        <td
                          key={col.id}
                          style={{ width: `${cWidth}px`, minWidth: `${cWidth}px` }}
                          className="border-r border-slate-100 dark:border-slate-800 py-1.5 px-1"
                        >
                          {canEditAccounts ? (
                            <input
                              type="text"
                              value={adv.customFields?.[col.id] || ''}
                              onChange={(e) => handleCustomCellChange(adv.id, col.id, e.target.value)}
                              placeholder="—"
                              className="w-full bg-transparent px-1 py-1 font-medium font-sans text-xs focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-[#0066cc] focus:outline-none rounded text-center"
                            />
                          ) : (
                            <div className="text-center px-1 font-sans text-xs">{adv.customFields?.[col.id] || '—'}</div>
                          )}
                        </td>
                      )
                    })}

                    <td
                      style={{ width: `${widths.action}px`, minWidth: `${widths.action}px` }}
                      className="py-1 px-2 text-center print:hidden"
                    >
                      {canEditAccounts && (
                        <button
                          onClick={() => requestDeleteAdvance(adv.id, adv.employeeName)}
                          title="Delete advance entry"
                          className="p-1 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 font-bold text-slate-900 dark:text-white text-xs">
                <td colSpan={4} className="border-r border-slate-200 dark:border-slate-700 py-2 px-3 font-sans uppercase text-right text-[11px] text-slate-600 dark:text-slate-300">
                  Total Salary Advances ({filtered.length} Employees):
                </td>
                <td className="border-r border-slate-200 dark:border-slate-700 py-2 px-3 text-right font-bold text-xs text-slate-900 dark:text-white font-mono">
                  {formatNumber(totalAdvances, 0)}
                </td>
                <td className="border-r border-slate-200 dark:border-slate-700 py-2 px-2 text-center font-sans text-[11px] text-slate-500">
                  Full Month Total
                </td>
                {customColumns.map((col) => (
                  <td key={col.id} className="border-r border-slate-200 dark:border-slate-700 py-2 px-2 text-center font-sans text-[11px] text-slate-400 font-normal">
                    —
                  </td>
                ))}
                <td className="py-2 px-2 text-center print:hidden font-sans text-[10px] text-slate-400">OK</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Prominent Calculated Advances Total in Words */}
        <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 p-3.5 font-sans print:border-none print:p-2">
          <div>
            <span className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400 tracking-wider">
              Advances Disbursed in Words (PKR):
            </span>
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
              {numberToWordsPKR(totalAdvances)}
            </div>
          </div>
          <div className="sm:text-right border-t sm:border-t-0 border-slate-200 dark:border-slate-700 pt-2 sm:pt-0 w-full sm:w-auto">
            <span className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">
              Total Deducted from Staff Payout:
            </span>
            <div className="text-base font-bold text-[#0066cc] dark:text-sky-400">
              {formatCurrency(totalAdvances)}
            </div>
          </div>
        </div>
      </div>

      {/* Delete Advance Confirmation Modal */}
      <AlertModal
        isOpen={deleteConfirmState.isOpen}
        onClose={() => setDeleteConfirmState({ isOpen: false, advanceId: '', employeeName: '' })}
        onConfirm={confirmDeleteAdvance}
        type="confirm"
        title="Confirm Delete Advance Record"
        message={`Are you sure you want to delete the salary advance record for "${deleteConfirmState.employeeName}"?`}
        confirmText="Yes, Delete Record"
        cancelText="Cancel"
      />
    </div>
  )
}
