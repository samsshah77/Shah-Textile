'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { payrollService } from '@/services/payrollService'
import { ContractorPaymentRecord, CustomColumn } from '@/types/payroll'
import { AddColumnButton, CustomColumnHeader } from '@/components/shared/CustomColumnModal'
import { SerialCellWithInsert } from '@/components/shared/InlineRowActions'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { useAuth } from '@/context/AuthContext'
import { formatCurrency, formatNumber, numberToWordsPKR } from '@/lib/utils'
import {
  Wrench,
  Printer,
  DollarSign,
  Briefcase,
  FileCheck,
  Plus,
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

const DEFAULT_CONTRACTOR_WIDTHS = {
  serialNo: 56,
  name: 220,
  contractType: 200,
  contractualAmount: 120,
  extraIncentive: 110,
  totalAmount: 120,
  lessAdvance: 110,
  netPayment: 130,
  remarks: 220,
  action: 48,
}

function ContractorsPayrollContent() {
  const { canEditAccounts } = useAuth()
  const searchParams = useSearchParams()
  const initialFortnight = (searchParams.get('fortnight') as '1-15' | '16-31') || '1-15'
  const [activeFortnight, setActiveFortnight] = useState<'1-15' | '16-31'>(initialFortnight)
  const [selectedMonth, setSelectedMonth] = useState('2026-08')
  const [contractorsList, setContractorsList] = useState<ContractorPaymentRecord[]>([])
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([])
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Resizable columns hook
  const {
    widths,
    setColumnWidth,
    resetColumnWidth,
    resetAllWidths,
  } = useResizableColumns('contractors_payroll', DEFAULT_CONTRACTOR_WIDTHS)

  useEffect(() => {
    const fn = searchParams.get('fortnight') as '1-15' | '16-31'
    if (fn === '1-15' || fn === '16-31') {
      setActiveFortnight(fn)
    }
  }, [searchParams])

  const reload = () => {
    setContractorsList(payrollService.getContractorsPayments(selectedMonth, activeFortnight))
  }

  useEffect(() => {
    reload()
    const handleSync = () => reload()
    window.addEventListener('payroll_synced', handleSync)
    return () => window.removeEventListener('payroll_synced', handleSync)
  }, [selectedMonth, activeFortnight])

  // Handle cell edit with live formula recalculation
  const handleCellChange = (
    index: number,
    field: keyof ContractorPaymentRecord,
    value: string | number
  ) => {
    if (!canEditAccounts) return
    setContractorsList((prev) => {
      const updated = [...prev]
      const current = { ...updated[index], [field]: value }
      const recalculated = payrollService.calculateContractorPaymentRow(current)
      updated[index] = recalculated
      return updated
    })
  }

  const handleCustomCellChange = (index: number, colId: string, value: string) => {
    if (!canEditAccounts) return
    setContractorsList((prev) => {
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
    const raw: ContractorPaymentRecord = {
      id: `c-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      serialNo: insertIdx !== undefined ? insertIdx + 2 : contractorsList.length + 1,
      name: 'NEW CONTRACTOR',
      contractType: 'Service Job',
      contractualAmount: 20000,
      extraIncentive: 0,
      totalAmount: 20000,
      lessAdvance: 0,
      netPayment: 20000,
      remarks: 'Monthly Bill',
      fortnight: activeFortnight,
      month: selectedMonth,
    }
    const newRecord = payrollService.calculateContractorPaymentRow(raw)

    const updated = [...contractorsList]
    if (insertIdx !== undefined) {
      updated.splice(insertIdx + 1, 0, newRecord)
    } else {
      updated.push(newRecord)
    }

    const renumbered = updated.map((item, idx) => ({ ...item, serialNo: idx + 1 }))
    setContractorsList(renumbered)
  }

  const handleDeleteRow = (id: string) => {
    if (!canEditAccounts) return
    const filtered = contractorsList.filter((c) => c.id !== id).map((item, idx) => ({ ...item, serialNo: idx + 1 }))
    setContractorsList(filtered)
  }

  const handleReset = () => {
    if (!canEditAccounts) return
    if (confirm('Reset this Contractors sheet back to template values?')) {
      payrollService.resetAllToDefault()
      setContractorsList(payrollService.getContractorsPayments(selectedMonth, activeFortnight))
      setCustomColumns([])
      resetAllWidths()
    }
  }

  const handleSave = () => {
    if (!canEditAccounts) return
    payrollService.saveContractorsPayments(selectedMonth, activeFortnight, contractorsList)
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

  const totalContractual = contractorsList.reduce((sum, c) => sum + (c.contractualAmount || 0), 0)
  const totalIncentive = contractorsList.reduce((sum, c) => sum + (c.extraIncentive || 0), 0)
  const totalGross = contractorsList.reduce((sum, c) => sum + (c.totalAmount || 0), 0)
  const totalAdvance = contractorsList.reduce((sum, c) => sum + (c.lessAdvance || 0), 0)
  const totalNet = contractorsList.reduce((sum, c) => sum + (c.netPayment || 0), 0)

  return (
    <div className="space-y-6 print:space-y-2">
      <div className="print:hidden">
        <PageHeader
          title="Contractors Register"
          breadcrumbs={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Payroll', href: '/payroll/contractors' },
            { label: 'Contractors' },
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
                <span>Add Contractor</span>
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
              <ExportPdfButton filename={`Contractors-${selectedMonth}-${activeFortnight || '1-15'}`} />
            </>
          }
        />
      </div>

      {/* Safety Notice if Editing is Disabled */}
      {!canEditAccounts && (
        <div className="flex items-center gap-2.5 p-3 rounded-lg border border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300 text-xs font-medium print:hidden">
          <Lock className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            Edit Protection Active: Click <strong>&quot;Enable Editing&quot;</strong> in the top navigation bar to modify contractor bills, incentives, advances, or save changes.
          </span>
        </div>
      )}

      {saveSuccess && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300 print:hidden animate-in fade-in">
          <CheckCircle2 className="size-4 text-emerald-600" />
          <span>Contractor bills successfully calculated and saved!</span>
        </div>
      )}

      {/* Printable Sheet */}
      <div className="erp-card p-5 sm:p-6 print:border-none print:p-0 font-sans">
        <div className="text-center border-b border-slate-200 dark:border-slate-700 pb-3 mb-4">
          <h1 className="text-xl font-bold uppercase text-slate-900 dark:text-white tracking-wide">SARA TEXTILES</h1>
          <h2 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mt-0.5">
            CONTRACTORS & OUTSOURCED SERVICES BILL PAYMENT ({activeFortnight === '1-15' ? '01-Aug-2026 to 15-Aug-2026' : '16-Aug-2026 to 31-Aug-2026'})
          </h2>
          <p className="text-[11px] text-slate-500 font-mono mt-0.5">Cycle: {activeFortnight === '1-15' ? '1st Half' : '2nd Half / Month-End'}</p>
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
                  columnKey="name"
                  width={widths.name}
                  minWidth={130}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 dark:border-slate-700 py-2 px-3 font-sans"
                >
                  Contractor Name
                </ResizableTh>

                <ResizableTh
                  columnKey="contractType"
                  width={widths.contractType}
                  minWidth={120}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 dark:border-slate-700 py-2 px-3 font-sans"
                >
                  Service / Department
                </ResizableTh>

                <ResizableTh
                  columnKey="contractualAmount"
                  width={widths.contractualAmount}
                  minWidth={95}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 dark:border-slate-700 py-2 px-2 text-right"
                >
                  Contractual Amt
                </ResizableTh>

                <ResizableTh
                  columnKey="extraIncentive"
                  width={widths.extraIncentive}
                  minWidth={85}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 dark:border-slate-700 py-2 px-2 text-right"
                >
                  Incentive
                </ResizableTh>

                <ResizableTh
                  columnKey="totalAmount"
                  width={widths.totalAmount}
                  minWidth={95}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 dark:border-slate-700 py-2 px-2 text-right whitespace-nowrap"
                >
                  Total Bill
                </ResizableTh>

                <ResizableTh
                  columnKey="lessAdvance"
                  width={widths.lessAdvance}
                  minWidth={85}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 dark:border-slate-700 py-2 px-2 text-right whitespace-nowrap"
                >
                  Less Adv
                </ResizableTh>

                <ResizableTh
                  columnKey="netPayment"
                  width={widths.netPayment}
                  minWidth={100}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 dark:border-slate-700 py-2 px-2 text-right font-bold whitespace-nowrap text-[#0066cc] dark:text-sky-400"
                >
                  Net Payment
                </ResizableTh>

                <ResizableTh
                  columnKey="remarks"
                  width={widths.remarks}
                  minWidth={130}
                  onResize={setColumnWidth}
                  onReset={resetColumnWidth}
                  className="border-r border-slate-200 dark:border-slate-700 py-2 px-3 font-sans"
                >
                  Remarks / Billing Basis
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
              {contractorsList.map((c, idx) => (
                <tr key={c.id} className="text-slate-800 dark:text-slate-200 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                  {/* S.# with Hover Row Insertion */}
                  <SerialCellWithInsert
                    serialNo={c.serialNo}
                    index={idx}
                    onInsertRow={handleInsertRow}
                  />
                  
                  {/* Name Input */}
                  <td
                    style={{ width: `${widths.name}px`, minWidth: `${widths.name}px` }}
                    className="border-r border-slate-100 dark:border-slate-800 py-1.5 px-1"
                  >
                    <input
                      type="text"
                      value={c.name}
                      disabled={!canEditAccounts}
                      onChange={(e) => handleCellChange(idx, 'name', e.target.value)}
                      className="w-full bg-transparent px-2 py-1 font-semibold font-sans text-xs focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-[#0066cc] focus:outline-none rounded text-slate-900 dark:text-white"
                    />
                  </td>

                  {/* Contract Type Input */}
                  <td
                    style={{ width: `${widths.contractType}px`, minWidth: `${widths.contractType}px` }}
                    className="border-r border-slate-100 dark:border-slate-800 py-1.5 px-1"
                  >
                    <input
                      type="text"
                      value={c.contractType}
                      disabled={!canEditAccounts}
                      onChange={(e) => handleCellChange(idx, 'contractType', e.target.value)}
                      className="w-full bg-transparent px-2 py-1 font-sans text-xs text-slate-700 dark:text-slate-300 font-medium focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-[#0066cc] focus:outline-none rounded"
                    />
                  </td>

                  {/* Contractual Amount (Editable) */}
                  <td
                    style={{ width: `${widths.contractualAmount}px`, minWidth: `${widths.contractualAmount}px` }}
                    className="border-r border-slate-100 dark:border-slate-800 py-1.5 px-1"
                  >
                    <NumericCellInput
                      value={c.contractualAmount || 0}
                      disabled={!canEditAccounts}
                      navRow={idx}
                      navCol={0}
                      onValueChange={(v) => handleCellChange(idx, 'contractualAmount', v)}
                      className="w-full text-right bg-transparent px-2 py-1 font-medium text-xs focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-[#0066cc] focus:outline-none rounded text-slate-800 dark:text-slate-200"
                    />
                  </td>

                  {/* Extra Incentive (Editable) */}
                  <td
                    style={{ width: `${widths.extraIncentive}px`, minWidth: `${widths.extraIncentive}px` }}
                    className="border-r border-slate-100 dark:border-slate-800 py-1.5 px-1"
                  >
                    <NumericCellInput
                      value={c.extraIncentive || 0}
                      disabled={!canEditAccounts}
                      navRow={idx}
                      navCol={1}
                      onValueChange={(v) => handleCellChange(idx, 'extraIncentive', v)}
                      className="w-full text-right bg-transparent px-2 py-1 font-medium text-xs text-slate-800 dark:text-slate-200 focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-[#0066cc] focus:outline-none rounded"
                    />
                  </td>

                  {/* Calculated Total Bill */}
                  <td
                    style={{ width: `${widths.totalAmount}px`, minWidth: `${widths.totalAmount}px` }}
                    className="border-r border-slate-100 dark:border-slate-800 py-1.5 px-2 text-right font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap"
                  >
                    {formatNumber(c.totalAmount, 0)}
                  </td>

                  {/* Less Advance (Editable) */}
                  <td
                    style={{ width: `${widths.lessAdvance}px`, minWidth: `${widths.lessAdvance}px` }}
                    className="border-r border-slate-100 dark:border-slate-800 py-1.5 px-1"
                  >
                    <NumericCellInput
                      value={c.lessAdvance || 0}
                      disabled={!canEditAccounts}
                      navRow={idx}
                      navCol={2}
                      onValueChange={(v) => handleCellChange(idx, 'lessAdvance', v)}
                      className="w-full text-right bg-transparent px-2 py-1 font-medium text-xs text-red-600 dark:text-red-400 focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-[#0066cc] focus:outline-none rounded"
                    />
                  </td>

                  {/* Calculated Net Payment */}
                  <td
                    style={{ width: `${widths.netPayment}px`, minWidth: `${widths.netPayment}px` }}
                    className="border-r border-slate-100 dark:border-slate-800 py-1.5 px-2 text-right font-semibold text-xs text-slate-900 dark:text-white whitespace-nowrap"
                  >
                    {formatNumber(c.netPayment, 0)}
                  </td>

                  {/* Remarks Input */}
                  <td
                    style={{ width: `${widths.remarks}px`, minWidth: `${widths.remarks}px` }}
                    className="border-r border-slate-100 dark:border-slate-800 py-1.5 px-1"
                  >
                    <input
                      type="text"
                      value={c.remarks}
                      disabled={!canEditAccounts}
                      onChange={(e) => handleCellChange(idx, 'remarks', e.target.value)}
                      className="w-full bg-transparent px-2 py-1 font-sans text-xs text-slate-600 dark:text-slate-400 focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-[#0066cc] focus:outline-none rounded"
                    />
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
                          value={c.customFields?.[col.id] || ''}
                          disabled={!canEditAccounts}
                          onChange={(e) => handleCustomCellChange(idx, col.id, e.target.value)}
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
                      onClick={() => handleDeleteRow(c.id)}
                      disabled={!canEditAccounts}
                      title={canEditAccounts ? 'Delete contractor bill' : 'Enable Editing to delete'}
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
                <td colSpan={3} className="border-r border-slate-200 dark:border-slate-700 py-2 px-2 font-sans uppercase text-[11px] text-slate-600 dark:text-slate-300">
                  Totals & Live Aggregates ({activeFortnight === '1-15' ? '1st Half' : '2nd Half'}):
                </td>
                <td className="border-r border-slate-200 dark:border-slate-700 py-2 px-2 text-right font-bold text-xs">
                  {formatNumber(totalContractual, 0)}
                </td>
                <td className="border-r border-slate-200 dark:border-slate-700 py-2 px-2 text-right font-bold text-xs">
                  {formatNumber(totalIncentive, 0)}
                </td>
                <td className="border-r border-slate-200 dark:border-slate-700 py-2 px-2 text-right font-bold text-xs">
                  {formatNumber(totalGross, 0)}
                </td>
                <td className="border-r border-slate-200 dark:border-slate-700 py-2 px-2 text-right font-bold text-xs text-red-600 dark:text-red-400">
                  {formatNumber(totalAdvance, 0)}
                </td>
                <td className="border-r border-slate-200 dark:border-slate-700 py-2 px-2 text-right font-bold text-xs text-[#0066cc] dark:text-sky-400">
                  {formatNumber(totalNet, 0)}
                </td>
                <td className="border-r border-slate-200 dark:border-slate-700 py-2 px-2 text-slate-500 font-sans text-[11px] font-normal">Verified</td>
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

        {/* Prominent Calculated Contractor Total in Words */}
        <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 p-3.5 font-sans print:border-none print:p-2">
          <div>
            <span className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400 tracking-wider">Net Contractor Payout in Words (PKR):</span>
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-0.5">{numberToWordsPKR(totalNet)}</div>
          </div>
          <div className="sm:text-right border-t sm:border-t-0 border-slate-200 dark:border-slate-700 pt-2 sm:pt-0 w-full sm:w-auto">
            <span className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">Total Fortnight Contractor Disbursal:</span>
            <div className="text-base font-bold text-[#0066cc] dark:text-sky-400">{formatCurrency(totalNet)}</div>
          </div>
        </div>
      </div>

      {/* Formula Explanation Alert at Bottom */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 p-3 text-xs text-slate-600 dark:text-slate-300 print:hidden">
        <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200 mb-1">
          <Calculator className="size-3.5 text-[#0066cc]" />
          <span>Active Contractor Billing Formulas:</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px] text-slate-600 dark:text-slate-400">
          <div>• <strong>Total Bill</strong> = Contractual Amount + Extra Incentive</div>
          <div>• <strong>Net Payment</strong> = Total Bill - Less Advance</div>
        </div>
      </div>
    </div>
  )
}

export default function ContractorsPayrollPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading Contractors Sheet...</div>}>
      <ContractorsPayrollContent />
    </Suspense>
  )
}
