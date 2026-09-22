'use client'

import type { CSSProperties } from 'react'
import { LoomStatus } from '@/types/loom'
import { cn } from '@/lib/utils'

export const LOOM_STATUSES: LoomStatus[] = [
  'RUNNING',
  'STOPPED',
  'KNOTTING',
  'BREAKDOWN',
  'BEAM_END',
]

export const LOOM_STATUS_LABEL: Record<LoomStatus, string> = {
  RUNNING: 'RUNNING',
  STOPPED: 'STOPPED',
  KNOTTING: 'Knotting',
  BREAKDOWN: 'BREAKDOWN',
  BEAM_END: 'Beam End',
}

/** Text color per status — Beam End is text-only (no fill). */
export const LOOM_STATUS_COLOR: Record<LoomStatus, string> = {
  RUNNING: '#198754',
  STOPPED: '#dc3545',
  KNOTTING: '#0d6efd',
  BREAKDOWN: '#fd7e14',
  BEAM_END: '#6f42c1',
}

interface LoomStatusSelectProps {
  value: LoomStatus
  onChange: (status: LoomStatus) => void
  disabled?: boolean
  className?: string
  style?: CSSProperties
}

export function LoomStatusSelect({
  value,
  onChange,
  disabled,
  className,
  style,
}: LoomStatusSelectProps) {
  const color = LOOM_STATUS_COLOR[value]

  return (
    <select
      className={cn('form-select form-select-sm fw-semibold', className)}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as LoomStatus)}
      style={{
        color,
        backgroundColor: '#fff',
        borderColor: value === 'BEAM_END' ? '#ced4da' : color,
        ...style,
      }}
    >
      {LOOM_STATUSES.map((s) => (
        <option key={s} value={s} style={{ color: LOOM_STATUS_COLOR[s], backgroundColor: '#fff' }}>
          {LOOM_STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  )
}
