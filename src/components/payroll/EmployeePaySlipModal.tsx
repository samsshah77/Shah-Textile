'use client'

import { useRef } from 'react'
import { EmployeePaySlip } from '@/types/payroll'
import { formatCurrency, formatNumber, numberToWordsPKR } from '@/lib/utils'
import { formatPayrollMonthLabel } from '@/services/payrollService'
import { Printer, X, CheckCircle2, ShieldCheck, Building2, User, Calendar, DollarSign } from 'lucide-react'

interface EmployeePaySlipModalProps {
  slip: EmployeePaySlip | null
  onClose: () => void
}

export function EmployeePaySlipModal({ slip, onClose }: EmployeePaySlipModalProps) {
  const printRef = useRef<HTMLDivElement>(null)

  if (!slip) return null

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-xl bg-white shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 my-6">
        {/* Top Modal Controls (Hidden in Print) */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 print:hidden bg-slate-50 rounded-t-xl">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-slate-800">Official Pay Slip / تنخواہ پرچی</span>
            {slip.isLocked && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                <ShieldCheck className="size-3" />
                FINALIZED
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-[#0066cc] hover:bg-[#0055aa] text-white cursor-pointer transition-colors shadow-xs"
            >
              <Printer className="size-3.5" />
              <span>Print Slip</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Printable Pay Slip Body */}
        <div ref={printRef} className="p-6 font-sans text-slate-900 print:p-8 print:m-0 print:max-w-none">
          {/* Company & Voucher Header */}
          <div className="border-b-2 border-slate-900 pb-3 mb-4 text-center">
            <h1 className="text-xl font-black uppercase tracking-wider text-slate-900">
              SHAH TEXTILE MILLS
            </h1>
            <p className="text-xs font-semibold uppercase text-slate-600 tracking-wide mt-0.5">
              Employee Salary & Wage Voucher / پرچی ادائیگی تنخواہ
            </p>
            <div className="flex items-center justify-between text-xs font-mono text-slate-700 mt-2 px-1">
              <span><strong>Month:</strong> {formatPayrollMonthLabel(slip.month)}</span>
              <span><strong>Voucher S.#:</strong> {slip.slipNo}</span>
              <span><strong>Date:</strong> {new Date().toLocaleDateString('en-GB')}</span>
            </div>
          </div>

          {/* Employee Info Grid */}
          <div className="rounded-md border border-slate-300 bg-slate-50/70 p-3 mb-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-2 gap-x-4">
              <div>
                <span className="text-[10px] uppercase text-slate-500 font-semibold block">Employee Name:</span>
                <strong className="text-sm text-slate-900">{slip.employeeName}</strong>
                {slip.fatherName && (
                  <span className="block text-[11px] text-slate-600">S/O {slip.fatherName}</span>
                )}
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-500 font-semibold block">Designation & Dept:</span>
                <span className="font-semibold text-slate-800">{slip.designation}</span>
                <span className="block text-[11px] text-slate-500">{slip.department || slip.category}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-500 font-semibold block">Category:</span>
                <span className="inline-block px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 font-semibold text-[11px]">
                  {slip.category}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-500 font-semibold block">CNIC:</span>
                <span className="font-mono text-slate-700">{slip.cnic || '—'}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-500 font-semibold block">Attendance (Days / Shifts):</span>
                <strong className="font-mono text-slate-900">{slip.attendanceDays} Days</strong>
                {slip.dutyHrs && (
                  <span className="text-slate-500 text-[10px] ml-1">({slip.dutyHrs} hrs shift)</span>
                )}
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-500 font-semibold block">Rate Base:</span>
                <span className="font-mono text-slate-700">{formatCurrency(slip.ratePerDay)} / day</span>
              </div>
            </div>
          </div>

          {/* Two-Column Earnings & Deductions Breakdown */}
          <div className="grid grid-cols-2 gap-4 mb-4 text-xs font-mono">
            {/* Earnings Column */}
            <div className="border border-slate-300 rounded-md overflow-hidden">
              <div className="bg-slate-100 px-3 py-1.5 font-bold uppercase text-[11px] text-slate-800 border-b border-slate-300">
                Earnings (آمدن)
              </div>
              <div className="divide-y divide-slate-100 p-2 space-y-1">
                <div className="flex justify-between py-1">
                  <span className="text-slate-600 font-sans">Basic Wage / Salary:</span>
                  <strong className="text-slate-900">{formatNumber(slip.basicSalary, 0)}</strong>
                </div>

                {slip.otHours != null && slip.otHours > 0 && (
                  <div className="flex justify-between py-1">
                    <span className="text-slate-600 font-sans">Overtime ({slip.otHours} hrs):</span>
                    <span className="text-slate-800">{formatNumber(slip.otAmount || 0, 0)}</span>
                  </div>
                )}

                {slip.holidayAmount != null && slip.holidayAmount > 0 && (
                  <div className="flex justify-between py-1">
                    <span className="text-slate-600 font-sans">Holiday / Sunday Shifts:</span>
                    <span className="text-slate-800">{formatNumber(slip.holidayAmount, 0)}</span>
                  </div>
                )}

                {slip.extraLoomAmount != null && slip.extraLoomAmount > 0 && (
                  <div className="flex justify-between py-1">
                    <span className="text-slate-600 font-sans">Extra Loom Allowance:</span>
                    <span className="text-slate-800">{formatNumber(slip.extraLoomAmount, 0)}</span>
                  </div>
                )}

                {slip.efficiencyAmount != null && slip.efficiencyAmount > 0 && (
                  <div className="flex justify-between py-1">
                    <span className="text-slate-600 font-sans">Efficiency Bonus:</span>
                    <span className="text-emerald-700 font-semibold">{formatNumber(slip.efficiencyAmount, 0)}</span>
                  </div>
                )}

                {slip.attendanceAllowance != null && slip.attendanceAllowance > 0 && (
                  <div className="flex justify-between py-1">
                    <span className="text-slate-600 font-sans">Attendance Allowance:</span>
                    <span className="text-slate-800">{formatNumber(slip.attendanceAllowance, 0)}</span>
                  </div>
                )}
              </div>
              <div className="bg-slate-50 border-t border-slate-200 px-3 py-2 flex justify-between font-bold text-slate-900">
                <span className="font-sans">Gross Total (آمدن کل):</span>
                <span>{formatCurrency(slip.grossAmount)}</span>
              </div>
            </div>

            {/* Deductions Column */}
            <div className="border border-slate-300 rounded-md overflow-hidden">
              <div className="bg-slate-100 px-3 py-1.5 font-bold uppercase text-[11px] text-slate-800 border-b border-slate-300">
                Deductions (کٹوتیاں)
              </div>
              <div className="divide-y divide-slate-100 p-2 space-y-1">
                <div className="flex justify-between py-1">
                  <span className="text-slate-600 font-sans">Advance Recovered (پیشگی):</span>
                  <span className="text-red-600 font-semibold">
                    {slip.advanceDeduction ? formatNumber(slip.advanceDeduction, 0) : '0'}
                  </span>
                </div>

                {slip.lateDeduction != null && slip.lateDeduction > 0 && (
                  <div className="flex justify-between py-1">
                    <span className="text-slate-600 font-sans">Late Penalty / Fine:</span>
                    <span className="text-red-600">{formatNumber(slip.lateDeduction, 0)}</span>
                  </div>
                )}

                {slip.ticketCharges != null && slip.ticketCharges > 0 && (
                  <div className="flex justify-between py-1">
                    <span className="text-slate-600 font-sans">Ticket / Meal Charges:</span>
                    <span className="text-red-600">{formatNumber(slip.ticketCharges, 0)}</span>
                  </div>
                )}

                <div className="flex justify-between py-1 text-slate-400">
                  <span className="font-sans">Other Deductions:</span>
                  <span>—</span>
                </div>
              </div>
              <div className="bg-slate-50 border-t border-slate-200 px-3 py-2 flex justify-between font-bold text-red-600">
                <span className="font-sans">Total Deductions:</span>
                <span>{formatCurrency(slip.totalDeductions)}</span>
              </div>
            </div>
          </div>

          {/* Prominent Net Payable Box */}
          <div className="rounded-lg border-2 border-slate-900 bg-slate-50 p-4 mb-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-300 pb-2">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 block">
                  Net Amount Payable (خالص قابلِ ادا رقم):
                </span>
                <span className="text-sm font-semibold text-slate-800">
                  {numberToWordsPKR(slip.netPayable)}
                </span>
              </div>
              <div className="text-right">
                <div className="text-2xl font-black text-[#0066cc]">
                  {formatCurrency(slip.netPayable)}
                </div>
                <span className="text-[10px] text-slate-500 font-semibold block">
                  Mode: {slip.paymentMode} {slip.chequeAmount ? `(Cheque: ${formatNumber(slip.chequeAmount, 0)} / Cash: ${formatNumber(slip.netCashAmount || 0, 0)})` : ''}
                </span>
              </div>
            </div>
          </div>

          {/* Official Signatures Blocks */}
          <div className="grid grid-cols-3 gap-6 pt-6 text-center text-xs">
            <div className="border-t border-slate-400 pt-2">
              <span className="font-semibold text-slate-800 block">Prepared By</span>
              <span className="text-[10px] text-slate-500">Accounts Department</span>
            </div>
            <div className="border-t border-slate-400 pt-2">
              <span className="font-semibold text-slate-800 block">Checked & Approved</span>
              <span className="text-[10px] text-slate-500">Finance Controller</span>
            </div>
            <div className="border-t border-slate-400 pt-2">
              <span className="font-semibold text-slate-800 block">Employee Signature / Thumb</span>
              <span className="text-[10px] text-slate-500">دستخط یا انگوٹھا وصول کنندہ</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
