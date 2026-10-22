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

/** The "wages" tab of the page. */
export function WeaverWagesTab({ page }: { page: WeaversPage }) {
  const { canEditAccounts, activeFortnight, selectedMonth, weaversList, customColumns, setActiveSlip, isEditable, wageWidths, setWageColWidth, resetWageColWidth, isCellDirty, isRowDirty, handleCellChange, handleCustomCellChange, handleMoveRow, handleDeleteRow, handleUpdateCustomColumn, handleRemoveCustomColumn, totalBasic, totalExtraLoom, totalAttnAllow, totalGross } = page
  return (
      <div className="rounded-lg border border-slate-200 bg-white text-slate-900 p-5 shadow-xs print:border-none print:p-0 print:shadow-none font-sans overflow-hidden">
        <div className="text-center border-b border-slate-200 pb-3 mb-4">
          <h1 className="text-lg font-bold uppercase text-slate-900 tracking-wide">SARA TEXTILES</h1>
          <h2 className="text-sm font-semibold text-slate-700 mt-0.5">
            WEAVERS WAGES ({fortnightDisplayLabel(selectedMonth, activeFortnight)} ·{' '}
            {formatPayrollMonthLabel(selectedMonth)})
          </h2>
          <p className="text-[11px] text-slate-500 font-mono">Loom production, extra looms & attendance allowance</p>
        </div>

        <div className="overflow-x-auto rounded-md border border-slate-200 shadow-xs">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 font-semibold uppercase text-[11px] text-slate-600">
                <ResizableTh
                  columnKey="serialNo"
                  width={wageWidths.serialNo}
                  minWidth={45}
                  onResize={setWageColWidth}
                  onReset={resetWageColWidth}
                  className="border-r border-slate-200 py-2 px-1 text-center"
                  title="Hover row serial to insert row at position"
                >
                  S.#
                </ResizableTh>

                <ResizableTh
                  columnKey="employeeName"
                  width={wageWidths.employeeName}
                  minWidth={130}
                  onResize={setWageColWidth}
                  onReset={resetWageColWidth}
                  className="border-r border-slate-200 py-2 px-3 font-sans"
                >
                  Employee Name
                </ResizableTh>

                <ResizableTh
                  columnKey="designation"
                  width={wageWidths.designation}
                  minWidth={110}
                  onResize={setWageColWidth}
                  onReset={resetWageColWidth}
                  className="border-r border-slate-200 py-2 px-3 font-sans"
                >
                  Designation
                </ResizableTh>

                <ResizableTh
                  columnKey="wagePerDay"
                  width={wageWidths.wagePerDay}
                  minWidth={85}
                  onResize={setWageColWidth}
                  onReset={resetWageColWidth}
                  className="border-r border-slate-200 py-2 px-2 text-right"
                >
                  Wage / Day
                </ResizableTh>

                <ResizableTh
                  columnKey="attendanceDays"
                  width={wageWidths.attendanceDays}
                  minWidth={55}
                  onResize={setWageColWidth}
                  onReset={resetWageColWidth}
                  className="border-r border-slate-200 py-2 px-1 text-center"
                >
                  ATTN
                </ResizableTh>

                <ResizableTh
                  columnKey="basicSalary"
                  width={wageWidths.basicSalary}
                  minWidth={85}
                  onResize={setWageColWidth}
                  onReset={resetWageColWidth}
                  className="border-r border-slate-200 py-2 px-2 text-right font-semibold text-slate-900 whitespace-nowrap"
                >
                  Basic Salary
                </ResizableTh>

                <ResizableTh
                  columnKey="rateLoom"
                  width={wageWidths.rateLoom}
                  minWidth={65}
                  onResize={setWageColWidth}
                  onReset={resetWageColWidth}
                  className="border-r border-slate-200 py-2 px-1 text-center whitespace-nowrap"
                >
                  Rate Loom
                </ResizableTh>

                <ResizableTh
                  columnKey="extraLooms"
                  width={wageWidths.extraLooms}
                  minWidth={65}
                  onResize={setWageColWidth}
                  onReset={resetWageColWidth}
                  className="border-r border-slate-200 py-2 px-1 text-center"
                >
                  Extra Looms
                </ResizableTh>

                <ResizableTh
                  columnKey="extraAmount"
                  width={wageWidths.extraAmount}
                  minWidth={85}
                  onResize={setWageColWidth}
                  onReset={resetWageColWidth}
                  className="border-r border-slate-200 py-2 px-2 text-right font-semibold text-slate-900 whitespace-nowrap"
                >
                  Extra Amount
                </ResizableTh>

                <ResizableTh
                  columnKey="attendanceAllowance"
                  width={wageWidths.attendanceAllowance}
                  minWidth={85}
                  onResize={setWageColWidth}
                  onReset={resetWageColWidth}
                  className="border-r border-slate-200 py-2 px-2 text-right font-semibold text-slate-900 whitespace-nowrap"
                >
                  ATTN Allow.
                </ResizableTh>

                <ResizableTh
                  columnKey="grossAmount"
                  width={wageWidths.grossAmount}
                  minWidth={95}
                  onResize={setWageColWidth}
                  onReset={resetWageColWidth}
                  className="border-r border-slate-200 py-2 px-2 text-right font-bold text-[#0066cc] whitespace-nowrap"
                >
                  Gross Wages
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
                  width={wageWidths.action}
                  minWidth={45}
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
                  
                  {/* Name — from HR */}
                  <td
                    style={{ width: `${wageWidths.employeeName}px`, minWidth: `${wageWidths.employeeName}px` }}
                    className="border-r border-slate-100 py-1.5 px-2 bg-slate-50"
                    title="From HR Profiles / General Wages"
                  >
                    <span className="font-semibold font-sans text-xs text-slate-500">{w.employeeName}</span>
                  </td>

                  {/* Designation — from HR */}
                  <td
                    style={{ width: `${wageWidths.designation}px`, minWidth: `${wageWidths.designation}px` }}
                    className="border-r border-slate-100 py-1.5 px-2 bg-slate-50"
                    title="From HR Profiles / General Wages"
                  >
                    <span className="font-sans text-xs text-slate-500">{w.designation}</span>
                  </td>

                  {/* Wage Per Day — From HR Profile Card */}
                  <td
                    style={{ width: `${wageWidths.wagePerDay}px`, minWidth: `${wageWidths.wagePerDay}px` }}
                    className="border-r border-slate-100 py-1.5 px-2 text-right bg-slate-50/50"
                    title="Set in HR Profile Card"
                  >
                    <span className="font-mono text-xs font-semibold text-slate-800">
                      {formatNumber(w.wagePerDay || 0, 0)}
                    </span>
                  </td>

                  {/* Attendance Days */}
                  <td
                    style={{ width: `${wageWidths.attendanceDays}px`, minWidth: `${wageWidths.attendanceDays}px` }}
                    className="border-r border-slate-100 py-1 px-1 text-center"
                  >
                    <NumericCellInput
                      value={w.attendanceDays || 0}
                      disabled={!canEditAccounts}
                      isDirty={isCellDirty(w.id, 'attendanceDays')}
                      navRow={idx}
                      navCol={1}
                      onValueChange={(v) => handleCellChange(idx, 'attendanceDays', v)}
                      className="w-full text-center bg-transparent px-1 py-0.5 font-semibold text-xs focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded text-slate-800"
                    />
                  </td>

                  {/* Calculated Basic Salary */}
                  <td
                    style={{ width: `${wageWidths.basicSalary}px`, minWidth: `${wageWidths.basicSalary}px` }}
                    className="border-r border-slate-100 py-1.5 px-2 text-right font-semibold text-slate-900 whitespace-nowrap"
                  >
                    {formatNumber(w.basicSalary, 0)}
                  </td>

                  {/* Rate Per Loom */}
                  <td
                    style={{ width: `${wageWidths.rateLoom}px`, minWidth: `${wageWidths.rateLoom}px` }}
                    className="border-r border-slate-100 py-1.5 px-1 text-center text-slate-600 font-mono whitespace-nowrap"
                  >
                    {formatNumber(w.rateLoom, 0)}
                  </td>

                  {/* Extra Looms Input */}
                  <td
                    style={{ width: `${wageWidths.extraLooms}px`, minWidth: `${wageWidths.extraLooms}px` }}
                    className="border-r border-slate-100 py-1 px-1 text-center"
                  >
                    <NumericCellInput
                      value={w.extraLooms || 0}
                      disabled={!canEditAccounts}
                      isDirty={isCellDirty(w.id, 'extraLooms')}
                      navRow={idx}
                      navCol={2}
                      onValueChange={(v) => handleCellChange(idx, 'extraLooms', v)}
                      className="w-full text-center bg-transparent px-1 py-0.5 font-semibold text-xs focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded text-slate-900"
                    />
                  </td>

                  {/* Calculated Extra Amount */}
                  <td
                    style={{ width: `${wageWidths.extraAmount}px`, minWidth: `${wageWidths.extraAmount}px` }}
                    className="border-r border-slate-100 py-1.5 px-2 text-right font-semibold text-slate-900 whitespace-nowrap"
                  >
                    {formatNumber(w.extraLoomAmount ?? (w as any).extraAmount ?? 0, 0)}
                  </td>

                  {/* Attendance Allowance — editable */}
                  <td
                    style={{ width: `${wageWidths.attendanceAllowance}px`, minWidth: `${wageWidths.attendanceAllowance}px` }}
                    className="border-r border-slate-100 py-1 px-1 text-right"
                  >
                    <NumericCellInput
                      value={w.attendanceAllowance || 0}
                      disabled={!canEditAccounts}
                      isDirty={isCellDirty(w.id, 'attendanceAllowance')}
                      navRow={idx}
                      navCol={3}
                      onValueChange={(v) => handleCellChange(idx, 'attendanceAllowance', v)}
                      className="w-full text-right bg-transparent px-1 py-0.5 font-semibold text-xs focus:bg-white focus:ring-1 focus:ring-[#0066cc] rounded text-slate-900"
                    />
                  </td>

                  {/* Calculated Gross Amount */}
                  <td
                    style={{ width: `${wageWidths.grossAmount}px`, minWidth: `${wageWidths.grossAmount}px` }}
                    className="border-r border-slate-100 py-1.5 px-2 text-right font-bold text-[#0066cc] whitespace-nowrap"
                  >
                    {formatNumber(w.grossAmount, 0)}
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
                    style={{ width: `${wageWidths.action}px`, minWidth: `${wageWidths.action}px` }}
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
                <td colSpan={5} className="border-r border-slate-200 py-2 px-2 text-center uppercase text-xs">Total Weaving Production:</td>
                <td className="border-r border-slate-200 py-2 px-2 text-right font-semibold">{formatNumber(totalBasic, 0)}</td>
                <td className="border-r border-slate-200 py-2 px-1 text-center text-slate-400">-</td>
                <td className="border-r border-slate-200 py-2 px-1 text-center font-semibold">{weaversList.reduce((s, w) => s + (w.extraLooms || 0), 0)}</td>
                <td className="border-r border-slate-200 py-2 px-2 text-right font-semibold">{formatNumber(totalExtraLoom, 0)}</td>
                <td className="border-r border-slate-200 py-2 px-2 text-right font-semibold">{formatNumber(totalAttnAllow, 0)}</td>
                <td className="border-r border-slate-200 py-2 px-2 text-right font-bold text-[#0066cc] text-sm">{formatCurrency(totalGross)}</td>
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

        {/* Prominent Calculated Gross Total in Words */}
        <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 font-sans print:border-none print:p-2">
          <div>
            <span className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider">Gross Weavers Wages in Words (PKR):</span>
            <div className="text-xs font-semibold text-slate-900 mt-0.5">{numberToWordsPKR(totalGross)}</div>
          </div>
          <div className="sm:text-right border-t sm:border-t-0 border-slate-200 pt-2 sm:pt-0 w-full sm:w-auto">
            <span className="text-[11px] font-semibold uppercase text-slate-500">Calculated Total Gross:</span>
            <div className="text-lg font-bold text-[#0066cc]">{formatCurrency(totalGross)}</div>
          </div>
        </div>
      </div>
  )
}
