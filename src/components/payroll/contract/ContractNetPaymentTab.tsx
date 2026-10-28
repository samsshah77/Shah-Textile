'use client'

import { payrollService, formatPayrollMonthLabel } from '@/services/payrollService'
import { CustomColumnHeader } from '@/components/shared/CustomColumnModal'
import { SerialCellWithInsert } from '@/components/shared/InlineRowActions'
import { ResizableTh } from '@/components/shared/ResizableTh'
import { formatCurrency, formatNumber, numberToWordsPKR, cn } from '@/lib/utils'
import { Trash2, FileText } from 'lucide-react'
import { NumericCellInput } from '@/components/shared/NumericCellInput'
import { REMOVE_ROW_TITLE } from '@/components/payroll/removeRowConfirm'
import type { ContractPage } from './useContractPage'
import { SheetHeader } from '@/components/shared/SheetHeader'
import { SignatureBox, useSignatureBoxHeight } from '@/components/shared/SignatureBox'

/** The "net-payment" tab of the page. */
export function ContractNetPaymentTab({ page }: { page: ContractPage }) {
  const { canEditAccounts, contractList, customColumns, selectedMonth, daysInMonth, setActiveSlip, isEditable, isCellDirty, isRowDirty, netWidths, setNetColWidth, resetNetColWidth, handleCellChange, handleCustomCellChange, handleMoveRow, handleDeleteRow, handleUpdateCustomColumn, handleRemoveCustomColumn, totalBasic, totalOT, totalOTHours, totalEfficiency, totalGross, totalAdvance, totalTicket, totalNet } = page
  const signatureBox = useSignatureBoxHeight('contract_net')
  return (
      <div className="rounded-lg border border-slate-200 bg-white text-slate-900 p-5 shadow-xs print:border-none print:p-0 print:shadow-none font-sans overflow-hidden">
        <SheetHeader title="CONTRACT EMPLOYEE SALARY, OVERTIME & EFFICIENCY (EXCEL SHEET 7)" subtitle={<>Statement for Month: {formatPayrollMonthLabel(selectedMonth)} (1 to {daysInMonth} Full Settlement)</>} />

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
                  Employee Name
                </ResizableTh>

                <ResizableTh
                  columnKey="designation"
                  width={netWidths.designation}
                  minWidth={40}
                  onResize={setNetColWidth}
                  onReset={resetNetColWidth}
                  className="border-r border-slate-200 py-2 px-3 font-sans"
                >
                  Designation
                </ResizableTh>

                <ResizableTh
                  columnKey="salary"
                  width={netWidths.salary}
                  minWidth={40}
                  onResize={setNetColWidth}
                  onReset={resetNetColWidth}
                  className="border-r border-slate-200 py-2 px-2 text-center whitespace-nowrap"
                >
                  Salary
                </ResizableTh>

                <ResizableTh
                  columnKey="attendanceDays"
                  width={netWidths.attendanceDays}
                  minWidth={40}
                  onResize={setNetColWidth}
                  onReset={resetNetColWidth}
                  className="border-r border-slate-200 py-2 px-1 text-center whitespace-nowrap"
                >
                  Attn
                </ResizableTh>

                <ResizableTh
                  columnKey="basicSalary"
                  width={netWidths.basicSalary}
                  minWidth={40}
                  onResize={setNetColWidth}
                  onReset={resetNetColWidth}
                  className="border-r border-slate-200 py-2 px-2 text-center font-semibold text-slate-900 whitespace-nowrap"
                >
                  Basic
                </ResizableTh>

                <ResizableTh
                  columnKey="otHours"
                  width={netWidths.otHours}
                  minWidth={40}
                  onResize={setNetColWidth}
                  onReset={resetNetColWidth}
                  className="border-r border-slate-200 py-2 px-1 text-center whitespace-nowrap"
                >
                  O/T Hrs
                </ResizableTh>

                <ResizableTh
                  columnKey="otAmount"
                  width={netWidths.otAmount}
                  minWidth={40}
                  onResize={setNetColWidth}
                  onReset={resetNetColWidth}
                  className="border-r border-slate-200 py-2 px-2 text-center font-semibold text-slate-900 whitespace-nowrap"
                >
                  O/T Amount
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
                  columnKey="grossSalary"
                  width={netWidths.grossSalary}
                  minWidth={40}
                  onResize={setNetColWidth}
                  onReset={resetNetColWidth}
                  className="border-r border-slate-200 py-2 px-2 text-center font-semibold text-slate-900 whitespace-nowrap"
                >
                  Gross
                </ResizableTh>

                <ResizableTh
                  columnKey="advanceDeduction"
                  width={netWidths.advanceDeduction}
                  minWidth={40}
                  onResize={setNetColWidth}
                  onReset={resetNetColWidth}
                  className="border-r border-slate-200 py-2 px-2 text-center text-red-600 whitespace-nowrap"
                >
                  Advance
                </ResizableTh>

                <ResizableTh
                  columnKey="ticketCharges"
                  width={netWidths.ticketCharges}
                  minWidth={40}
                  onResize={setNetColWidth}
                  onReset={resetNetColWidth}
                  className="border-r border-slate-200 py-2 px-1 text-center whitespace-nowrap"
                >
                  Ticket
                </ResizableTh>

                <ResizableTh
                  columnKey="netAmount"
                  width={netWidths.netAmount}
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
                    className="border-r border-slate-100 py-1.5 px-2 text-center whitespace-nowrap text-slate-700"
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
                    className="border-r border-slate-100 py-1.5 px-2 text-center font-semibold text-slate-900 whitespace-nowrap"
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
                    className="border-r border-slate-100 py-1.5 px-2 text-center font-semibold text-slate-900 whitespace-nowrap"
                  >
                    {formatNumber(c.otAmount, 0)}
                  </td>

                  <td
                    style={{ width: `${netWidths.efficiencyAmount}px`, minWidth: `${netWidths.efficiencyAmount}px` }}
                    className="border-r border-slate-100 py-1.5 px-2 text-center font-semibold text-[#0066cc]"
                  >
                    <NumericCellInput
                      value={c.efficiencyAmount || 0}
                      disabled={!canEditAccounts}
                      isDirty={isCellDirty(c.id, 'efficiencyAmount')}
                      navRow={idx}
                      navCol={0}
                      onValueChange={(v) => handleCellChange(idx, 'efficiencyAmount', v)}
                      className="w-full text-center bg-transparent px-1 py-0.5 font-semibold text-xs focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded text-[#0066cc]"
                    />
                  </td>

                  <td
                    style={{ width: `${netWidths.grossSalary}px`, minWidth: `${netWidths.grossSalary}px` }}
                    className="border-r border-slate-100 py-1.5 px-2 text-center font-semibold text-slate-900 whitespace-nowrap"
                  >
                    {formatNumber(c.grossSalary, 0)}
                  </td>

                  <td
                    style={{ width: `${netWidths.advanceDeduction}px`, minWidth: `${netWidths.advanceDeduction}px` }}
                    className="border-r border-slate-100 py-1.5 px-2 text-center text-red-600 font-semibold whitespace-nowrap"
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
                      isDirty={isCellDirty(c.id, 'ticketCharges')}
                      navRow={idx}
                      navCol={1}
                      onValueChange={(v) => handleCellChange(idx, 'ticketCharges', v)}
                      className="w-full text-center bg-transparent px-1 py-0.5 font-semibold text-xs text-red-600 focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded"
                    />
                  </td>

                  <td
                    style={{ width: `${netWidths.netAmount}px`, minWidth: `${netWidths.netAmount}px` }}
                    className="border-r border-slate-100 py-1.5 px-2 text-center font-bold text-[#0066cc] whitespace-nowrap"
                  >
                    {formatNumber(c.netAmount, 0)}
                  </td>

                  {/* Signature — empty box, signed (and sticker pasted) on the printed sheet */}
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
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const slip = payrollService.generateEmployeePaySlip(selectedMonth, c.id)
                          setActiveSlip(slip)
                        }}
                        title="View Official Salary Slip / پرچی"
                        className="p-1 text-slate-400 hover:text-[#0066cc] transition-colors cursor-pointer"
                      >
                        <FileText className="size-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteRow(c.id)}
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
                <td colSpan={3} className="border-r border-slate-200 py-2 px-2 text-center uppercase text-xs">Consolidated Totals:</td>
                <td className="border-r border-slate-200 py-2 px-2 text-center font-semibold">{formatNumber(contractList.reduce((s, c) => s + (c.salary || 0), 0), 0)}</td>
                <td className="border-r border-slate-200 py-2 px-1 text-center text-slate-400">-</td>
                <td className="border-r border-slate-200 py-2 px-2 text-center font-semibold">{formatNumber(totalBasic, 0)}</td>
                <td className="border-r border-slate-200 py-2 px-1 text-center font-semibold">{totalOTHours}</td>
                <td className="border-r border-slate-200 py-2 px-2 text-center font-semibold">{formatNumber(totalOT, 0)}</td>
                <td className="border-r border-slate-200 py-2 px-2 text-center font-semibold text-[#0066cc]">{formatNumber(totalEfficiency, 0)}</td>
                <td className="border-r border-slate-200 py-2 px-2 text-center font-semibold">{formatNumber(totalGross, 0)}</td>
                <td className="border-r border-slate-200 py-2 px-2 text-center text-red-600 font-semibold">{formatNumber(totalAdvance, 0)}</td>
                <td className="border-r border-slate-200 py-2 px-1 text-center text-red-600 font-semibold" title="Total Ticket Charges Deductions">{formatNumber(totalTicket, 0)}</td>
                <td className="border-r border-slate-200 py-2 px-2 text-center font-bold text-[#0066cc] text-sm">{formatCurrency(totalNet)}</td>
                <td className="border-r border-slate-200"></td>
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

        {/* Prominent Calculated Consolidated Payout Breakdown */}
        <div className="print:hidden mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3.5 font-sans">
            <span className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider">Consolidated Gross:</span>
            <div className="text-base font-bold text-slate-900 mt-0.5">{formatCurrency(totalGross)}</div>
            <div className="text-[10px] text-slate-500 font-mono mt-1">Basic + OT ({formatNumber(totalOT, 0)}) + Eff ({formatNumber(totalEfficiency, 0)})</div>
          </div>

          <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3.5 font-sans">
            <span className="text-[11px] font-semibold uppercase text-amber-700 tracking-wider">Advance Recovered:</span>
            <div className="text-base font-bold text-amber-900 mt-0.5">- {formatCurrency(totalAdvance)}</div>
            <div className="text-[10px] text-amber-600 font-mono mt-1">Deducted from staff ledger</div>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-3.5 font-sans">
            <span className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider">Ticket Charges:</span>
            <div className="text-base font-bold text-slate-900 mt-0.5">{formatCurrency(totalTicket)}</div>
            <div className="text-[10px] text-slate-500 font-mono mt-1">{contractList.length} employees × Rs. 5 = 75</div>
          </div>

          <div className="rounded-md border border-blue-200 bg-blue-50/60 p-3.5 font-sans">
            <span className="text-[11px] font-semibold uppercase text-[#0066cc] tracking-wider">Net Contract Disbursal:</span>
            <div className="text-lg font-bold text-[#0066cc] mt-0.5">{formatCurrency(totalNet)}</div>
            <div className="text-[10px] text-slate-600 font-medium mt-1 truncate" title={numberToWordsPKR(totalNet)}>
              {numberToWordsPKR(totalNet)}
            </div>
          </div>
        </div>
      </div>
  )
}
