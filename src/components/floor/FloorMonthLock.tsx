'use client'

import { useEffect, useState } from 'react'
import {
  getFloorMonthLocks,
  setFloorMonthLock,
  type FloorMonthLock,
} from '@/services/productionMastersService'

function monthLabel(month: string) {
  try {
    return new Date(`${month}-01T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  } catch {
    return month
  }
}

/** Locked production months, kept up to date when they change. */
export function useFloorMonthLocks(): FloorMonthLock[] {
  const [locks, setLocks] = useState<FloorMonthLock[]>(() => getFloorMonthLocks())
  useEffect(() => {
    const on = (ev: Event) => setLocks([...((ev as CustomEvent<FloorMonthLock[]>).detail || [])])
    window.addEventListener('floor:month-locks', on)
    return () => window.removeEventListener('floor:month-locks', on)
  }, [])
  return locks
}

export function useFloorMonthLocked(month: string): boolean {
  const locks = useFloorMonthLocks()
  return locks.some((l) => l.month === month && l.locked)
}

/**
 * Banner for a locked production month; the admin also gets the Lock / Unlock button.
 * A locked month cannot be changed by anyone (the server refuses with 423).
 */
export function FloorMonthLockBar({
  month,
  isAdmin,
  variant = 'full',
}: {
  month: string
  isAdmin: boolean
  /** full = note + button; button = only the Lock / Unlock button (toolbar); note = only the "locked" note. */
  variant?: 'full' | 'button' | 'note'
}) {
  const locks = useFloorMonthLocks()
  const lock = locks.find((l) => l.month === month)
  const locked = Boolean(lock?.locked)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!/^\d{4}-\d{2}$/.test(month)) return null
  if (!locked && !isAdmin) return null

  const toggle = async () => {
    const next = !locked
    const ok = window.confirm(
      next
        ? `Lock production for ${monthLabel(month)}? After locking, no entry, yarn or sheet in this month can be changed.`
        : `Unlock production for ${monthLabel(month)}? Changes to this month will be allowed again.`
    )
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await setFloorMonthLock(month, next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the lock.')
    } finally {
      setBusy(false)
    }
  }

  const lockButton = (extra: string) => (
    <button
      type="button"
      className={`btn btn-sm ${locked ? 'btn-outline-secondary' : 'btn-outline-dark'} ${extra}`}
      onClick={toggle}
      disabled={busy}
      title={error || (locked ? 'Unlock this production month' : 'Lock this production month')}
    >
      <i className={`bi ${locked ? 'bi-unlock' : 'bi-lock'} me-1`} />
      {locked ? `Unlock ${monthLabel(month)}` : `Lock ${monthLabel(month)}`}
    </button>
  )

  if (variant === 'button') {
    if (!isAdmin) return null
    return (
      <>
        {lockButton('')}
        {error && <span className="text-danger small">{error}</span>}
      </>
    )
  }
  if (variant === 'note' && !locked) return null

  return (
    <div
      className={`d-flex flex-wrap align-items-center gap-2 px-3 py-2 small ${locked ? 'alert alert-secondary mb-0' : ''}`}
      role={locked ? 'status' : undefined}
      data-testid="floor-month-lock"
    >
      {locked ? (
        <span>
          <i className="bi bi-lock-fill me-1" />
          <strong>{monthLabel(month)} locked</strong>
          {lock?.lockedBy ? ` — ${lock.lockedBy}` : ''}. This month’s production is view-only.
        </span>
      ) : null}
      {isAdmin && variant === 'full' && lockButton('ms-auto')}
      {error && <span className="text-danger w-100">{error}</span>}
    </div>
  )
}
