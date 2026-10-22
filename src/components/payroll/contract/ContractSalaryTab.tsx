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

/** The "employees" tab of the page. */
export function ContractSalaryTab({ page }: { page: ContractPage }) {
  const { canEditAccounts, contractList, customColumns, selectedMonth, daysInMonth, setActiveSlip, isEditable, isCellDirty, isRowDirty, salaryWidths, setSalaryColWidth, resetSalaryColWidth, handleCellChange, handleCustomCellChange, handleMoveRow, handleDeleteRow, handleUpdateCustomColumn, handleRemoveCustomColumn, totalBasic, totalLateAmount, totalAdvance, totalTicket, totalNetSalary } = page
  return (
      <div className="rounded-lg border border-slate-200 bg-white text-slate-900 p-5 shadow-xs print:border-none print:p-0 print:shadow-none font-sans overflow-hidden">
        <div className="text-center border-b border-slate-200 pb-3 mb-4">
          <h1 className="text-lg font-bold uppercase text-slate-900 tracking-wide">SARA TEXTILES</h1>
          <h2 className="text-sm font-semibold text-slate-700 mt-0.5">CONTRACT EMPLOYEES SALARIES (EXCEL SHEET 4)</h2>
          <p className="text-[11px] text-slate-500 font-mono">Statement for Month: {formatPayrollMonthLabel(selectedMonth)} ({daysInMonth} Days Base)</p>
        </div>

        <div className="overflow-x-auto rounded-md border border-slate-200 shadow-xs">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 font-semibold uppercase text-[11px] text-slate-600">
                <ResizableTh
                  columnKey="serialNo"
                  width={salaryWidths.serialNo}
                  minWidth={45}
                  onResize={setSalaryColWidth}
                  onReset={resetSalaryColWidth}
                  className="border-r border-slate-200 py-2 px-1 text-center"
                  title="Hover row serial to insert row at position"
                >
                  S.#
                </ResizableTh>

                <ResizableTh
                  columnKey="employeeName"
                  width={salaryWidths.employeeName}
                  minWidth={130}
                  onResize={setSalaryColWidth}
                  onReset={resetSalaryColWidth}
                  className="border-r border-slate-200 py-2 px-3 font-sans"
                >
                  Employee Name
                </ResizableTh>

                <ResizableTh
                  columnKey="designation"
                  width={salaryWidths.designation}
                  minWidth={110}
                  onResize={setSalaryColWidth}
                  onReset={resetSalaryColWidth}
                  className="border-r border-slate-200 py-2 px-3 font-sans"
                >
                  Designation
                </ResizableTh>

                <ResizableTh
                  columnKey="salary"
                  width={salaryWidths.salary}
                  minWidth={85}
                  onResize={setSalaryColWidth}
                  onReset={resetSalaryColWidth}
                  className="border-r border-slate-200 py-2 px-2 text-right"
                >
                  Salary / Wages
                </ResizableTh>

                <ResizableTh
                  columnKey="attendanceDays"
                  width={salaryWidths.attendanceDays}
                  minWidth={55}
                  onResize={setSalaryColWidth}
                  onReset={resetSalaryColWidth}
                  className="border-r border-slate-200 py-2 px-1 text-center"
                >
                  Attn Days
                </ResizableTh>

                <ResizableTh
                  columnKey="ratePerDay"
                  width={salaryWidths.ratePerDay}
                  minWidth={80}
                  onResize={setSalaryColWidth}
                  onReset={resetSalaryColWidth}
                  className="border-r border-slate-200 py-2 px-2 text-right whitespace-nowrap"
                >
                  Rate Per Day
                </ResizableTh>

                <ResizableTh
                  columnKey="ratePerHr"
                  width={salaryWidths.ratePerHr}
                  minWidth={80}
                  onResize={setSalaryColWidth}
                  onReset={resetSalaryColWidth}
                  className="border-r border-slate-200 py-2 px-2 text-right whitespace-nowrap"
                >
                  Rate Per Hr
                </ResizableTh>

                <ResizableTh
                  columnKey="basicSalary"
                  width={salaryWidths.basicSalary}
                  minWidth={85}
                  onResize={setSalaryColWidth}
                  onReset={resetSalaryColWidth}
                  className="border-r border-slate-200 py-2 px-2 text-right font-semibold text-slate-900 whitespace-nowrap"
                >
                  Gross Salary
                </ResizableTh>

                <ResizableTh
                  columnKey="lateHours"
                  width={salaryWidths.lateHours}
                  minWidth={70}
                  onResize={setSalaryColWidth}
                  onReset={resetSalaryColWidth}
                  className="border-r border-slate-200 py-2 px-2 text-right whitespace-nowrap"
                >
                  Late Hrs
                </ResizableTh>

                <ResizableTh
                  columnKey="lateAmount"
                  width={salaryWidths.lateAmount}
                  minWidth={80}
                  onResize={setSalaryColWidth}
                  onReset={resetSalaryColWidth}
                  className="border-r border-slate-200 py-2 px-2 text-right text-red-600 whitespace-nowrap"
                >
                  Late Amount
                </ResizableTh>

                <ResizableTh
                  columnKey="advanceDeduction"
                  width={salaryWidths.advanceDeduction}
                  minWidth={80}
                  onResize={setSalaryColWidth}
                  onReset={resetSalaryColWidth}
                  className="border-r border-slate-200 py-2 px-2 text-right text-red-600 whitespace-nowrap"
                >
                  Advance
                </ResizableTh>

                <ResizableTh
                  columnKey="ticketCharges"
                  width={salaryWidths.ticketCharges}
                  minWidth={60}
                  onResize={setSalaryColWidth}
                  onReset={resetSalaryColWidth}
                  className="border-r border-slate-200 py-2 px-2 text-right text-red-600 whitespace-nowrap"
                >
                  Ticket
                </ResizableTh>

                <ResizableTh
                  columnKey="netAmount"
                  width={salaryWidths.netAmount}
                  minWidth={90}
                  onResize={setSalaryColWidth}
                  onReset={resetSalaryColWidth}
                  className="border-r border-slate-200 py-2 px-2 text-right font-semibold text-[#0066cc] whitespace-nowrap"
                >
                  Net Salary
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
                  width={salaryWidths.action}
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
                  
                  {/* Name — from HR / General Wages */}
                  <td
                    style={{ width: `${salaryWidths.employeeName}px`, minWidth: `${salaryWidths.employeeName}px` }}
                    className="border-r border-slate-100 py-1.5 px-2 bg-slate-50"
                    title="From HR Profiles / General Wages"
                  >
                    <span className="font-semibold font-sans text-xs text-slate-500">{c.employeeName}</span>
                  </td>

                  {/* Designation — from HR / General Wages */}
                  <td
                    style={{ width: `${salaryWidths.designation}px`, minWidth: `${salaryWidths.designation}px` }}
                    className="border-r border-slate-100 py-1.5 px-2 bg-slate-50"
                    title="From HR Profiles / General Wages"
                  >
                    <span className="font-sans text-xs text-slate-500">{c.designation}</span>
                  </td>

                  {/* Salary — from HR / General Wages */}
                  <td
                    style={{ width: `${salaryWidths.salary}px`, minWidth: `${salaryWidths.salary}px` }}
                    className="border-r border-slate-100 py-1.5 px-2 text-right bg-slate-50"
                    title="From HR Profiles / General Wages"
                  >
                    <span className="font-semibold text-xs text-slate-500">{formatNumber(c.salary, 0)}</span>
                  </td>

                  {/* Attendance Days */}
                  <td
                    style={{ width: `${salaryWidths.attendanceDays}px`, minWidth: `${salaryWidths.attendanceDays}px` }}
                    className="border-r border-slate-100 py-1 px-1 text-center"
                  >
                    <NumericCellInput
                      value={c.attendanceDays || 0}
                      disabled={!canEditAccounts}
                      isDirty={isCellDirty(c.id, 'attendanceDays')}
                      navRow={idx}
                      navCol={0}
                      onValueChange={(v) => handleCellChange(idx, 'attendanceDays', v)}
                      className="w-full text-center bg-transparent px-1 py-0.5 font-semibold text-xs focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded text-slate-800"
                    />
                  </td>

                  {/* Calculated Rate Per Day */}
                  <td
                    style={{ width: `${salaryWidths.ratePerDay}px`, minWidth: `${salaryWidths.ratePerDay}px` }}
                    className="border-r border-slate-100 py-1.5 px-2 text-right text-slate-500 whitespace-nowrap bg-slate-50"
                    title="Auto: Salary ÷ Days"
                  >
                    {formatNumber(c.ratePerDay, 2)}
                  </td>

                  {/* Calculated Rate Per Hr */}
                  <td
                    style={{ width: `${salaryWidths.ratePerHr}px`, minWidth: `${salaryWidths.ratePerHr}px` }}
                    className="border-r border-slate-100 py-1.5 px-2 text-right text-slate-500 whitespace-nowrap bg-slate-50"
                    title="From General Wages / duty hours"
                  >
                    {formatNumber(c.ratePerHr, 2)}
                  </td>

                  {/* Calculated Gross Salary */}
                  <td
                    style={{ width: `${salaryWidths.basicSalary}px`, minWidth: `${salaryWidths.basicSalary}px` }}
                    className="border-r border-slate-100 py-1.5 px-2 text-right font-semibold text-slate-500 whitespace-nowrap bg-slate-50"
                    title="Auto: Attn × Rate Per Day"
                  >
                    {formatNumber(c.basicSalary, 0)}
                  </td>

                  {/* Late Hrs */}
                  <td
                    style={{ width: `${salaryWidths.lateHours}px`, minWidth: `${salaryWidths.lateHours}px` }}
                    className="border-r border-slate-100 py-1 px-1 text-center"
                  >
                    <NumericCellInput
                      value={c.lateHours || 0}
                      disabled={!canEditAccounts}
                      isDirty={isCellDirty(c.id, 'lateHours')}
                      navRow={idx}
                      navCol={1}
                      onValueChange={(v) => handleCellChange(idx, 'lateHours', v)}
                      className="w-full text-center bg-transparent px-1 py-0.5 font-semibold text-xs focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded text-slate-800"
                    />
                  </td>

                  {/* Late Amount */}
                  <td
                    style={{ width: `${salaryWidths.lateAmount}px`, minWidth: `${salaryWidths.lateAmount}px` }}
                    className="border-r border-slate-100 py-1 px-1"
                  >
                    <NumericCellInput
                      value={c.lateAmount || 0}
                      disabled={!canEditAccounts}
                      isDirty={isCellDirty(c.id, 'lateAmount')}
                      navRow={idx}
                      navCol={2}
                      onValueChange={(v) => handleCellChange(idx, 'lateAmount', v)}
                      className="w-full text-right bg-transparent px-1 py-0.5 font-semibold text-xs text-red-600 focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded"
                    />
                  </td>

                  {/* Advance Input */}
                  <td
                    style={{ width: `${salaryWidths.advanceDeduction}px`, minWidth: `${salaryWidths.advanceDeduction}px` }}
                    className="border-r border-slate-100 py-1 px-1"
                  >
                    <NumericCellInput
                      value={c.advanceDeduction || 0}
                      disabled={!canEditAccounts}
                      isDirty={isCellDirty(c.id, 'advanceDeduction')}
                      navRow={idx}
                      navCol={3}
                      onValueChange={(v) => handleCellChange(idx, 'advanceDeduction', v)}
                      className="w-full text-right bg-transparent px-2 py-0.5 font-semibold text-xs text-red-600 focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded"
                    />
                  </td>

                  {/* Ticket Charges */}
                  <td
                    style={{ width: `${salaryWidths.ticketCharges}px`, minWidth: `${salaryWidths.ticketCharges}px` }}
                    className="border-r border-slate-100 py-1 px-1"
                  >
                    <NumericCellInput
                      value={c.ticketCharges ?? 5}
                      disabled={!canEditAccounts}
                      isDirty={isCellDirty(c.id, 'ticketCharges')}
                      navRow={idx}
                      navCol={4}
                      onValueChange={(v) => handleCellChange(idx, 'ticketCharges', v)}
                      className="w-full text-right bg-transparent px-1 py-0.5 font-semibold text-xs text-red-600 focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded"
                    />
                  </td>

                  {/* Net Salary (Sheet 4 Base Net: Basic - Late - Advance - Ticket) - NO OT, NO Efficiency! */}
                  <td
                    style={{ width: `${salaryWidths.netAmount}px`, minWidth: `${salaryWidths.netAmount}px` }}
                    className="border-r border-slate-100 py-1.5 px-2 text-right font-bold text-[#0066cc] whitespace-nowrap bg-slate-50"
                    title="Basic Salary − Late − Advance − Ticket (Sheet 4 Base Net)"
                  >
                    {formatNumber(
                      c.netSalary !== undefined
                        ? c.netSalary
                        : Math.max(
                            0,
                            (c.basicSalary || 0) -
                              (c.lateAmount || 0) -
                              (c.advanceDeduction || 0) -
                              (c.ticketCharges || 0)
                          ),
                      0
                    )}
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

                  {/* Action */}
                  <td
                    style={{ width: `${salaryWidths.action}px`, minWidth: `${salaryWidths.action}px` }}
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
                <td colSpan={3} className="border-r border-slate-200 py-2 px-2 text-center uppercase text-xs">Total Base Earned:</td>
                <td className="border-r border-slate-200 py-2 px-2 text-right font-semibold">{formatNumber(contractList.reduce((s, c) => s + (c.salary || 0), 0), 0)}</td>
                <td className="border-r border-slate-200 py-2 px-1 text-center text-slate-400">-</td>
                <td className="border-r border-slate-200 py-2 px-2 text-right text-slate-400">-</td>
                <td className="border-r border-slate-200 py-2 px-2 text-right text-slate-400">-</td>
                <td className="border-r border-slate-200 py-2 px-2 text-right font-bold text-[#0066cc] text-sm">{formatCurrency(totalBasic)}</td>
                <td className="border-r border-slate-200 py-2 px-2 text-right text-slate-400">-</td>
                <td className="border-r border-slate-200 py-2 px-2 text-right text-red-600 font-semibold">{formatNumber(totalLateAmount, 0)}</td>
                <td className="border-r border-slate-200 py-2 px-2 text-right text-red-600 font-semibold">{formatNumber(totalAdvance, 0)}</td>
                <td className="border-r border-slate-200 py-2 px-2 text-right text-red-600 font-semibold" title="Total Ticket Charges Deductions">{formatNumber(totalTicket, 0)}</td>
                <td className="border-r border-slate-200 py-2 px-2 text-right font-bold text-[#0066cc] text-sm" title="Total Net Base Salary (Sheet 4)">{formatCurrency(totalNetSalary)}</td>
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

        {/* Prominent Calculated Base Salary & Deductions Breakdown */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3.5 font-sans">
            <span className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider">Gross Base Earned:</span>
            <div className="text-base font-bold text-slate-900 mt-0.5">{formatCurrency(totalBasic)}</div>
            <div className="text-[10px] text-slate-500 font-mono mt-1">Attn Days × Rate Per Day</div>
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
            <span className="text-[11px] font-semibold uppercase text-[#0066cc] tracking-wider">Net Base Salary Disbursal:</span>
            <div className="text-lg font-bold text-[#0066cc] mt-0.5">{formatCurrency(totalNetSalary)}</div>
            <div className="text-[10px] text-slate-600 font-medium mt-1 truncate" title={numberToWordsPKR(totalNetSalary)}>
              {numberToWordsPKR(totalNetSalary)}
            </div>
          </div>
        </div>
      </div>
  )
}
