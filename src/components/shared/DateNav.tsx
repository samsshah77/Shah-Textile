'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  PRODUCTION_START,
  getCalendarToday,
  shiftProductionDate,
} from '@/constants/productionCalendar'

function shortDay(dateStr: string) {
  try {
    return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  } catch {
    return dateStr
  }
}

/**
 * The one day picker used on every page (same as the Dashboard):
 *   [‹] [date] [›]  [Yesterday (1 Nov)] [Today (2 Nov)]
 */
export function DateNav({
  value,
  onChange,
  min = PRODUCTION_START,
  max,
  disabled,
  quick = true,
}: {
  value: string
  onChange: (next: string) => void
  min?: string
  max?: string
  disabled?: boolean
  /** Show the Yesterday / Today buttons. */
  quick?: boolean
}) {
  const today = getCalendarToday()
  const top = max || today
  const yesterday = shiftProductionDate(today, -1)
  const step = (delta: number) => {
    const next = shiftProductionDate(value, delta)
    if (next >= min && next <= top) onChange(next)
  }
  return (
    <div className="d-flex flex-wrap align-items-center gap-2">
      <div className="d-flex align-items-center gap-1">
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary px-2"
          title="Previous day"
          onClick={() => step(-1)}
          disabled={disabled || value <= min}
        >
          <ChevronLeft className="size-3.5" />
        </button>
        <input
          type="date"
          className="form-control form-control-sm fw-semibold"
          style={{ width: 'auto', minWidth: 140 }}
          value={value}
          min={min}
          max={top}
          disabled={disabled}
          aria-label="Date"
          onChange={(e) => {
            const v = e.target.value
            if (/^\d{4}-\d{2}-\d{2}$/.test(v) && v >= min && v <= top) onChange(v)
          }}
        />
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary px-2"
          title="Next day"
          onClick={() => step(1)}
          disabled={disabled || value >= top}
        >
          <ChevronRight className="size-3.5" />
        </button>
      </div>
      {quick && (
        <div className="btn-group btn-group-sm" role="group" aria-label="Quick day">
          {yesterday >= min && yesterday <= top && (
            <button
              type="button"
              className={`btn btn-sm ${value === yesterday ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => onChange(yesterday)}
              disabled={disabled}
            >
              Yesterday<span className="d-none d-md-inline"> ({shortDay(yesterday)})</span>
            </button>
          )}
          {today <= top && (
            <button
              type="button"
              className={`btn btn-sm ${value === today ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => onChange(today)}
              disabled={disabled}
            >
              Today<span className="d-none d-md-inline"> ({shortDay(today)})</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
