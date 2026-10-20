'use client'

import { useCallback, useRef, useState } from 'react'
import { Calendar, Lock, Unlock, CheckCircle2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { monthLabel } from '@/lib/accounts/util'
import type { MonthLock } from '@/lib/accounts/types'
import { accountsApi } from '@/services/accounts/accountsApi'

/** Month dropdown used on every Accounts page. */
export function MonthPicker({
  month,
  months,
  onChange,
  allowAll,
}: {
  month: string
  months: string[]
  onChange: (m: string) => void
  allowAll?: boolean
}) {
  const list = months.includes(month) || month === 'all' || !month ? months : [month, ...months]
  return (
    <div className="flex items-center gap-1.5 bg-background border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 shadow-2xs h-9">
      <Calendar className="size-3.5 text-muted-foreground" />
      <select
        aria-label="Month"
        value={month}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-xs font-bold text-foreground focus:outline-hidden cursor-pointer"
      >
        {allowAll && <option value="all">All months</option>}
        {list.map((m) => (
          <option key={m} value={m}>
            {monthLabel(m)}
          </option>
        ))}
      </select>
      <input
        type="month"
        aria-label="Pick another month"
        title="Koi aur mahina"
        value=""
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="w-5 bg-transparent text-transparent cursor-pointer"
      />
    </div>
  )
}

/** "Locked" badge, plus Lock / Unlock button for Admin and Accountant. */
export function LockControl({
  lock,
  canEdit,
  onChanged,
}: {
  lock: MonthLock
  canEdit: boolean
  onChanged: (l: MonthLock) => void
}) {
  const [busy, setBusy] = useState(false)
  const toggle = async () => {
    const next = !lock.locked
    const msg = next
      ? `${monthLabel(lock.month)} lock karein? Lock ke baad is mahine ka koi bill, petty cash ya cost statement nahi badlega.`
      : `${monthLabel(lock.month)} unlock karein?`
    if (!window.confirm(msg)) return
    setBusy(true)
    try {
      onChanged(await accountsApi.setLock(lock.month, next))
    } catch {
      // banner already shown
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex items-center gap-1.5">
      {lock.locked && (
        <span
          className="inline-flex items-center gap-1 rounded-md bg-amber-100 text-amber-900 border border-amber-300 px-2 py-1 text-[11px] font-bold"
          title={lock.lockedBy ? `Locked by ${lock.lockedBy}` : undefined}
        >
          <Lock className="size-3" /> Locked
        </span>
      )}
      {canEdit && (
        <button
          type="button"
          disabled={busy}
          onClick={toggle}
          className="erp-btn-secondary text-xs !min-h-9 !h-9 cursor-pointer print:hidden"
          title={lock.locked ? 'Unlock month' : 'Lock month (close the books)'}
        >
          {lock.locked ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
          <span>{lock.locked ? 'Unlock' : 'Lock month'}</span>
        </button>
      )}
    </div>
  )
}

/** "Saving… / Saved" indicator for pages that save each change on its own. */
export function useSaveStatus() {
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const pending = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    pending.current += 1
    setState('saving')
    try {
      const r = await fn()
      pending.current -= 1
      if (!pending.current) {
        setState('saved')
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setState('idle'), 2000)
      }
      return r
    } catch {
      pending.current -= 1
      setState('error')
      return undefined
    }
  }, [])
  const node =
    state === 'saving' ? (
      <span className="inline-flex items-center gap-1 text-xs text-slate-600 font-semibold">
        <Loader2 className="size-3.5 animate-spin" /> Saving…
      </span>
    ) : state === 'saved' ? (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-semibold">
        <CheckCircle2 className="size-3.5" /> Saved
      </span>
    ) : state === 'error' ? (
      <span className="text-xs text-rose-600 font-semibold">Not saved</span>
    ) : null
  return { run, node, state }
}

const TINTS = [
  'bg-[#ede9fe] text-purple-950 dark:bg-purple-950/40 dark:text-purple-200',
  'bg-[#fed7aa] text-amber-950 dark:bg-amber-950/40 dark:text-amber-200',
  'bg-[#bae6fd] text-sky-950 dark:bg-sky-950/40 dark:text-sky-200',
  'bg-[#dcfce7] text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-200',
  'bg-[#fef08a] text-yellow-950 dark:bg-yellow-950/40 dark:text-yellow-200',
  'bg-[#e8dac8] text-amber-950 dark:bg-amber-900/40 dark:text-amber-200',
  'bg-[#ffedd5] text-orange-950 dark:bg-orange-950/40 dark:text-orange-200',
  'bg-[#bfdbfe] text-blue-950 dark:bg-blue-950/40 dark:text-blue-200',
  'bg-[#fce7f3] text-pink-950 dark:bg-pink-950/40 dark:text-pink-200',
  'bg-[#ccfbf1] text-teal-950 dark:bg-teal-950/40 dark:text-teal-200',
]

/** Each party keeps the same soft colour everywhere (picked from its name). */
export function partyTint(slug: string): string {
  let h = 0
  for (let i = 0; i < slug.length; i += 1) h = (h * 31 + slug.charCodeAt(i)) >>> 0
  return TINTS[h % TINTS.length]
}

export function machineBadge(machine: string): string {
  const m = (machine || '').trim().toUpperCase()
  if (m === 'ALL') return 'bg-red-600 text-white'
  if (m === 'PU') return 'bg-[#15803d] text-white'
  if (m.includes('6300')) return 'bg-[#0284c7] text-white'
  if (m.includes('6200')) return 'bg-[#84cc16] text-white'
  if (m.toLowerCase().includes('electron')) return 'bg-[#64748b] text-white'
  return 'bg-slate-500 text-white'
}

/** Spinner on first load, error box on failure; later reloads keep the old view. */
export function LoadState({
  loading,
  error,
  hasData,
  children,
}: {
  loading: boolean
  error: string | null
  hasData: boolean
  children: React.ReactNode
}) {
  if (error && !hasData) return <div className="alert alert-danger py-2 px-3 small">{error}</div>
  if (!hasData) return <p className="px-3 py-4 text-muted-foreground text-sm">{loading ? 'Load ho raha hai…' : ''}</p>
  return <>{children}</>
}
