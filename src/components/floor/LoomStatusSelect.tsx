'use client'

import type { CSSProperties } from 'react'
import { LoomStatus } from '@/types/loom'
import { cn } from '@/lib/utils'
import {
  LOOM_STATUSES,
  LOOM_STATUS_LABEL,
  LOOM_STATUS_COLOR,
  LOOM_STATUS_ROW_BG,
  resolveLoomCondition,
  loomConditionRowStyle,
} from '@/constants/loomConditions'

export {
  LOOM_STATUSES,
  LOOM_STATUS_LABEL,
  LOOM_STATUS_COLOR,
  LOOM_STATUS_ROW_BG,
  resolveLoomCondition,
  loomConditionRowStyle,
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
  const safeValue = (LOOM_STATUSES as string[]).includes(value) ? value : 'RUNNING'
  const color = LOOM_STATUS_COLOR[safeValue]

  return (
    <select
      className={cn('form-select form-select-sm fw-semibold', className)}
      value={safeValue}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as LoomStatus)}
      style={{
        color,
        backgroundColor: '#fff',
        borderColor: safeValue === 'BEAM_END' ? '#ced4da' : color,
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
