'use client'

import { useState, useEffect } from 'react'
import { payrollService, formatPayrollMonthLabel } from '@/services/payrollService'
import { AdvanceRecord, CustomColumn } from '@/types/payroll'
import { AddColumnButton, CustomColumnHeader } from '@/components/shared/CustomColumnModal'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { useAuth } from '@/context/AuthContext'
import { formatCurrency, formatNumber, numberToWordsPKR, cn } from '@/lib/utils'
import {
  Printer,
  PlusCircle,
  Trash2,
  Save,
  Lock,
  Search,
  X,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { ExportPdfButton } from '@/components/shared/ExportPdfButton'
import { NumericCellInput } from '@/components/shared/NumericCellInput'
import { PayrollMonthSelect } from '@/components/payroll/PayrollMonthSelect'
import { PayrollSaveButton } from '@/components/payroll/PayrollSaveButton'
import { PayrollUnsavedBanner } from '@/components/payroll/PayrollUnsavedBanner'
import { usePayrollDirtyTracker } from '@/hooks/usePayrollDirtyTracker'
import { usePayrollModals } from '@/hooks/usePayrollModals'

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
  const { askConfirm, showSuccess, showError, modals } = usePayrollModals()
  const [advances, setAdvances] = useState<AdvanceRecord[]>([])
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([])
  const [selectedMonth, setSelectedMonth] = useState(() => payrollService.getActiveSalariedMonth())
  const [search, setSearch] = useState('')
  const [showAddDialog, setShowAddDialog] = useState(false)


  // Resizable columns hook
  const {
    widths,
    setColumnWidth,
    resetColumnWidth,
    resetAllWidths,
  } = useResizableColumns('salary_advances_v2', DEFAULT_ADVANCE_WIDTHS)

  // Unsaved / dirty cell tracker
  const {
    isCellDirty,
    isRowDirty,
    dirtyCount,
    hasUnsavedChanges,
    commitSaved,
    resetSnapshot,
    discardChanges,
    requestNavigationGuard,
  } = usePayrollDirtyTracker(advances, selectedMonth, {
    sheetName: 'Advance',
    editableFields: ['date', 'amount', 'remarks'],
  })

  // Form State
  const [employeeName, setEmployeeName] = useState('')
  const [designation, setDesignation] = useState('')
  const [amount, setAmount] = useState<number | string>('')
  const [formDate, setFormDate] = useState(() => `${payrollService.getActiveSalariedMonth()}-05`)
  const [formRemarks, setFormRemarks] = useState('')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')

  const [masterEmployees, setMasterEmployees] = useState<
    { id: string; name: string; designation: string; salary: number }[]
  >([])

  const resetAddForm = () => {
    setEmployeeName('')
    setDesignation('')
    setSelectedEmployeeId('')
    setAmount('')
    setFormRemarks('')
    setFormDate(`${selectedMonth}-05`)
  }

  const reload = (force = false) => {
    if (!force && hasUnsavedChanges) return
    const fresh = payrollService.getAdvances(selectedMonth, 'all')
    setAdvances(fresh)
    resetSnapshot(fresh)
    setMasterEmployees(payrollService.getAdvanceEligibleEmployees())
  }

  useEffect(() => {
    reload()
    const handleSync = (e: Event) => {
      const detailMonth = (e as CustomEvent<{ month?: string }>).detail?.month
      const next =
        detailMonth && /^\d{4}-\d{2}$/.test(detailMonth)
          ? detailMonth
          : payrollService.getActiveSalariedMonth()
      if (next !== selectedMonth) {
        setSelectedMonth(next)
        setFormDate(`${next}-05`)
        return
      }
      reload()
    }
    window.addEventListener('payroll_synced', handleSync)
    return () => window.removeEventListener('payroll_synced', handleSync)
  }, [selectedMonth])

  const formatMonthName = (monthStr: string) => formatPayrollMonthLabel(monthStr)

  const totalAdvances = advances.reduce((s, a) => s + (Number(a.amount) || 0), 0)

  // Direct ID-based cell editing
  const handleCellChange = (id: string, field: keyof AdvanceRecord, value: string | number) => {
    if (!canEditAccounts) return
    // Sirf local state update — sync/persist Save dabane pe hoga.
    // (Pehle har keystroke pe sync -> payroll_synced -> reload() purani value wapis le aata tha)
    setAdvances((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    )
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

  const handleAddAdvance = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canEditAccounts) return
    const numAmt = parseFloat(amount as string)
    if (!employeeName || isNaN(numAmt)) return
    if (!selectedEmployeeId) {
      showError(
        'Employee required',
        'Advance-eligible employee Profiles se select karo (Advance Eligible enable hona chahiye).'
      )
      return
    }

    const existing = payrollService.hasAdvanceForEmployee(
      selectedMonth,
      selectedEmployeeId,
      employeeName
    )
    if (existing) {
      showError(
        'Already exists',
        `"${employeeName}" ka advance ${formatMonthName(selectedMonth)} me pehle se hai (Rs. ${formatNumber(existing.amount || 0)}). Amount table me edit karo.`
      )
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
    const ok = await payrollService.saveAdvancesAsync(updated, true, selectedMonth)
    setShowAddDialog(false)
    resetAddForm()
    if (ok) {
      commitSaved(updated)
      showSuccess('Advance saved', `"${employeeName}" ka advance record ho gaya.`)
    } else {
      showError('Save failed', 'Advance local me save hua lekin server pe nahi gaya. Dobara Save dabao.')
    }
  }

  const requestDeleteAdvance = (id: string, empName: string) => {
    if (!canEditAccounts) return
    askConfirm({
      title: 'Delete Advance Entry?',
      danger: true,
      confirmText: 'Delete Advance',
      cancelText: 'Cancel',
      message: (
        <div className="space-y-2 text-xs text-slate-600 text-left">
          <p>
            Kya aap waqai <strong>{empName || 'Employee'}</strong> ka yeh advance record delete karna chahte hain?
          </p>
          <div className="rounded-md bg-amber-50 p-2.5 border border-amber-200 text-amber-800 text-[11px] leading-relaxed">
            <strong>Notice:</strong> Delete option abhi ke liye hai. In future, direct delete karne ke bajaye employee ko sirf <strong>Resign</strong> mark kiya jaye ga taake audit history mehfooz rahe.
          </div>
        </div>
      ),
      onConfirm: async () => {
        const updated = advances.filter((a) => a.id !== id).map((item, idx) => ({ ...item, serialNo: idx + 1 }))
        setAdvances(updated)
        const ok = await payrollService.saveAdvancesAsync(updated, true, selectedMonth)
        if (ok) commitSaved(updated)
      },
    })
  }

  const handleSave = () => {
    if (!canEditAccounts) return
    askConfirm({
      title: 'Save advances?',
      message: `Save advances for ${formatMonthName(selectedMonth)}?`,
      confirmText: 'Save',
      onConfirm: async () => {
        const ok = await payrollService.saveAdvancesAsync(advances, true, selectedMonth)
        if (ok) {
          commitSaved(advances)
          showSuccess('Saved', 'Advances successfully saved.')
        } else {
          showError('Save failed', 'Advances server pe save nahi huay. Dobara Save dabao.')
        }
      },
    })
  }

  const handleDiscard = () => {
    askConfirm({
      title: 'Discard unsaved changes?',
      message: 'Aap ke unsaved edits revert ho jayenge. Proceed karein?',
      confirmText: 'Discard',
      onConfirm: () => {
        setAdvances(discardChanges())
      },
    })
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
          showTitle={false}
          breadcrumbs={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Payroll', href: '/payroll/advances' },
            { label: 'Advances' },
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
                              title: 'Unsaved changes',
                              message:
                                'Aap ke paas unsaved edits hain. Month badalne se yeh discard ho jayenge. Proceed karein?',
                              confirmText: 'Discard & Switch',
                              onConfirm: async () => {
                                await payrollService.setActiveSalariedMonthAsync(m)
                                setSelectedMonth(m)
                                setFormDate(`${m}-05`)
                              },
                            })
                            return
                          }
                          void payrollService.setActiveSalariedMonthAsync(m)
                          setSelectedMonth(m)
                          setFormDate(`${m}-05`)
                        }
                      : undefined
                  }
                />
                {canEditAccounts && (
                  <button
                    type="button"
                    onClick={() => {
                      resetAddForm()
                      setShowAddDialog(true)
                    }}
                    className="erp-btn-primary text-xs !min-h-9 !h-9"
                  >
                    <PlusCircle className="size-3.5" />
                    <span>Add Advance</span>
                  </button>
                )}
              </div>
              <div className="inline-flex shrink-0 items-center gap-1.5">
                <AddColumnButton onAddColumn={handleAddCustomColumn} />

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
                <ExportPdfButton filename={`Advances-${selectedMonth}`} className="!min-h-9 !h-9" />
              </div>
            </>
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-2.5 print:hidden">
        <div className="relative min-w-[200px] flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search name, designation…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc]/40"
          />
        </div>
        <div className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 h-[38px] text-xs font-medium text-slate-700">
          <span>Total:</span>
          <span className="font-bold text-slate-900">{formatCurrency(totalAdvances)}</span>
          <span className="text-[11px] text-slate-400 font-normal">({filtered.length})</span>
        </div>
      </div>

      {!canEditAccounts && (
        <div className="flex items-center gap-2.5 p-3 rounded-lg border border-amber-200 bg-amber-50/70 text-amber-900 text-xs font-medium print:hidden">
          <Lock className="size-4 shrink-0 text-amber-600" />
          <span>
            Edit Protection Active: Click <strong>&quot;Enable Editing&quot;</strong> in the top navigation bar to issue advances or modify amounts.
          </span>
        </div>
      )}

      {modals}

      {showAddDialog && (
        <div
          className="fixed inset-0 z-[1080] flex items-center justify-center p-4 print:hidden"
          style={{ background: 'rgba(15, 23, 42, 0.48)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAddDialog(false)
          }}
        >
          <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-black/5">
            <div className="relative border-b border-slate-100 px-5 py-4">
              <button
                type="button"
                onClick={() => setShowAddDialog(false)}
                className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
              <h3 className="text-[15px] font-semibold text-slate-900 pr-8">Add Advance</h3>
              <p className="mt-1 text-[12px] text-slate-500">
                For {formatMonthName(selectedMonth)}
              </p>
            </div>
            <form onSubmit={handleAddAdvance} className="space-y-3 px-5 py-4">
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-slate-700">
                  Employee <span className="font-normal text-slate-400">(eligible only)</span>
                </span>
                <input
                  type="text"
                  required
                  list="advance-employees-list"
                  placeholder={
                    masterEmployees.length
                      ? 'Type or select name…'
                      : 'No Advance Eligible employee'
                  }
                  value={employeeName}
                  onChange={(e) => handleSelectMasterEmployee(e.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc]/40"
                />
                <datalist id="advance-employees-list">
                  {masterEmployees.map((emp) => (
                    <option key={emp.id} value={emp.name}>
                      {emp.designation} (Base: PKR {emp.salary})
                    </option>
                  ))}
                </datalist>
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-slate-700">Designation</span>
                <input
                  type="text"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc]/40"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-slate-700">Amount (PKR)</span>
                  <input
                    type="number"
                    required
                    min="1"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-mono font-semibold text-slate-900 outline-none focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc]/40"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-slate-700">Date</span>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc]/40"
                  />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-slate-700">Remarks</span>
                <input
                  type="text"
                  value={formRemarks}
                  onChange={(e) => setFormRemarks(e.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc]/40"
                />
              </label>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddDialog(false)}
                  className="erp-btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button type="submit" className="erp-btn-primary text-xs">
                  <PlusCircle className="size-3.5" />
                  Save Advance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unsaved changes alert banner */}
      <PayrollUnsavedBanner
        dirtyCount={dirtyCount}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />

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
                    No advance records for {formatMonthName(selectedMonth)}. Click <strong>Add Advance</strong> to issue one.
                  </td>
                </tr>
              ) : (
                filtered.map((adv, idx) => (
                  <tr
                    key={adv.id}
                    className={cn(
                      'text-slate-800 dark:text-slate-200 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors',
                      isRowDirty(adv.id) && 'payroll-row-dirty'
                    )}
                  >
                    <td
                      style={{ width: `${widths.serialNo}px`, minWidth: `${widths.serialNo}px` }}
                      className="border-r border-slate-100 dark:border-slate-800 py-1.5 px-1 text-center font-mono text-slate-700"
                    >
                      {adv.serialNo || idx + 1}
                    </td>

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
                          className={cn(
                            'w-full text-center bg-transparent px-1 py-1 font-medium focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-[#0066cc] focus:outline-none rounded text-[11px] transition-colors',
                            isCellDirty(adv.id, 'date') && 'payroll-cell-dirty'
                          )}
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
                          isDirty={isCellDirty(adv.id, 'amount')}
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
                          className={cn(
                            'w-full bg-transparent px-2 py-1 font-normal font-sans text-xs focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-[#0066cc] focus:outline-none rounded text-slate-700 dark:text-slate-300 transition-colors',
                            isCellDirty(adv.id, 'remarks') && 'payroll-cell-dirty'
                          )}
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
                              className={cn(
                                'w-full bg-transparent px-1 py-1 font-medium font-sans text-xs focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-[#0066cc] focus:outline-none rounded text-center transition-colors',
                                isCellDirty(adv.id, `cf_${col.id}`, adv.customFields?.[col.id]) &&
                                  'payroll-cell-dirty'
                              )}
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

      {modals}
    </div>
  )
}
