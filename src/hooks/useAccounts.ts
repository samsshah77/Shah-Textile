'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { accountsApi, ACCOUNTS_CHANGED_EVENT } from '@/services/accounts/accountsApi'
import { isMonth } from '@/lib/accounts/util'

const MONTH_KEY = 'sara_accounts_month_v2'

/**
 * Selected accounts month ("YYYY-MM"), shared by all Accounts pages:
 * ?month= in the URL wins, then the last month picked on this computer, then today.
 * `allowAll` lets a page offer "all months".
 */
export function useAccountsMonth(opts: { allowAll?: boolean } = {}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [months, setMonths] = useState<string[]>([])
  const [current, setCurrent] = useState<string>('')
  const urlMonth = params.get('month')
  const valid = (m: string | null | undefined) => (m && (isMonth(m) || (opts.allowAll && m === 'all')) ? m : null)
  const stored = (() => {
    try {
      return typeof window !== 'undefined' ? localStorage.getItem(MONTH_KEY) : null
    } catch {
      return null
    }
  })()
  const month = valid(urlMonth) || valid(stored) || current || ''

  useEffect(() => {
    let alive = true
    accountsApi
      .months()
      .then((r) => {
        if (!alive) return
        setMonths(r.months)
        setCurrent(r.current)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const setMonth = useCallback(
    (m: string) => {
      try {
        if (m !== 'all') localStorage.setItem(MONTH_KEY, m)
      } catch {
        // ignore
      }
      const next = new URLSearchParams(params.toString())
      next.set('month', m)
      router.replace(`${pathname}?${next.toString()}`)
    },
    [params, pathname, router]
  )

  return { month, setMonth, months: months.length ? months : current ? [current] : [], ready: Boolean(month) }
}

/**
 * Load data for a page and reload it after any accounts save (this tab) — the server is
 * the only copy, so every page always shows what is really stored.
 */
export function useAccountsData<T>(load: () => Promise<T>, deps: unknown[], opts: { reloadOnChange?: boolean } = {}) {
  const reloadOnChange = opts.reloadOnChange ?? true
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const seq = useRef(0)
  const loadRef = useRef(load)
  loadRef.current = load

  const reload = useCallback(async () => {
    const my = ++seq.current
    setLoading(true)
    try {
      const d = await loadRef.current()
      if (my === seq.current) {
        setData(d)
        setError(null)
      }
    } catch (e) {
      if (my === seq.current) setError(e instanceof Error ? e.message : 'Load failed')
    } finally {
      if (my === seq.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    if (!reloadOnChange) return
    const on = () => void reload()
    window.addEventListener(ACCOUNTS_CHANGED_EVENT, on)
    return () => window.removeEventListener(ACCOUNTS_CHANGED_EVENT, on)
  }, [reload, reloadOnChange])

  return { data, setData, error, loading, reload }
}
