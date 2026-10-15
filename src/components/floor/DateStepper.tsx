'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PRODUCTION_START, getCalendarToday, shiftProductionDate } from '@/constants/productionCalendar'

export function DateStepper({
  value,
  onChange,
  min = PRODUCTION_START,
  max,
  required,
  size = 'md',
  ariaLabel,
  allowFuture = true,
}: {
  value: string
  onChange: (next: string) => void
  min?: string
  max?: string
  required?: boolean
  size?: 'sm' | 'md'
  ariaLabel?: string
  allowFuture?: boolean
}) {
  const cap = max ?? (allowFuture ? undefined : getCalendarToday())
  const sm = size === 'sm'
  const atMin = Boolean(min && value && value <= min)
  const atMax = Boolean(cap && value && value >= cap)

  const shift = (delta: number) => {
    const base = value || getCalendarToday()
    const next = shiftProductionDate(base, delta)
    if (min && next < min) return
    if (cap && next > cap) return
    onChange(next)
  }

  return (
    <div className="d-flex align-items-center gap-1">
      <button
        type="button"
        className={`btn ${sm ? 'btn-sm' : ''} btn-outline-secondary px-2 d-inline-flex align-items-center justify-content-center`}
        title="Previous day (<)"
        aria-label="Previous day"
        disabled={atMin}
        onClick={() => shift(-1)}
      >
        <ChevronLeft className={sm ? 'size-3.5' : 'size-4'} />
      </button>
      <input
        type="date"
        className={`form-control ${sm ? 'form-control-sm fw-semibold' : ''}`}
        style={{ minWidth: sm ? 140 : 0 }}
        value={value}
        min={min}
        max={cap}
        required={required}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className={`btn ${sm ? 'btn-sm' : ''} btn-outline-secondary px-2 d-inline-flex align-items-center justify-content-center`}
        title="Next day (>)"
        aria-label="Next day"
        disabled={atMax}
        onClick={() => shift(1)}
      >
        <ChevronRight className={sm ? 'size-3.5' : 'size-4'} />
      </button>
    </div>
  )
}
