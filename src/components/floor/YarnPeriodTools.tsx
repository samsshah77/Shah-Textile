'use client'

import { useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { getCalendarToday } from '@/constants/productionCalendar'
import { TRACKING_PERIODS, type TrackingPeriod } from '@/lib/floor/yarnSupply'

/**
 * Yarn Supply pages: the Daily / Weekly / Monthly / All choice and its date, kept in the address
 * (?view=…&date=YYYY-MM-DD) so Back / Refresh / coming back from Edit keeps the same view.
 */
export function usePeriodParams(defaultPeriod: TrackingPeriod) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const today = getCalendarToday()
  const rawView = sp.get('view')
  const period: TrackingPeriod = TRACKING_PERIODS.some((p) => p.value === rawView) ? (rawView as TrackingPeriod) : defaultPeriod
  const rawDate = sp.get('date') || ''
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && rawDate <= today ? rawDate : today
  const setPeriod = (p: TrackingPeriod, d: string) => {
    const q = new URLSearchParams(sp.toString())
    if (p === defaultPeriod) q.delete('view')
    else q.set('view', p)
    const day = d > today ? today : d
    if (day === today) q.delete('date')
    else q.set('date', day)
    const qs = q.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }
  return { period, date, today, setPeriod }
}

/** First / last day (YYYY-MM-DD) of the chosen period; All → no limits. */
export function periodRange(period: TrackingPeriod, date: string): { from: string; to: string } {
  if (period === 'all') return { from: '0000-01-01', to: '9999-12-31' }
  if (period === 'daily') return { from: date, to: date }
  const [y, m, d] = date.split('-').map(Number)
  if (period === 'monthly') {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
    return { from: `${date.slice(0, 7)}-01`, to: `${date.slice(0, 7)}-${String(last).padStart(2, '0')}` }
  }
  const start = new Date(Date.UTC(y, m - 1, d - 6)).toISOString().slice(0, 10)
  return { from: start, to: date }
}

export const PAGE_SIZE = 25

/** Page-by-page list: the page number belongs to one view (key), so a new view starts at page 1. */
export function usePaged<T>(rows: T[], viewKey: string) {
  const [paging, setPaging] = useState({ key: viewKey, page: 1 })
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const page = Math.min(paging.key === viewKey ? paging.page : 1, pages)
  return {
    page,
    pages,
    shown: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    setPage: (n: number) => setPaging({ key: viewKey, page: n }),
  }
}

export function Pager({ page, pages, total, noun, onPage }: { page: number; pages: number; total: number; noun: string; onPage: (n: number) => void }) {
  if (pages <= 1) return null
  return (
    <div className="d-flex flex-wrap align-items-center justify-content-center gap-2 px-3 py-2 border-top small">
      <button type="button" className="btn btn-sm btn-outline-secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <i className="bi bi-chevron-left" /> Previous
      </button>
      <span className="text-dark">
        Page {page} of {pages} · {total} {noun}
      </span>
      <button type="button" className="btn btn-sm btn-outline-secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next <i className="bi bi-chevron-right" />
      </button>
    </div>
  )
}
