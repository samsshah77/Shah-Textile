'use client'

import Link from 'next/link'
import { formatPayrollMonthLabel } from '@/services/payrollService'
import { CustomColumnHeader } from '@/components/shared/CustomColumnModal'
import { SerialCellWithInsert } from '@/components/shared/InlineRowActions'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { formatCurrency, formatNumber, numberToWordsPKR, cn } from '@/lib/utils'
import { Trash2, Edit2 } from 'lucide-react'
import { NumericCellInput } from '@/components/shared/NumericCellInput'
import { fortnightDisplayLabel } from '@/components/payroll/FortnightSelect'
import { REMOVE_ROW_TITLE } from '@/components/payroll/removeRowConfirm'
import type { WeaversPage } from './useWeaversPage'
import { SheetHeader } from '@/components/shared/SheetHeader'

/** The "overtime" tab of the page. */
export function WeaverOvertimeTab({ page }: { page: WeaversPage }) {
  const { canEditAccounts, activeFortnight, selectedMonth, weaversList, customColumns, otWidths, setOtColWidth, resetOtColWidth, isCellDirty, isRowDirty, handleCellChange, handleCustomCellChange, handleMoveRow, handleDeleteRow, handleUpdateCustomColumn, handleRemoveCustomColumn, totalHoliday } = page
  return (
      <div className="rounded-lg border border-slate-200 bg-white text-slate-900 p-5 shadow-xs print:border-none print:p-0 print:shadow-none font-sans overflow-hidden">
        <SheetHeader title={<>WEAVER HOLIDAYS & OVERTIME ({fortnightDisplayLabel(selectedMonth, activeFortnight)} ·{' '} {formatPayrollMonthLabel(selectedMonth)})</>} subtitle="Gazetted & weekly holiday shifts worked" />

        <div className="overflow-x-auto rounded-md border border-slate-200 shadow-xs">
          <table data-no-tidy className="table-fixed w-px print:table-auto text-center border-collapse text-xs font-mono">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 font-semibold uppercase text-[11px] text-slate-600">
                <ResizableTh
                  columnKey="serialNo"
                  width={otWidths.serialNo}
                  minWidth={40}
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
                  minWidth={40}
                  onResize={setOtColWidth}
                  onReset={resetOtColWidth}
                  className="border-r border-slate-200 py-2 px-3 font-sans"
                >
                  EMPLOYEE NAME
                </ResizableTh>

                <ResizableTh
                  columnKey="designation"
                  width={otWidths.designation}
                  minWidth={40}
                  onResize={setOtColWidth}
                  onReset={resetOtColWidth}
                  className="border-r border-slate-200 py-2 px-3 font-sans"
                >
                  Designation
                </ResizableTh>

                <ResizableTh
                  columnKey="holidayAttendance"
                  width={otWidths.holidayAttendance}
                  minWidth={40}
                  onResize={setOtColWidth}
                  onReset={resetOtColWidth}
                  className="border-r border-slate-200 py-2 px-2 text-center"
                >
                  H/Day Attendance
                </ResizableTh>

                <ResizableTh
                  columnKey="holidayRate"
                  width={otWidths.holidayRate}
                  minWidth={40}
                  onResize={setOtColWidth}
                  onReset={resetOtColWidth}
                  className="border-r border-slate-200 py-2 px-3 text-center whitespace-nowrap"
                >
                  Overtime Rate
                </ResizableTh>

                <ResizableTh
                  columnKey="holidayAmount"
                  width={otWidths.holidayAmount}
                  minWidth={40}
                  onResize={setOtColWidth}
                  onReset={resetOtColWidth}
                  className="border-r border-slate-200 py-2 px-3 text-center font-semibold text-slate-900 whitespace-nowrap"
                >
                  AMOUNT
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
                  minWidth={40}
                  enableResize={false}
                  className="py-2 px-1 text-center print:hidden"
                >
                  Action
                </ResizableTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {weaversList.map((w, idx) => (
                <tr
                  key={w.id}
                  className={cn(
                    'text-slate-800 hover:bg-slate-50/80 transition-colors',
                    isRowDirty(w.id) && 'payroll-row-dirty'
                  )}
                >
                  {/* S.# with Hover Row Insertion */}
                  <SerialCellWithInsert
                    serialNo={w.serialNo}
                    index={idx}
                    onMoveUp={(i) => handleMoveRow(i, 'up')}
                    onMoveDown={(i) => handleMoveRow(i, 'down')}
                    canMoveUp={idx > 0}
                    canMoveDown={idx < weaversList.length - 1}
                  />
                  
                  <td
                    style={{ width: `${otWidths.employeeName}px`, minWidth: `${otWidths.employeeName}px` }}
                    className="border-r border-slate-100 py-1.5 px-3 font-sans font-semibold uppercase text-slate-900"
                  >
                    {w.employeeName}
                  </td>

                  <td
                    style={{ width: `${otWidths.designation}px`, minWidth: `${otWidths.designation}px` }}
                    className="border-r border-slate-100 py-1.5 px-3 font-sans text-slate-600"
                  >
                    {w.designation}
                  </td>

                  {/* H/Day Attendance — editable on sheet */}
                  <td
                    style={{ width: `${otWidths.holidayAttendance}px`, minWidth: `${otWidths.holidayAttendance}px` }}
                    className="border-r border-slate-100 py-1 px-1 text-center"
                  >
                    <NumericCellInput
                      value={w.holidayAttendance || 0}
                      disabled={!canEditAccounts}
                      isDirty={isCellDirty(w.id, 'holidayAttendance')}
                      navRow={idx}
                      navCol={0}
                      onValueChange={(v) => handleCellChange(idx, 'holidayAttendance', v)}
                      className="w-full text-center bg-transparent px-1 py-0.5 font-semibold text-xs focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded text-slate-800"
                    />
                  </td>

                  <td
                    style={{ width: `${otWidths.holidayRate}px`, minWidth: `${otWidths.holidayRate}px` }}
                    className="border-r border-slate-100 py-1.5 px-3 text-center text-slate-600 font-mono whitespace-nowrap bg-slate-50/30"
                    title="Set in HR Profile Card"
                  >
                    {formatNumber(w.holidayRate, 0)}
                  </td>

                  <td
                    style={{ width: `${otWidths.holidayAmount}px`, minWidth: `${otWidths.holidayAmount}px` }}
                    className="border-r border-slate-100 py-1.5 px-3 text-center font-semibold text-slate-900 font-mono whitespace-nowrap"
                  >
                    {formatNumber(w.holidayAmount, 0)}
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
                          value={w.customFields?.[col.id] || ''}
                          disabled={!canEditAccounts}
                          onChange={(e) => handleCustomCellChange(idx, col.id, e.target.value)}
                          placeholder="—"
                          className={cn(
                            'w-full bg-transparent px-1 py-0.5 font-medium font-sans text-xs focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded text-center transition-colors',
                            isCellDirty(w.id, `cf_${col.id}`, w.customFields?.[col.id]) &&
                              'payroll-cell-dirty'
                          )}
                        />
                      </td>
                    )
                  })}

                  <td
                    style={{ width: `${otWidths.action}px`, minWidth: `${otWidths.action}px` }}
                    className="py-1 px-1 text-center print:hidden"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <Link
                        href={`/payroll/profiles?search=${encodeURIComponent(w.employeeName)}`}
                        className="p-1 text-[#0066cc] hover:text-blue-800 rounded hover:bg-blue-50 transition-colors"
                        title={`Edit Overtime for ${w.employeeName} in HR Profile`}
                      >
                        <Edit2 className="size-3.5" />
                      </Link>
                      <button
                        onClick={() => handleDeleteRow(w.id)}
                        title={REMOVE_ROW_TITLE}
                        disabled={!canEditAccounts}
                        className="text-slate-400 hover:text-red-600 p-1 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold text-slate-900">
                <td colSpan={3} className="border-r border-slate-200 py-2 px-3 text-center uppercase text-xs">Total Holiday Overtime:</td>
                <td className="border-r border-slate-200 py-2 px-2 text-center font-semibold">{weaversList.reduce((s, w) => s + (w.holidayAttendance || 0), 0)} shifts</td>
                <td className="border-r border-slate-200 py-2 px-3 text-center text-slate-400">-</td>
                <td className="border-r border-slate-200 py-2 px-3 text-center font-bold text-[#0066cc] text-sm">{formatCurrency(totalHoliday)}</td>
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

        {/* Prominent Calculated Holiday Total in Words */}
        <div className="print:hidden mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 font-sans print:border-none print:p-2">
          <div>
            <span className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider">Total Holiday Overtime in Words (PKR):</span>
            <div className="text-xs font-semibold text-slate-900 mt-0.5">{numberToWordsPKR(totalHoliday)}</div>
          </div>
          <div className="sm:text-right border-t sm:border-t-0 border-slate-200 pt-2 sm:pt-0 w-full sm:w-auto">
            <span className="text-[11px] font-semibold uppercase text-slate-500">Calculated Holiday Total:</span>
            <div className="text-lg font-bold text-[#0066cc]">{formatCurrency(totalHoliday)}</div>
          </div>
        </div>
      </div>
  )
}
