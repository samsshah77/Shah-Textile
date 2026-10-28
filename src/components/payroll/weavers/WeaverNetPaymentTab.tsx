'use client'

import { payrollService, formatPayrollMonthLabel } from '@/services/payrollService'
import { CustomColumnHeader } from '@/components/shared/CustomColumnModal'
import { SerialCellWithInsert } from '@/components/shared/InlineRowActions'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { formatCurrency, formatNumber, numberToWordsPKR, cn } from '@/lib/utils'
import { Trash2, FileText } from 'lucide-react'
import { NumericCellInput } from '@/components/shared/NumericCellInput'
import { fortnightDisplayLabel } from '@/components/payroll/FortnightSelect'
import { REMOVE_ROW_TITLE } from '@/components/payroll/removeRowConfirm'
import type { WeaversPage } from './useWeaversPage'
import { SheetHeader } from '@/components/shared/SheetHeader'
import { SignatureBox, useSignatureBoxHeight } from '@/components/shared/SignatureBox'

/** The "net-payment" tab of the page. */
export function WeaverNetPaymentTab({ page }: { page: WeaversPage }) {
  const { canEditAccounts, activeFortnight, selectedMonth, weaversList, customColumns, setActiveSlip, isEditable, netWidths, setNetColWidth, resetNetColWidth, isCellDirty, isRowDirty, handleCellChange, handleCustomCellChange, handleMoveRow, handleDeleteRow, handleUpdateCustomColumn, handleRemoveCustomColumn, totalBasic, totalExtraLoom, totalAttnAllow, totalHoliday, totalEfficiency, totalNet } = page
  const signatureBox = useSignatureBoxHeight('weavers_net', 58)
  return (
      <div className="rounded-lg border border-slate-200 bg-white text-slate-900 p-5 shadow-xs print:border-none print:p-0 print:shadow-none font-sans overflow-hidden">
        <SheetHeader title={<>WEAVERS SALARY & OVERTIME PAYMENT ({fortnightDisplayLabel(selectedMonth, activeFortnight)} ·{' '} {formatPayrollMonthLabel(selectedMonth)})</>} subtitle="Consolidated net payout rollup" />

        <div className="overflow-x-auto rounded-md border border-slate-200 shadow-xs">
          <table data-no-tidy className="table-fixed w-px print:table-auto text-center border-collapse text-xs font-mono">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 font-semibold uppercase text-[11px] text-slate-600">
                <ResizableTh
                  columnKey="serialNo"
                  width={netWidths.serialNo}
                  minWidth={40}
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
                  minWidth={40}
                  onResize={setNetColWidth}
                  onReset={resetNetColWidth}
                  className="border-r border-slate-200 py-2 px-3 font-sans"
                >
                  EMPLOYEE NAME
                </ResizableTh>

                <ResizableTh
                  columnKey="designation"
                  width={netWidths.designation}
                  minWidth={40}
                  onResize={setNetColWidth}
                  onReset={resetNetColWidth}
                  className="border-r border-slate-200 py-2 px-3 font-sans"
                >
                  DESIGNATION
                </ResizableTh>

                <ResizableTh
                  columnKey="attendanceDays"
                  width={netWidths.attendanceDays}
                  minWidth={40}
                  onResize={setNetColWidth}
                  onReset={resetNetColWidth}
                  className="border-r border-slate-200 py-2 px-1 text-center whitespace-nowrap"
                >
                  ATTN
                </ResizableTh>

                <ResizableTh
                  columnKey="extraLooms"
                  width={netWidths.extraLooms}
                  minWidth={40}
                  onResize={setNetColWidth}
                  onReset={resetNetColWidth}
                  className="border-r border-slate-200 py-2 px-1 text-center whitespace-nowrap"
                >
                  EXTRA LOOM
                </ResizableTh>

                <ResizableTh
                  columnKey="extraLoomAmount"
                  width={netWidths.extraLoomAmount}
                  minWidth={40}
                  onResize={setNetColWidth}
                  onReset={resetNetColWidth}
                  className="border-r border-slate-200 py-2 px-2 text-center whitespace-nowrap"
                >
                  Extra Loom Amt
                </ResizableTh>

                <ResizableTh
                  columnKey="attendanceAllowance"
                  width={netWidths.attendanceAllowance}
                  minWidth={40}
                  onResize={setNetColWidth}
                  onReset={resetNetColWidth}
                  className="border-r border-slate-200 py-2 px-2 text-center whitespace-nowrap"
                >
                  ATTN Allow.
                </ResizableTh>

                <ResizableTh
                  columnKey="basicSalary"
                  width={netWidths.basicSalary}
                  minWidth={40}
                  onResize={setNetColWidth}
                  onReset={resetNetColWidth}
                  className="border-r border-slate-200 py-2 px-2 text-center font-semibold text-slate-900 whitespace-nowrap"
                >
                  WAGES
                </ResizableTh>

                <ResizableTh
                  columnKey="holidayAttendance"
                  width={netWidths.holidayAttendance}
                  minWidth={40}
                  onResize={setNetColWidth}
                  onReset={resetNetColWidth}
                  className="border-r border-slate-200 py-2 px-1 text-center whitespace-nowrap"
                >
                  H/Days
                </ResizableTh>

                <ResizableTh
                  columnKey="holidayAmount"
                  width={netWidths.holidayAmount}
                  minWidth={40}
                  onResize={setNetColWidth}
                  onReset={resetNetColWidth}
                  className="border-r border-slate-200 py-2 px-2 text-center font-semibold text-slate-900 whitespace-nowrap"
                >
                  H/Days Amt
                </ResizableTh>

                <ResizableTh
                  columnKey="efficiencyAmount"
                  width={netWidths.efficiencyAmount}
                  minWidth={40}
                  onResize={setNetColWidth}
                  onReset={resetNetColWidth}
                  className="border-r border-slate-200 py-2 px-2 text-center font-semibold text-[#0066cc]"
                >
                  Efficiency
                </ResizableTh>

                <ResizableTh
                  columnKey="netPay"
                  width={netWidths.netPay}
                  minWidth={40}
                  onResize={setNetColWidth}
                  onReset={resetNetColWidth}
                  className="border-r border-slate-200 py-2 px-2 text-center font-bold text-[#0066cc] whitespace-nowrap"
                >
                  Net Pay
                </ResizableTh>

                <ResizableTh
                  columnKey="signature"
                  width={netWidths.signature}
                  minWidth={40}
                  onResize={setNetColWidth}
                  onReset={resetNetColWidth}
                  className="border-r border-slate-200 py-2 px-2 text-center font-sans"
                >
                  Signature
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
                    style={{ width: `${netWidths.employeeName}px`, minWidth: `${netWidths.employeeName}px` }}
                    className="border-r border-slate-100 py-1.5 px-3 font-sans font-semibold uppercase text-slate-900"
                  >
                    {w.employeeName}
                  </td>

                  <td
                    style={{ width: `${netWidths.designation}px`, minWidth: `${netWidths.designation}px` }}
                    className="border-r border-slate-100 py-1.5 px-3 font-sans text-slate-600"
                  >
                    {w.designation}
                  </td>

                  <td
                    style={{ width: `${netWidths.attendanceDays}px`, minWidth: `${netWidths.attendanceDays}px` }}
                    className="border-r border-slate-100 py-1.5 px-1 text-center whitespace-nowrap text-slate-700"
                  >
                    {w.attendanceDays}
                  </td>

                  <td
                    style={{ width: `${netWidths.extraLooms}px`, minWidth: `${netWidths.extraLooms}px` }}
                    className="border-r border-slate-100 py-1.5 px-1 text-center whitespace-nowrap text-slate-700"
                  >
                    {w.extraLooms || '-'}
                  </td>

                  <td
                    style={{ width: `${netWidths.extraLoomAmount}px`, minWidth: `${netWidths.extraLoomAmount}px` }}
                    className="border-r border-slate-100 py-1.5 px-2 text-center whitespace-nowrap text-slate-700"
                  >
                    {w.extraLoomAmount ? formatNumber(w.extraLoomAmount, 0) : '-'}
                  </td>

                  <td
                    style={{ width: `${netWidths.attendanceAllowance}px`, minWidth: `${netWidths.attendanceAllowance}px` }}
                    className="border-r border-slate-100 py-1.5 px-2 text-center whitespace-nowrap text-slate-700"
                  >
                    {w.attendanceAllowance ? formatNumber(w.attendanceAllowance, 0) : '-'}
                  </td>

                  <td
                    style={{ width: `${netWidths.basicSalary}px`, minWidth: `${netWidths.basicSalary}px` }}
                    className="border-r border-slate-100 py-1.5 px-2 text-center font-semibold text-slate-900 whitespace-nowrap"
                  >
                    {formatNumber(w.basicSalary, 0)}
                  </td>

                  <td
                    style={{ width: `${netWidths.holidayAttendance}px`, minWidth: `${netWidths.holidayAttendance}px` }}
                    className="border-r border-slate-100 py-1.5 px-1 text-center whitespace-nowrap text-slate-700"
                  >
                    {w.holidayAttendance || '-'}
                  </td>

                  <td
                    style={{ width: `${netWidths.holidayAmount}px`, minWidth: `${netWidths.holidayAmount}px` }}
                    className="border-r border-slate-100 py-1.5 px-2 text-center font-semibold text-slate-900 whitespace-nowrap"
                  >
                    {w.holidayAmount ? formatNumber(w.holidayAmount, 0) : '-'}
                  </td>

                  <td
                    style={{ width: `${netWidths.efficiencyAmount}px`, minWidth: `${netWidths.efficiencyAmount}px` }}
                    className="border-r border-slate-100 py-1.5 px-2 text-center font-semibold text-[#0066cc]"
                  >
                    <NumericCellInput
                      value={w.efficiencyAmount || 0}
                      disabled={!canEditAccounts}
                      isDirty={isCellDirty(w.id, 'efficiencyAmount')}
                      navRow={idx}
                      navCol={0}
                      onValueChange={(v) => handleCellChange(idx, 'efficiencyAmount', v)}
                      className="w-full text-center bg-transparent px-1 py-0.5 font-semibold text-xs focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded text-[#0066cc]"
                    />
                  </td>

                  <td
                    style={{ width: `${netWidths.netPay}px`, minWidth: `${netWidths.netPay}px` }}
                    className="border-r border-slate-100 py-1.5 px-2 text-center font-bold text-[#0066cc] whitespace-nowrap"
                  >
                    {formatNumber(w.netPay, 0)}
                  </td>

                  {/* Signature — empty box, signed (and ticket pasted) on the printed sheet */}
                  <td
                    style={{ width: `${netWidths.signature}px`, minWidth: `${netWidths.signature}px` }}
                    className="border-r border-slate-100 p-1"
                  >
                    <SignatureBox height={signatureBox.height} onHeightChange={signatureBox.setHeight} width={netWidths.signature} />
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
                    style={{ width: `${netWidths.action}px`, minWidth: `${netWidths.action}px` }}
                    className="py-1 px-1 text-center print:hidden"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const slip = payrollService.generateEmployeePaySlip(selectedMonth, w.id)
                          setActiveSlip(slip)
                        }}
                        title="View Official Salary Slip / پرچی"
                        className="p-1 text-slate-400 hover:text-[#0066cc] transition-colors cursor-pointer"
                      >
                        <FileText className="size-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteRow(w.id)}
                        title={REMOVE_ROW_TITLE}
                        disabled={!isEditable}
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
                <td colSpan={4} className="border-r border-slate-200 py-2 px-2 text-center uppercase text-xs">Consolidated Disbursal:</td>
                <td className="border-r border-slate-200 py-2 px-1 text-center font-semibold">{weaversList.reduce((s, w) => s + (w.extraLooms || 0), 0)}</td>
                <td className="border-r border-slate-200 py-2 px-2 text-center font-semibold">{formatNumber(totalExtraLoom, 0)}</td>
                <td className="border-r border-slate-200 py-2 px-2 text-center font-semibold">{formatNumber(totalAttnAllow, 0)}</td>
                <td className="border-r border-slate-200 py-2 px-2 text-center font-semibold text-slate-900">{formatNumber(totalBasic, 0)}</td>
                <td className="border-r border-slate-200 py-2 px-1 text-center font-semibold">{weaversList.reduce((s, w) => s + (w.holidayAttendance || 0), 0)}</td>
                <td className="border-r border-slate-200 py-2 px-2 text-center font-semibold">{formatNumber(totalHoliday, 0)}</td>
                <td className="border-r border-slate-200 py-2 px-2 text-center font-semibold text-[#0066cc]">{formatNumber(totalEfficiency, 0)}</td>
                <td className="border-r border-slate-200 py-2 px-2 text-center font-bold text-[#0066cc] text-sm">{formatCurrency(totalNet)}</td>
                <td className="border-r border-slate-200"></td>
                {customColumns.map((col) => (
                  <td key={col.id} className="border-r border-slate-200 py-2.5 px-2 text-center font-sans text-[10px] text-slate-500">
                    —
                  </td>
                ))}
                <td className="print:hidden"></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Prominent Calculated Net Disbursal Total in Words */}
        <div className="print:hidden mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 font-sans print:border-none print:p-2">
          <div>
            <span className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider">Net Cash Disbursal in Words (PKR):</span>
            <div className="text-xs font-semibold text-slate-900 mt-0.5">{numberToWordsPKR(totalNet)}</div>
          </div>
          <div className="sm:text-right border-t sm:border-t-0 border-slate-200 pt-2 sm:pt-0 w-full sm:w-auto">
            <span className="text-[11px] font-semibold uppercase text-slate-500">Calculated Net Payout:</span>
            <div className="text-lg font-bold text-[#0066cc]">{formatCurrency(totalNet)}</div>
          </div>
        </div>
      </div>
  )
}
