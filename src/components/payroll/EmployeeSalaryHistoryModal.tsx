'use client'

import { useState } from 'react'
import { payrollService, formatPayrollMonthLabel } from '@/services/payrollService'
import { EmployeeSalaryHistoryItem, EmployeePaySlip, EmployeeProfile } from '@/types/payroll'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { EmployeePaySlipModal } from './EmployeePaySlipModal'
import { X, Calendar, FileText, ShieldCheck, ChevronRight, History } from 'lucide-react'

interface EmployeeSalaryHistoryModalProps {
  employee: EmployeeProfile | null
  onClose: () => void
}

export function EmployeeSalaryHistoryModal({ employee, onClose }: EmployeeSalaryHistoryModalProps) {
  const [selectedSlip, setSelectedSlip] = useState<EmployeePaySlip | null>(null)

  if (!employee) return null

  const history = payrollService.getEmployeeSalaryHistory(employee.id)

  const handleOpenSlip = (month: string) => {
    const slip = payrollService.generateEmployeePaySlip(month, employee.id)
    if (slip) {
      setSelectedSlip(slip)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
        <div className="relative w-full max-w-3xl rounded-xl bg-white shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 my-6">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 bg-slate-50 rounded-t-xl">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-[#0066cc]/10 text-[#0066cc]">
                <History className="size-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Salary & Wages Ledger History
                </h2>
                <p className="text-xs text-slate-500">
                  {employee.name} · {employee.designation} ({employee.employeeCategory || 'Employee'})
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Table */}
          <div className="p-5">
            {history.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                No salary or wages records found across generated payroll months for this employee.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-xs">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 font-semibold uppercase text-[11px] text-slate-600">
                      <th className="py-2.5 px-3 font-sans">Month</th>
                      <th className="py-2.5 px-3 font-sans">Category</th>
                      <th className="py-2.5 px-2 text-center">Days</th>
                      <th className="py-2.5 px-3 text-right">Basic (PKR)</th>
                      <th className="py-2.5 px-3 text-right">OT Amount</th>
                      <th className="py-2.5 px-3 text-right">Gross</th>
                      <th className="py-2.5 px-3 text-right text-red-600">Advance</th>
                      <th className="py-2.5 px-3 text-right font-bold text-[#0066cc]">Net Paid</th>
                      <th className="py-2.5 px-2 text-center">Status</th>
                      <th className="py-2.5 px-2 text-center font-sans">Pay Slip</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {history.map((row) => (
                      <tr key={row.month} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2 px-3 font-semibold text-slate-900 font-sans whitespace-nowrap">
                          {formatPayrollMonthLabel(row.month)}
                        </td>
                        <td className="py-2 px-3 font-sans text-slate-600">
                          {row.category}
                        </td>
                        <td className="py-2 px-2 text-center text-slate-700">
                          {row.attendanceDays}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-700">
                          {formatNumber(row.basicSalary, 0)}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-700">
                          {row.otAmount ? formatNumber(row.otAmount, 0) : '—'}
                        </td>
                        <td className="py-2 px-3 text-right font-semibold text-slate-800">
                          {formatNumber(row.grossAmount, 0)}
                        </td>
                        <td className="py-2 px-3 text-right text-red-600">
                          {row.advanceDeduction ? formatNumber(row.advanceDeduction, 0) : '—'}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-sm text-[#0066cc]">
                          {formatNumber(row.netPayable, 0)}
                        </td>
                        <td className="py-2 px-2 text-center">
                          {row.isLocked ? (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                              <ShieldCheck className="size-2.5" />
                              LOCKED
                            </span>
                          ) : (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                              DRAFT
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleOpenSlip(row.month)}
                            title="View Official Pay Slip"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold text-[#0066cc] bg-blue-50 hover:bg-blue-100 transition-colors cursor-pointer"
                          >
                            <FileText className="size-3" />
                            <span>Slip</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold text-xs text-slate-900">
                      <td colSpan={7} className="py-2.5 px-3 font-sans uppercase">
                        Cumulative Total ({history.length} Months):
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-sm text-[#0066cc]">
                        {formatNumber(history.reduce((s, h) => s + h.netPayable, 0), 0)}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedSlip && (
        <EmployeePaySlipModal
          slip={selectedSlip}
          onClose={() => setSelectedSlip(null)}
        />
      )}
    </>
  )
}
