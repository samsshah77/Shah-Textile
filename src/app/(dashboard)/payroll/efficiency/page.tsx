'use client'

import { useState, useEffect } from 'react'
import { payrollService, formatPayrollMonthLabel } from '@/services/payrollService'
import { EfficiencyIncentiveRecord, LoomCategoryFilter, CustomColumn } from '@/types/payroll'
import { AddColumnButton, CustomColumnHeader } from '@/components/shared/CustomColumnModal'
import { SerialCellWithInsert, reorderSerialRows } from '@/components/shared/InlineRowActions'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { useAuth } from '@/context/AuthContext'
import { formatCurrency, formatNumber, numberToWordsPKR } from '@/lib/utils'
import {
  Zap,
  Printer,
  DollarSign,
  Percent,
  Trash2,
  RotateCcw,
  Save,
  CheckCircle2,
  Calculator,
  Lock,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { ExportPdfButton } from '@/components/shared/ExportPdfButton'
import { NumericCellInput } from '@/components/shared/NumericCellInput'
import { PayrollMonthSelect } from '@/components/payroll/PayrollMonthSelect'
import { usePayrollModals } from '@/hooks/usePayrollModals'

const DEFAULT_EFFICIENCY_WIDTHS = {
  serialNo: 56,
  loom: 120,
  name: 220,
  designation: 180,
  efficiencyPercent: 100,
  salaryEarned: 120,
  availPercent: 95,
  amount: 130,
  action: 48,
}

export default function TechnicalEfficiencyPage() {
  const { askConfirm, showSuccess, modals } = usePayrollModals()
  const { canEditAccounts } = useAuth()
  const [incentiveList, setIncentiveList] = useState<EfficiencyIncentiveRecord[]>([])
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([])
  const [selectedMonth, setSelectedMonth] = useState(() => payrollService.getActiveSalariedMonth())

  // Resizable columns hook
  const {
    widths,
    setColumnWidth,
    resetColumnWidth,
    resetAllWidths,
  } = useResizableColumns('technical_efficiency', DEFAULT_EFFICIENCY_WIDTHS)

  const reload = () => {
    setIncentiveList(payrollService.getEfficiencyIncentives(selectedMonth))
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
        return
      }
      reload()
    }
    window.addEventListener('payroll_synced', handleSync)
    return () => window.removeEventListener('payroll_synced', handleSync)
  }, [selectedMonth])

  // Handle cell edit with live formula recalculation
  const handleCellChange = (
    index: number,
    field: keyof EfficiencyIncentiveRecord,
    value: string | number
  ) => {
    if (!canEditAccounts) return
    setIncentiveList((prev) => {
      const updated = [...prev]
      const current = { ...updated[index], [field]: value }
      const recalculated = payrollService.calculateEfficiencyRow(current)
      updated[index] = recalculated
      return updated
    })
  }

  const handleCustomCellChange = (index: number, colId: string, value: string) => {
    if (!canEditAccounts) return
    setIncentiveList((prev) => {
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
    const raw: EfficiencyIncentiveRecord = {
      id: `eff-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      serialNo: insertIdx !== undefined ? insertIdx + 2 : incentiveList.length + 1,
      loom: 'G6200',
      name: 'New Technical Staff',
      designation: 'Technician',
      efficiencyPercent: 75,
      salaryEarned: 50000,
      availPercent: 15,
      amount: 7500,
      month: selectedMonth,
    }
    const newRecord = payrollService.calculateEfficiencyRow(raw)

    const updated = [...incentiveList]
    if (insertIdx !== undefined) {
      updated.splice(insertIdx + 1, 0, newRecord)
    } else {
      updated.push(newRecord)
    }

    const renumbered = updated.map((item, idx) => ({ ...item, serialNo: idx + 1 }))
    setIncentiveList(renumbered)
    payrollService.saveEfficiencyIncentives(renumbered)
  }

  const handleMoveRow = (index: number, direction: 'up' | 'down') => {
    if (!canEditAccounts) return
    const next = reorderSerialRows(incentiveList, index, direction)
    if (!next) return
    setIncentiveList(next)
    payrollService.saveEfficiencyIncentives(next)
  }

  // Delete row and renumber
  const handleDeleteRow = (id: string) => {
    if (!canEditAccounts) return
    const updated = incentiveList.filter((item) => item.id !== id).map((item, idx) => ({ ...item, serialNo: idx + 1 }))
    setIncentiveList(updated)
    payrollService.saveEfficiencyIncentives(updated)
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

  const handleReset = () => {
    if (!canEditAccounts) return
    askConfirm({
      title: 'Reset efficiency sheet?',
      message: 'Default template values pe reset ho jayega. Undo nahi hoga.',
      confirmText: 'Reset',
      danger: true,
      onConfirm: () => {
        payrollService.resetAllToDefault()
        setIncentiveList(payrollService.getEfficiencyIncentives(selectedMonth))
        setCustomColumns([])
        resetAllWidths()
        showSuccess('Reset complete', 'Efficiency sheet template pe restore ho gaya.')
      },
    })
  }

  const handleSave = () => {
    if (!canEditAccounts) return
    askConfirm({
      title: 'Save efficiency sheet?',
      message: 'Efficiency incentives save ho jayengi.',
      confirmText: 'Save',
      onConfirm: () => {
        payrollService.saveEfficiencyIncentives(incentiveList)
        showSuccess('Saved', 'Efficiency incentives successfully saved.')
      },
    })
  }

  const handlePrint = () => {
    window.print()
  }

  const totalIncentive = incentiveList.reduce((sum, e) => sum + (e.amount || 0), 0)
  const totalSalaryBase = incentiveList.reduce((sum, e) => sum + (e.salaryEarned || 0), 0)
  const avgEfficiency = incentiveList.length
    ? Math.round(incentiveList.reduce((sum, e) => sum + (e.efficiencyPercent || 0), 0) / incentiveList.length)
    : 0

  return (
    <div className="space-y-6 print:space-y-2">
      <div className="print:hidden">
        <PageHeader
          title="Efficiency Incentive"
          showTitle={false}
          breadcrumbs={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Payroll', href: '/payroll/efficiency' },
            { label: 'Efficiency' },
          ]}
          actions={
            <>
              <div className="inline-flex shrink-0 items-center gap-1.5">
                <PayrollMonthSelect
                  value={selectedMonth}
                  disabled={!canEditAccounts}
                  onChange={
                    canEditAccounts
                      ? async (m) => {
                          await payrollService.setActiveSalariedMonthAsync(m)
                          setSelectedMonth(m)
                        }
                      : undefined
                  }
                />
              </div>
              <div className="inline-flex shrink-0 items-center gap-1.5">
                <AddColumnButton onAddColumn={handleAddCustomColumn} />
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={!canEditAccounts}
                  title={canEditAccounts ? 'Reset to default template' : 'Enable Editing to reset'}
                  className="erp-btn-secondary text-xs !min-h-9 !h-9 !text-slate-800"
                >
                  <RotateCcw className="size-3.5" />
                  <span>Reset</span>
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!canEditAccounts}
                  className="erp-btn-primary text-xs !min-h-9 !h-9"
                >
                  <Save className="size-3.5" />
                  <span>Save</span>
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="erp-btn-secondary text-xs !min-h-9 !h-9 !text-slate-800"
                >
                  <Printer className="size-3.5" />
                  <span>Print</span>
                </button>
                <ExportPdfButton filename={`Efficiency-${selectedMonth}`} className="!min-h-9 !h-9" />
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
            Edit Protection Active: Click <strong>&quot;Enable Editing&quot;</strong> in the top navigation bar to modify efficiency percentages, salaries, or save changes.
          </span>
        </div>
      )}

      {modals}

      {/* Printable Sheet */}
      <div className="erp-card p-5 sm:p-6 print:border-none print:p-0 font-sans">
        <div className="text-center border-b border-slate-200 dark:border-slate-700 pb-3 mb-4">
          <h1 className="text-xl font-bold uppercase text-slate-900 dark:text-white tracking-wide">SARA TEXTILES</h1>
          <h2 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mt-0.5">TECHNICAL STAFF EFFICIENCY INCENTIVE SHEET</h2>
          <p className="text-[11px] text-slate-500 font-mono mt-0.5">
            Statement for Month: {formatPayrollMonthLabel(selectedMonth)}
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
                  columnKey="loom"
                  width={widths.loom}
                  minWidth={90}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 dark:border-slate-700 py-2 px-2 font-sans"
                >
                  Loom Group
                </ResizableTh>

                <ResizableTh
                  columnKey="name"
                  width={widths.name}
                  minWidth={130}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 dark:border-slate-700 py-2 px-3 font-sans"
                >
                  Staff Name
                </ResizableTh>

                <ResizableTh
                  columnKey="designation"
                  width={widths.designation}
                  minWidth={110}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 dark:border-slate-700 py-2 px-3 font-sans"
                >
                  Designation
                </ResizableTh>

                <ResizableTh
                  columnKey="efficiencyPercent"
                  width={widths.efficiencyPercent}
                  minWidth={85}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 dark:border-slate-700 py-2 px-1 text-center"
                >
                  Efficiency %
                </ResizableTh>

                <ResizableTh
                  columnKey="salaryEarned"
                  width={widths.salaryEarned}
                  minWidth={95}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 dark:border-slate-700 py-2 px-2 text-right"
                >
                  Salary Earned
                </ResizableTh>

                <ResizableTh
                  columnKey="availPercent"
                  width={widths.availPercent}
                  minWidth={75}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 dark:border-slate-700 py-2 px-1 text-center whitespace-nowrap"
                >
                  Avail %
                </ResizableTh>

                <ResizableTh
                  columnKey="amount"
                  width={widths.amount}
                  minWidth={95}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 dark:border-slate-700 py-2 px-2 text-right font-bold whitespace-nowrap text-[#0066cc] dark:text-sky-400"
                >
                  Incentive Amt
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
              {incentiveList.map((e, idx) => (
                <tr key={e.id} className="text-slate-800 dark:text-slate-200 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                  <SerialCellWithInsert
                    serialNo={e.serialNo}
                    index={idx}
                    onMoveUp={(i) => handleMoveRow(i, 'up')}
                    onMoveDown={(i) => handleMoveRow(i, 'down')}
                    canMoveUp={idx > 0}
                    canMoveDown={idx < incentiveList.length - 1}
                  />
                  
                  {/* Loom Group */}
                  <td
                    style={{ width: `${widths.loom}px`, minWidth: `${widths.loom}px` }}
                    className="border-r border-slate-100 dark:border-slate-800 py-1.5 px-1"
                  >
                    <select
                      value={e.loom}
                      disabled={!canEditAccounts}
                      onChange={(ev) => handleCellChange(idx, 'loom', ev.target.value as LoomCategoryFilter)}
                      className="w-full bg-transparent px-2 py-1 font-semibold font-sans text-xs focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-[#0066cc] focus:outline-none rounded cursor-pointer disabled:opacity-50 text-slate-800 dark:text-slate-200"
                    >
                      <option value="G6200">G6200</option>
                      <option value="G6300">G6300</option>
                      <option value="PU">PU</option>
                      <option value="Overall">Overall</option>
                    </select>
                  </td>

                  {/* Name — from HR */}
                  <td
                    style={{ width: `${widths.name}px`, minWidth: `${widths.name}px` }}
                    className="border-r border-slate-100 dark:border-slate-800 py-1.5 px-2 bg-slate-50"
                    title="From HR Profiles / General Wages"
                  >
                    <span className="font-semibold font-sans text-xs text-slate-500">{e.name}</span>
                  </td>

                  {/* Designation — from HR */}
                  <td
                    style={{ width: `${widths.designation}px`, minWidth: `${widths.designation}px` }}
                    className="border-r border-slate-100 dark:border-slate-800 py-1.5 px-2 bg-slate-50"
                    title="From HR Profiles / General Wages"
                  >
                    <span className="font-sans text-xs text-slate-500">{e.designation}</span>
                  </td>

                  {/* Efficiency % (Editable) */}
                  <td
                    style={{ width: `${widths.efficiencyPercent}px`, minWidth: `${widths.efficiencyPercent}px` }}
                    className="border-r border-slate-100 dark:border-slate-800 py-1.5 px-1 text-center"
                  >
                    <NumericCellInput
                      value={e.efficiencyPercent || 0}
                      disabled={!canEditAccounts}
                      navRow={idx}
                      navCol={0}
                      onValueChange={(v) => handleCellChange(idx, 'efficiencyPercent', v)}
                      className="w-full text-center bg-transparent px-1 py-1 font-semibold text-xs focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-[#0066cc] focus:outline-none rounded text-slate-800 dark:text-slate-200"
                    />
                  </td>

                  {/* Salary Earned — Synced from Contract/Staff Profile */}
                  <td
                    style={{ width: `${widths.salaryEarned}px`, minWidth: `${widths.salaryEarned}px` }}
                    className="border-r border-slate-100 dark:border-slate-800 py-1.5 px-2 text-right bg-slate-50/50"
                    title="Synced from Contract / Staff Sheet"
                  >
                    <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {formatNumber(e.salaryEarned || 0, 0)}
                    </span>
                  </td>

                  {/* Calculated Avail % */}
                  <td
                    style={{ width: `${widths.availPercent}px`, minWidth: `${widths.availPercent}px` }}
                    className="border-r border-slate-100 dark:border-slate-800 py-1.5 px-2 text-center font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap"
                  >
                    {e.availPercent}%
                  </td>

                  {/* Calculated Incentive Amount */}
                  <td
                    style={{ width: `${widths.amount}px`, minWidth: `${widths.amount}px` }}
                    className="border-r border-slate-100 dark:border-slate-800 py-1.5 px-2 text-right font-semibold text-xs text-slate-900 dark:text-white whitespace-nowrap"
                  >
                    {formatNumber(e.amount, 0)}
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
                          value={e.customFields?.[col.id] || ''}
                          disabled={!canEditAccounts}
                          onChange={(ev) => handleCustomCellChange(idx, col.id, ev.target.value)}
                          placeholder="—"
                          className="w-full bg-transparent px-1 py-1 font-medium font-sans text-xs focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-[#0066cc] focus:outline-none rounded text-center"
                        />
                      </td>
                    )
                  })}

                  {/* Action */}
                  <td
                    style={{ width: `${widths.action}px`, minWidth: `${widths.action}px` }}
                    className="py-1 px-1 text-center print:hidden"
                  >
                    <button
                      onClick={() => handleDeleteRow(e.id)}
                      disabled={!canEditAccounts}
                      title={canEditAccounts ? 'Delete row' : 'Enable Editing to delete'}
                      className="p-1 text-slate-400 hover:text-red-600 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 font-bold text-slate-900 dark:text-white text-xs">
                <td colSpan={5} className="border-r border-slate-200 dark:border-slate-700 py-2 px-2 font-sans uppercase text-[11px] text-slate-600 dark:text-slate-300">
                  Totals & Live Incentive Sums:
                </td>
                <td className="border-r border-slate-200 dark:border-slate-700 py-2 px-2 text-right font-bold text-xs">
                  {formatNumber(totalSalaryBase, 0)}
                </td>
                <td className="border-r border-slate-200 dark:border-slate-700 py-2 px-1 text-center font-bold text-xs text-[#0066cc] dark:text-sky-400">
                  Avg {avgEfficiency}%
                </td>
                <td className="border-r border-slate-200 dark:border-slate-700 py-2 px-2 text-right font-bold text-xs text-[#0066cc] dark:text-sky-400">
                  {formatNumber(totalIncentive, 0)}
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

        {/* Calculated Total Banner */}
        <div className="mt-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 font-sans">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total Calculated Technical Efficiency Bonus (In Words):
            </div>
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
              {numberToWordsPKR(totalIncentive)}
            </div>
          </div>
          <div className="sm:text-right border-t sm:border-t-0 border-slate-200 dark:border-slate-700 pt-2 sm:pt-0 w-full sm:w-auto">
            <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase">
              Total Bonus Payout
            </div>
            <div className="font-mono text-base font-bold text-[#0066cc] dark:text-sky-400">
              {formatCurrency(totalIncentive)}
            </div>
          </div>
        </div>
      </div>

      {/* Formula Explanation Alert at Bottom */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 p-3 text-xs text-slate-600 dark:text-slate-300 print:hidden">
        <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200 mb-1">
          <Calculator className="size-3.5 text-[#0066cc]" />
          <span>Active Efficiency Incentive Formulas:</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px] text-slate-600 dark:text-slate-400">
          <div>• <strong>Avail %</strong> = If (Eff % ≥ 70%) then (Eff % - 60%) else 0%</div>
          <div>• <strong>Incentive Amount</strong> = Salary Earned × (Avail % ÷ 100)</div>
        </div>
      </div>
    </div>
  )
}
