'use client'

import { useState } from 'react'
import { targetBalance } from '@/lib/floor/qualityTargets'

/** Target (meters): typed in Edit, saved when the box is left or Enter is pressed. */
export function TargetInput({ value, onSave }: { value: number; onSave: (meters: number) => void }) {
  // While typing: the draft; otherwise the saved value.
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? (value ? String(value) : '')
  const commit = () => {
    if (draft == null) return
    const n = Math.max(0, Math.round((Number(draft) || 0) * 100) / 100)
    if (n !== (value || 0)) onSave(n)
  }
  return (
    <input
      type="text"
      inputMode="decimal"
      className="form-control form-control-sm text-center"
      style={{ width: '100%', minWidth: 0 }}
      placeholder="Target m"
      aria-label="Target (meters)"
      value={shown}
      onFocus={(e) => {
        setDraft(value ? String(value) : '')
        e.currentTarget.select()
      }}
      onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ''))}
      onBlur={() => {
        commit()
        setDraft(null)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}

export const metersText = (m: number) => `${m.toLocaleString(undefined, { maximumFractionDigits: 2 })} m`

/** Balance = Target − produced. Blue while there is still to make, green once reached. */
export function BalanceText({ target, produced }: { target: number; produced: number }) {
  if (!target) return <span className="text-secondary">—</span>
  const bal = targetBalance(target, produced)
  if (bal > 0) return <span className="fw-bold text-primary font-monospace">{metersText(bal)}</span>
  return (
    <span className="fw-bold text-success font-monospace" title="Target reached">
      {bal === 0 ? 'Done' : `+${metersText(-bal)}`}
    </span>
  )
}
