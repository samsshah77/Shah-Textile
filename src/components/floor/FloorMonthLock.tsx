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
export function FloorMonthLockBar({ month, isAdmin }: { month: string; isAdmin: boolean }) {
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
        ? `${monthLabel(month)} ka production lock karein? Lock ke baad is mahine ki koi entry, yarn ya sheet nahi badlegi.`
        : `${monthLabel(month)} ka production unlock karein? Phir is mahine mein tabdeeli ho sakegi.`
    )
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await setFloorMonthLock(month, next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lock save nahi hua.')
    } finally {
      setBusy(false)
    }
  }

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
          {lock?.lockedBy ? ` — ${lock.lockedBy}` : ''}. Is mahine ka production sirf dekha ja sakta hai.
        </span>
      ) : null}
      {isAdmin && (
        <button
          type="button"
          className={`btn btn-sm ${locked ? 'btn-outline-secondary' : 'btn-outline-dark'} ms-auto`}
          onClick={toggle}
          disabled={busy}
          title={locked ? 'Unlock this production month' : 'Lock this production month'}
        >
          <i className={`bi ${locked ? 'bi-unlock' : 'bi-lock'} me-1`} />
          {locked ? `Unlock ${monthLabel(month)}` : `Lock ${monthLabel(month)}`}
        </button>
      )}
      {error && <span className="text-danger w-100">{error}</span>}
    </div>
  )
}
