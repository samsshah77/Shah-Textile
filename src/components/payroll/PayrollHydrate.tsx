'use client'

import { useEffect, useState, type ReactNode } from 'react'
import {
  PAYROLL_LOAD_EVENT,
  getPayrollLoadState,
  hydratePayrollFromDb,
  type PayrollLoadState,
} from '@/services/payrollService'

/**
 * Salary pages render only after the real data has loaded from the server — never on
 * placeholder / seed data, so nothing can be typed or saved on top of the wrong numbers.
 */
export default function PayrollHydrate({ children }: { children?: ReactNode }) {
  const [state, setState] = useState<PayrollLoadState>(() => getPayrollLoadState())
  const [everReady, setEverReady] = useState(() => getPayrollLoadState().status === 'ready')

  useEffect(() => {
    const onState = (e: Event) => {
      const s = (e as CustomEvent<PayrollLoadState>).detail
      setState(s)
      if (s.status === 'ready') setEverReady(true)
    }
    window.addEventListener(PAYROLL_LOAD_EVENT, onState)
    void hydratePayrollFromDb().then(() => {
      const s = getPayrollLoadState()
      setState(s)
      if (s.status === 'ready') {
        setEverReady(true)
        window.dispatchEvent(new CustomEvent('payroll_synced'))
      }
    })
    return () => window.removeEventListener(PAYROLL_LOAD_EVENT, onState)
  }, [])

  // After the first load, keep the page on screen during background reloads.
  if (everReady) return <>{children}</>

  if (state.status === 'error') {
    return (
      <div className="m-6 rounded-lg border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800" role="alert">
        <p className="font-bold">Salary data load nahi hua.</p>
        <p className="mt-1">{state.message}</p>
        <button
          type="button"
          className="mt-3 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-bold text-white"
          onClick={() => {
            setState({ status: 'loading' })
            void hydratePayrollFromDb()
          }}
        >
          Dobara koshish karein
        </button>
      </div>
    )
  }

  return (
    <div className="m-6 text-sm text-slate-500" aria-busy="true">
      Salary data load ho raha hai…
    </div>
  )
}
