'use client'

import { useEffect, useState } from 'react'
import { getProductionToday } from '@/constants/productionCalendar'
import type { BeamMaster } from '@/services/production/masterTypes'

type AsOf = { date: string; beams: BeamMaster[] | null; error: string | null }

/**
 * Beams tab by date: today (or later) is the live list; a past day comes from the beam
 * history on the server — read-only, as the beams stood at the end of that day.
 */
export function useBeamsAsOf(date: string, liveBeams: BeamMaster[], enabled: boolean) {
  const isPast = Boolean(date) && date < getProductionToday()
  const [state, setState] = useState<AsOf>({ date: '', beams: null, error: null })

  useEffect(() => {
    if (!enabled || !isPast) return
    let live = true
    fetch(`/api/floor/beam-history?date=${encodeURIComponent(date)}`, { credentials: 'same-origin', cache: 'no-store' })
      .then(async (r) => {
        const data = (await r.json().catch(() => null)) as { beams?: BeamMaster[]; error?: string } | null
        if (!live) return
        if (r.ok && Array.isArray(data?.beams)) setState({ date, beams: data.beams, error: null })
        else setState({ date, beams: null, error: data?.error || `Load nahi hua (${r.status})` })
      })
      .catch(() => {
        if (live) setState({ date, beams: null, error: 'Server tak nahi pohanch saka' })
      })
    return () => {
      live = false
    }
  }, [date, enabled, isPast])

  if (!isPast) return { isPast: false, beams: liveBeams, loading: false, error: null as string | null }
  const current = state.date === date
  return {
    isPast: true,
    beams: current && state.beams ? state.beams : [],
    loading: !current,
    error: current ? state.error : null,
  }
}
