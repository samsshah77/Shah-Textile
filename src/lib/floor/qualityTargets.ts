'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Active Qualities → Target (meters) per quality, from /api/floor/quality-targets.
 * Balance = Target − meters produced (shown next to "Overall").
 */
export function useQualityTargets(onError?: (message: string) => void) {
  const [targets, setTargets] = useState<Record<string, number>>({})

  const load = useCallback(() => {
    fetch('/api/floor/quality-targets', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => r.json().catch(() => ({})))
      .then((d) => {
        if (d?.ok && d.targets && typeof d.targets === 'object') setTargets(d.targets as Record<string, number>)
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    load()
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  /** Set (meters > 0) or clear (0) a target. Shown at once; put back if the save fails. */
  const saveTarget = useCallback(
    (qualityId: string, meters: number) => {
      const next = Math.max(0, Math.round((Number(meters) || 0) * 100) / 100)
      let before: number | undefined
      setTargets((cur) => {
        before = cur[qualityId]
        const copy = { ...cur }
        if (next > 0) copy[qualityId] = next
        else delete copy[qualityId]
        return copy
      })
      fetch('/api/floor/quality-targets', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ qualityId, target: next || null }),
      })
        .then(async (r) => {
          const d = await r.json().catch(() => ({}))
          if (!r.ok || !d?.ok) throw new Error(d?.error || 'Could not save the target.')
        })
        .catch((e: unknown) => {
          setTargets((cur) => {
            const copy = { ...cur }
            if (before) copy[qualityId] = before
            else delete copy[qualityId]
            return copy
          })
          onError?.(e instanceof Error ? e.message : 'Could not save the target.')
        })
    },
    [onError]
  )

  return { targets, saveTarget }
}

/** Target − produced, rounded to 0.01 (negative = over target). */
export const targetBalance = (target: number, produced: number) => Math.round((target - produced) * 100) / 100
