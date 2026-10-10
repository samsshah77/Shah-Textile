'use client'

import { cn } from '@/lib/utils'
import { payrollService } from '@/services/payrollService'

export type FortnightHalf = '1-15' | '16-31'

/** Second-half label follows calendar days in that month (16–28/29/30/31). */
export function secondHalfLabel(month: string): string {
  const [y, m] = (month || '').split('-').map(Number)
  if (!y || !m) return '16–31'
  const days = new Date(y, m, 0).getDate()
  return `16–${days}`
}

export function fortnightDisplayLabel(month: string, half: FortnightHalf): string {
  return half === '1-15' ? '1–15' : secondHalfLabel(month)
}

type Props = {
  month: string
  value: FortnightHalf
  onChange?: (half: FortnightHalf) => void
  disabled?: boolean
  /** Only show halves that already have generated rows (plus current). */
  onlyGenerated?: boolean
  className?: string
}

/** Compact fortnight half filter. Use onlyGenerated for Weaver-linked sheets; false for Petty Cash. */
export function FortnightSelect({
  month,
  value,
  onChange,
  disabled,
  onlyGenerated = true,
  className,
}: Props) {
  const available = onlyGenerated
    ? payrollService.listAvailableFortnightsForMonth(month)
    : (['1-15', '16-31'] as FortnightHalf[])
  const options = available.includes(value)
    ? available
    : ([...available, value] as FortnightHalf[])

  return (
    <select
      value={value}
      disabled={disabled || !onChange}
      onChange={(e) => onChange?.(e.target.value as FortnightHalf)}
      className={cn(
        'h-9 appearance-none rounded-md border border-slate-200 bg-white px-2.5 pr-7 text-xs font-semibold text-slate-800 outline-none focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc]/40 disabled:opacity-70',
        className
      )}
      aria-label="Fortnight half"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%33475569' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 0.55rem center',
      }}
    >
      {options.map((half) => (
        <option key={half} value={half}>
          {fortnightDisplayLabel(month, half)}
        </option>
      ))}
    </select>
  )
}
