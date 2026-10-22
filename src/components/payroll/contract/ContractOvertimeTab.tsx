'use client'

import { formatPayrollMonthLabel } from '@/services/payrollService'
import { CustomColumnHeader } from '@/components/shared/CustomColumnModal'
import { SerialCellWithInsert } from '@/components/shared/InlineRowActions'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { formatCurrency, formatNumber, numberToWordsPKR, cn } from '@/lib/utils'
import { Trash2 } from 'lucide-react'
import { NumericCellInput } from '@/components/shared/NumericCellInput'
import { REMOVE_ROW_TITLE } from '@/components/payroll/removeRowConfirm'
import type { ContractPage } from './useContractPage'

/** The "overtime" tab of the page. */
export function ContractOvertimeTab({ page }: { page: ContractPage }) {
  const { canEditAccounts, contractList, customColumns, selectedMonth, daysInMonth, isCellDirty, isRowDirty, otWidths, setOtColWidth, resetOtColWidth, handleCellChange, handleCustomCellChange, handleMoveRow, handleDeleteRow, handleUpdateCustomColumn, handleRemoveCustomColumn, totalOT, totalOTHours } = page
  return (
      <div className="rounded-lg border border-slate-200 bg-white text-slate-900 p-5 shadow-xs print:border-none print:p-0 print:shadow-none font-sans overflow-hidden">
        <div className="text-center border-b border-slate-200 pb-3 mb-4">
          <h1 className="text-lg font-bold uppercase text-slate-900 tracking-wide">SARA TEXTILES</h1>
          <h2 className="text-sm font-semibold text-slate-700 mt-0.5">CONTRACT EMPLOYEES OVERTIME (EXCEL SHEET 5)</h2>
          <p className="text-[11px] text-slate-500 font-mono">Statement for Month: {formatPayrollMonthLabel(selectedMonth)} ({daysInMonth} Days Base)</p>
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
                <tr
                  key={c.id}
                  className={cn(
                    'text-slate-800 hover:bg-slate-50/80 transition-colors',
                    isRowDirty(c.id) && 'payroll-row-dirty'
                  )}
                >
                  {/* S.# with Hover Row Insertion */}
                  <SerialCellWithInsert
                    serialNo={c.serialNo}
                    index={idx}
                    onMoveUp={(i) => handleMoveRow(i, 'up')}
                    onMoveDown={(i) => handleMoveRow(i, 'down')}
                    canMoveUp={idx > 0}
                    canMoveDown={idx < contractList.length - 1}
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
                      isDirty={isCellDirty(c.id, 'otHours')}
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
                      title={REMOVE_ROW_TITLE}
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
  )
}
