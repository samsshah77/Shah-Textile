'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { payrollService } from '@/services/payrollService'
import { PettyCashRecord, CustomColumn } from '@/types/payroll'
import { AddColumnButton, CustomColumnHeader } from '@/components/shared/CustomColumnModal'
import { SerialCellWithInsert } from '@/components/shared/InlineRowActions'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { useAuth } from '@/context/AuthContext'
import { formatCurrency, formatNumber, numberToWordsPKR } from '@/lib/utils'
import {
  Wallet,
  Printer,
  RotateCcw,
  Save,
  CheckCircle2,
  Plus,
  Trash2,
  ArrowDownLeft,
  ArrowUpRight,
  DollarSign,
  Lock,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'

const DEFAULT_PETTY_CASH_WIDTHS = {
  serialNo: 56,
  date: 120,
  description: 340,
  drAmount: 140,
  crAmount: 140,
  balance: 140,
  action: 48,
}

function PettyCashContent() {
  const { canEditAccounts } = useAuth()
  const searchParams = useSearchParams()
  const initialFortnight = (searchParams.get('fortnight') as '1-15' | '16-31') || '1-15'
  const [activeFortnight, setActiveFortnight] = useState<'1-15' | '16-31'>(initialFortnight)
  const [selectedMonth, setSelectedMonth] = useState('2026-08')
  const [entries, setEntries] = useState<PettyCashRecord[]>([])
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([])
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Resizable columns hook
  const {
    widths,
    setColumnWidth,
    resetColumnWidth,
    resetAllWidths,
  } = useResizableColumns('petty_cash', DEFAULT_PETTY_CASH_WIDTHS)

  useEffect(() => {
    const fn = searchParams.get('fortnight') as '1-15' | '16-31'
    if (fn && (fn === '1-15' || fn === '16-31')) {
      setActiveFortnight(fn)
    }
  }, [searchParams])

  useEffect(() => {
    setEntries(payrollService.getPettyCashEntries(selectedMonth, activeFortnight))
  }, [selectedMonth, activeFortnight])

  // Recalculate balances dynamically
  const recalculateBalances = (records: PettyCashRecord[]) => {
    let runningBalance = 0
    return records.map((record, idx) => {
      if (idx === 0 && (record.description.includes('Balance b/f') || record.balance)) {
        runningBalance = record.balance || 0
        return record
      }
      const dr = Number(record.drAmount) || 0
      const cr = Number(record.crAmount) || 0
      runningBalance = runningBalance + dr - cr
      return { ...record, balance: runningBalance }
    })
  }

  const handleCellChange = (
    index: number,
    field: keyof PettyCashRecord,
    value: string | number | null
  ) => {
    if (!canEditAccounts) return
    setEntries((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return recalculateBalances(updated)
    })
  }

  const handleCustomCellChange = (index: number, colId: string, value: string) => {
    if (!canEditAccounts) return
    setEntries((prev) => {
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
    const newRecord: PettyCashRecord = {
      id: `pc-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      serialNo: insertIdx !== undefined ? insertIdx + 2 : entries.length + 1,
      date: activeFortnight === '1-15' ? '2026-08-10' : '2026-08-25',
      description: 'New Expense Entry',
      drAmount: null,
      crAmount: 1000,
      balance: 0,
      fortnight: activeFortnight,
      month: selectedMonth,
    }

    const updated = [...entries]
    if (insertIdx !== undefined) {
      updated.splice(insertIdx + 1, 0, newRecord)
    } else {
      updated.push(newRecord)
    }

    const renumbered = updated.map((item, idx) => ({ ...item, serialNo: idx + 1 }))
    setEntries(recalculateBalances(renumbered))
  }

  const handleDeleteRow = (id: string) => {
    if (!canEditAccounts) return
    const updated = entries.filter((e) => e.id !== id).map((item, idx) => ({ ...item, serialNo: idx + 1 }))
    setEntries(recalculateBalances(updated))
  }

  const handleReset = () => {
    if (!canEditAccounts) return
    if (confirm('Reset Petty Cash register back to template values?')) {
      payrollService.resetAllToDefault()
      setEntries(payrollService.getPettyCashEntries(selectedMonth, activeFortnight))
      setCustomColumns([])
      resetAllWidths()
    }
  }

  const handleSave = () => {
    if (!canEditAccounts) return
    payrollService.savePettyCashEntries(selectedMonth, activeFortnight, entries)
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

  // Calculations
  const openingBalance = entries.find((e) => e.description.includes('Balance b/f'))?.balance || 0
  const totalDr = entries.reduce((s, e) => s + (Number(e.drAmount) || 0), 0)
  const totalCr = entries.reduce((s, e) => s + (Number(e.crAmount) || 0), 0)
  const closingBalance =
    entries.length > 0
      ? entries[entries.length - 1].balance ?? openingBalance + totalDr - totalCr
      : 0

  return (
    <div className="space-y-6 print:space-y-2">
      <div className="print:hidden">
        <PageHeader
          title="Petty Cash Ledger"
          breadcrumbs={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Payroll', href: '/payroll/petty-cash' },
            { label: 'Petty Cash' },
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
                <span>Add Entry</span>
              </button>
              <AddColumnButton onAddColumn={handleAddCustomColumn} />
              <button
                type="button"
                onClick={handleReset}
                disabled={!canEditAccounts}
                title={canEditAccounts ? 'Reset to default template' : 'Enable Editing to reset'}
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
            </>
          }
        />
      </div>

      {/* Safety Notice if Editing is Disabled */}
      {!canEditAccounts && (
        <div className="flex items-center gap-2.5 p-3 rounded-lg border border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300 text-xs font-medium print:hidden">
          <Lock className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            Edit Protection Active: Click <strong>&quot;Enable Editing&quot;</strong> in the top navigation bar to add petty cash vouchers, debit/credit entries, or save changes.
          </span>
        </div>
      )}

      {saveSuccess && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300 print:hidden animate-in fade-in">
          <CheckCircle2 className="size-4 text-emerald-600" />
          <span>Petty Cash transactions & running balance successfully stored!</span>
        </div>
      )}

      {/* Printable Sheet */}
      <div className="erp-card p-5 sm:p-6 print:border-none print:p-0 font-sans">
        <div className="text-center border-b border-slate-200 dark:border-slate-700 pb-3 mb-4">
          <h1 className="text-xl font-bold uppercase text-slate-900 dark:text-white tracking-wide">SARA TEXTILES</h1>
          <h2 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mt-0.5">
            PETTY CASH STATEMENT ({activeFortnight === '1-15' ? 'Aug 01 to 15, 2026' : 'Aug 16 to 31, 2026'})
          </h2>
          <p className="text-[11px] text-slate-500 font-mono mt-0.5">Cycle: {activeFortnight === '1-15' ? '1st Half' : '2nd Half'}</p>
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
                  className="border-r border-slate-200 dark:border-slate-700 py-2.5 px-2 text-center"
                  title="Hover row serial to insert row at position"
                >
                  S.#
                </ResizableTh>

                <ResizableTh
                  columnKey="date"
                  width={widths.date}
                  minWidth={90}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 dark:border-slate-700 py-2.5 px-3 font-sans"
                >
                  Date
                </ResizableTh>

                <ResizableTh
                  columnKey="description"
                  width={widths.description}
                  minWidth={200}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 dark:border-slate-700 py-2.5 px-3 font-sans"
                >
                  Description / Particulars
                </ResizableTh>

                <ResizableTh
                  columnKey="drAmount"
                  width={widths.drAmount}
                  minWidth={110}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 dark:border-slate-700 py-2.5 px-3 text-right"
                >
                  Debit (Inflow)
                </ResizableTh>

                <ResizableTh
                  columnKey="crAmount"
                  width={widths.crAmount}
                  minWidth={110}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 dark:border-slate-700 py-2.5 px-3 text-right"
                >
                  Credit (Outflow)
                </ResizableTh>

                <ResizableTh
                  columnKey="balance"
                  width={widths.balance}
                  minWidth={110}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 dark:border-slate-700 py-2.5 px-3 text-right font-bold text-[#0066cc] dark:text-sky-400"
                >
                  Balance
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
                  className="py-2.5 px-2 text-center print:hidden"
                >
                  Action
                </ResizableTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {entries.map((entry, idx) => (
                <tr
                  key={entry.id}
                  className="text-slate-800 dark:text-slate-200 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                >
                  {/* S.# with Hover Row Insertion */}
                  <SerialCellWithInsert
                    serialNo={entry.serialNo ?? idx + 1}
                    index={idx}
                    onInsertRow={handleInsertRow}
                  />

                  <td
                    style={{ width: `${widths.date}px`, minWidth: `${widths.date}px` }}
                    className="border-r border-slate-100 dark:border-slate-800 py-1.5 px-2"
                  >
                    <input
                      type="text"
                      value={entry.date}
                      disabled={!canEditAccounts}
                      onChange={(e) => handleCellChange(idx, 'date', e.target.value)}
                      className="w-full bg-transparent px-1 py-0.5 text-xs font-medium text-slate-800 dark:text-slate-200 focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-[#0066cc] focus:outline-none rounded"
                    />
                  </td>

                  <td
                    style={{ width: `${widths.description}px`, minWidth: `${widths.description}px` }}
                    className="border-r border-slate-100 dark:border-slate-800 py-1.5 px-3 font-sans font-semibold text-slate-900 dark:text-slate-100"
                  >
                    <input
                      type="text"
                      value={entry.description}
                      disabled={!canEditAccounts}
                      onChange={(e) => handleCellChange(idx, 'description', e.target.value)}
                      className="w-full bg-transparent px-1.5 py-0.5 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-[#0066cc] focus:outline-none rounded"
                    />
                  </td>

                  <td
                    style={{ width: `${widths.drAmount}px`, minWidth: `${widths.drAmount}px` }}
                    className="border-r border-slate-100 dark:border-slate-800 py-1.5 px-3 text-right"
                  >
                    <input
                      type="number"
                      value={entry.drAmount ?? ''}
                      placeholder="-"
                      disabled={!canEditAccounts}
                      onChange={(e) =>
                        handleCellChange(
                          idx,
                          'drAmount',
                          e.target.value === '' ? null : Number(e.target.value)
                        )
                      }
                      className="w-full text-right bg-transparent px-1 text-xs font-medium text-slate-800 dark:text-slate-200 focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-[#0066cc] focus:outline-none rounded font-mono"
                    />
                  </td>

                  <td
                    style={{ width: `${widths.crAmount}px`, minWidth: `${widths.crAmount}px` }}
                    className="border-r border-slate-100 dark:border-slate-800 py-1.5 px-3 text-right"
                  >
                    <input
                      type="number"
                      value={entry.crAmount ?? ''}
                      placeholder="-"
                      disabled={!canEditAccounts}
                      onChange={(e) =>
                        handleCellChange(
                          idx,
                          'crAmount',
                          e.target.value === '' ? null : Number(e.target.value)
                        )
                      }
                      className="w-full text-right bg-transparent px-1 text-xs font-medium text-slate-800 dark:text-slate-200 focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-[#0066cc] focus:outline-none rounded font-mono"
                    />
                  </td>

                  <td
                    style={{ width: `${widths.balance}px`, minWidth: `${widths.balance}px` }}
                    className="border-r border-slate-100 dark:border-slate-800 py-1.5 px-3 text-right font-semibold text-slate-900 dark:text-white"
                  >
                    {entry.balance !== null && entry.balance !== undefined
                      ? formatNumber(entry.balance, 0)
                      : '-'}
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
                          value={entry.customFields?.[col.id] || ''}
                          disabled={!canEditAccounts}
                          onChange={(e) => handleCustomCellChange(idx, col.id, e.target.value)}
                          placeholder="—"
                          className="w-full bg-transparent px-1 py-0.5 font-medium font-sans text-xs focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-[#0066cc] focus:outline-none rounded text-center"
                        />
                      </td>
                    )
                  })}

                  <td
                    style={{ width: `${widths.action}px`, minWidth: `${widths.action}px` }}
                    className="py-1 px-2 text-center print:hidden"
                  >
                    <button
                      onClick={() => handleDeleteRow(entry.id)}
                      disabled={!canEditAccounts}
                      title={canEditAccounts ? 'Delete Entry' : 'Enable Editing to delete'}
                      className="text-slate-400 hover:text-red-500 transition-colors p-1 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 dark:border-slate-700 font-bold bg-slate-50 dark:bg-slate-800/80 text-xs">
                <td colSpan={3} className="border-r border-slate-200 dark:border-slate-700 py-2.5 px-4 font-sans uppercase text-[11px] text-slate-600 dark:text-slate-300">
                  TOTAL FORTNIGHT TURNOVER & SETTLEMENT:
                </td>
                <td className="border-r border-slate-200 dark:border-slate-700 py-2.5 px-3 text-right font-bold text-slate-900 dark:text-white text-xs">
                  {formatNumber(totalDr, 0)}
                </td>
                <td className="border-r border-slate-200 dark:border-slate-700 py-2.5 px-3 text-right font-bold text-slate-900 dark:text-white text-xs">
                  {formatNumber(totalCr, 0)}
                </td>
                <td className="border-r border-slate-200 dark:border-slate-700 py-2.5 px-3 text-right text-xs font-bold text-[#0066cc] dark:text-sky-400">
                  {formatCurrency(closingBalance)}
                </td>
                {customColumns.map((col) => (
                  <td key={col.id} className="border-r border-slate-200 dark:border-slate-700 py-2.5 px-2 text-center font-sans text-[11px] text-slate-400 font-normal">
                    —
                  </td>
                ))}
                <td className="print:hidden"></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Prominent Calculated Closing Balance in Words */}
        <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 p-3.5 font-sans print:border-none print:p-2">
          <div>
            <span className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400 tracking-wider">Closing Cash in Hand in Words (PKR):</span>
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-0.5">{numberToWordsPKR(closingBalance)}</div>
          </div>
          <div className="sm:text-right border-t sm:border-t-0 border-slate-200 dark:border-slate-700 pt-2 sm:pt-0 w-full sm:w-auto">
            <span className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">Calculated Safe Balance:</span>
            <div className="text-base font-bold text-[#0066cc] dark:text-sky-400">{formatCurrency(closingBalance)}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PettyCashPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading Petty Cash Ledger...</div>}>
      <PettyCashContent />
    </Suspense>
  )
}
