'use client'

import { useRef } from 'react'

/** "2026-11-10" → "10 Nov 2026" */
export function formatNamedDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''))
  if (!m) return iso || ''
  const [, y, mo, d] = m.map(Number)
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Date input that displays the month name (e.g. "10 Nov 2026") instead of the
 * browser's ambiguous numeric MM/DD/YYYY format, while keeping the native
 * calendar picker on click.
 */
export function NamedDateInput({
  value,
  onChange,
  min,
  max,
  required,
  disabled,
  size = 'sm',
  ariaLabel = 'Date',
  minWidth,
  className = '',
}: {
  value: string
  onChange: (next: string) => void
  min?: string
  max?: string
  required?: boolean
  disabled?: boolean
  size?: 'sm' | 'md'
  ariaLabel?: string
  minWidth?: number
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const sm = size === 'sm'

  const openCalendar = () => {
    if (disabled) return
    const el = inputRef.current
    if (!el) return
    try {
      el.showPicker()
    } catch {
      el.focus()
      el.click()
    }
  }

  return (
    <div className={`position-relative d-inline-flex ${className}`} style={{ minWidth: minWidth ?? (sm ? 140 : 0) }}>
      <button
        type="button"
        disabled={disabled}
        onClick={openCalendar}
        aria-label={ariaLabel}
        className={`form-control ${sm ? 'form-control-sm fw-semibold' : ''} d-inline-flex align-items-center justify-content-between gap-2 text-start text-nowrap w-100`}
      >
        <span>{value ? formatNamedDate(value) : 'Select date'}</span>
        <i className="bi bi-calendar3 text-secondary" aria-hidden="true" />
      </button>
      <input
        ref={inputRef}
        type="date"
        value={value}
        min={min}
        max={max}
        required={required}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => onChange(e.target.value)}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          pointerEvents: 'none',
          border: 0,
          padding: 0,
        }}
      />
    </div>
  )
}

