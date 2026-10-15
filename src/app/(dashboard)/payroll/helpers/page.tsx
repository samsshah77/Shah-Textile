'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { payrollService, formatPayrollMonthLabel } from '@/services/payrollService'
import { HelperWageRecord, CustomColumn } from '@/types/payroll'
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
  Trash2,
  Save,
  CheckCircle2,
  Calculator,
  Lock,
  Edit2,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { ExportPdfButton } from '@/components/shared/ExportPdfButton'
import { NumericCellInput } from '@/components/shared/NumericCellInput'
import { PayrollMonthSelect } from '@/components/payroll/PayrollMonthSelect'
import { FortnightSelect, fortnightDisplayLabel } from '@/components/payroll/FortnightSelect'
import { PayrollSaveButton } from '@/components/payroll/PayrollSaveButton'
import { PayrollUnsavedBanner } from '@/components/payroll/PayrollUnsavedBanner'
import { usePayrollDirtyTracker } from '@/hooks/usePayrollDirtyTracker'
import { usePayrollModals } from '@/hooks/usePayrollModals'

const DEFAULT_HELPER_WIDTHS = {
  serialNo: 56,
  employeeName: 220,
  designation: 140,
  wagePerDay: 110,
  attendanceDays: 70,
  wagesAmount: 110,
  holidayAttendance: 80,
  otAmount: 130,
  netAmount: 125,
  action: 48,
}

function HelpersPayrollContent() {
  const { canEditAccounts } = useAuth()
  const { askConfirm, showSuccess, modals } = usePayrollModals()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const urlFn = searchParams.get('fortnight') as '1-15' | '16-31' | null
  const urlMonth = searchParams.get('month')
  const [activeFortnight, setActiveFortnight] = useState<'1-15' | '16-31'>(
    urlFn === '1-15' || urlFn === '16-31' ? urlFn : '1-15'
  )
  const [selectedMonth, setSelectedMonth] = useState(
    () =>
      (urlMonth && /^\d{4}-\d{2}$/.test(urlMonth) && urlMonth) ||
      payrollService.getActiveSalariedMonth()
  )

  const pushFilters = (next: { fortnight?: '1-15' | '16-31'; month?: string }) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next.fortnight) params.set('fortnight', next.fortnight)
    if (next.month) params.set('month', next.month)
    router.replace(`${pathname}?${params.toString()}`)
  }
  const [helpersList, setHelpersList] = useState<HelperWageRecord[]>([])
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([])

  // Resizable columns hook
  const {
    widths,
    setColumnWidth,
    resetColumnWidth,
    resetAllWidths,
  } = useResizableColumns('helpers_payroll', DEFAULT_HELPER_WIDTHS)

  // Unsaved changes tracker
  const {
    isCellDirty,
    isRowDirty,
    dirtyCount,
    hasUnsavedChanges,
    commitSaved,
    resetSnapshot,
    discardChanges,
    requestNavigationGuard,
  } = usePayrollDirtyTracker(
    helpersList,
    `${selectedMonth}-${activeFortnight}`,
    {
      sheetName: 'Helpers',
      editableFields: ['attendanceDays', 'holidayAttendance'],
    }
  )

  useEffect(() => {
    const fn = searchParams.get('fortnight') as '1-15' | '16-31' | null
    const m = searchParams.get('month')
    if (fn === '1-15' || fn === '16-31') setActiveFortnight(fn)
    if (m && /^\d{4}-\d{2}$/.test(m)) setSelectedMonth(m)
  }, [searchParams])

  const reload = (force = false) => {
    if (!force && hasUnsavedChanges) return
    const fresh = payrollService.getHelpersWages(selectedMonth, activeFortnight)
    setHelpersList(fresh)
    resetSnapshot(fresh)
  }

  useEffect(() => {
    reload()
    const handleSync = () => {
      // Helpers period is independent of Weaver fortnight — only refresh rows.
      reload()
    }
    window.addEventListener('payroll_synced', handleSync)
    return () => window.removeEventListener('payroll_synced', handleSync)
  }, [selectedMonth, activeFortnight])

  // Handle cell edit with live formula recalculation
  const handleCellChange = (
    index: number,
    field: keyof HelperWageRecord,
    value: string | number
  ) => {
    if (!canEditAccounts) return
    setHelpersList((prev) => {
      const updated = [...prev]
      const current = { ...updated[index], [field]: value }
      const recalculated = payrollService.calculateHelperWageRow(current)
      updated[index] = recalculated
      return updated
    })
  }

  const handleCustomCellChange = (index: number, colId: string, value: string) => {
    if (!canEditAccounts) return
    setHelpersList((prev) => {
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
    const raw: HelperWageRecord = {
      id: `h-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      serialNo: insertIdx !== undefined ? insertIdx + 2 : helpersList.length + 1,
      employeeName: 'NEW HELPER',
      designation: 'Helper',
      wagePerDay: 1050,
      attendanceDays: 13,
      wagesAmount: 13650,
      otRate: 1200,
      holidayAttendance: 0,
      otAmount: 0,
      netAmount: 13650,
      fortnight: activeFortnight,
      month: selectedMonth,
    }
    const newRecord = payrollService.calculateHelperWageRow(raw)

    const updated = [...helpersList]
    if (insertIdx !== undefined) {
      updated.splice(insertIdx + 1, 0, newRecord)
    } else {
      updated.push(newRecord)
    }

    const renumbered = updated.map((item, idx) => ({ ...item, serialNo: idx + 1 }))
    setHelpersList(renumbered)
  }

  const handleMoveRow = (index: number, direction: 'up' | 'down') => {
    if (!canEditAccounts) return
    const next = reorderSerialRows(helpersList, index, direction)
    if (!next) return
    setHelpersList(next)
  }

  // Delete row with confirmation
  const handleDeleteRow = (id: string) => {
    if (!canEditAccounts) return
    const row = helpersList.find((h) => h.id === id)
    if (!row) return
    const empName = row.employeeName || 'Helper'
    askConfirm({
      title: 'Delete Helper Row?',
      danger: true,
      confirmText: 'Delete Row',
      cancelText: 'Cancel',
      message: (
        <div className="space-y-2 text-xs text-slate-600 text-left">
          <p>
            Kya aap waqai <strong>{empName}</strong> ko is helper sheet se delete karna chahte hain?
          </p>
          <div className="rounded-md bg-amber-50 p-2.5 border border-amber-200 text-amber-800 text-[11px] leading-relaxed">
            <strong>Notice:</strong> Delete option abhi ke liye hai. In future, direct delete karne ke bajaye employee ko sirf <strong>Resign</strong> mark kiya jaye ga taake audit history mehfooz rahe.
          </div>
        </div>
      ),
      onConfirm: () => {
        payrollService.deleteWageSheetPerson('helper', row)
        const filtered = helpersList
          .filter((h) => h.id !== id)
          .filter(
            (h) =>
              !(
                (row.employeeId && h.employeeId === row.employeeId) ||
                (row.employeeName &&
                  h.employeeName &&
                  h.employeeName.trim().toLowerCase() === row.employeeName.trim().toLowerCase())
              )
          )
          .map((item, idx) => ({ ...item, serialNo: idx + 1 }))
        setHelpersList(filtered)
      },
    })
  }


  const handleSave = () => {
    if (!canEditAccounts) return
    askConfirm({
      title: 'Save helpers sheet?',
      message: `Save ${formatPayrollMonthLabel(selectedMonth)} (${fortnightDisplayLabel(selectedMonth, activeFortnight)})?`,
      confirmText: 'Save',
      onConfirm: () => {
        payrollService.saveHelpersWages(selectedMonth, activeFortnight, helpersList)
        commitSaved(helpersList)
        showSuccess('Saved', 'Helpers wages successfully saved.')
      },
    })
  }

  const handleDiscard = () => {
    askConfirm({
      title: 'Discard unsaved changes?',
      message: 'Unsaved edits revert ho jayenge. Proceed karein?',
      confirmText: 'Discard',
      onConfirm: () => {
        setHelpersList(discardChanges())
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

  const totalWages = helpersList.reduce((sum, h) => sum + (h.wagesAmount || 0), 0)
  const totalHolidayOT = helpersList.reduce((sum, h) => sum + (h.otAmount || 0), 0)
  const totalNet = helpersList.reduce((sum, h) => sum + (h.netAmount || 0), 0)

  return (
    <div className="space-y-6 print:space-y-2">
      <div className="print:hidden">
        <PageHeader
          title="Helpers Payroll"
          showTitle={false}
          breadcrumbs={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Payroll', href: '/payroll/helpers' },
            { label: 'Helpers' },
          ]}
          actions={
            <>
              <div className="inline-flex shrink-0 items-center gap-1.5">
                <PayrollMonthSelect
                  value={selectedMonth}
                  months={payrollService.listHelpersMonths()}
                  onChange={(m) => {
                    if (m === selectedMonth) return
                    requestNavigationGuard(() => {
                      setSelectedMonth(m)
                      pushFilters({ month: m, fortnight: activeFortnight })
                    })
                  }}
                />
                <FortnightSelect
                  month={selectedMonth}
                  value={activeFortnight}
                  onlyGenerated={false}
                  onChange={(fn) => {
                    if (fn === activeFortnight) return
                    requestNavigationGuard(() => {
                      setActiveFortnight(fn)
                      pushFilters({ fortnight: fn, month: selectedMonth })
                    })
                  }}
                />
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
                <ExportPdfButton
                  filename={`Helpers-${selectedMonth}-${activeFortnight || '1-15'}`}
                  className="!min-h-9 !h-9"
                />
              </div>
            </>
          }
        />
      </div>

      {/* Safety Notice if Editing is Disabled */}
      {!canEditAccounts && (
        <div className="flex items-center gap-2.5 p-3 rounded-lg border border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300 text-xs font-medium print:hidden">
          <Lock className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            Edit Protection Active: Click <strong>&quot;Enable Editing&quot;</strong> in the top navigation bar to modify helper wage rates, attendance, holiday shifts, or save changes.
          </span>
        </div>
      )}

      {/* Unsaved changes banner */}
      <PayrollUnsavedBanner
        dirtyCount={dirtyCount}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />

      {/* Printable Sheet */}
      <div className="erp-card p-5 sm:p-6 print:border-none print:p-0 font-sans">
        <div className="text-center border-b border-slate-200 dark:border-slate-700 pb-3 mb-4">
          <h1 className="text-xl font-bold uppercase text-slate-900 dark:text-white tracking-wide">SARA TEXTILES</h1>
          <h2 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mt-0.5">
            HELPERS WAGES STATEMENT ({formatPayrollMonthLabel(selectedMonth)} ·{' '}
            {fortnightDisplayLabel(selectedMonth, activeFortnight)})
          </h2>
          <p className="text-[11px] text-slate-500 font-mono mt-0.5">
            Period: {fortnightDisplayLabel(selectedMonth, activeFortnight)}
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
                  columnKey="employeeName"
                  width={widths.employeeName}
                  minWidth={130}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 dark:border-slate-700 py-2 px-3 font-sans"
                >
                  Helper Name
                </ResizableTh>

                <ResizableTh
                  columnKey="designation"
                  width={widths.designation}
                  minWidth={100}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 dark:border-slate-700 py-2 px-3 font-sans whitespace-nowrap"
                >
                  Designation
                </ResizableTh>

                <ResizableTh
                  columnKey="wagePerDay"
                  width={widths.wagePerDay}
                  minWidth={85}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 dark:border-slate-700 py-2 px-2 text-right"
                >
                  Wage/Day
                </ResizableTh>

                <ResizableTh
                  columnKey="attendanceDays"
                  width={widths.attendanceDays}
                  minWidth={55}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 dark:border-slate-700 py-2 px-1 text-center"
                >
                  Attn
                </ResizableTh>

                <ResizableTh
                  columnKey="wagesAmount"
                  width={widths.wagesAmount}
                  minWidth={85}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 dark:border-slate-700 py-2 px-2 text-right whitespace-nowrap"
                >
                  Wages Amt
                </ResizableTh>

                <ResizableTh
                  columnKey="holidayAttendance"
                  width={widths.holidayAttendance}
                  minWidth={65}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 dark:border-slate-700 py-2 px-1 text-center"
                >
                  Hol Shifts
                </ResizableTh>

                <ResizableTh
                  columnKey="otAmount"
                  width={widths.otAmount}
                  minWidth={95}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 dark:border-slate-700 py-2 px-2 text-right whitespace-nowrap"
                >
                  Holiday OT (1200)
                </ResizableTh>

                <ResizableTh
                  columnKey="netAmount"
                  width={widths.netAmount}
                  minWidth={95}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 dark:border-slate-700 py-2 px-2 text-right font-bold whitespace-nowrap text-[#0066cc] dark:text-sky-400"
                >
                  Net Payment
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
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {helpersList.map((h, idx) => (
                <tr
                  key={h.id}
                  className={cn(
                    'text-slate-800 dark:text-slate-200 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors',
                    isRowDirty(h.id) && 'payroll-row-dirty'
                  )}
                >
                  <SerialCellWithInsert
                    serialNo={h.serialNo}
                    index={idx}
                    onMoveUp={(i) => handleMoveRow(i, 'up')}
                    onMoveDown={(i) => handleMoveRow(i, 'down')}
                    canMoveUp={idx > 0}
                    canMoveDown={idx < helpersList.length - 1}
                  />
                  
                  {/* Name — from HR */}
                  <td
                    style={{ width: `${widths.employeeName}px`, minWidth: `${widths.employeeName}px` }}
                    className="border-r border-slate-100 dark:border-slate-800 py-1.5 px-2 bg-slate-50"
                    title="From HR Profiles / General Wages"
                  >
                    <span className="font-semibold font-sans text-xs text-slate-500">{h.employeeName}</span>
                  </td>

                  {/* Designation — from HR */}
                  <td
                    style={{ width: `${widths.designation}px`, minWidth: `${widths.designation}px` }}
                    className="border-r border-slate-100 dark:border-slate-800 py-1.5 px-3 bg-slate-50 font-sans text-slate-500 whitespace-nowrap text-xs"
                    title="From HR Profiles / General Wages"
                  >
                    {h.designation}
                  </td>

                  {/* Wage Per Day — From HR Profile Card */}
                  <td
                    style={{ width: `${widths.wagePerDay}px`, minWidth: `${widths.wagePerDay}px` }}
                    className="border-r border-slate-100 dark:border-slate-800 py-1.5 px-2 text-right bg-slate-50/50"
                    title="Set in HR Profile Card"
                  >
                    <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {formatNumber(h.wagePerDay || 0, 0)}
                    </span>
                  </td>

                  {/* Attendance Days (Editable) */}
                  <td
                    style={{ width: `${widths.attendanceDays}px`, minWidth: `${widths.attendanceDays}px` }}
                    className="border-r border-slate-100 dark:border-slate-800 py-1.5 px-1 text-center"
                  >
                    <NumericCellInput
                      value={h.attendanceDays || 0}
                      disabled={!canEditAccounts}
                      isDirty={isCellDirty(h.id, 'attendanceDays')}
                      navRow={idx}
                      navCol={1}
                      onValueChange={(v) => handleCellChange(idx, 'attendanceDays', v)}
                      className="w-full text-center bg-transparent px-1 py-1 font-medium text-xs focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-[#0066cc] focus:outline-none rounded text-slate-800 dark:text-slate-200"
                    />
                  </td>

                  {/* Calculated Wages Amount */}
                  <td
                    style={{ width: `${widths.wagesAmount}px`, minWidth: `${widths.wagesAmount}px` }}
                    className="border-r border-slate-100 dark:border-slate-800 py-1.5 px-2 text-right font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap"
                  >
                    {formatNumber(h.wagesAmount, 0)}
                  </td>

                  {/* Holiday Shifts — editable on sheet */}
                  <td
                    style={{ width: `${widths.holidayAttendance}px`, minWidth: `${widths.holidayAttendance}px` }}
                    className="border-r border-slate-100 dark:border-slate-800 py-1 px-1 text-center"
                  >
                    <NumericCellInput
                      value={h.holidayAttendance || 0}
                      disabled={!canEditAccounts}
                      isDirty={isCellDirty(h.id, 'holidayAttendance')}
                      navRow={idx}
                      navCol={2}
                      onValueChange={(v) => handleCellChange(idx, 'holidayAttendance', v)}
                      className="w-full text-center bg-transparent px-1 py-0.5 font-semibold text-xs focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-[#0066cc] rounded text-slate-800 dark:text-slate-200"
                    />
                  </td>

                  {/* Calculated Holiday OT */}
                  <td
                    style={{ width: `${widths.otAmount}px`, minWidth: `${widths.otAmount}px` }}
                    className="border-r border-slate-100 dark:border-slate-800 py-1.5 px-2 text-right font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap"
                  >
                    {formatNumber(h.otAmount, 0)}
                  </td>

                  {/* Calculated Net Payment */}
                  <td
                    style={{ width: `${widths.netAmount}px`, minWidth: `${widths.netAmount}px` }}
                    className="border-r border-slate-100 dark:border-slate-800 py-1.5 px-2 text-right font-semibold text-xs text-slate-900 dark:text-white whitespace-nowrap"
                  >
                    {formatNumber(h.netAmount, 0)}
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
                        <input
                          type="text"
                          value={h.customFields?.[col.id] || ''}
                          disabled={!canEditAccounts}
                          onChange={(e) => handleCustomCellChange(idx, col.id, e.target.value)}
                          placeholder="—"
                          className={cn(
                            'w-full bg-transparent px-1 py-1 font-medium font-sans text-xs focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-[#0066cc] focus:outline-none rounded text-center transition-colors',
                            isCellDirty(h.id, `cf_${col.id}`, h.customFields?.[col.id]) &&
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
                      <Link
                        href={`/payroll/profiles?search=${encodeURIComponent(h.employeeName)}`}
                        className="p-1 text-[#0066cc] hover:text-blue-800 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                        title={`Edit Overtime for ${h.employeeName} in HR Profile`}
                      >
                        <Edit2 className="size-3.5" />
                      </Link>
                      <button
                        onClick={() => handleDeleteRow(h.id)}
                        disabled={!canEditAccounts}
                        title={canEditAccounts ? 'Delete row' : 'Enable Editing to delete'}
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
              <tr className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 font-bold text-slate-900 dark:text-white text-xs">
                <td colSpan={5} className="border-r border-slate-200 dark:border-slate-700 py-2 px-2 font-sans uppercase text-[11px] text-slate-600 dark:text-slate-300">
                  Totals & Live Helper Sums:
                </td>
                <td className="border-r border-slate-200 dark:border-slate-700 py-2 px-2 text-right font-bold text-xs">
                  {formatNumber(totalWages, 0)}
                </td>
                <td className="border-r border-slate-200 dark:border-slate-700 py-2 px-1 text-center font-bold text-xs">
                  {helpersList.reduce((s, h) => s + Number(h.holidayAttendance || 0), 0)}
                </td>
                <td className="border-r border-slate-200 dark:border-slate-700 py-2 px-2 text-right font-bold text-xs">
                  {formatNumber(totalHolidayOT, 0)}
                </td>
                <td className="border-r border-slate-200 dark:border-slate-700 py-2 px-2 text-right font-bold text-xs text-[#0066cc] dark:text-sky-400">
                  {formatNumber(totalNet, 0)}
                </td>
                {customColumns.map((col) => (
                  <td key={col.id} className="border-r border-slate-200 dark:border-slate-700 py-2 px-2 text-center font-sans text-[11px] text-slate-400 font-normal">
                    —
                  </td>
                ))}
                <td className="py-2 px-1 text-center font-sans text-[10px] text-slate-400 print:hidden">OK</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Prominent Calculated Helpers Total in Words */}
        <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 p-3.5 font-sans print:border-none print:p-2">
          <div>
            <span className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400 tracking-wider">Helpers Net Payout in Words (PKR):</span>
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-0.5">{numberToWordsPKR(totalNet)}</div>
          </div>
          <div className="sm:text-right border-t sm:border-t-0 border-slate-200 dark:border-slate-700 pt-2 sm:pt-0 w-full sm:w-auto">
            <span className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">Total Fortnight Net Wages:</span>
            <div className="text-base font-bold text-[#0066cc] dark:text-sky-400">{formatCurrency(totalNet)}</div>
          </div>
        </div>
      </div>

      {/* Formula Explanation Alert at Bottom */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 p-3 text-xs text-slate-600 dark:text-slate-300 print:hidden">
        <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200 mb-1">
          <Calculator className="size-3.5 text-[#0066cc]" />
          <span>Active Helpers Formulas:</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-[11px] text-slate-600 dark:text-slate-400">
          <div>• <strong>Wages Amt</strong> = Wage/Day × Attn Days</div>
          <div>• <strong>Holiday OT</strong> = Holiday Shifts × 1,200</div>
          <div>• <strong>Net Payout</strong> = Wages Amt + Holiday OT</div>
        </div>
      </div>
    </div>
  )
}

export default function HelpersPayrollPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading Helpers Sheet...</div>}>
      <HelpersPayrollContent />
    </Suspense>
  )
}
