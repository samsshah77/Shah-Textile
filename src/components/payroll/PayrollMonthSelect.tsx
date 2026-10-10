'use client'

import { Calendar, ChevronDown } from 'lucide-react'
import { payrollService, formatPayrollMonthLabel } from '@/services/payrollService'
import { cn } from '@/lib/utils'

type Props = {
  value: string
  onChange?: (month: string) => void
  disabled?: boolean
  months?: string[]
  className?: string
  'aria-label'?: string
}

/** Compact calendar-styled month dropdown used across payroll toolbars. */
export function PayrollMonthSelect({
  value,
  onChange,
  disabled,
  months,
  className,
  'aria-label': ariaLabel = 'Payroll month',
}: Props) {
  const options = months ?? payrollService.listPayrollMonths()
  const list = options.includes(value) ? options : [value, ...options]

  return (
    <div className={cn('relative shrink-0', className)}>
      <Calendar className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#0066cc]" />
      <select
        value={value}
        disabled={disabled || !onChange}
        onChange={(e) => onChange?.(e.target.value)}
        className="h-9 w-auto min-w-[9.5rem] appearance-none rounded-md border border-slate-200 bg-white py-0 pl-8 pr-8 text-xs font-semibold text-[#0066cc] outline-none focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc]/40 disabled:opacity-70"
        aria-label={ariaLabel}
      >
        {list.map((m) => (
          <option key={m} value={m}>
            {formatPayrollMonthLabel(m)}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#0066cc]" />
    </div>
  )
}
