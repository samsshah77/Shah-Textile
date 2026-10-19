'use client'

import { useEffect, useState } from 'react'
import { fetchProductionReport, type ProductionReport } from '@/services/floorReportsClient'

type State = { key: string; report: ProductionReport | null; error: string | null }

/** Loads the server production report for [from, to]; `loading` until that range arrives. */
export function useProductionReport(from: string, to: string) {
  const key = `${from}|${to}`
  const [state, setState] = useState<State>({ key: '', report: null, error: null })

  useEffect(() => {
    let alive = true
    fetchProductionReport(from, to)
      .then((report) => alive && setState({ key, report, error: null }))
      .catch((e) =>
        alive && setState({ key, report: null, error: e instanceof Error ? e.message : 'Report failed' })
      )
    return () => {
      alive = false
    }
  }, [from, to, key])

  const current = state.key === key
  return {
    loading: !current,
    report: current ? state.report : null,
    error: current ? state.error : null,
  }
}
